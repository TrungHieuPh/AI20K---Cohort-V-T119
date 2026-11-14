"""Test eval/score.py trên results.json và đáp án giả (tạo trong tmp_path)."""

import csv
import json

import pytest

from eval import score as score_mod
from eval.score import score


def y_(nhan, trich_dan):
    return {"noi_dung": "ý", "nhan": nhan, "trich_dan": trich_dan, "bang_chung": "", "giai_thich": ""}


def cau(id_, ket_luan, cac_y=(), dieu_truy_hoi=(), thoi_gian_ms=1000, chi_phi_usd=0.001, faithfulness=None):
    return {"id": id_, "ket_luan": ket_luan, "faithfulness": faithfulness, "cac_y": list(cac_y),
            "dieu_truy_hoi": list(dieu_truy_hoi), "thoi_gian_ms": thoi_gian_ms, "chi_phi_usd": chi_phi_usd}


def ghi_results(path, cac_cau, faithfulness_tb=None):
    path.write_text(json.dumps({"tong_ket": {"faithfulness_tb": faithfulness_tb}, "cau": cac_cau},
                               ensure_ascii=False), encoding="utf-8")
    return path


def ghi_dap_an(path, dong, encoding="utf-8"):
    with open(path, "w", encoding=encoding, newline="") as f:
        w = csv.writer(f)
        w.writerow(["id", "nhan_that", "loai_loi", "dieu_dung", "ghi_chu"])
        w.writerows(dong)
    return path


def chay(tmp_path, cac_cau, dap_an, **kw):
    return score(ghi_results(tmp_path / "r.json", cac_cau), ghi_dap_an(tmp_path / "k.csv", dap_an), **kw)


# --- Bắt được / bỏ sót / báo nhầm / LOI ---------------------------------------------

def test_dem_bat_duoc_bao_nham_va_loi(tmp_path):
    kq = chay(tmp_path,
              [cau(1, "SAI"), cau(2, "KHONG_CAN_CU"), cau(3, "DUNG"), cau(4, "LOI"),
               cau(5, "DUNG"), cau(6, "SAI"), cau(7, "LOI")],
              [(1, "SAI", "sai_con_so", "", ""), (2, "SAI", "bia_quyen_loi", "", ""), (3, "SAI", "luat_cu", "", ""),
               (4, "SAI", "trich_sai_dieu", "", ""), (5, "DUNG", "", "", ""), (6, "DUNG", "", "", ""),
               (7, "DUNG", "", "", "")])
    assert (kq["bat_duoc"]["dat"], kq["bat_duoc"]["tong"]) == (2, 4)  # câu sai ra DUNG hoặc LOI là bỏ sót
    assert (kq["bao_nham"]["dat"], kq["bao_nham"]["tong"]) == (1, 3)  # câu đúng ra LOI không tính báo nhầm
    assert kq["loi"] == {"cau_sai": 1, "cau_dung": 1}
    assert [c["ket_qua"] for c in kq["chi_tiet"]] == ["bat_duoc", "bat_duoc", "bo_sot", "bo_sot", "dung", "bao_nham", "loi"]


@pytest.mark.parametrize("so_bat, dat", [(4, True), (3, False)])
def test_muc_tieu_bat_duoc_80_phan_tram(tmp_path, so_bat, dat):
    cac_cau = [cau(i, "SAI" if i <= so_bat else "DUNG") for i in range(1, 6)]
    kq = chay(tmp_path, cac_cau, [(i, "SAI", "x", "", "") for i in range(1, 6)])
    assert kq["bat_duoc"]["dat_muc_tieu"] is dat


@pytest.mark.parametrize("so_nham, dat", [(1, True), (2, False)])
def test_muc_tieu_bao_nham_toi_da_1_tren_15(tmp_path, so_nham, dat):
    cac_cau = [cau(i, "SAI" if i <= so_nham else "DUNG") for i in range(1, 16)]
    kq = chay(tmp_path, cac_cau, [(i, "DUNG", "", "", "") for i in range(1, 16)])
    assert kq["bao_nham"]["dat_muc_tieu"] is dat


