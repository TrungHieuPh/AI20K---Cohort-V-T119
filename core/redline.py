"""Bôi đỏ văn bản do AI viết (Legal Redline): tìm khẳng định sai luật, bịa, hoặc mơ hồ, trả về vị trí để bôi.

Cách làm: chia văn bản theo đoạn; mỗi đoạn truy hồi căn cứ riêng (cộng các Điều đoạn đó tự trích), rồi gọi
LLM một lần để tách khẳng định và chấm, giống audit_one. Vị trí bôi do code tính bằng cách tìm `doan_goc`
trong văn bản gốc, không lấy số từ LLM; không tìm thấy thì không bôi (khong_dinh_vi=True).

    python -m core.redline van_ban.txt [--cau-hoi "..."] [--out results_redline.json]
"""
import json
import logging
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from core.audit import (
    DUONG_DAN_CAU_HINH,
    SO_DIEU_TRUY_HOI,
    TRUONG_Y,
    _chan_trich_dan_ngoai,
    _doc_json,
    _goi_co_thu_lai,
    _kiem_bang_chung,
    _kiem_cau_hinh_llm,
    _lay_dieu_trich_them,
    _llm_mac_dinh,
    _van_ban_luat,
    chon_nguon,
    doc_cau_hinh,
    tao_llm,
)

log = logging.getLogger(__name__)

NHAN_REDLINE = ("DUNG", "TRAI_LUAT", "KHONG_CAN_CU", "MO_HO")
MAU = {"TRAI_LUAT": "do", "KHONG_CAN_CU": "do", "MO_HO": "vang", "DUNG": None}
TOI_DA_KY_TU = 5000  # MVP: khoảng 1–2 trang
DOAN_TOI_DA = 1500  # đoạn dài hơn thì cắt theo câu
SO_LAN_CHAY_MOT_DOAN = 2  # lỗi (JSON hỏng...) thì chạy lại đoạn đó 1 lần
SO_LUONG_SONG_SONG = 4

HUONG_DAN = """Bạn là chuyên gia rà soát văn bản về Bộ luật Lao động Việt Nam.
Chỉ được dựa vào VĂN BẢN LUẬT được cung cấp bên dưới, không dùng kiến thức bên ngoài.

Việc cần làm:
1. Tìm trong ĐOẠN VĂN các khẳng định pháp lý kiểm tra được: con số, thời hạn, ngày tháng, điều kiện, quyền,
   nghĩa vụ, số Điều/khoản. Bỏ qua câu chào hỏi, câu dẫn dắt, câu không nói gì về luật.
   Đoạn không có khẳng định nào thì trả về danh sách rỗng.
2. Với mỗi khẳng định, doan_goc là phần chữ CHÉP NGUYÊN VĂN từ ĐOẠN VĂN (giữ đúng từng chữ, dấu và khoảng
   trắng), ngắn nhất có thể nhưng đủ chứa phần cần kiểm, thường là một mệnh đề hoặc một câu.
   noi_dung là khẳng định đó viết lại ngắn gọn.
3. Chấm mỗi khẳng định bằng đúng một nhãn:
   - DUNG: văn bản luật được cung cấp hỗ trợ khẳng định này.
   - TRAI_LUAT: mâu thuẫn với văn bản luật (sai con số, sai điều kiện, dùng quy định cũ đã bị thay,
     hoặc ghi sai số Điều/khoản so với quy định thật sự điều chỉnh vấn đề đó).
   - KHONG_CAN_CU: văn bản luật được cung cấp không có căn cứ cho khẳng định này (ví dụ quyền lợi không điều nào
     quy định).
   - MO_HO: câu thiếu điều kiện hoặc phạm vi nên người đọc có thể hiểu theo hai cách, trong đó có một cách sai
     luật (ví dụ nêu một trường hợp ngoại lệ như thể là quy tắc chung). Chỉ dùng khi thật sự có cách hiểu sai
     luật; câu đúng mà chỉ ngắn gọn thì vẫn là DUNG.
4. Với mỗi khẳng định, ghi trich_dan dạng "Điều N khoản K điểm x" (bỏ phần không có), bang_chung là đoạn trích
   nguyên văn ngắn từ văn bản luật, giai_thich ngắn gọn bằng tiếng Việt (với TRAI_LUAT và MO_HO, nói rõ luật
   quy định thế nào). Nếu KHONG_CAN_CU thì trich_dan và bang_chung để chuỗi rỗng, nhưng giai_thich vẫn phải
   nói rõ vì sao không có căn cứ (ví dụ luật chỉ quy định vấn đề gần nhất như thế nào).

Chỉ trả về JSON đúng dạng sau, không thêm chữ nào khác:
{"cac_y": [{"doan_goc": "...", "noi_dung": "...", "nhan": "DUNG|TRAI_LUAT|KHONG_CAN_CU|MO_HO",
"trich_dan": "...", "bang_chung": "...", "giai_thich": "..."}]}"""


