"""Test run_audit: đọc CSV, gọi audit cho từng câu, ghi results.json. Dùng audit giả."""

import csv
import json

import pytest

from core import audit
from core.audit import run_audit


def ghi_csv(path, dong, encoding="utf-8"):
    with open(path, "w", encoding=encoding, newline="") as f:
        w = csv.writer(f)
        w.writerow(["id", "cau_hoi", "cau_tra_loi"])
        w.writerows(dong)
    return path


def audit_gia(cau_hoi, cau_tra_loi):
    """Audit giả: câu trả lời chính là kết luận mong muốn; "LOI" thì ném lỗi."""
    if cau_tra_loi == "LOI":
        raise ValueError("LLM không trả về JSON đọc được")
    return {
        "ket_luan": cau_tra_loi,
        "faithfulness": None,
        "cac_y": [],
        "dieu_truy_hoi": ["dieu-35"],
        "thoi_gian_ms": 1,
        "chi_phi_usd": 0.001,
    }


def chay(tmp_path, ket_luan_cac_cau):
    csv_path = ghi_csv(tmp_path / "in.csv", [(i, f"câu hỏi {i}", kl) for i, kl in enumerate(ket_luan_cac_cau, 1)])
    return run_audit(csv_path, tmp_path / "results.json", audit_fn=audit_gia)


def test_id_lay_tu_csv_va_giu_thu_tu(tmp_path):
    csv_path = ghi_csv(tmp_path / "in.csv", [(7, "q", "DUNG"), (3, "q", "SAI"), ("A1", "q", "DUNG")])
    kq = run_audit(csv_path, tmp_path / "results.json", audit_fn=audit_gia)
    assert [c["id"] for c in kq["cau"]] == [7, 3, "A1"]
    assert [c["ket_luan"] for c in kq["cau"]] == ["DUNG", "SAI", "DUNG"]


@pytest.mark.parametrize(
    "ket_luan, cong",
    [
        (["DUNG", "SAI", "KHONG_CAN_CU"], "KHONG_DAT"),
        (["DUNG", "KHONG_CAN_CU"], "CAN_XEM_LAI"),
        (["DUNG", "DUNG"], "DAT"),
    ],
)
def test_cong_ba_muc(tmp_path, ket_luan, cong):
    assert chay(tmp_path, ket_luan)["tong_ket"]["cong"] == cong


def test_tong_ket_dem_dung_so_cau(tmp_path):
    tk = chay(tmp_path, ["DUNG", "SAI", "SAI", "KHONG_CAN_CU", "DUNG", "DUNG"])["tong_ket"]
    assert (tk["so_cau"], tk["dung"], tk["sai"], tk["khong_can_cu"], tk["loi"]) == (6, 3, 2, 1, 0)


def test_loi_mot_cau_thi_ghi_loi_va_chay_tiep(tmp_path):
    kq = chay(tmp_path, ["DUNG", "LOI", "DUNG"])
    assert [c["ket_luan"] for c in kq["cau"]] == ["DUNG", "LOI", "DUNG"]
    assert "JSON" in kq["cau"][1]["loi"]
    assert kq["cau"][1]["id"] == 2
    assert kq["tong_ket"]["loi"] == 1


@pytest.mark.parametrize("ket_luan, cong", [(["DUNG", "LOI"], "CAN_XEM_LAI"), (["SAI", "LOI"], "KHONG_DAT")])
def test_cau_loi_khong_de_cong_dat(tmp_path, ket_luan, cong):
    assert chay(tmp_path, ket_luan)["tong_ket"]["cong"] == cong


def test_ghi_file_utf8_giu_nguyen_tieng_viet(tmp_path):
    kq = chay(tmp_path, ["LOI"])  # thông báo lỗi có chữ "không"
    van_ban = (tmp_path / "results.json").read_text(encoding="utf-8")
    assert "không" in van_ban
    assert json.loads(van_ban) == kq


def test_doc_duoc_csv_co_bom_tu_excel(tmp_path):
    csv_path = ghi_csv(tmp_path / "in.csv", [(1, "q", "DUNG")], encoding="utf-8-sig")
    kq = run_audit(csv_path, tmp_path / "results.json", audit_fn=audit_gia)
    assert kq["cau"][0]["id"] == 1


def test_csv_thieu_cot_thi_bao_loi(tmp_path):
    p = tmp_path / "in.csv"
    p.write_text("id,cau_hoi\n1,q\n", encoding="utf-8")
    with pytest.raises(ValueError, match="cau_tra_loi"):
        run_audit(p, tmp_path / "results.json", audit_fn=audit_gia)


