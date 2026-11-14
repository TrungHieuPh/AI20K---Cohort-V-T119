"""Test core/answer.py (RAG hỏi đáp chạy theo lô). Retrieve và LLM giả, dữ liệu giả trong mock/."""

import json
from pathlib import Path

import pytest

from core.answer import KHONG_CO_CAN_CU, answer_one

MOCK = json.loads(
    (Path(__file__).resolve().parent.parent / "mock" / "mock_chunks.json").read_text(encoding="utf-8")
)
CHUNKS = MOCK["chunks"]  # dieu-35, dieu-36 (nội dung giả)


def fake_retrieve(query, k=5):
    return [dict(c) for c in CHUNKS]


def llm_tra(du_lieu, chi_phi=0.0002, da_gui=None):
    """LLM giả trả du_lieu (dict → JSON, str → nguyên văn); ghi lại messages vào da_gui nếu có."""

    def _llm(messages):
        if da_gui is not None:
            da_gui.append(messages)
        return (du_lieu if isinstance(du_lieu, str) else json.dumps(du_lieu, ensure_ascii=False)), chi_phi

    return _llm


def hoi(du_lieu, **kw):
    return answer_one("câu hỏi giả", retrieve_fn=fake_retrieve, llm_fn=llm_tra(du_lieu), **kw)


def test_tra_ve_cau_tra_loi_trich_dan_va_dieu_truy_hoi():
    kq = hoi({"cau_tra_loi": "A", "trich_dan": ["Điều 35 khoản 1"]})
    assert kq["cau_tra_loi"] == "A"
    assert kq["trich_dan"] == ["Điều 35 khoản 1"]
    assert kq["dieu_truy_hoi"] == ["dieu-35", "dieu-36"]
    assert kq["chi_phi_usd"] == 0.0002
    assert isinstance(kq["thoi_gian_ms"], int)


def test_prompt_chua_cau_hoi_van_ban_dieu_va_cau_khong_can_cu():
    da_gui = []
    answer_one("CÂU HỎI XYZ", retrieve_fn=fake_retrieve,
               llm_fn=llm_tra({"cau_tra_loi": "A", "trich_dan": []}, da_gui=da_gui))
    assert len(da_gui) == 1  # một lần gọi LLM
    he_thong, nguoi_dung = da_gui[0][0]["content"], da_gui[0][1]["content"]
    assert KHONG_CO_CAN_CU in he_thong
    assert "CÂU HỎI XYZ" in nguoi_dung
    for c in CHUNKS:
        assert c["noi_dung"] in nguoi_dung


def test_cau_khong_can_cu_dung_nguyen_van_quy_dinh():
    assert KHONG_CO_CAN_CU == "Bộ luật Lao động không có quy định trực tiếp về vấn đề này."


def test_k_truyen_xuong_retrieve():
    goi = []

    def retrieve(query, k=5):
        goi.append(k)
        return fake_retrieve(query, k)

    answer_one("q", retrieve_fn=retrieve, llm_fn=llm_tra({"cau_tra_loi": "A", "trich_dan": []}), k=3)
    assert goi == [3]


def test_doc_json_trong_code_fence():
    noi_dung = json.dumps({"cau_tra_loi": "B", "trich_dan": []}, ensure_ascii=False)
    assert hoi(f"Đây:\n```json\n{noi_dung}\n```")["cau_tra_loi"] == "B"


def test_trich_dan_la_chuoi_thi_thanh_list():
    assert hoi({"cau_tra_loi": "A", "trich_dan": "Điều 35"})["trich_dan"] == ["Điều 35"]


def test_thieu_trich_dan_thi_la_list_rong():
    assert hoi({"cau_tra_loi": KHONG_CO_CAN_CU})["trich_dan"] == []


@pytest.mark.parametrize(
    "du_lieu",
    ["không phải JSON", {"trich_dan": []}, {"cau_tra_loi": "   ", "trich_dan": []}, {"cau_tra_loi": "A", "trich_dan": 5}],
    ids=["khong_json", "thieu_cau_tra_loi", "cau_tra_loi_rong", "trich_dan_la_so"],
)
def test_ket_qua_llm_khong_hop_le_thi_bao_loi(du_lieu):
    with pytest.raises(ValueError):
        hoi(du_lieu)


class LoiGia(Exception):
    status_code = 429


