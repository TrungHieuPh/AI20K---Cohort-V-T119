"""Agent tự tối ưu cấu hình cổng kiểm định (AIP-04).

Thử lưới cấu hình (k × nguồn truy hồi × model judge) trên tập chạy thử, chấm bằng eval.score, tìm đường Pareto
(chất lượng × chi phí × thời gian), đề xuất cấu hình rẻ nhất trong nhóm đạt mục tiêu MVP. Người duyệt chạy `duyet`:
cổng "không kém hơn" trên tập giữ lại, qua thì lưu cau_hinh_dang_dung.json (core.audit dùng) và ghi lịch sử.

Chạy: python -m eval.optimize thu
      python -m eval.optimize duyet <lượt> <mã cấu hình> --nguoi-duyet "Tên"
"""

import json
import logging
from datetime import datetime
from functools import partial
from pathlib import Path

from core.audit import (
    DUONG_DAN_CAU_HINH,
    REPO_ROOT,
    _kiem_cau_hinh_llm,
    audit_one,
    chon_nguon,
    doc_cau_hinh,
    run_audit,
    tao_llm,
)
from eval.score import score

log = logging.getLogger(__name__)

K_MAC_DINH = (3, 5, 8)
RETRIEVER_MAC_DINH = ("qdrant", "bm25")
MODEL_MAC_DINH = ("openai/gpt-4o-mini", "openai/gpt-4.1-mini", "openai/gpt-4.1")
CHI_SO_MUC_TIEU = ("bat_duoc", "bao_nham", "trich_dung_dieu", "truy_hoi_dung")


# --- Lưới cấu hình -------------------------------------------------------------------

def ma_cau_hinh(k, retriever, model):
    """Mã ngắn của cấu hình, vd k5-qdrant-gpt-4.1-mini (bỏ tiền tố nhà cung cấp của model)."""
    return f"k{k}-{retriever}-{model.split('/')[-1]}"


def luoi_cau_hinh(ks, retrievers, models):
    """Mọi tổ hợp, theo thứ tự nguồn truy hồi → model → k (chạy hết một nguồn rồi mới sang nguồn khác)."""
    return [{"ma": ma_cau_hinh(k, r, m), "k": k, "retriever": r, "model": m}
            for r in retrievers for m in models for k in ks]


# --- Chất lượng, đạt mục tiêu ---------------------------------------------------------

def chat_luong(diem):
    """Tỉ lệ câu gắn cờ đúng: câu sai bị bắt + câu đúng không báo nhầm (câu LOI tính là sai)."""
    dung = sum(c["ket_qua"] in ("bat_duoc", "dung") for c in diem["chi_tiet"])
    return round(dung / diem["so_cau"], 4) if diem["so_cau"] else 0.0


def dat_muc_tieu(diem):
    """Đạt mọi mục tiêu MVP đo được ở tập chạy thử và không có câu LOI (câu lỗi không tốn tiền, không được làm
    cấu hình trông rẻ hơn). Chỉ số không áp dụng (None) không chặn."""
    loi = diem.get("loi") or {}
    return (all(diem[ten]["dat_muc_tieu"] is not False for ten in CHI_SO_MUC_TIEU)
            and bool(diem["thoi_gian"]["dat_muc_tieu"]) and not (loi.get("cau_sai", 0) + loi.get("cau_dung", 0)))


# --- Pareto và đề xuất ------------------------------------------------------------------

def _xet_duoc(d):
    return d["trang_thai"] == "xong"


def pareto(dong):
    """Mã các cấu hình không bị cấu hình nào trội (chất lượng ≥, chi phí ≤, thời gian ≤ và hơn ở ít nhất một).
    Cấu hình lỗi, bị bỏ qua hoặc chi phí chưa rõ không tham gia."""
    cac = [d for d in dong if _xet_duoc(d) and d["chi_phi_ro"]]

    def troi(a, b):
        khong_kem = (a["chat_luong"] >= b["chat_luong"] and a["chi_phi_usd"] <= b["chi_phi_usd"]
                     and a["thoi_gian_s"] <= b["thoi_gian_s"])
        hon = (a["chat_luong"] > b["chat_luong"] or a["chi_phi_usd"] < b["chi_phi_usd"]
               or a["thoi_gian_s"] < b["thoi_gian_s"])
        return khong_kem and hon

    return {b["ma"] for b in cac if not any(troi(a, b) for a in cac if a is not b)}