def test_dong_lenh_ghi_results_json(tmp_path, monkeypatch):
    csv_path = ghi_csv(tmp_path / "in.csv", [(1, "q", "SAI")])
    monkeypatch.setattr(audit, "chon_nguon", lambda: nguon_gia()[0])
    monkeypatch.setattr(audit, "_kiem_cau_hinh_llm", lambda: "gia/model-gia")
    monkeypatch.setattr(audit, "audit_one", lambda cau_hoi, cau_tra_loi, **kw: audit_gia(cau_hoi, cau_tra_loi))
    monkeypatch.chdir(tmp_path)
    audit.main([str(csv_path)], cau_hinh_path=tmp_path / "khong_co.json")
    kq = json.loads((tmp_path / "results.json").read_text(encoding="utf-8"))
    assert kq["tong_ket"]["cong"] == "KHONG_DAT"


# --- Chạy lại một lần khi lỗi ---------------------------------------------------

def audit_loi_truoc(so_lan_loi):
    dem = {"goi": 0}

    def _audit(cau_hoi, cau_tra_loi):
        dem["goi"] += 1
        if dem["goi"] <= so_lan_loi:
            raise TimeoutError(f"lỗi lần {dem['goi']}")
        return audit_gia(cau_hoi, "DUNG")

    return _audit, dem


def test_loi_lan_dau_thi_chay_lai_mot_lan_va_thanh_cong(tmp_path):
    audit_fn, dem = audit_loi_truoc(1)
    csv_path = ghi_csv(tmp_path / "in.csv", [(1, "q", "x")])
    kq = run_audit(csv_path, tmp_path / "r.json", audit_fn=audit_fn)
    assert kq["cau"][0]["ket_luan"] == "DUNG"
    assert dem["goi"] == 2


def test_loi_ca_hai_lan_thi_ghi_loi_cua_lan_sau(tmp_path):
    audit_fn, dem = audit_loi_truoc(5)
    csv_path = ghi_csv(tmp_path / "in.csv", [(1, "q", "x")])
    kq = run_audit(csv_path, tmp_path / "r.json", audit_fn=audit_fn)
    assert kq["cau"][0]["ket_luan"] == "LOI"
    assert "lỗi lần 2" in kq["cau"][0]["loi"]
    assert dem["goi"] == 2


# --- Tổng số câu khớp -----------------------------------------------------------

def test_ket_luan_la_thi_ghi_loi_de_tong_van_khop(tmp_path):
    def audit_la(cau_hoi, cau_tra_loi):
        return {**audit_gia(cau_hoi, "DUNG"), "ket_luan": "KHONG_RO"}

    csv_path = ghi_csv(tmp_path / "in.csv", [(1, "q", "x")])
    kq = run_audit(csv_path, tmp_path / "r.json", audit_fn=audit_la)
    assert kq["cau"][0]["ket_luan"] == "LOI"
    assert "KHONG_RO" in kq["cau"][0]["loi"]


def test_so_cau_bang_tong_cac_loai(tmp_path):
    tk = chay(tmp_path, ["DUNG", "SAI", "LOI", "KHONG_CAN_CU", "DUNG"])["tong_ket"]
    assert tk["so_cau"] == 5
    assert tk["dung"] + tk["sai"] + tk["khong_can_cu"] + tk["loi"] == tk["so_cau"]


# --- Chọn retriever một lần cho cả lượt chạy ---------------------------------------

def nguon_gia(hong=False):
    from core.audit import Nguon

    goi = {"retrieve": 0}

    def retrieve(query, k=5):
        goi["retrieve"] += 1
        if hong:
            raise RuntimeError("Không nạp được model BAAI/bge-m3")
        return [{"chunk_id": "dieu-35", "dieu": 35, "tieu_de": "[GIẢ]", "noi_dung": "[GIẢ] nội dung"}]

    return Nguon("nguồn giả", retrieve, lambda dieu: None), goi


def llm_gia(messages):
    return json.dumps({"cac_y": [{"noi_dung": "ý", "nhan": "DUNG", "trich_dan": "Điều 35",
                                  "bang_chung": "", "giai_thich": ""}]}), 0.0


def test_retriever_hong_thi_dung_ngay_truoc_khi_chay_cau_nao(tmp_path):
    nguon, goi = nguon_gia(hong=True)
    csv_path = ghi_csv(tmp_path / "in.csv", [(1, "q", "a"), (2, "q", "a")])
    with pytest.raises(RuntimeError, match="bge-m3"):
        run_audit(csv_path, tmp_path / "r.json", nguon=nguon, llm_fn=llm_gia)
    assert goi["retrieve"] == 1  # chỉ lần kiểm tra lúc bắt đầu, không thử từng câu
    assert not (tmp_path / "r.json").exists()