def _cat_theo_cau(doan, bat_dau):
    """Cắt một đoạn dài thành các khúc ≤ DOAN_TOI_DA, tại ranh giới câu; trả [(vị trí, chữ)]."""
    moc = [0] + [m.end() for m in re.finditer(r"(?<=[.!?;])\s+|\n+", doan)] + [len(doan)]
    khuc, dau = [], 0
    for truoc, sau in zip(moc, moc[1:]):
        if sau - dau > DOAN_TOI_DA and truoc > dau:
            khuc.append((dau, truoc))
            dau = truoc
    khuc.append((dau, len(doan)))
    ket_qua = []
    for a, b in khuc:
        chu = doan[a:b]
        trai = len(chu) - len(chu.lstrip())
        chu = chu.strip()
        if chu:
            ket_qua.append((bat_dau + a + trai, chu))
    return ket_qua


def chia_doan(van_ban):
    """Chia văn bản theo dòng trống; đoạn dài quá DOAN_TOI_DA thì cắt theo câu. Trả [(vị trí bắt đầu, đoạn)]."""
    ket_qua, dau = [], 0
    for m in list(re.finditer(r"\n[ \t]*\n\s*", van_ban)) + [None]:
        cuoi = m.start() if m else len(van_ban)
        khoi = van_ban[dau:cuoi]
        trai = len(khoi) - len(khoi.lstrip())
        khoi = khoi.strip()
        if khoi:
            ket_qua.extend(_cat_theo_cau(khoi, dau + trai))
        if m:
            dau = m.end()
    return ket_qua


def _tim_vi_tri(doan_goc, doan, tu=0):
    """Vị trí (đầu, cuối) của doan_goc trong doan. Ưu tiên chỗ sau `tu` (hai khẳng định giống chữ);
    không thấy nguyên văn thì cho phép khác khoảng trắng/hoa thường. Không thấy: None."""
    goc = doan_goc.strip().strip("\"'“”")
    if not goc:
        return None
    for bat_dau in (tu, 0):
        i = doan.find(goc, bat_dau)
        if i >= 0:
            return i, i + len(goc)
    mau = r"\s+".join(re.escape(t) for t in goc.split())
    m = re.search(mau, doan, flags=re.IGNORECASE)
    return (m.start(), m.end()) if m else None


def _kiem_cac_y(du_lieu):
    """Như audit._kiem_cac_y nhưng cho phép danh sách rỗng, thêm nhãn MO_HO và trường doan_goc."""
    cac_y = du_lieu.get("cac_y") if isinstance(du_lieu, dict) else None
    if not isinstance(cac_y, list):
        raise ValueError("Kết quả LLM không có danh sách 'cac_y'")
    ket_qua = []
    for i, y in enumerate(cac_y, 1):
        if not isinstance(y, dict) or "nhan" not in y:
            raise ValueError(f"Khẳng định thứ {i} thiếu trường 'nhan'")
        nhan = str(y["nhan"]).strip().upper()
        if nhan not in NHAN_REDLINE:
            raise ValueError(f"Khẳng định thứ {i} có nhãn không hợp lệ: {y['nhan']!r}")
        ket_qua.append({**{k: str(y.get(k) or "") for k in TRUONG_Y + ("doan_goc",)}, "nhan": nhan})
    return ket_qua


def _tao_messages(cau_hoi, doan, can_cu):
    phan_hoi = f"CÂU HỎI (ngữ cảnh của văn bản):\n{cau_hoi}\n\n" if cau_hoi else ""
    return [
        {"role": "system", "content": HUONG_DAN},
        {"role": "user", "content": f"VĂN BẢN LUẬT:\n{_van_ban_luat(can_cu)}\n\n{phan_hoi}ĐOẠN VĂN:\n{doan}"},
    ]


