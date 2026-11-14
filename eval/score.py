"""Chấm results.json của audit theo đáp án và mục tiêu MVP (README mục Evaluation).

score(results_path, answer_key_path, results_path_2=None) -> dict

Chạy: python -m eval.score results.json <dap_an.csv> [--lan2 results2.json] [--out results_score.json]

Quy tắc chấm (README "Scoring rule"):
- Câu cố tình sai (nhan_that khác DUNG): ra SAI hoặc KHONG_CAN_CU là bắt được; ra DUNG hoặc LOI là bỏ sót.
- Câu đúng (nhan_that = DUNG): ra SAI hoặc KHONG_CAN_CU là báo nhầm; ra LOI không tính báo nhầm, đếm riêng.
Mục tiêu tính theo tỉ lệ để dùng được cho cả dev set (10 câu) và test set (20 câu).
"""

import argparse
import csv
import json
import logging
import re
import sys
import unicodedata
from fractions import Fraction

log = logging.getLogger(__name__)

GAN_CO = ("SAI", "KHONG_CAN_CU")
MUC_TIEU = {  # README: >= 4/5, <= 1/15, đúng mọi câu, >= 9/10, >= 19/20, <= 5 phút cho 20 câu
    "bat_duoc": Fraction(4, 5),
    "bao_nham": Fraction(1, 15),
    "trich_dung_dieu": Fraction(1),
    "truy_hoi_dung": Fraction(9, 10),
    "on_dinh": Fraction(19, 20),
}
THOI_GIAN_20_CAU_S = 300


def _doc_id(gia_tri):
    gia_tri = str(gia_tri).strip()
    return int(gia_tri) if gia_tri.isdigit() else gia_tri


def _cac_dieu(o):
    """Tập số Điều trong ô dieu_dung ("35", "137|37", "")."""
    return {int(x) for x in re.findall(r"\d+", o or "")}


def _so_dieu(trich_dan):
    m = re.search(r"điều\s+(\d+)", unicodedata.normalize("NFC", trich_dan or ""), flags=re.IGNORECASE)
    return int(m.group(1)) if m else None


def _chi_so(dat, tong, muc_tieu, toi_da=False):
    """dat/tong so với mục tiêu (tối thiểu, hoặc tối đa nếu toi_da). Không có câu nào thì không áp dụng (None)."""
    if tong == 0:
        return {"dat": dat, "tong": tong, "ti_le": None, "muc_tieu": float(muc_tieu), "dat_muc_tieu": None}
    ti_le = Fraction(dat, tong)
    return {"dat": dat, "tong": tong, "ti_le": round(float(ti_le), 4), "muc_tieu": float(muc_tieu),
            "dat_muc_tieu": ti_le <= muc_tieu if toi_da else ti_le >= muc_tieu}