def test_ghi_log_retriever_dang_dung_khi_bat_dau(tmp_path, caplog):
    nguon, _ = nguon_gia()
    csv_path = ghi_csv(tmp_path / "in.csv", [(1, "q", "a")])
    with caplog.at_level("INFO", logger="core.audit"):
        run_audit(csv_path, tmp_path / "r.json", nguon=nguon, llm_fn=llm_gia)
    assert "nguồn giả" in caplog.records[0].getMessage()


def test_cac_cau_dung_retriever_da_chon(tmp_path):
    nguon, goi = nguon_gia()
    csv_path = ghi_csv(tmp_path / "in.csv", [(1, "q", "a"), (2, "q", "a")])
    kq = run_audit(csv_path, tmp_path / "r.json", nguon=nguon, llm_fn=llm_gia)
    assert [c["dieu_truy_hoi"] for c in kq["cau"]] == [["dieu-35"], ["dieu-35"]]
    assert kq["tong_ket"]["cong"] == "DAT"
    assert goi["retrieve"] == 3  # 1 lần kiểm tra + 2 câu


# --- Kiểm tra cấu hình LLM một lần lúc bắt đầu (chỉ khi dùng LLM thật) ---------------

class LiteLLMKiemKey:
    """litellm giả: validate_environment báo thiếu GIA_API_KEY nếu biến không có trong môi trường."""

    @staticmethod
    def validate_environment(model):
        import os

        thieu = [] if "GIA_API_KEY" in os.environ else ["GIA_API_KEY"]
        return {"keys_in_environment": not thieu, "missing_keys": thieu}


@pytest.fixture
def env_llm(monkeypatch):
    import sys

    monkeypatch.setattr(audit, "_nap_env", lambda: None)
    monkeypatch.setitem(sys.modules, "litellm", LiteLLMKiemKey)
    monkeypatch.setenv("LLM_MODEL", "gia/model-gia")
    monkeypatch.setenv("GIA_API_KEY", "khoa-gia")
    return monkeypatch


def chay_llm_that(tmp_path):
    nguon, goi = nguon_gia()
    csv_path = ghi_csv(tmp_path / "in.csv", [(1, "q", "a")])
    return lambda: run_audit(csv_path, tmp_path / "r.json", nguon=nguon), goi


def test_thieu_llm_model_thi_dung_truoc_khi_nap_retriever(tmp_path, env_llm):
    env_llm.delenv("LLM_MODEL")
    chay, goi = chay_llm_that(tmp_path)
    with pytest.raises(RuntimeError, match="LLM_MODEL"):
        chay()
    assert goi["retrieve"] == 0
    assert not (tmp_path / "r.json").exists()


def test_thieu_api_key_thi_bao_ten_bien_can_dien(tmp_path, env_llm):
    env_llm.delenv("GIA_API_KEY")
    chay, goi = chay_llm_that(tmp_path)
    with pytest.raises(RuntimeError, match="GIA_API_KEY"):
        chay()
    assert goi["retrieve"] == 0


def test_api_key_de_trong_tinh_la_thieu_va_moi_truong_giu_nguyen(tmp_path, env_llm):
    import os

    env_llm.setenv("GIA_API_KEY", "")
    chay, _ = chay_llm_that(tmp_path)
    with pytest.raises(RuntimeError, match="GIA_API_KEY"):
        chay()
    assert os.environ["GIA_API_KEY"] == ""


def test_cau_hinh_llm_du_thi_ghi_log_model_va_chay_tiep(tmp_path, env_llm, caplog):
    env_llm.setattr(audit, "_llm_mac_dinh", llm_gia)
    chay, goi = chay_llm_that(tmp_path)
    with caplog.at_level("INFO", logger="core.audit"):
        kq = chay()
    assert kq["tong_ket"]["cong"] == "DAT"
    assert any("gia/model-gia" in r.getMessage() for r in caplog.records)


# --- tong_ket.faithfulness_tb -----------------------------------------------------

def audit_faithfulness(cau_tra_loi_sang_faithfulness):
    """Audit giả: cau_tra_loi "LOI" thì ném lỗi; còn lại trả DUNG với faithfulness tra theo bảng."""

    def _audit(cau_hoi, cau_tra_loi):
        if cau_tra_loi == "LOI":
            raise ValueError("lỗi giả")
        return {**audit_gia(cau_hoi, "DUNG"), "faithfulness": cau_tra_loi_sang_faithfulness[cau_tra_loi]}

    return _audit