def test_loi_429_duoc_thu_lai(monkeypatch):
    monkeypatch.setattr("core.audit.time.sleep", lambda s: None)
    dem = {"goi": 0}

    def llm(messages):
        dem["goi"] += 1
        if dem["goi"] == 1:
            raise LoiGia("quá giới hạn")
        return json.dumps({"cau_tra_loi": "A", "trich_dan": []}), 0.0

    assert answer_one("q", retrieve_fn=fake_retrieve, llm_fn=llm)["cau_tra_loi"] == "A"
    assert dem["goi"] == 2


# --- run_answer: chạy theo lô ---------------------------------------------------------

import csv  # noqa: E402

from core import answer as answer_mod  # noqa: E402
from core.answer import run_answer  # noqa: E402


def ghi_cau_hoi(path, dong, cot=("id", "cau_hoi"), encoding="utf-8"):
    with open(path, "w", encoding=encoding, newline="") as f:
        w = csv.writer(f)
        w.writerow(cot)
        w.writerows(dong)
    return path


def tra_loi_gia(cau_hoi):
    return {"cau_tra_loi": f"Trả lời cho: {cau_hoi}", "trich_dan": ["Điều 35"], "dieu_truy_hoi": ["dieu-35"],
            "thoi_gian_ms": 5, "chi_phi_usd": 0.0001}


