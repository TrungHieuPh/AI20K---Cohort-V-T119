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
    monkeypatch.setattr(audit, "audit_one", audit_gia)
    monkeypatch.chdir(tmp_path)
    audit.main([str(csv_path)])
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