def de_xuat(dong):
    """Đề xuất: trong nhóm đạt mục tiêu, rẻ nhất (chi phí chưa rõ xếp sau) → nhanh hơn → chất lượng cao hơn → thứ tự lưới.
    Không ai đạt: chất lượng cao nhất, ghi rõ chưa đạt. Trả {ma, dat_muc_tieu, ly_do, du_phong}."""
    xong = [(i, d) for i, d in enumerate(dong) if _xet_duoc(d)]
    if not xong:
        return {"ma": None, "dat_muc_tieu": False, "ly_do": "Không có cấu hình nào chạy xong.", "du_phong": []}
    dat = [(i, d) for i, d in xong if d["dat_muc_tieu"]]
    if dat:
        xep = sorted(dat, key=lambda x: (not x[1]["chi_phi_ro"], x[1]["chi_phi_usd"] or 0.0, x[1]["thoi_gian_s"],
                                         -x[1]["chat_luong"], x[0]))
        chon = xep[0][1]
        return {"ma": chon["ma"], "dat_muc_tieu": True,
                "ly_do": f"rẻ nhất trong {len(dat)} cấu hình đạt mục tiêu MVP.",
                "du_phong": [d["ma"] for _, d in xep[1:]]}
    xep = sorted(xong, key=lambda x: (-x[1]["chat_luong"], not x[1]["chi_phi_ro"], x[1]["chi_phi_usd"] or 0.0,
                                      x[1]["thoi_gian_s"], x[0]))
    return {"ma": xep[0][1]["ma"], "dat_muc_tieu": False,
            "ly_do": "chưa đạt mục tiêu MVP: không cấu hình nào đạt; chọn cấu hình chất lượng cao nhất.",
            "du_phong": [d["ma"] for _, d in xep[1:]]}


# --- Chạy một cấu hình, chạy cả lưới (lệnh thu) ---------------------------------------------

THU_MUC_MAC_DINH = Path("results_toi_uu")


def chay_cau_hinh(cau_hinh, csv_path, dap_an_path, out_path, nguon, llm_fn):
    """Audit csv_path với cấu hình (nguồn và LLM đã chuẩn bị), ghi out_path, chấm theo đáp án. Trả (results, diem)."""
    audit_fn = partial(audit_one, retrieve_fn=nguon.retrieve, get_article_fn=nguon.get_article, llm_fn=llm_fn,
                       k=cau_hinh["k"])
    results = run_audit(csv_path, out_path, audit_fn=audit_fn)
    return results, score(out_path, dap_an_path)


def _dong_xong(cau_hinh, results, diem):
    khong_loi = [c for c in results["cau"] if c["ket_luan"] != "LOI"]
    if not khong_loi:
        return {**cau_hinh, "trang_thai": "loi", "loi": f"mọi câu đều lỗi: {results['cau'][0].get('loi')}",
                "chi_phi_usd": diem["chi_phi_usd"]}
    return {**cau_hinh, "trang_thai": "xong", "chat_luong": chat_luong(diem), "chi_phi_usd": diem["chi_phi_usd"],
            "chi_phi_ro": all(c["chi_phi_usd"] is not None for c in khong_loi),
            "thoi_gian_s": diem["thoi_gian"]["tong_s"], "dat_muc_tieu": dat_muc_tieu(diem), "diem": diem}


def _tao_thu_muc_luot(thu_muc, ma_luot):
    thu_muc = Path(thu_muc)
    goc = ma_luot or datetime.now().strftime("%Y%m%d-%H%M%S")
    ma, i = goc, 1
    while (thu_muc / ma).exists():
        i += 1
        ma = f"{goc}-{i}"
    (thu_muc / ma).mkdir(parents=True)
    return ma, thu_muc / ma


def _chuan_bi_nguon(retrievers, tao_nguon):
    """Tạo và chạy thử mọi nguồn truy hồi trước khi đo (nạp bge-m3, dựng BM25). Lỗi thì ghi lỗi cho nguồn đó."""
    nguon, loi = {}, {}
    for r in retrievers:
        try:
            n = tao_nguon(r)
            n.retrieve("kiểm tra truy hồi", k=1)
            nguon[r] = n
            log.info("Truy hồi %s: %s", r, n.ten)
        except Exception as e:
            loi[r] = f"Truy hồi {r} không chạy được: {e}"
            log.error(loi[r])
    return nguon, loi


