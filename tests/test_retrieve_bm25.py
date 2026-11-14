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


# --- get_article: cùng cách gọi với core.retrieve.get_article ---------------------

from core.retrieve_bm25 import get_article  # noqa: E402


@pytest.mark.parametrize("dieu", [2, "2", "Điều 2", "Điều 2 khoản 1 điểm a", "điều 2"])
def test_get_article_nhan_nhieu_cach_ghi(dieu):
    a = get_article(dieu, path=MOCK)
    assert a["chunk_id"] == "dieu-2"
    assert a["noi_dung"].startswith("Điều 2.")


@pytest.mark.parametrize("dieu", [99, "không có số"])
def test_get_article_khong_co_thi_tra_none(dieu):
    assert get_article(dieu, path=MOCK) is None
