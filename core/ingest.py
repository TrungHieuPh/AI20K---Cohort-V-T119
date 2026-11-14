"""Build the Qdrant index from the article-level JSONL (one line per Điều).

Usage:
    python -m core.ingest data/law/dieu.jsonl
    python -m core.ingest data/law/dieu.jsonl --recreate   # drop and rebuild the collection
    python -m core.ingest data/law/dieu.jsonl --no-cache   # ignore saved vectors, embed everything

The JSONL is produced by scripts/split_law.py from the consolidated Labor Code
(18/VBHN-VPQH). Re-running is safe: point ids derive from chunk_id, and points
whose chunk_id no longer exists in the file are deleted.

Vector cache: embeddings are saved next to the JSONL as <stem>.<model>.npz
(e.g. data/law/dieu.BAAI__bge-m3.npz) and committed to git. Each vector is
stored with a hash of the exact text that was embedded, so only new or changed
articles are re-embedded. When every article is cached, the embedding model is
not loaded at all and the index builds in seconds.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import time
import unicodedata
from pathlib import Path

import numpy as np

from core.vectordb import COLLECTION, EMBED_MODEL, get_client, get_embedder, point_id

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


def text_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def cache_path(law_path: str | Path, model_name: str = EMBED_MODEL) -> Path:
    law_path = Path(law_path)
    return law_path.with_name(f"{law_path.stem}.{model_name.replace('/', '__')}.npz")


def load_cache(path: Path, model_name: str) -> dict[str, tuple[str, np.ndarray]]:
    """chunk_id -> (text hash, vector). Empty if the file is missing or made by another model."""
    if not path.exists():
        return {}
    with np.load(path, allow_pickle=False) as z:
        if str(z["model"]) != model_name:
            print(f"Bỏ qua {path.name}: tạo bởi {z['model']}, không phải {model_name}")
            return {}
        return {cid: (h, v) for cid, h, v in zip(z["chunk_ids"].tolist(), z["hashes"].tolist(), z["vectors"])}


def save_cache(path: Path, model_name: str, chunk_ids: list[str], hashes: list[str], vectors: np.ndarray) -> None:
    np.savez_compressed(
        path,
        model=np.array(model_name),
        chunk_ids=np.array(chunk_ids),
        hashes=np.array(hashes),
        vectors=vectors.astype(np.float32),
    )


def get_vectors(articles: list[dict], law_path: str | Path, use_cache: bool = True) -> tuple[np.ndarray, int]:
    """Vectors for every article, embedding only those not in the cache. Returns (vectors, n_embedded)."""
    path = cache_path(law_path)
    texts = [embed_text(a) for a in articles]
    hashes = [text_hash(t) for t in texts]
    cache = load_cache(path, EMBED_MODEL) if use_cache else {}

    vecs: list[np.ndarray | None] = []
    for a, h in zip(articles, hashes):
        hit = cache.get(a["chunk_id"])
        vecs.append(hit[1] if hit and hit[0] == h else None)
    todo = [i for i, v in enumerate(vecs) if v is None]

    if todo:
        print(f"Embed {len(todo)}/{len(articles)} điều bằng {EMBED_MODEL} (còn lại lấy từ {path.name})")
        new = get_embedder().embed_documents([texts[i] for i in todo])
        for i, v in zip(todo, new):
            vecs[i] = np.asarray(v, dtype=np.float32)
    vectors = np.stack(vecs).astype(np.float32)
    if todo or len(cache) != len(articles):
        save_cache(path, EMBED_MODEL, [a["chunk_id"] for a in articles], hashes, vectors)
        print(f"Đã lưu vector vào {path}")
    return vectors, len(todo)


def _ensure_collection(client, dims: int, recreate: bool) -> None:
    from qdrant_client.models import Distance, VectorParams

    if client.collection_exists(COLLECTION):
        size = client.get_collection(COLLECTION).config.params.vectors.size
        if recreate or size != dims:
            if size != dims:
                print(f"Collection có {size} chiều, vector có {dims} chiều: tạo lại.")
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


def build_index(law_path: str | Path, recreate: bool = False, use_cache: bool = True) -> int:
    """Embed (or load cached vectors for) every article in law_path and upsert into Qdrant.

    Returns the point count.
    """
    from qdrant_client.models import PointIdsList, PointStruct

    t0 = time.perf_counter()
    articles = load_articles(law_path)
    vectors, n_embedded = get_vectors(articles, law_path, use_cache=use_cache)
    client = get_client()
    _ensure_collection(client, vectors.shape[1], recreate)

    points = [
        PointStruct(
            id=point_id(a["chunk_id"]),
            vector=v.tolist(),
            payload={
                **a,
                "chi_tham_chieu": a["dieu"] in REFERENCE_ONLY,
                "embed_model": EMBED_MODEL,
                "nguon_file": Path(law_path).name,
            },
        )
        for a, v in zip(articles, vectors)
    ]
    client.upsert(COLLECTION, points=points, wait=True)

    stale = _existing_ids(client) - {p.id for p in points}
    if stale:
        client.delete(COLLECTION, points_selector=PointIdsList(points=list(stale)))

    total = client.count(COLLECTION).count
    lens = sorted(len(a["noi_dung"]) for a in articles)
    print(
        f"Collection {COLLECTION}: {total} điểm ({len(points)} upsert, {len(stale)} xoá cũ, "
        f"{n_embedded} embed mới) | model {EMBED_MODEL} ({vectors.shape[1]} chiều) | "
        f"độ dài ký tự min/trung vị/max {lens[0]}/{lens[len(lens) // 2]}/{lens[-1]} | "
        f"{time.perf_counter() - t0:.1f}s"
    )
    return total


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("law_path", help="JSONL, mỗi dòng một Điều (vd data/law/dieu.jsonl)")
    p.add_argument("--recreate", action="store_true", help="xoá collection và dựng lại từ đầu")
    p.add_argument("--no-cache", action="store_true", help="bỏ qua file vector đã lưu, embed lại toàn bộ")
    args = p.parse_args()
    try:
        build_index(args.law_path, recreate=args.recreate, use_cache=not args.no_cache)
    finally:
        get_client().close()


if __name__ == "__main__":
    main()