def test_khong_co_cau_sai_thi_chi_so_bat_duoc_khong_ap_dung(tmp_path):
    kq = chay(tmp_path, [cau(1, "DUNG")], [(1, "DUNG", "", "", "")])
    assert kq["bat_duoc"]["tong"] == 0
    assert kq["bat_duoc"]["ti_le"] is None and kq["bat_duoc"]["dat_muc_tieu"] is None


# --- Trích đúng Điều, truy hồi đúng -----------------------------------------------

def test_trich_dung_dieu_chi_xet_cau_sai_da_bat_va_co_dieu_dung(tmp_path):
    kq = chay(tmp_path,
              [cau(1, "SAI", [y_("TRAI_LUAT", "Điều 128 khoản 2")]),
               cau(2, "SAI", [y_("DUNG", "Điều 36 khoản 1"), y_("TRAI_LUAT", "Điều 94")]),
               cau(3, "KHONG_CAN_CU", [y_("KHONG_CAN_CU", "")]),
               cau(4, "DUNG", [y_("DUNG", "Điều 20")])],
              [(1, "SAI", "sai_con_so", "128", ""), (2, "SAI", "dung_mot_nua", "36", ""),
               (3, "KHONG_CAN_CU", "bia_quyen_loi", "", ""), (4, "SAI", "luat_cu", "20", "")])
    assert (kq["trich_dung_dieu"]["dat"], kq["trich_dung_dieu"]["tong"]) == (2, 2)  # câu 3 không có dieu_dung, câu 4 bỏ sót
    assert kq["trich_dung_dieu"]["dat_muc_tieu"] is True


def test_trich_sai_dieu_thi_khong_dat_va_nhan_nhieu_dieu_dung(tmp_path):
    kq = chay(tmp_path,
              [cau(1, "SAI", [y_("TRAI_LUAT", "Điều 90")]), cau(2, "SAI", [y_("TRAI_LUAT", "điều 37")])],
              [(1, "SAI", "x", "26", ""), (2, "SAI", "x", "137|37", "")])
    assert (kq["trich_dung_dieu"]["dat"], kq["trich_dung_dieu"]["tong"]) == (1, 2)
    assert kq["trich_dung_dieu"]["dat_muc_tieu"] is False


def test_truy_hoi_dung_bo_qua_cau_loi_va_cau_khong_co_dieu_dung(tmp_path):
    kq = chay(tmp_path,
              [cau(1, "DUNG", dieu_truy_hoi=["dieu-35", "dieu-36"]), cau(2, "DUNG", dieu_truy_hoi=["dieu-1"]),
               cau(3, "LOI"), cau(4, "KHONG_CAN_CU", dieu_truy_hoi=["dieu-115"])],
              [(1, "DUNG", "", "35", ""), (2, "DUNG", "", "107|108", ""), (3, "DUNG", "", "48", ""),
               (4, "KHONG_CAN_CU", "bia_quyen_loi", "", "")])
    assert (kq["truy_hoi_dung"]["dat"], kq["truy_hoi_dung"]["tong"]) == (1, 2)


@pytest.mark.parametrize("so_trung, dat", [(9, True), (8, False)])
def test_muc_tieu_truy_hoi_90_phan_tram(tmp_path, so_trung, dat):
    cac_cau = [cau(i, "DUNG", dieu_truy_hoi=["dieu-1" if i <= so_trung else "dieu-2"]) for i in range(1, 11)]
    kq = chay(tmp_path, cac_cau, [(i, "DUNG", "", "1", "") for i in range(1, 11)])
    assert kq["truy_hoi_dung"]["dat_muc_tieu"] is dat


# --- Ổn định giữa 2 lần chạy -------------------------------------------------------

def test_on_dinh_so_sanh_ket_luan_hai_lan(tmp_path):
    dap_an = ghi_dap_an(tmp_path / "k.csv", [(i, "DUNG", "", "", "") for i in range(1, 21)])
    lan1 = ghi_results(tmp_path / "r1.json", [cau(i, "DUNG") for i in range(1, 21)])
    lan2 = ghi_results(tmp_path / "r2.json", [cau(i, "SAI" if i == 1 else "DUNG") for i in range(1, 21)])
    kq = score(lan1, dap_an, results_path_2=lan2)
    assert (kq["on_dinh"]["dat"], kq["on_dinh"]["tong"]) == (19, 20)
    assert kq["on_dinh"]["dat_muc_tieu"] is True
    assert kq["on_dinh"]["khac_nhau"] == [1]


