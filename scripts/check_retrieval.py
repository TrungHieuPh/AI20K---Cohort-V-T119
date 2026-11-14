"""Retrieval smoke test: is the right article in the top-k?

Usage:
    python -m scripts.check_retrieval data/test/retrieval_smoke.csv [-k 5]

CSV columns: id, cau_hoi, dieu_dung (accepted article numbers separated by "|").
Prints Hit@1/3/5 and MRR, and writes the full top-k trace to results_retrieval.json
(git-ignored). These questions are a retrieval dev set only; keep them apart from
the held-out test set.
"""
from __future__ import annotations

import argparse
import csv
import json

from core.retrieve import retrieve
from core.vectordb import COLLECTION, EMBED_MODEL, get_client


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("csv_path")
    p.add_argument("-k", type=int, default=5)
    p.add_argument("--out", default="results_retrieval.json")
    args = p.parse_args()

    rows = list(csv.DictReader(open(args.csv_path, encoding="utf-8-sig")))
    trace, hits, rr = [], {1: 0, 3: 0, 5: 0}, 0.0
    for r in rows:
        gold = {int(x) for x in r["dieu_dung"].split("|")}
        got = retrieve(r["cau_hoi"], k=args.k)
        ranks = [i for i, c in enumerate(got, 1) if c["dieu"] in gold]
        rank = ranks[0] if ranks else None
        for n in hits:
            hits[n] += bool(rank and rank <= n)
        rr += 1 / rank if rank else 0
        mark = f"@{rank}" if rank else "MISS"
        print(f"{r['id']:4} {mark:5} gold={sorted(gold)} top={[c['dieu'] for c in got]}  {r['cau_hoi']}")
        trace.append({
            "id": r["id"], "cau_hoi": r["cau_hoi"], "dieu_dung": sorted(gold), "rank": rank,
            "top_k": [{"dieu": c["dieu"], "tieu_de": c["tieu_de"], "score": c["score"]} for c in got],
        })

    n = len(rows)
    summary = {f"hit@{k}": f"{v}/{n}" for k, v in hits.items()} | {"mrr": round(rr / n, 3)}
    print(f"\n{COLLECTION} ({EMBED_MODEL}), {n} câu: {summary}")
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump({"collection": COLLECTION, "model": EMBED_MODEL, "summary": summary, "trace": trace},
                  f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    try:
        main()
    finally:
        get_client().close()