def thu(csv_path, dap_an_path, *, ks=K_MAC_DINH, retrievers=RETRIEVER_MAC_DINH, models=MODEL_MAC_DINH, toi_da_usd=2.0,
        thu_muc=THU_MUC_MAC_DINH, tao_nguon=chon_nguon, tao_llm_fn=tao_llm, kiem_llm=_kiem_cau_hinh_llm, ma_luot=None):
    """Chạy lưới cấu hình trên tập chạy thử, ghi <thu_muc>/<lượt>/ (kết quả từng cấu hình, ket_qua.json, bao_cao.md)."""
    luoi = luoi_cau_hinh(ks, retrievers, models)
    ma_luot, thu_muc_luot = _tao_thu_muc_luot(thu_muc, ma_luot)
    nguon, loi_nguon = _chuan_bi_nguon(retrievers, tao_nguon)
    loi_model, dong, tong = {}, [], 0.0
    for i, ch in enumerate(luoi, 1):
        if tong >= toi_da_usd:
            dong.append({**ch, "trang_thai": "bo_qua", "loi": f"hết ngân sách {toi_da_usd} USD"})
            continue
        if ch["retriever"] in loi_nguon:
            dong.append({**ch, "trang_thai": "loi", "loi": loi_nguon[ch["retriever"]]})
            continue
        try:
            if ch["model"] not in loi_model:
                loi_model[ch["model"]] = None
                kiem_llm(ch["model"])
        except Exception as e:
            loi_model[ch["model"]] = str(e)
        if loi_model[ch["model"]]:
            dong.append({**ch, "trang_thai": "loi", "loi": loi_model[ch["model"]]})
            continue
        log.info("[%d/%d] %s", i, len(luoi), ch["ma"])
        try:
            results, diem = chay_cau_hinh(ch, csv_path, dap_an_path, thu_muc_luot / f"{ch['ma']}.json",
                                          nguon[ch["retriever"]], tao_llm_fn(ch["model"]))
            d = _dong_xong(ch, results, diem)
        except Exception as e:
            d = {**ch, "trang_thai": "loi", "loi": f"{type(e).__name__}: {e}", "chi_phi_usd": 0.0}
        tong += d.get("chi_phi_usd") or 0.0
        dong.append(d)

    ket_qua = {"luot": ma_luot, "tap": {"csv": str(csv_path), "dap_an": str(dap_an_path)}, "dong": dong,
               "pareto": sorted(pareto(dong)), "de_xuat": de_xuat(dong), "tong_chi_phi_usd": round(tong, 6),
               "chan_doan": chan_doan(dong)}
    with open(thu_muc_luot / "ket_qua.json", "w", encoding="utf-8") as f:
        json.dump(ket_qua, f, ensure_ascii=False, indent=2)
    (thu_muc_luot / "bao_cao.md").write_text(bao_cao(ket_qua), encoding="utf-8")
    return ket_qua


def chan_doan(dong):
    """Chỗ cắm cho bước LLM chẩn đoán lỗi (cách 3, làm sau). Hiện chưa làm gì."""
    return None