def chay_faithfulness(tmp_path, cac_cau, bang):
    csv_path = ghi_csv(tmp_path / "in.csv", [(i, "q", a) for i, a in enumerate(cac_cau, 1)])
    return run_audit(csv_path, tmp_path / "r.json", audit_fn=audit_faithfulness(bang))["tong_ket"]


def test_faithfulness_tb_la_trung_binh_cac_cau(tmp_path):
    tk = chay_faithfulness(tmp_path, ["a", "b", "c"], {"a": 1.0, "b": 0.5, "c": 0.0})
    assert tk["faithfulness_tb"] == 0.5


def test_faithfulness_tb_bo_qua_cau_loi(tmp_path):
    assert chay_faithfulness(tmp_path, ["a", "LOI"], {"a": 1.0})["faithfulness_tb"] == 1.0


@pytest.mark.parametrize("cac_cau, bang", [(["LOI", "LOI"], {}), (["a"], {"a": None})],
                         ids=["toan_cau_loi", "faithfulness_none"])
def test_faithfulness_tb_null_khi_khong_cau_nao_co_gia_tri(tmp_path, cac_cau, bang):
    assert chay_faithfulness(tmp_path, cac_cau, bang)["faithfulness_tb"] is None


def test_faithfulness_tb_tinh_tu_gia_tri_chua_lam_tron(tmp_path):
    """1/3, 1/3, 1.0: trung bình chưa làm tròn = 0.5556 → 0.56 (trung bình các giá trị đã làm tròn sẽ ra 0.55)."""
    def y_(nhan):
        return {"noi_dung": "ý", "nhan": nhan, "trich_dan": "", "bang_chung": "", "giai_thich": ""}

    bang = {"a": ["DUNG", "TRAI_LUAT", "TRAI_LUAT"], "b": ["DUNG", "KHONG_CAN_CU", "TRAI_LUAT"], "c": ["DUNG"]}

    def audit_fn(cau_hoi, cau_tra_loi):
        cac_y = [y_(n) for n in bang[cau_tra_loi]]
        return {**audit_gia(cau_hoi, "DUNG"), "cac_y": cac_y,
                "faithfulness": round(sum(y["nhan"] == "DUNG" for y in cac_y) / len(cac_y), 2)}

    csv_path = ghi_csv(tmp_path / "in.csv", [(1, "q", "a"), (2, "q", "b"), (3, "q", "c")])
    kq = run_audit(csv_path, tmp_path / "r.json", audit_fn=audit_fn)
    assert [c["faithfulness"] for c in kq["cau"]] == [0.33, 0.33, 1.0]
    assert kq["tong_ket"]["faithfulness_tb"] == 0.56


# --- results.json mang theo câu hỏi và câu trả lời (cho UI) -----------------------------

def test_moi_cau_co_cau_hoi_va_cau_tra_loi_ngay_sau_id(tmp_path):
    csv_path = ghi_csv(tmp_path / "in.csv", [(1, "Hỏi, có dấu phẩy?", "DUNG"), (2, "Hỏi hai", "LOI")])
    kq = run_audit(csv_path, tmp_path / "r.json", audit_fn=audit_gia)
    assert [(c["id"], c["cau_hoi"], c["cau_tra_loi"]) for c in kq["cau"]] == [
        (1, "Hỏi, có dấu phẩy?", "DUNG"), (2, "Hỏi hai", "LOI")]  # cả câu LOI cũng có
    assert list(kq["cau"][0])[:3] == ["id", "cau_hoi", "cau_tra_loi"]
    tren_dia = json.loads((tmp_path / "r.json").read_text(encoding="utf-8"))
    assert tren_dia["cau"][1]["cau_hoi"] == "Hỏi hai"


# --- Cấu hình truyền vào run_audit và đọc cau_hinh_dang_dung.json ---------------------

def test_run_audit_truyen_k_xuong_retrieve(tmp_path):
    from core.audit import Nguon

    k_nhan = []

    def retrieve(query, k=5):
        k_nhan.append(k)
        return [{"chunk_id": "dieu-35", "dieu": 35, "tieu_de": "[GIẢ]", "noi_dung": "[GIẢ]"}]

    csv_path = ghi_csv(tmp_path / "in.csv", [(1, "q", "a")])
    run_audit(csv_path, tmp_path / "r.json", nguon=Nguon("giả", retrieve, lambda d: None), llm_fn=llm_gia, k=8)
    assert k_nhan == [1, 8]  # 1 lần chạy thử, rồi k=8 cho câu


