"""Build the Qdrant index from the article-level JSONL (one line per Điều).

Usage:
    python -m core.ingest data/law/dieu.jsonl
    python -m core.ingest data/law/dieu.jsonl --recreate   # drop and rebuild the collection

The JSONL is produced by scripts/split_law.py from the consolidated Labor Code
(18/VBHN-VPQH). Re-running is safe: point ids derive from chunk_id, and points
whose chunk_id no longer exists in the file are deleted.
"""
from __future__ import annotations

import argparse
import json
import time
import unicodedata
from pathlib import Path

from core.vectordb import COLLECTION, get_client, get_embedder, point_id

REQUIRED_FIELDS = ("chunk_id", "chuong", "dieu", "tieu_de", "noi_dung")

# Điều 219 quotes amendments to other laws (Social Insurance Law 2014, Civil
# Procedure Code 2015), which pulls it into unrelated pension/court queries.
# It stays in the index for get_article() but is excluded from default search.
REFERENCE_ONLY = {219}


def load_articles(law_path: str | Path) -> list[dict]:
    articles, seen = [], set()
    with open(law_path, encoding="utf-8") as f:
        for lineno, line in enumerate(f, 1):
            if not line.strip():
                continue
            a = json.loads(line)
            missing = [k for k in REQUIRED_FIELDS if not a.get(k) and a.get(k) != 0]
            if missing:
                raise ValueError(f"{law_path}:{lineno} thiếu trường {missing}")
            if a["chunk_id"] in seen:
                raise ValueError(f"{law_path}:{lineno} trùng chunk_id {a['chunk_id']}")
            seen.add(a["chunk_id"])
            for k, v in a.items():
                if isinstance(v, str):
                    a[k] = unicodedata.normalize("NFC", v)
            articles.append(a)
    if not articles:
        raise ValueError(f"{law_path} không có dòng nào")
    return articles


def embed_text(a: dict) -> str:
    """Text sent to the embedder: chapter/section context + the article itself."""
    parts = ["Bộ luật Lao động", f"Chương {a['chuong']}. {a.get('ten_chuong', '')}".strip()]
    if a.get("muc"):
        parts.append(a["muc"])
    return "\n".join(parts) + "\n" + a["noi_dung"]


def _ensure_collection(client, dims: int, recreate: bool) -> None:
    from qdrant_client.models import Distance, VectorParams

    if client.collection_exists(COLLECTION):
        size = client.get_collection(COLLECTION).config.params.vectors.size
        if recreate or size != dims:
            if size != dims:
                print(f"Collection có {size} chiều, model có {dims} chiều: tạo lại.")
            client.delete_collection(COLLECTION)
        else:
            return
    client.create_collection(COLLECTION, vectors_config=VectorParams(size=dims, distance=Distance.COSINE))


def _existing_ids(client) -> set[str]:
    ids, offset = set(), None
    while True:
        points, offset = client.scroll(COLLECTION, limit=1000, offset=offset, with_payload=False)
        ids.update(str(p.id) for p in points)
        if offset is None:
            return ids


def build_index(law_path: str | Path, recreate: bool = False) -> int:
    """Embed every article in law_path and upsert into Qdrant. Returns the point count."""
    from qdrant_client.models import PointStruct

    t0 = time.perf_counter()
    articles = load_articles(law_path)
    embedder = get_embedder()
    client = get_client()
    _ensure_collection(client, embedder.dimensions, recreate)

    vectors = embedder.embed_documents([embed_text(a) for a in articles])
    points = [
        PointStruct(
            id=point_id(a["chunk_id"]),
            vector=v,
            payload={
                **a,
                "chi_tham_chieu": a["dieu"] in REFERENCE_ONLY,
                "embed_model": embedder.model_name,
                "nguon_file": Path(law_path).name,
            },
        )
        for a, v in zip(articles, vectors)
    ]
    client.upsert(COLLECTION, points=points, wait=True)

    stale = _existing_ids(client) - {p.id for p in points}
    if stale:
        from qdrant_client.models import PointIdsList

        client.delete(COLLECTION, points_selector=PointIdsList(points=list(stale)))

    total = client.count(COLLECTION).count
    lens = sorted(len(a["noi_dung"]) for a in articles)
    print(
        f"Collection {COLLECTION}: {total} điểm ({len(points)} upsert, {len(stale)} xoá cũ) | "
        f"model {embedder.model_name} ({embedder.dimensions} chiều) | "
        f"độ dài ký tự min/trung vị/max {lens[0]}/{lens[len(lens) // 2]}/{lens[-1]} | "
        f"{time.perf_counter() - t0:.1f}s"
    )
    return total


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("law_path", help="JSONL, mỗi dòng một Điều (vd data/law/dieu.jsonl)")
    p.add_argument("--recreate", action="store_true", help="xoá collection và dựng lại từ đầu")
    args = p.parse_args()
    try:
        build_index(args.law_path, recreate=args.recreate)
    finally:
        get_client().close()


if __name__ == "__main__":
    main()