def bao_cao(ket_qua):
    """Báo cáo dạng Markdown: bảng cấu hình, Pareto, đề xuất, lệnh duyệt."""
    pareto_ = set(ket_qua["pareto"])
    dong = [f"# Lượt {ket_qua['luot']}",
            "",
            f"Tập chạy thử: `{ket_qua['tap']['csv']}` · {len(ket_qua['dong'])} cấu hình · "
            f"chi phí {ket_qua['tong_chi_phi_usd']:.4f} USD",
            "",
            "| Mã cấu hình | Chất lượng | Bắt | Nhầm | Trích | Truy hồi | Thời gian | Chi phí | Pareto | Đạt MT |",
            "|---|---|---|---|---|---|---|---|---|---|"]

    def ps(cs):
        return "–" if cs["tong"] == 0 else f"{cs['dat']}/{cs['tong']}"

    for d in ket_qua["dong"]:
        if d["trang_thai"] != "xong":
            dong.append(f"| {d['ma']} | {d['trang_thai']}: {d.get('loi', '')} | | | | | | | | |")
            continue
        g = d["diem"]
        phi = f"${d['chi_phi_usd']:.4f}" + ("" if d["chi_phi_ro"] else " (chưa rõ)")
        dong.append(f"| {d['ma']} | {d['chat_luong']:.2f} | {ps(g['bat_duoc'])} | {ps(g['bao_nham'])} | "
                    f"{ps(g['trich_dung_dieu'])} | {ps(g['truy_hoi_dung'])} | {d['thoi_gian_s']:.0f} s | {phi} | "
                    f"{'★' if d['ma'] in pareto_ else ''} | {'✓' if d['dat_muc_tieu'] else '✗'} |")
    dx = ket_qua["de_xuat"]
    dong += ["", f"**ĐỀ XUẤT:** {dx['ma'] or '(không có)'} – {dx['ly_do']}"]
    if dx["du_phong"]:
        dong.append(f"Dự phòng (nếu trượt cổng): {', '.join(dx['du_phong'][:3])}")
    if dx["ma"]:
        dong += ["", "Duyệt (người duyệt chạy):", "",
                 f'    python -m eval.optimize duyet {ket_qua["luot"]} {dx["ma"]} --nguoi-duyet "Tên"']
    dong += ["", "_Lưu ý: tập chạy thử nhỏ, kết quả chỉ để tham khảo; cổng hồi quy chạy trên tập giữ lại._"]
    return "\n".join(dong) + "\n"


# --- Cổng "không kém hơn" và lệnh duyet (HITL) -------------------------------------------------

CAU_HINH_MAC_DINH = {"k": 5, "retriever": "qdrant", "model": "openai/gpt-4.1-mini"}  # trước khi có cấu hình đã duyệt
CSV_GIU_LAI = REPO_ROOT / "data" / "demo" / "demo_samples.csv"
DAP_AN_GIU_LAI = REPO_ROOT / "data" / "demo" / "demo_samples_dap_an.csv"
CSV_THU = REPO_ROOT / "data" / "test" / "dev_set.csv"
DAP_AN_THU = REPO_ROOT / "data" / "test" / "dev_set_dap_an.csv"
LICH_SU_MAC_DINH = REPO_ROOT / "lich_su_cau_hinh.jsonl"


def _so_gan_co_dung(diem):
    return sum(c["ket_qua"] in ("bat_duoc", "dung") for c in diem["chi_tiet"])


def _so_loi(diem):
    loi = diem.get("loi") or {}
    return loi.get("cau_sai", 0) + loi.get("cau_dung", 0)


def _so_doi_ket_luan(diem_lan1):
    on_dinh = diem_lan1.get("on_dinh")
    return len(on_dinh["khac_nhau"]) if on_dinh else 0


def qua_cong(moi, dang_dung):
    """Cổng "không kém hơn": mỗi bên là [diem lần 1 (có on_dinh từ --lan2), diem lần 2].
    Qua khi ở mỗi lần, cấu hình mới gắn cờ đúng ≥ cấu hình đang dùng, và đổi kết luận giữa 2 lần ≤ cấu hình đang dùng."""
    def tom(d):
        return {"gan_co_dung": [_so_gan_co_dung(d[0]), _so_gan_co_dung(d[1])], "doi_ket_luan": _so_doi_ket_luan(d[0]),
                "so_cau": d[0]["so_cau"]}

    m, c = tom(moi), tom(dang_dung)
    ly_do = []
    so_loi = sum(_so_loi(d) for d in (*moi, *dang_dung))
    if so_loi:  # API lỗi / hết quota: 0 ≥ 0 không phải bằng chứng "không kém hơn"
        ly_do.append(f"có {so_loi} câu LOI trong lượt cổng, không đủ bằng chứng để so sánh")
    for lan in (0, 1):
        if m["gan_co_dung"][lan] < c["gan_co_dung"][lan]:
            ly_do.append(f"lần {lan + 1}: gắn cờ đúng {m['gan_co_dung'][lan]} < {c['gan_co_dung'][lan]} của cấu hình đang dùng")
    if m["doi_ket_luan"] > c["doi_ket_luan"]:
        ly_do.append(f"đổi kết luận giữa 2 lần {m['doi_ket_luan']} > {c['doi_ket_luan']} của cấu hình đang dùng")
    return {"qua": not ly_do, "moi": m, "dang_dung": c,
            "ly_do": "; ".join(ly_do) or "không kém cấu hình đang dùng ở cả 2 lần chạy"}


