"""API hỏi đáp Bộ luật Lao động (MVP): câu hỏi → top-k Điều → LLM trả lời có trích Điều.

Bọc core.answer.answer_one, chỉ hỏi trên bộ luật đã có trong index (chưa có tài liệu riêng của người dùng).

Chạy (một process, vì Qdrant local khoá thư mục .qdrant/):
    python -m uvicorn api.server:app --port 8000
Mở http://localhost:8000 để chat thử, http://localhost:8000/docs để xem API.

    POST /api/chat           {"cau_hoi": "...", "k": 5} -> câu trả lời, trích dẫn, các Điều truy hồi
    GET  /api/dieu/{so}      toàn văn một Điều
    GET  /api/health         nguồn truy hồi, model LLM
"""

import logging
import threading
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

from core.answer import _la_tu_choi, _trich_dan_ngoai, answer_one
from core.audit import _kiem_cau_hinh_llm, chon_nguon

log = logging.getLogger("api")

TRANG_CHAT = Path(__file__).with_name("chat.html")
DO_DAI_TOI_DA = 1000
DO_DAI_TRICH = 300

_trang_thai = {}
# Embedder và Qdrant local không chắc an toàn khi nhiều luồng gọi cùng lúc: khoá phần truy hồi,
# còn phần gọi LLM (chậm nhất) vẫn chạy song song.
_khoa_truy_hoi = threading.Lock()


@asynccontextmanager
async def lifespan(app):
    nguon = chon_nguon()
    model = _kiem_cau_hinh_llm()
    log.info("Truy hồi: %s | LLM: %s", nguon.ten, model)
    nguon.retrieve("kiểm tra truy hồi", k=1)  # nạp embedder ngay, để câu hỏi đầu không phải chờ
    _trang_thai.update(nguon=nguon, model=model)
    yield
    from core import vectordb

    if vectordb.get_client.cache_info().currsize:
        vectordb.get_client().close()


app = FastAPI(title="lexgate – hỏi đáp Bộ luật Lao động", lifespan=lifespan)


class CauHoi(BaseModel):
    cau_hoi: str = Field(min_length=1, max_length=DO_DAI_TOI_DA)
    k: int = Field(default=5, ge=1, le=10)


def _rut_gon(chunk):
    noi_dung = chunk.get("noi_dung", "")
    return {
        "dieu": chunk["dieu"],
        "tieu_de": chunk.get("tieu_de", ""),
        "score": chunk.get("score"),
        "trich": noi_dung[:DO_DAI_TRICH] + ("…" if len(noi_dung) > DO_DAI_TRICH else ""),
    }


@app.post("/api/chat")
def chat(body: CauHoi):
    cau_hoi = body.cau_hoi.strip()
    if not cau_hoi:
        raise HTTPException(422, "Câu hỏi rỗng")
    nguon = _trang_thai["nguon"]
    da_truy_hoi = []

    def truy_hoi(q, k):
        with _khoa_truy_hoi:
            chunks = nguon.retrieve(q, k=k)
        da_truy_hoi.extend(chunks)
        return chunks

    try:
        kq = answer_one(cau_hoi, retrieve_fn=truy_hoi, k=body.k)
    except Exception as e:
        log.exception("Lỗi khi trả lời: %s", cau_hoi)
        raise HTTPException(502, f"Không trả lời được: {type(e).__name__}: {e}") from e
    return {
        "cau_hoi": cau_hoi,
        **kq,
        "tu_choi": _la_tu_choi(kq["cau_tra_loi"]),
        "trich_dan_ngoai": _trich_dan_ngoai(kq["trich_dan"], kq["dieu_truy_hoi"]),
        "cac_dieu": [_rut_gon(c) for c in da_truy_hoi],
    }


@app.get("/api/dieu/{so}")
def dieu(so: int):
    with _khoa_truy_hoi:
        a = _trang_thai["nguon"].get_article(so)
    if not a:
        raise HTTPException(404, f"Không có Điều {so}")
    return {k: a.get(k) for k in ("dieu", "tieu_de", "noi_dung", "nguon")}


@app.get("/api/health")
def health():
    return {"retriever": _trang_thai["nguon"].ten, "model": _trang_thai["model"]}


@app.get("/", response_class=HTMLResponse)
def trang_chat():
    return TRANG_CHAT.read_text(encoding="utf-8")