def doc_csv(path):
    with open(path, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def test_ghi_csv_dung_dinh_dang_audit_doc_duoc(tmp_path):
    out = tmp_path / "results_answers.csv"
    run_answer(ghi_cau_hoi(tmp_path / "q.csv", [(7, "hỏi bảy"), (3, "hỏi ba")]), out, answer_fn=tra_loi_gia)
    dong = doc_csv(out)
    assert list(dong[0].keys()) == ["id", "cau_hoi", "cau_tra_loi"]
    assert [(d["id"], d["cau_hoi"], d["cau_tra_loi"]) for d in dong] == [
        ("7", "hỏi bảy", "Trả lời cho: hỏi bảy"), ("3", "hỏi ba", "Trả lời cho: hỏi ba")]


def test_cau_tra_loi_co_dau_phay_nhay_xuong_dong_doc_lai_nguyen_van(tmp_path):
    kho = 'Có, theo "Điều 35",\nngười lao động phải báo trước; xem thêm khoản 2.'
    out = tmp_path / "results_answers.csv"
    run_answer(ghi_cau_hoi(tmp_path / "q.csv", [(1, "q")]), out, answer_fn=lambda q: {**tra_loi_gia(q), "cau_tra_loi": kho})
    assert doc_csv(out)[0]["cau_tra_loi"] == kho


def test_cau_loi_hai_lan_khong_co_trong_csv_co_loi_trong_json(tmp_path):
    dem = {}

    def answer_fn(cau_hoi):
        dem[cau_hoi] = dem.get(cau_hoi, 0) + 1
        if cau_hoi == "hỏng" or (cau_hoi == "hỏng một lần" and dem[cau_hoi] == 1):
            raise ValueError("LLM không trả về JSON đọc được")
        return tra_loi_gia(cau_hoi)

    out = tmp_path / "results_answers.csv"
    kq = run_answer(ghi_cau_hoi(tmp_path / "q.csv", [(1, "hỏng"), (2, "hỏng một lần"), (3, "ổn")]), out, answer_fn=answer_fn)
    assert [d["id"] for d in doc_csv(out)] == ["2", "3"]
    assert dem == {"hỏng": 2, "hỏng một lần": 2, "ổn": 1}
    loi = json.loads(out.with_suffix(".json").read_text(encoding="utf-8"))["cau"][0]
    assert loi["id"] == 1 and "JSON" in loi["loi"]
    assert kq["tong_ket"]["loi"] == 1 and kq["tong_ket"]["tra_loi_duoc"] == 2


def test_cau_hoi_rong_khong_goi_llm_va_ghi_loi(tmp_path):
    goi = []
    out = tmp_path / "results_answers.csv"
    kq = run_answer(ghi_cau_hoi(tmp_path / "q.csv", [(1, "   "), (2, "q")]), out,
                    answer_fn=lambda q: goi.append(q) or tra_loi_gia(q))
    assert goi == ["q"]
    assert [d["id"] for d in doc_csv(out)] == ["2"]
    assert "rỗng" in kq["cau"][0]["loi"]


def test_doc_csv_co_bom_va_cot_thua(tmp_path):
    q = ghi_cau_hoi(tmp_path / "q.csv", [("r01", "hỏi", "35")], cot=("id", "cau_hoi", "dieu_dung"), encoding="utf-8-sig")
    kq = run_answer(q, tmp_path / "results_answers.csv", answer_fn=tra_loi_gia)
    assert kq["cau"][0]["id"] == "r01"


def test_thieu_cot_cau_hoi_thi_bao_loi(tmp_path):
    q = ghi_cau_hoi(tmp_path / "q.csv", [(1, "x")], cot=("id", "cau_tra_loi"))
    with pytest.raises(ValueError, match="cau_hoi"):
        run_answer(q, tmp_path / "results_answers.csv", answer_fn=tra_loi_gia)


def test_truy_hoi_hong_thi_dung_truoc_cau_dau(tmp_path):
    from core.audit import Nguon

    goi = {"n": 0}

    def retrieve(query, k=5):
        goi["n"] += 1
        raise RuntimeError("Không nạp được model BAAI/bge-m3")

    out = tmp_path / "results_answers.csv"
    with pytest.raises(RuntimeError, match="bge-m3"):
        run_answer(ghi_cau_hoi(tmp_path / "q.csv", [(1, "q"), (2, "q")]), out,
                   nguon=Nguon("nguồn giả", retrieve, lambda d: None), llm_fn=llm_tra({"cau_tra_loi": "A"}))
    assert goi["n"] == 1
    assert not out.exists() and not out.with_suffix(".json").exists()


def test_nguon_va_k_duoc_dung_cho_tung_cau(tmp_path):
    from core.audit import Nguon

    k_nhan = []

    def retrieve(query, k=5):
        k_nhan.append(k)
        return fake_retrieve(query, k)

    kq = run_answer(ghi_cau_hoi(tmp_path / "q.csv", [(1, "q")]), tmp_path / "results_answers.csv", k=3,
                    nguon=Nguon("nguồn giả", retrieve, lambda d: None),
                    llm_fn=llm_tra({"cau_tra_loi": "A", "trich_dan": []}))
    assert k_nhan == [1, 3]  # 1 lần chạy thử lúc bắt đầu, rồi k=3 cho câu hỏi
    assert kq["tong_ket"]["k"] == 3 and kq["tong_ket"]["retriever"] == "nguồn giả"


def test_tong_ket_va_json_cung_ten(tmp_path):
    out = tmp_path / "results_answers.csv"
    kq = run_answer(ghi_cau_hoi(tmp_path / "q.csv", [(1, "q1"), (2, "q2")]), out,
                    answer_fn=lambda q: {**tra_loi_gia(q), "cau_tra_loi": KHONG_CO_CAN_CU} if q == "q2" else tra_loi_gia(q))
    tk = kq["tong_ket"]
    assert (tk["so_cau"], tk["tra_loi_duoc"], tk["loi"], tk["khong_co_can_cu"], tk["k"]) == (2, 2, 0, 1, 5)
    assert json.loads(out.with_suffix(".json").read_text(encoding="utf-8")) == kq


def test_dong_lenh_ghi_hai_file(tmp_path, monkeypatch):
    from core.audit import Nguon

    monkeypatch.setattr(answer_mod, "chon_nguon", lambda: Nguon("nguồn giả", fake_retrieve, lambda d: None))
    monkeypatch.setattr(answer_mod, "_kiem_cau_hinh_llm", lambda: "gia/model-gia")
    monkeypatch.setattr(answer_mod, "answer_one", lambda cau_hoi, **kw: tra_loi_gia(cau_hoi))
    out = tmp_path / "results_answers.csv"
    answer_mod.main([str(ghi_cau_hoi(tmp_path / "q.csv", [(1, "q")])), "--out", str(out), "--k", "4"])
    assert doc_csv(out)[0]["cau_tra_loi"] == "Trả lời cho: q"
    tk = json.loads(out.with_suffix(".json").read_text(encoding="utf-8"))["tong_ket"]
    assert (tk["k"], tk["model"], tk["retriever"]) == (4, "gia/model-gia", "nguồn giả")


# --- Sửa sau review -------------------------------------------------------------------

def test_csv_dau_ra_di_qua_run_audit_giu_nguyen_id_va_cau_tra_loi(tmp_path):
    from core.audit import run_audit

    kho = 'Có, theo "Điều 35",\r\nphải báo trước.'
    out = tmp_path / "results_answers.csv"
    run_answer(ghi_cau_hoi(tmp_path / "q.csv", [("r01", "hỏi 1"), (2, "hỏi 2")]), out,
               answer_fn=lambda q: {**tra_loi_gia(q), "cau_tra_loi": kho if q == "hỏi 1" else "B"})
    nhan = []

    def audit_fn(cau_hoi, cau_tra_loi):
        nhan.append((cau_hoi, cau_tra_loi))
        return {"ket_luan": "DUNG", "faithfulness": 1.0, "cac_y": [], "dieu_truy_hoi": [], "thoi_gian_ms": 1, "chi_phi_usd": 0}

    kq = run_audit(out, tmp_path / "results.json", audit_fn=audit_fn)
    assert nhan == [("hỏi 1", kho), ("hỏi 2", "B")]
    assert [c["id"] for c in kq["cau"]] == ["r01", 2]


def test_run_audit_tu_choi_csv_khong_co_cau_nao(tmp_path):
    from core.audit import run_audit

    p = tmp_path / "rong.csv"
    p.write_text("id,cau_hoi,cau_tra_loi\n", encoding="utf-8")
    with pytest.raises(ValueError, match="không có câu nào"):
        run_audit(p, tmp_path / "results.json", audit_fn=lambda q, a: {})


def test_dong_lenh_co_cau_loi_thi_thoat_ma_1_nhung_van_ghi_file(tmp_path, monkeypatch):
    from core.audit import Nguon

    monkeypatch.setattr(answer_mod, "chon_nguon", lambda: Nguon("nguồn giả", fake_retrieve, lambda d: None))
    monkeypatch.setattr(answer_mod, "_kiem_cau_hinh_llm", lambda: "gia/model-gia")

    def hong(cau_hoi, **kw):
        raise ValueError("lỗi giả")

    monkeypatch.setattr(answer_mod, "answer_one", hong)
    out = tmp_path / "results_answers.csv"
    with pytest.raises(SystemExit) as e:
        answer_mod.main([str(ghi_cau_hoi(tmp_path / "q.csv", [(1, "q")])), "--out", str(out)])
    assert e.value.code == 1
    assert out.exists() and out.with_suffix(".json").exists()


def test_thu_muc_dau_ra_chua_co_thi_tu_tao(tmp_path):
    out = tmp_path / "runs" / "lan1" / "results_answers.csv"
    run_answer(ghi_cau_hoi(tmp_path / "q.csv", [(1, "q")]), out, answer_fn=tra_loi_gia)
    assert out.exists()


def test_dau_ra_duoi_json_thi_bao_loi_truoc_khi_chay(tmp_path):
    goi = []
    with pytest.raises(ValueError, match=".csv"):
        run_answer(ghi_cau_hoi(tmp_path / "q.csv", [(1, "q")]), tmp_path / "results.json",
                   answer_fn=lambda q: goi.append(q) or tra_loi_gia(q))
    assert goi == []


def test_dong_thieu_o_khong_lam_hong_ca_luot(tmp_path):
    q = tmp_path / "q.csv"
    q.write_text("id,cau_hoi\n1,hỏi một\n2\n3,hỏi ba\n", encoding="utf-8")
    kq = run_answer(q, tmp_path / "results_answers.csv", answer_fn=tra_loi_gia)
    assert [c.get("loi") for c in kq["cau"]] == [None, "Câu hỏi rỗng", None]
    assert kq["tong_ket"]["tra_loi_duoc"] == 2


@pytest.mark.parametrize("tra_loi", [
    KHONG_CO_CAN_CU,
    f'"{KHONG_CO_CAN_CU}"',
    f"{KHONG_CO_CAN_CU} Bạn nên xem thêm nội quy công ty.",
])
def test_nhan_ra_cau_tu_choi_ke_ca_khi_co_nhay_hoac_giai_thich_them(tmp_path, tra_loi):
    kq = run_answer(ghi_cau_hoi(tmp_path / "q.csv", [(1, "q")]), tmp_path / "results_answers.csv",
                    answer_fn=lambda q: {**tra_loi_gia(q), "cau_tra_loi": tra_loi, "trich_dan": []})
    assert kq["tong_ket"]["khong_co_can_cu"] == 1
    assert kq["cau"][0]["tu_choi"] is True


def test_danh_dau_dieu_trich_ngoai_top_k(tmp_path):
    kq = run_answer(ghi_cau_hoi(tmp_path / "q.csv", [(1, "q")]), tmp_path / "results_answers.csv",
                    answer_fn=lambda q: {**tra_loi_gia(q), "trich_dan": ["Điều 35 khoản 1", "Điều 99"],
                                         "dieu_truy_hoi": ["dieu-35", "dieu-36"]})
    assert kq["cau"][0]["trich_dan_ngoai"] == [99]
    assert kq["cau"][0]["tu_choi"] is False