def _doc_ket_qua_luot(thu_muc, ma_luot):
    path = Path(thu_muc) / ma_luot / "ket_qua.json"
    if not path.exists():
        raise ValueError(f"Không có lượt {ma_luot} ({path})")
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def duyet(ma_luot, ma, nguoi_duyet, *, csv_giu_lai=CSV_GIU_LAI, dap_an_giu_lai=DAP_AN_GIU_LAI, thu_muc=THU_MUC_MAC_DINH,
          cau_hinh_path=DUONG_DAN_CAU_HINH, lich_su_path=LICH_SU_MAC_DINH, toi_da_usd=1.0, tao_nguon=chon_nguon,
          tao_llm_fn=tao_llm, kiem_llm=_kiem_cau_hinh_llm):
    """Người duyệt chọn cấu hình `ma` của lượt `ma_luot`; chạy cổng hồi quy trên tập giữ lại; qua thì lưu làm cấu hình
    đang dùng. Luôn ghi một dòng lịch sử. Trả {qua, cong, cau_hinh, so_voi, chi_phi_usd}."""
    if not str(nguoi_duyet).strip():
        raise ValueError("Cần tên người duyệt (--nguoi-duyet)")
    dong = next((d for d in _doc_ket_qua_luot(thu_muc, ma_luot)["dong"] if d["ma"] == ma), None)
    if dong is None:
        raise ValueError(f"Lượt {ma_luot} không có cấu hình {ma}")
    if dong["trang_thai"] != "xong":
        raise ValueError(f"Cấu hình {ma} không chạy xong trong lượt {ma_luot} ({dong['trang_thai']}: {dong.get('loi', '')})")
    moi = {k: dong[k] for k in ("k", "retriever", "model")}
    dang_dung = doc_cau_hinh(cau_hinh_path) or CAU_HINH_MAC_DINH
    dang_dung = {k: dang_dung[k] for k in ("k", "retriever", "model")}
    ma_dang_dung = ma_cau_hinh(**dang_dung)

    nguon, loi_nguon = _chuan_bi_nguon(sorted({moi["retriever"], dang_dung["retriever"]}), tao_nguon)
    if loi_nguon:
        raise RuntimeError("; ".join(loi_nguon.values()))
    for model in {moi["model"], dang_dung["model"]}:
        kiem_llm(model)

    thu_muc_cong = Path(thu_muc) / ma_luot / "cong"
    thu_muc_cong.mkdir(parents=True, exist_ok=True)
    da_tieu = 0.0

    def chay_hai_lan(ch, ma_ch):
        nonlocal da_tieu
        duong_dan = []
        for lan in (1, 2):
            if da_tieu >= toi_da_usd:
                raise RuntimeError(f"Hết ngân sách cổng {toi_da_usd} USD")
            out = thu_muc_cong / f"{ma_ch}-lan{lan}.json"
            ket_qua, _ = chay_cau_hinh({"ma": ma_ch, **ch}, csv_giu_lai, dap_an_giu_lai, out, nguon[ch["retriever"]],
                                       tao_llm_fn(ch["model"]))
            da_tieu += sum(c["chi_phi_usd"] or 0.0 for c in ket_qua["cau"])
            duong_dan.append(out)
        return [score(duong_dan[0], dap_an_giu_lai, results_path_2=duong_dan[1]), score(duong_dan[1], dap_an_giu_lai)]

    def ghi_lich_su(dong_ls):
        with open(lich_su_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(dong_ls, ensure_ascii=False) + "\n")

    try:
        diem_moi = chay_hai_lan(moi, ma)
        diem_dang_dung = diem_moi if ma == ma_dang_dung else chay_hai_lan(dang_dung, ma_dang_dung)
    except Exception as e:  # hết ngân sách / lỗi giữa chừng: đã tốn tiền và có lần duyệt, vẫn phải ghi lịch sử
        ghi_lich_su({"thoi_gian": datetime.now().isoformat(timespec="seconds"), "nguoi_duyet": nguoi_duyet,
                     "luot": ma_luot, "ma": ma, "cau_hinh": moi, "so_voi": ma_dang_dung, "qua": False,
                     "loi": f"{type(e).__name__}: {e}", "chi_phi_cong_usd": round(da_tieu, 6)})
        raise
    cong = qua_cong(diem_moi, diem_dang_dung)

    bay_gio = datetime.now().isoformat(timespec="seconds")
    if cong["qua"]:
        with open(cau_hinh_path, "w", encoding="utf-8") as f:
            json.dump({"ma": ma, **moi, "duyet_luc": bay_gio, "nguoi_duyet": nguoi_duyet, "luot": ma_luot},
                      f, ensure_ascii=False, indent=2)
    lich_su = {"thoi_gian": bay_gio, "nguoi_duyet": nguoi_duyet, "luot": ma_luot, "ma": ma, "cau_hinh": moi,
               "so_voi": ma_dang_dung, "qua": cong["qua"], "cong": cong, "chi_phi_cong_usd": round(da_tieu, 6),
               "chi_so_thu": {k: dong[k] for k in ("chat_luong", "chi_phi_usd", "thoi_gian_s", "dat_muc_tieu")}}
    ghi_lich_su(lich_su)
    return {"qua": cong["qua"], "cong": cong, "cau_hinh": {"ma": ma, **moi}, "so_voi": ma_dang_dung,
            "chi_phi_usd": round(da_tieu, 6)}