def _cham_doan(llm_fn, cau_hoi, doan, can_cu):
    """Gọi LLM cho một đoạn (chạy lại 1 lần nếu lỗi). Trả (cac_y, chi_phi)."""
    for lan in range(SO_LAN_CHAY_MOT_DOAN):
        try:
            van_ban, chi_phi = _goi_co_thu_lai(llm_fn, _tao_messages(cau_hoi, doan, can_cu))
            cac_y = _kiem_cac_y(_doc_json(van_ban))
            return _kiem_bang_chung(_chan_trich_dan_ngoai(cac_y, can_cu), can_cu), chi_phi
        except Exception:
            if lan == SO_LAN_CHAY_MOT_DOAN - 1:
                raise


def _cong(cac_nhan, co_loi):
    if "TRAI_LUAT" in cac_nhan:
        return "KHONG_DAT"
    if co_loi or "KHONG_CAN_CU" in cac_nhan or "MO_HO" in cac_nhan:
        return "CAN_XEM_LAI"
    return "DAT"


def redline(van_ban, cau_hoi="", *, retrieve_fn=None, get_article_fn=None, llm_fn=None,
            k=SO_DIEU_TRUY_HOI, so_luong=SO_LUONG_SONG_SONG):
    """Rà một văn bản, trả dict có cac_doan (các đoạn cần bôi, vị trí tính trên van_ban gốc) và tong_ket.

    Truy hồi chạy lần lượt (Qdrant local và model embed dùng chung), gọi LLM chạy song song theo đoạn.
    Một đoạn lỗi hai lần thì ghi vào doan_loi, cổng ít nhất CAN_XEM_LAI; mọi đoạn đều lỗi thì báo lỗi.
    """
    if not van_ban or not van_ban.strip():
        raise ValueError("Văn bản trống")
    if len(van_ban) > TOI_DA_KY_TU:
        raise ValueError(f"Văn bản dài {len(van_ban)} ký tự, tối đa {TOI_DA_KY_TU}")
    if retrieve_fn is None or get_article_fn is None:
        nguon = chon_nguon()
        retrieve_fn = retrieve_fn or nguon.retrieve
        get_article_fn = get_article_fn or nguon.get_article
    llm_fn = llm_fn or _llm_mac_dinh
    cau_hoi = (cau_hoi or "").strip()
    bat_dau_luc = time.perf_counter()

    cac_doan_van = chia_doan(van_ban)
    can_cu_moi_doan, dieu_truy_hoi = [], []
    for _, doan in cac_doan_van:
        chunks = retrieve_fn(f"{cau_hoi}\n{doan}".strip(), k=k)
        can_cu_moi_doan.append(chunks + _lay_dieu_trich_them(doan, chunks, get_article_fn))
        dieu_truy_hoi += [c["chunk_id"] for c in chunks if c["chunk_id"] not in dieu_truy_hoi]

    with ThreadPoolExecutor(max_workers=max(1, so_luong)) as pool:
        tuong_lai = [pool.submit(_cham_doan, llm_fn, cau_hoi, doan, cc)
                     for (_, doan), cc in zip(cac_doan_van, can_cu_moi_doan)]

    cac_doan, doan_loi, chi_phi = [], [], []
    for so, ((goc, doan), tl) in enumerate(zip(cac_doan_van, tuong_lai), 1):
        try:
            cac_y, cp = tl.result()
        except Exception as e:
            doan_loi.append({"doan_so": so, "bat_dau": goc, "ket_thuc": goc + len(doan), "loi": str(e)})
            log.warning("Đoạn %d lỗi: %s", so, e)
            continue
        chi_phi.append(cp)
        tu = 0
        for y in cac_y:
            vi_tri = _tim_vi_tri(y["doan_goc"], doan, tu)
            muc = {"doan_so": so, "bat_dau": None, "ket_thuc": None, **y, "mau": MAU[y["nhan"]]}
            if vi_tri:
                muc["bat_dau"], muc["ket_thuc"] = goc + vi_tri[0], goc + vi_tri[1]
                muc["doan_goc"] = van_ban[muc["bat_dau"]:muc["ket_thuc"]]
                tu = vi_tri[1]
            else:
                muc["khong_dinh_vi"] = True
            cac_doan.append(muc)
    cac_doan.sort(key=lambda m: (m["doan_so"], m["bat_dau"] is None, m["bat_dau"] or 0))  # theo thứ tự trong văn bản
    if len(doan_loi) == len(cac_doan_van):
        raise RuntimeError(f"Không kiểm được đoạn nào: {doan_loi[0]['loi']}")

    cac_nhan = [m["nhan"] for m in cac_doan]
    tong_ket = {
        "so_doan_van": len(cac_doan_van),
        "so_y": len(cac_doan),
        "so_do": sum(m["mau"] == "do" for m in cac_doan),
        "so_vang": sum(m["mau"] == "vang" for m in cac_doan),
        "so_dung": cac_nhan.count("DUNG"),
        "so_khong_dinh_vi": sum(bool(m.get("khong_dinh_vi")) for m in cac_doan),
        "so_doan_loi": len(doan_loi),
        "cong": _cong(cac_nhan, bool(doan_loi)),
        "thoi_gian_ms": round((time.perf_counter() - bat_dau_luc) * 1000),
        "chi_phi_usd": None if all(c is None for c in chi_phi) else sum(c or 0 for c in chi_phi),
    }
    nguon_luat = next((c.get("nguon") for cc in can_cu_moi_doan for c in cc if c.get("nguon")), None)
    return {
        "van_ban": van_ban,
        "cau_hoi": cau_hoi,
        "phien_ban_luat": nguon_luat,
        "cac_doan": cac_doan,
        "doan_loi": doan_loi,
        "dieu_truy_hoi": dieu_truy_hoi,
        "tong_ket": tong_ket,
    }