def test_khong_co_lan_2_thi_on_dinh_la_none(tmp_path):
    assert chay(tmp_path, [cau(1, "DUNG")], [(1, "DUNG", "", "", "")])["on_dinh"] is None


# --- Thời gian, chi phí, theo loại lỗi ---------------------------------------------

@pytest.mark.parametrize("ms_moi_cau, dat", [(15000, True), (16000, False)])
def test_thoi_gian_quy_ve_20_cau_toi_da_5_phut(tmp_path, ms_moi_cau, dat):
    cac_cau = [cau(i, "DUNG", thoi_gian_ms=ms_moi_cau) for i in range(1, 11)]
    kq = chay(tmp_path, cac_cau, [(i, "DUNG", "", "", "") for i in range(1, 11)])
    assert kq["thoi_gian"]["quy_ve_20_cau_s"] == pytest.approx(ms_moi_cau * 20 / 1000)
    assert kq["thoi_gian"]["dat_muc_tieu"] is dat


def test_tong_chi_phi_faithfulness_va_theo_loai_loi(tmp_path):
    kq = score(ghi_results(tmp_path / "r.json",
                           [cau(1, "SAI", chi_phi_usd=0.002), cau(2, "DUNG", chi_phi_usd=None), cau(3, "SAI")],
                           faithfulness_tb=0.67),
               ghi_dap_an(tmp_path / "k.csv", [(1, "SAI", "sai_con_so", "", ""), (2, "SAI", "sai_con_so", "", ""),
                                               (3, "SAI", "luat_cu", "", "")]))
    assert kq["chi_phi_usd"] == pytest.approx(0.003)
    assert kq["faithfulness_tb"] == 0.67
    assert kq["theo_loai_loi"] == {"sai_con_so": {"dat": 1, "tong": 2}, "luat_cu": {"dat": 1, "tong": 1}}


# --- Khớp id -------------------------------------------------------------------------

def test_thieu_cau_trong_ket_qua_thi_bao_loi(tmp_path):
    with pytest.raises(ValueError, match="2"):
        chay(tmp_path, [cau(1, "DUNG")], [(1, "DUNG", "", "", ""), (2, "DUNG", "", "", "")])


def test_cau_thua_trong_ket_qua_thi_canh_bao_va_bo_qua(tmp_path, caplog):
    with caplog.at_level("WARNING", logger="eval.score"):
        kq = chay(tmp_path, [cau(1, "DUNG"), cau(9, "SAI")], [(1, "DUNG", "", "", "")])
    assert kq["so_cau"] == 1
    assert any("9" in r.getMessage() for r in caplog.records)


def test_id_chu_va_dap_an_co_bom(tmp_path):
    kq = score(ghi_results(tmp_path / "r.json", [cau("A1", "SAI"), cau(2, "DUNG")]),
               ghi_dap_an(tmp_path / "k.csv", [("A1", "SAI", "x", "", ""), (2, "DUNG", "", "", "")], encoding="utf-8-sig"))
    assert kq["bat_duoc"]["dat"] == 1 and kq["bao_nham"]["dat"] == 0


# --- Dòng lệnh -----------------------------------------------------------------------

def test_dong_lenh_in_bao_cao_va_ghi_out(tmp_path, capsys):
    r = ghi_results(tmp_path / "r.json", [cau(1, "SAI", [y_("TRAI_LUAT", "Điều 5")], ["dieu-5"])])
    k = ghi_dap_an(tmp_path / "k.csv", [(1, "SAI", "sai_con_so", "5", "")])
    out = tmp_path / "results_score.json"
    score_mod.main([str(r), str(k), "--out", str(out)])
    in_ra = capsys.readouterr().out
    assert "Bắt được" in in_ra and "1/1" in in_ra
    assert json.loads(out.read_text(encoding="utf-8"))["bat_duoc"]["dat"] == 1