def _doc_results(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def doc_dap_an(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        return {_doc_id(r["id"]): r for r in csv.DictReader(f)}


def _khop_id(dap_an, cac_cau, ten):
    theo_id = {_doc_id(c["id"]): c for c in cac_cau}
    thieu = [i for i in dap_an if i not in theo_id]
    if thieu:
        raise ValueError(f"{ten} thiếu câu có trong đáp án: {thieu}")
    thua = [i for i in theo_id if i not in dap_an]
    if thua:
        log.warning("%s có câu không nằm trong đáp án, bỏ qua: %s", ten, thua)
    return theo_id


def score(results_path, answer_key_path, results_path_2=None):
    dap_an = doc_dap_an(answer_key_path)
    kq = _doc_results(results_path)
    theo_id = _khop_id(dap_an, kq["cau"], "results")

    chi_tiet, theo_loai = [], {}
    bat = so_sai = nham = so_dung = trich = so_trich = truy = so_truy = 0
    loi = {"cau_sai": 0, "cau_dung": 0}
    tong_ms, chi_phi = 0, 0.0
    for id_, k in dap_an.items():
        c = theo_id[id_]
        co_loi, ket_luan, dieu_dung = k["nhan_that"].strip().upper() != "DUNG", c["ket_luan"], _cac_dieu(k["dieu_dung"])
        tong_ms += c.get("thoi_gian_ms") or 0
        chi_phi += c.get("chi_phi_usd") or 0
        if ket_luan == "LOI":
            loi["cau_sai" if co_loi else "cau_dung"] += 1
        if co_loi:
            so_sai += 1
            bat_cau = ket_luan in GAN_CO
            bat += bat_cau
            ket_qua = "bat_duoc" if bat_cau else "bo_sot"
            loai = k.get("loai_loi") or "khong_ro"
            theo_loai.setdefault(loai, {"dat": 0, "tong": 0})
            theo_loai[loai]["tong"] += 1
            theo_loai[loai]["dat"] += bat_cau
        else:
            so_dung += 1
            nham += ket_luan in GAN_CO
            ket_qua = "loi" if ket_luan == "LOI" else ("bao_nham" if ket_luan in GAN_CO else "dung")
        trich_dung = None
        if ket_qua == "bat_duoc" and dieu_dung:
            trich_dung = any(_so_dieu(y.get("trich_dan")) in dieu_dung for y in c.get("cac_y", []))
            so_trich += 1
            trich += trich_dung
        truy_hoi_dung = None
        if dieu_dung and ket_luan != "LOI":  # câu LOI không có dữ liệu truy hồi
            truy_hoi_dung = any(int(d.split("-")[-1]) in dieu_dung for d in c.get("dieu_truy_hoi", []))
            so_truy += 1
            truy += truy_hoi_dung
        chi_tiet.append({"id": id_, "nhan_that": k["nhan_that"], "loai_loi": k.get("loai_loi", ""), "ket_luan": ket_luan,
                         "ket_qua": ket_qua, "trich_dung_dieu": trich_dung, "truy_hoi_dung": truy_hoi_dung})

    on_dinh = None
    if results_path_2:
        theo_id_2 = _khop_id(dap_an, _doc_results(results_path_2)["cau"], "results lần 2")
        khac = [i for i in dap_an if theo_id[i]["ket_luan"] != theo_id_2[i]["ket_luan"]]
        on_dinh = _chi_so(len(dap_an) - len(khac), len(dap_an), MUC_TIEU["on_dinh"]) | {"khac_nhau": khac}

    n = len(dap_an)
    quy_ve_20 = tong_ms / 1000 * 20 / n if n else 0
    return {
        "so_cau": n,
        "bat_duoc": _chi_so(bat, so_sai, MUC_TIEU["bat_duoc"]),
        "bao_nham": _chi_so(nham, so_dung, MUC_TIEU["bao_nham"], toi_da=True),
        "loi": loi,
        "trich_dung_dieu": _chi_so(trich, so_trich, MUC_TIEU["trich_dung_dieu"]),
        "truy_hoi_dung": _chi_so(truy, so_truy, MUC_TIEU["truy_hoi_dung"]),
        "on_dinh": on_dinh,
        "thoi_gian": {"tong_s": round(tong_ms / 1000, 1), "quy_ve_20_cau_s": round(quy_ve_20, 1),
                      "muc_tieu_s": THOI_GIAN_20_CAU_S, "dat_muc_tieu": quy_ve_20 <= THOI_GIAN_20_CAU_S},
        "chi_phi_usd": round(chi_phi, 6),
        "faithfulness_tb": kq.get("tong_ket", {}).get("faithfulness_tb"),
        "theo_loai_loi": theo_loai,
        "chi_tiet": chi_tiet,
    }


def _dong(ten, cs, toi_da=False):
    if cs is None:
        return f"  {ten:<34} (không đo: cần --lan2)"
    if cs["tong"] == 0:
        return f"  {ten:<34} không áp dụng (0 câu)"
    dau = "≤" if toi_da else "≥"
    dat = "ĐẠT" if cs["dat_muc_tieu"] else "CHƯA ĐẠT"
    return f"  {ten:<34} {cs['dat']}/{cs['tong']} ({cs['ti_le']:.0%})  mục tiêu {dau} {cs['muc_tieu']:.0%}  → {dat}"


def in_bao_cao(kq):
    tg = kq["thoi_gian"]
    dong = [
        f"Chấm {kq['so_cau']} câu:",
        _dong("Bắt được câu sai", kq["bat_duoc"]),
        _dong("Báo nhầm câu đúng", kq["bao_nham"], toi_da=True),
        _dong("Trích đúng Điều (câu đã bắt)", kq["trich_dung_dieu"]),
        _dong("Điều đúng trong top-5 truy hồi", kq["truy_hoi_dung"]),
        _dong("Ổn định giữa 2 lần chạy", kq["on_dinh"]),
        f"  {'Thời gian (quy về 20 câu)':<34} {tg['quy_ve_20_cau_s']} s  mục tiêu ≤ {tg['muc_tieu_s']} s  → "
        f"{'ĐẠT' if tg['dat_muc_tieu'] else 'CHƯA ĐẠT'}",
        f"  Câu LOI: {kq['loi']['cau_sai']} câu sai, {kq['loi']['cau_dung']} câu đúng | "
        f"chi phí {kq['chi_phi_usd']} USD | faithfulness_tb {kq['faithfulness_tb']}",
        "  Theo loại lỗi: " + ", ".join(f"{k} {v['dat']}/{v['tong']}" for k, v in kq["theo_loai_loi"].items()),
    ]
    sai_lech = [c for c in kq["chi_tiet"] if c["ket_qua"] in ("bo_sot", "bao_nham", "loi")
                or c["trich_dung_dieu"] is False or c["truy_hoi_dung"] is False]
    for c in sai_lech:
        dong.append(f"  - câu {c['id']}: thật {c['nhan_that']}, ra {c['ket_luan']} ({c['ket_qua']})"
                    f"{', trích sai Điều' if c['trich_dung_dieu'] is False else ''}"
                    f"{', Điều đúng không có trong top-5' if c['truy_hoi_dung'] is False else ''}")
    print("\n".join(dong))


def main(argv=None):
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")  # console Windows mặc định cp1252
    logging.basicConfig(level=logging.WARNING, format="%(message)s")
    p = argparse.ArgumentParser(description="Chấm results.json theo đáp án và mục tiêu MVP")
    p.add_argument("results_path")
    p.add_argument("answer_key_path", help="CSV: id, nhan_that, loai_loi, dieu_dung, ghi_chu")
    p.add_argument("--lan2", help="results.json của lần chạy thứ 2, để đo độ ổn định")
    p.add_argument("--out", help="ghi kết quả ra JSON (nên đặt tên results_*.json để git bỏ qua)")
    a = p.parse_args(argv)
    kq = score(a.results_path, a.answer_key_path, results_path_2=a.lan2)
    in_bao_cao(kq)
    if a.out:
        with open(a.out, "w", encoding="utf-8") as f:
            json.dump(kq, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