def main(argv=None, *, cau_hinh_path=DUONG_DAN_CAU_HINH):
    import argparse

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    p = argparse.ArgumentParser(description="Bôi đỏ văn bản AI viết so với Bộ luật Lao động")
    p.add_argument("van_ban_path", help="file .txt/.md, UTF-8")
    p.add_argument("--cau-hoi", default="", help="câu hỏi đi kèm (nếu văn bản là câu trả lời của chatbot)")
    p.add_argument("--out", default="results_redline.json")
    a = p.parse_args(argv)
    van_ban = Path(a.van_ban_path).read_text(encoding="utf-8-sig")

    ch = doc_cau_hinh(cau_hinh_path) or {}
    if ch:
        log.info("Cấu hình: %s (từ %s, ghi đè .env)", ch.get("ma"), Path(cau_hinh_path).name)
    nguon = chon_nguon(ch["retriever"]) if ch else chon_nguon()
    log.info("Truy hồi: %s", nguon.ten)
    model = _kiem_cau_hinh_llm(ch.get("model"))
    log.info("LLM: %s", model)
    try:
        nguon.retrieve("kiểm tra truy hồi", k=1)  # nạp model embed trước, để thoi_gian_ms chỉ tính phần rà văn bản
        kq = redline(van_ban, a.cau_hoi, retrieve_fn=nguon.retrieve, get_article_fn=nguon.get_article,
                     llm_fn=tao_llm(model), k=ch.get("k", SO_DIEU_TRUY_HOI))
    finally:
        vectordb = sys.modules.get("core.vectordb")
        if vectordb is not None and vectordb.get_client.cache_info().currsize:
            vectordb.get_client().close()
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(kq, f, ensure_ascii=False, indent=2)

    for m in kq["cac_doan"]:
        if m["mau"]:
            nhan = "ĐỎ " if m["mau"] == "do" else "VÀNG"
            print(f"[{nhan}] {m['nhan']}: \"{m['doan_goc']}\"\n       {m['trich_dan'] or '-'}: {m['giai_thich']}")
    tk = kq["tong_ket"]
    chi_phi = f"{tk['chi_phi_usd']:.4f} USD" if tk["chi_phi_usd"] is not None else "không rõ"
    print(f"\n{tk['so_y']} khẳng định: {tk['so_do']} đỏ, {tk['so_vang']} vàng, {tk['so_dung']} đúng; "
          f"{tk['so_doan_loi']} đoạn lỗi. Cổng: {tk['cong']}. {tk['thoi_gian_ms'] / 1000:.1f} s, {chi_phi}. "
          f"Kết quả: {a.out}")


if __name__ == "__main__":
    main()