def test_run_audit_chon_nguon_va_model_theo_ten(tmp_path, monkeypatch):
    from core.audit import Nguon

    goi = {}
    monkeypatch.setattr(audit, "chon_nguon", lambda ten=None: goi.setdefault("nguon", ten) and Nguon(
        "giả", lambda q, k=5: [{"chunk_id": "dieu-35", "dieu": 35, "tieu_de": "", "noi_dung": ""}], lambda d: None))
    monkeypatch.setattr(audit, "_kiem_cau_hinh_llm", lambda model=None: goi.setdefault("kiem", model))
    monkeypatch.setattr(audit, "tao_llm", lambda model: goi.setdefault("llm", model) and llm_gia)
    csv_path = ghi_csv(tmp_path / "in.csv", [(1, "q", "a")])
    run_audit(csv_path, tmp_path / "r.json", retriever="bm25", model="openai/gpt-4o-mini")
    assert goi == {"nguon": "bm25", "kiem": "openai/gpt-4o-mini", "llm": "openai/gpt-4o-mini"}


def test_doc_cau_hinh(tmp_path):
    from core.audit import doc_cau_hinh

    assert doc_cau_hinh(tmp_path / "khong_co.json") is None
    tot = tmp_path / "tot.json"
    tot.write_text(json.dumps({"k": 3, "retriever": "qdrant", "model": "openai/gpt-4o-mini", "ma": "x"}), encoding="utf-8")
    assert doc_cau_hinh(tot)["k"] == 3
    thieu = tmp_path / "thieu.json"
    thieu.write_text(json.dumps({"k": 3}), encoding="utf-8")
    with pytest.raises(ValueError, match="thieu.json"):
        doc_cau_hinh(thieu)
    hong = tmp_path / "hong.json"
    hong.write_text("{không phải json", encoding="utf-8")
    with pytest.raises(ValueError, match="hong.json"):
        doc_cau_hinh(hong)


def test_dong_lenh_dung_cau_hinh_dang_dung(tmp_path, monkeypatch, caplog):
    nhan = {}
    monkeypatch.setattr(audit, "run_audit", lambda csv_path, out, **kw: nhan.update(kw) or {
        "tong_ket": {"so_cau": 1, "dung": 1, "sai": 0, "khong_can_cu": 0, "loi": 0, "cong": "DAT"}})
    ch = tmp_path / "cau_hinh_dang_dung.json"
    ch.write_text(json.dumps({"k": 3, "retriever": "bm25", "model": "openai/gpt-4o-mini", "ma": "k3-bm25-gpt-4o-mini"}),
                  encoding="utf-8")
    with caplog.at_level("INFO", logger="core.audit"):
        audit.main([str(ghi_csv(tmp_path / "in.csv", [(1, "q", "a")]))], cau_hinh_path=ch)
    assert nhan == {"k": 3, "retriever": "bm25", "model": "openai/gpt-4o-mini"}
    assert any("k3-bm25-gpt-4o-mini" in r.getMessage() for r in caplog.records)


def test_dong_lenh_cau_hinh_hong_thi_bao_loi(tmp_path):
    ch = tmp_path / "cau_hinh_dang_dung.json"
    ch.write_text(json.dumps({"k": 3}), encoding="utf-8")
    with pytest.raises(ValueError, match="cau_hinh_dang_dung.json"):
        audit.main([str(ghi_csv(tmp_path / "in.csv", [(1, "q", "a")]))], cau_hinh_path=ch)


@pytest.mark.parametrize("noi_dung, sai", [
    ({"k": 5, "retriever": None, "model": "openai/gpt-4.1-mini"}, "retriever"),
    ({"k": 5, "retriever": "qdrant", "model": None}, "model"),
    ({"k": None, "retriever": "qdrant", "model": "openai/gpt-4.1-mini"}, "k"),
    ({"k": 0, "retriever": "qdrant", "model": "openai/gpt-4.1-mini"}, "k"),
    ({"k": 5, "retriever": "elastic", "model": "openai/gpt-4.1-mini"}, "retriever"),
    ({"k": 5, "retriever": "qdrant", "model": "  "}, "model"),
])
def test_doc_cau_hinh_gia_tri_khong_hop_le_thi_bao_loi(tmp_path, noi_dung, sai):
    from core.audit import doc_cau_hinh

    p = tmp_path / "cau_hinh_dang_dung.json"
    p.write_text(json.dumps(noi_dung), encoding="utf-8")
    with pytest.raises(ValueError, match=sai):
        doc_cau_hinh(p)
