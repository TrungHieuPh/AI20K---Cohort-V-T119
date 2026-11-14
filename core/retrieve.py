"""Search the Labor Code index.

    retrieve(query, k=5)      semantic search, returns chunk payload + score
    get_article("Điều 35")    direct lookup by article number (for checking a cited article)

Quick test from the command line:
    python -m core.retrieve "nghỉ việc phải báo trước bao nhiêu ngày" -k 5
    python -m core.retrieve --dieu 35
"""
from __future__ import annotations

import argparse
import re

from core.vectordb import COLLECTION, get_client, get_embedder, point_id


def _check_collection(client) -> None:
    if not client.collection_exists(COLLECTION):
        raise RuntimeError(
            f"Chưa có collection '{COLLECTION}'. Chạy trước: python -m core.ingest data/law/dieu.jsonl"
        )


def retrieve(query: str, k: int = 5, include_reference: bool = False) -> list[dict]:
    """Top-k articles for query, best first. Each item is the chunk dict plus 'score' (cosine).

    Articles flagged chi_tham_chieu (Điều 219) are skipped unless include_reference=True.
    """
    from qdrant_client.models import FieldCondition, Filter, MatchValue

    client = get_client()
    _check_collection(client)
    flt = None
    if not include_reference:
        flt = Filter(must_not=[FieldCondition(key="chi_tham_chieu", match=MatchValue(value=True))])
    res = client.query_points(
        COLLECTION,
        query=get_embedder().embed_query(query),
        query_filter=flt,
        limit=k,
        with_payload=True,
    )
    return [{**p.payload, "score": round(p.score, 4)} for p in res.points]


def get_article(dieu: int | str) -> dict | None:
    """Return the article by number: 35, "35", "Điều 35" or "Điều 35 khoản 1 điểm a". None if absent."""
    m = re.search(r"(?:điều\s*)?(\d+)", str(dieu), flags=re.IGNORECASE)
    if not m:
        return None
    client = get_client()
    _check_collection(client)
    pts = client.retrieve(COLLECTION, ids=[point_id(f"dieu-{int(m.group(1))}")], with_payload=True)
    return dict(pts[0].payload) if pts else None


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("query", nargs="?", help="câu hỏi")
    p.add_argument("-k", type=int, default=5)
    p.add_argument("--dieu", help="tra trực tiếp theo số điều")
    args = p.parse_args()
    try:
        _cli(p, args)
    finally:
        get_client().close()


def _cli(p, args) -> None:
    if args.dieu:
        a = get_article(args.dieu)
        print(a["noi_dung"] if a else "Không tìm thấy")
        return
    if not args.query:
        p.error("cần query hoặc --dieu")
    for r in retrieve(args.query, k=args.k):
        print(f"{r['score']:.4f}  Điều {r['dieu']}. {r['tieu_de']}")


if __name__ == "__main__":
    main()
