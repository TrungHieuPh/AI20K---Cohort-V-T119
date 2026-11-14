"""Test core/retrieve_bm25.py trên dữ liệu giả mock/mock_dieu.jsonl."""

from pathlib import Path

import pytest

from core.retrieve_bm25 import retrieve

MOCK = Path(__file__).resolve().parent.parent / "mock" / "mock_dieu.jsonl"


@pytest.mark.parametrize(
    "query, dieu_dau",
    [
        ("Làm thêm giờ tối đa bao nhiêu?", 2),
        ("BÁO TRƯỚC khi nghỉ việc", 1),
        ("nghỉ hằng năm có hưởng lương không", 3),
    ],
)
def test_dieu_lien_quan_nhat_dung_dau(query, dieu_dau):
    kq = retrieve(query, k=3, path=MOCK)
    assert kq[0]["dieu"] == dieu_dau


def test_tra_dung_k_ket_qua_xep_theo_score_giam_dan():
    kq = retrieve("nghỉ việc", k=2, path=MOCK)
    assert len(kq) == 2
    assert kq[0]["score"] >= kq[1]["score"]


def test_k_lon_hon_so_dieu_thi_tra_tat_ca():
    assert len(retrieve("giờ", k=10, path=MOCK)) == 3


def test_moi_ket_qua_co_du_cac_truong_chunk():
    kq = retrieve("làm thêm", k=1, path=MOCK)[0]
    assert kq["chunk_id"] == "dieu-2"
    assert kq["tieu_de"] == "[GIẢ] Làm thêm giờ"
    assert kq["noi_dung"].startswith("Điều 2.")
    assert isinstance(kq["score"], float)