# --- Dòng lệnh -----------------------------------------------------------------------------------

def _danh_sach(chuoi, kieu=str):
    return [kieu(x.strip()) for x in chuoi.split(",") if x.strip()]


def main(argv=None):
    import argparse
    import sys

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")  # console Windows mặc định cp1252
        sys.stderr.reconfigure(encoding="utf-8")
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    p = argparse.ArgumentParser(description="Agent tự tối ưu cấu hình cổng kiểm định")
    con = p.add_subparsers(dest="lenh", required=True)
    t = con.add_parser("thu", help="thử lưới cấu hình trên tập chạy thử và đề xuất")
    t.add_argument("--csv", default=str(CSV_THU))
    t.add_argument("--dap-an", default=str(DAP_AN_THU))
    t.add_argument("--k", default=",".join(map(str, K_MAC_DINH)))
    t.add_argument("--retriever", default=",".join(RETRIEVER_MAC_DINH))
    t.add_argument("--model", default=",".join(MODEL_MAC_DINH))
    t.add_argument("--toi-da-usd", type=float, default=2.0)
    t.add_argument("--thu-muc", default=str(THU_MUC_MAC_DINH))
    d = con.add_parser("duyet", help="người duyệt chọn cấu hình; chạy cổng hồi quy; qua thì lưu làm cấu hình đang dùng")
    d.add_argument("luot")
    d.add_argument("ma")
    d.add_argument("--nguoi-duyet", required=True)
    d.add_argument("--csv-giu-lai", default=str(CSV_GIU_LAI))
    d.add_argument("--dap-an-giu-lai", default=str(DAP_AN_GIU_LAI))
    d.add_argument("--toi-da-usd", type=float, default=1.0)
    d.add_argument("--thu-muc", default=str(THU_MUC_MAC_DINH))
    a = p.parse_args(argv)
    try:
        if a.lenh == "thu":
            kq = thu(a.csv, a.dap_an, ks=_danh_sach(a.k, int), retrievers=_danh_sach(a.retriever),
                     models=_danh_sach(a.model), toi_da_usd=a.toi_da_usd, thu_muc=a.thu_muc)
            print(bao_cao(kq))
        else:
            kq = duyet(a.luot, a.ma, a.nguoi_duyet, csv_giu_lai=a.csv_giu_lai, dap_an_giu_lai=a.dap_an_giu_lai,
                       toi_da_usd=a.toi_da_usd, thu_muc=a.thu_muc)
            c = kq["cong"]
            print(("QUA CỔNG: đã lưu cấu hình đang dùng " if kq["qua"] else "KHÔNG QUA CỔNG: giữ cấu hình cũ. ")
                  + f"{c['ly_do']}. Gắn cờ đúng (lần 1, lần 2): mới {c['moi']['gan_co_dung']} vs đang dùng "
                  f"{kq['so_voi']} {c['dang_dung']['gan_co_dung']} trên {c['moi']['so_cau']} câu; đổi kết luận: "
                  f"{c['moi']['doi_ket_luan']} vs {c['dang_dung']['doi_ket_luan']} (chi phí cổng {kq['chi_phi_usd']} USD)")
    finally:
        vectordb = sys.modules.get("core.vectordb")
        if vectordb is not None and vectordb.get_client.cache_info().currsize:
            vectordb.get_client().close()  # Qdrant local khoá .qdrant/


if __name__ == "__main__":
    main()
