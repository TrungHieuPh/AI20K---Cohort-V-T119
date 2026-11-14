"""Truy hồi tạm bằng BM25 (dự phòng khi core.retrieve chưa có hoặc lỗi).

Cùng chữ ký với core.retrieve: retrieve(query, k=5) -> list[chunk + score].
Đọc data/law/dieu.jsonl (mỗi dòng một Điều). Tách từ theo âm tiết, thêm cặp âm tiết liền nhau
vì từ tiếng Việt thường gồm 2 âm tiết ("làm thêm", "báo trước").
"""

import json
import re
from functools import lru_cache
from pathlib import Path

from rank_bm25 import BM25Okapi

DUONG_DAN_MAC_DINH = Path(__file__).resolve().parent.parent / "data" / "law" / "dieu.jsonl"
TRUONG_TRA_VE = ("chunk_id", "dieu", "tieu_de", "noi_dung")


def _tach_tu(van_ban):
    am_tiet = re.findall(r"\w+", van_ban.lower())
    return am_tiet + [f"{a}_{b}" for a, b in zip(am_tiet, am_tiet[1:])]


@lru_cache(maxsize=4)
def _nap(path):
    with open(path, encoding="utf-8") as f:
        chunks = [json.loads(dong) for dong in f if dong.strip()]
    if not chunks:
        raise ValueError(f"Không có Điều nào trong {path}")
    return chunks, BM25Okapi([_tach_tu(c["noi_dung"]) for c in chunks])


def retrieve(query, k=5, *, path=None):
    chunks, bm25 = _nap(str(path or DUONG_DAN_MAC_DINH))
    diem = bm25.get_scores(_tach_tu(query))
    thu_tu = sorted(range(len(chunks)), key=lambda i: diem[i], reverse=True)[:k]
    return [{**{t: chunks[i][t] for t in TRUONG_TRA_VE}, "score": float(diem[i])} for i in thu_tu]
