import json

import pytest

from core.redline import chia_doan, redline

DIEU_107 = {"chunk_id": "dieu-107", "dieu": 107, "tieu_de": "Làm thêm giờ", "nguon": "VBHN 18",
            "noi_dung": "Điều 107. Làm thêm giờ\n2.c) Bảo đảm số giờ làm thêm không quá 200 giờ trong 01 năm"}

VAN_BAN = "Chào anh.\n\nLàm thêm không quá 300 giờ trong 01 năm.\n\nNgười lao động có thể nghỉ không cần báo trước."


def _retrieve(query, k=5):
    return [DIEU_107]


def _llm_theo_doan(messages):
    doan = messages[1]["content"].split("ĐOẠN VĂN:\n")[1]
    if doan.startswith("Chào"):
        cac_y = []
    elif "300 giờ" in doan:
        cac_y = [{"doan_goc": "không quá 300 giờ trong 01 năm", "nhan": "TRAI_LUAT", "trich_dan": "Điều 107",
                  "bang_chung": "không quá 200 giờ trong 01 năm", "giai_thich": "200 giờ"}]
    else:
        cac_y = [{"doan_goc": "có thể  nghỉ KHÔNG cần báo trước", "nhan": "MO_HO", "trich_dan": "Điều 107",
                  "bang_chung": "", "giai_thich": "chỉ một số trường hợp"}]
    return json.dumps({"cac_y": cac_y}, ensure_ascii=False), 0.001


def test_chia_doan_giu_dung_vi_tri():
    for bat_dau, doan in chia_doan(VAN_BAN):
        assert VAN_BAN[bat_dau:bat_dau + len(doan)] == doan
    assert len(chia_doan(VAN_BAN)) == 3


def test_redline_vi_tri_mau_va_cong():
    kq = redline(VAN_BAN, retrieve_fn=_retrieve, get_article_fn=lambda d: None, llm_fn=_llm_theo_doan)
    do, vang = kq["cac_doan"]
    assert VAN_BAN[do["bat_dau"]:do["ket_thuc"]] == "không quá 300 giờ trong 01 năm"
    assert (do["mau"], vang["mau"]) == ("do", "vang")
    # khác khoảng trắng / hoa thường vẫn định vị được, doan_goc lấy lại nguyên văn từ văn bản
    assert vang["doan_goc"] == "có thể nghỉ không cần báo trước"
    assert kq["tong_ket"]["cong"] == "KHONG_DAT"
    assert kq["tong_ket"]["chi_phi_usd"] == pytest.approx(0.003)


def test_doan_goc_khong_co_trong_van_ban_thi_khong_boi():
    def llm(messages):
        return json.dumps({"cac_y": [{"doan_goc": "câu LLM tự chế", "nhan": "TRAI_LUAT"}]}), None

    kq = redline("Làm thêm 300 giờ.", retrieve_fn=_retrieve, get_article_fn=lambda d: None, llm_fn=llm)
    assert kq["cac_doan"][0]["bat_dau"] is None and kq["cac_doan"][0]["khong_dinh_vi"]
    assert kq["tong_ket"]["chi_phi_usd"] is None


def test_mot_doan_loi_thi_can_xem_lai():
    def llm(messages):
        if "300 giờ" in messages[1]["content"].split("ĐOẠN VĂN:\n")[1]:
            return "không phải JSON", None
        return json.dumps({"cac_y": []}), None

    kq = redline(VAN_BAN, retrieve_fn=_retrieve, get_article_fn=lambda d: None, llm_fn=llm)
    assert kq["tong_ket"]["so_doan_loi"] == 1 and kq["tong_ket"]["cong"] == "CAN_XEM_LAI"


def test_van_ban_trong_hoac_qua_dai():
    with pytest.raises(ValueError):
        redline("  ", retrieve_fn=_retrieve, get_article_fn=lambda d: None, llm_fn=_llm_theo_doan)
    with pytest.raises(ValueError):
        redline("a" * 5001, retrieve_fn=_retrieve, get_article_fn=lambda d: None, llm_fn=_llm_theo_doan)
