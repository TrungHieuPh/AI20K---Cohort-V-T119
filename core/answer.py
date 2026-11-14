"""RAG hỏi đáp của nhóm: câu hỏi → top-k Điều → LLM trả lời có trích Điều.

answer_one(cau_hoi) -> dict   : trả lời một câu (một lần gọi LLM)
run_answer(csv_path)          : trả lời cả CSV → results_answers.csv (id, cau_hoi, cau_tra_loi) + .json chi tiết

Chạy: python -m core.answer data/test/retrieval_smoke.csv [--out results_answers.csv] [--k 5]
      python -m core.audit results_answers.csv     # chấm chính chatbot của nhóm

Câu trả lời là đối tượng để đo: chạy theo lô ra CSV (id, cau_hoi, cau_tra_loi) rồi cho core.audit chấm.
Dùng lại nguồn truy hồi, gọi LLM, đọc JSON của core.audit (chưa tách module chung).
"""

import csv
import json
import logging
import re
import sys
import time
import unicodedata
from functools import partial
from pathlib import Path

from core.audit import (
    _chuan_hoa_chu,
    _doc_id,
    _doc_json,
    _goi_co_thu_lai,
    _kiem_cau_hinh_llm,
    _llm_mac_dinh,
    _van_ban_luat,
    chon_nguon,
)

log = logging.getLogger(__name__)

SO_DIEU_TRUY_HOI = 5
KHONG_CO_CAN_CU = "Bộ luật Lao động không có quy định trực tiếp về vấn đề này."

HUONG_DAN_TRA_LOI = f"""Bạn là trợ lý tư vấn Bộ luật Lao động Việt Nam.
Chỉ được dựa vào VĂN BẢN LUẬT được cung cấp bên dưới, không dùng kiến thức bên ngoài, không bịa quy định.

Yêu cầu:
1. Trả lời CÂU HỎI ngắn gọn, chính xác bằng tiếng Việt, nêu đúng con số, điều kiện, thời hạn như trong văn bản luật.
2. Ghi căn cứ trong câu trả lời theo dạng "theo Điều N khoản K điểm x Bộ luật Lao động" (bỏ phần không có),
   và liệt kê các căn cứ đó trong trich_dan.
3. Nếu văn bản luật được cung cấp không có căn cứ để trả lời, trả lời đúng nguyên văn câu sau và để trich_dan rỗng:
   "{KHONG_CO_CAN_CU}"

Chỉ trả về JSON đúng dạng sau, không thêm chữ nào khác:
{{"cau_tra_loi": "...", "trich_dan": ["Điều N khoản K điểm x"]}}"""


def _tao_messages(cau_hoi, chunks):
    return [
        {"role": "system", "content": HUONG_DAN_TRA_LOI},
        {"role": "user", "content": f"VĂN BẢN LUẬT:\n{_van_ban_luat(chunks)}\n\nCÂU HỎI:\n{cau_hoi}"},
    ]


def _kiem_tra_loi(du_lieu):
    """Lấy cau_tra_loi (bắt buộc, không rỗng) và trich_dan (list; một chuỗi thì thành [chuỗi]; thiếu thì [])."""
    cau_tra_loi = du_lieu.get("cau_tra_loi") if isinstance(du_lieu, dict) else None
    if not isinstance(cau_tra_loi, str) or not cau_tra_loi.strip():
        raise ValueError("Kết quả LLM thiếu 'cau_tra_loi' hoặc câu trả lời rỗng")
    trich_dan = du_lieu.get("trich_dan") or []
    if isinstance(trich_dan, str):
        trich_dan = [trich_dan]
    if not isinstance(trich_dan, list):
        raise ValueError(f"'trich_dan' phải là danh sách, nhận được {type(trich_dan).__name__}")
    return cau_tra_loi.strip(), [str(t).strip() for t in trich_dan if str(t).strip()]


def answer_one(cau_hoi, *, retrieve_fn=None, llm_fn=None, k=SO_DIEU_TRUY_HOI):
    """Trả lời một câu hỏi. retrieve_fn, llm_fn để thay khi test; mặc định theo chon_nguon() và LiteLLM."""
    if retrieve_fn is None:
        retrieve_fn = chon_nguon().retrieve
    if llm_fn is None:
        llm_fn = _llm_mac_dinh
    bat_dau = time.perf_counter()
    chunks = retrieve_fn(cau_hoi, k=k)
    van_ban, chi_phi = _goi_co_thu_lai(llm_fn, _tao_messages(cau_hoi, chunks))
    cau_tra_loi, trich_dan = _kiem_tra_loi(_doc_json(van_ban))
    return {
        "cau_tra_loi": cau_tra_loi,
        "trich_dan": trich_dan,
        "dieu_truy_hoi": [c["chunk_id"] for c in chunks],
        "thoi_gian_ms": round((time.perf_counter() - bat_dau) * 1000),
        "chi_phi_usd": chi_phi,
    }


COT_CSV = ("id", "cau_hoi")
SO_LAN_CHAY_MOT_CAU = 2  # lỗi thì chạy lại câu đó 1 lần


def _chuan_bi(nguon, llm_fn, k):
    """Chọn nguồn truy hồi một lần, kiểm cấu hình LLM, chạy thử truy hồi (nạp model ngay). Hỏng thì dừng luôn.
    Trả (answer_fn, tên nguồn, tên model)."""
    nguon = nguon or chon_nguon()
    log.info("Truy hồi: %s", nguon.ten)
    model = None
    if llm_fn is None:
        model = _kiem_cau_hinh_llm()
        log.info("LLM: %s", model)
        llm_fn = _llm_mac_dinh
    try:
        nguon.retrieve("kiểm tra truy hồi", k=1)
    except Exception as e:
        raise RuntimeError(f"Truy hồi không chạy được ({nguon.ten}): {e}") from e
    return partial(answer_one, retrieve_fn=nguon.retrieve, llm_fn=llm_fn, k=k), nguon.ten, model


CUM_TU_CHOI = (  # model hay diễn đạt lại câu cố định ("…không có quy định trực tiếp về việc X")
    KHONG_CO_CAN_CU,
    "không có quy định trực tiếp",
    "bộ luật lao động không có quy định",
    "bộ luật lao động không quy định",
)


def _la_tu_choi(cau_tra_loi):
    """Câu trả lời là từ chối "không có căn cứ": chứa câu cố định hoặc một cụm diễn đạt lại của nó
    (bỏ qua dấu nháy, hoa thường, dấu câu, phần giải thích thêm)."""
    van_ban = _chuan_hoa_chu(cau_tra_loi)
    return any(_chuan_hoa_chu(cum) in van_ban for cum in CUM_TU_CHOI)


def _trich_dan_ngoai(trich_dan, dieu_truy_hoi):
    """Số Điều được trích mà không nằm trong top-k đã truy hồi (theo thứ tự, không trùng)."""
    co = {int(d.split("-")[-1]) for d in dieu_truy_hoi}
    ngoai = []
    for t in trich_dan:
        for so in re.findall(r"điều\s+(\d+)", unicodedata.normalize("NFC", t), flags=re.IGNORECASE):
            if int(so) not in co and int(so) not in ngoai:
                ngoai.append(int(so))
    return ngoai


def _kiem_duong_dan_ra(out_path):
    """Kiểm đường dẫn đầu ra trước khi tốn tiền gọi LLM: phải là .csv (file .json cùng tên đi kèm)."""
    out_path = Path(out_path)
    if out_path.suffix.lower() != ".csv":
        raise ValueError(f"Đầu ra phải là file .csv (file .json cùng tên được ghi kèm), nhận được: {out_path}")
    return out_path


def _mo_san_dau_ra(out_path):
    """Tạo thư mục và thử mở ghi cả hai file ngay từ đầu (vd file đang mở trong Excel) để không mất lượt đã chạy."""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    for p in (out_path, out_path.with_suffix(".json")):
        with open(p, "a", encoding="utf-8"):
            pass


def _tra_loi_mot_cau(answer_fn, id_, cau_hoi):
    """Trả (kết quả, None) hoặc (None, thông báo lỗi) sau tối đa SO_LAN_CHAY_MOT_CAU lần."""
    if not cau_hoi.strip():
        return None, "Câu hỏi rỗng"
    for lan in range(1, SO_LAN_CHAY_MOT_CAU + 1):
        try:
            return answer_fn(cau_hoi), None
        except Exception as e:
            loi = f"{type(e).__name__}: {e}"
            log.error("Câu %s lỗi (lần %d/%d): %s", id_, lan, SO_LAN_CHAY_MOT_CAU, e)
    return None, loi


def run_answer(csv_path, out_path="results_answers.csv", *, k=SO_DIEU_TRUY_HOI, answer_fn=None, nguon=None, llm_fn=None):
    """Trả lời mọi câu trong CSV (cột id, cau_hoi; cột khác bỏ qua).

    Ghi out_path (CSV id, cau_hoi, cau_tra_loi, chỉ câu trả lời được, để core.audit chấm) và cùng tên đuôi .json
    (chi tiết từng câu, kể cả câu lỗi). answer_fn, nguon, llm_fn để thay khi test.
    """
    out_path = _kiem_duong_dan_ra(out_path)
    with open(csv_path, encoding="utf-8-sig", newline="") as f:
        doc = csv.DictReader(f)
        thieu = [c for c in COT_CSV if c not in (doc.fieldnames or [])]
        if thieu:
            raise ValueError(f"CSV thiếu cột: {', '.join(thieu)}")
        dong = list(doc)

    retriever = model = None
    if answer_fn is None:
        answer_fn, retriever, model = _chuan_bi(nguon, llm_fn, k)
    _mo_san_dau_ra(out_path)

    cau = []
    for i, d in enumerate(dong, 1):
        id_, cau_hoi = _doc_id(d.get("id") or ""), d.get("cau_hoi") or ""  # dòng thiếu ô: DictReader cho None
        kq, loi = _tra_loi_mot_cau(answer_fn, id_, cau_hoi)
        if kq:
            kq = {**kq, "tu_choi": _la_tu_choi(kq["cau_tra_loi"]),
                  "trich_dan_ngoai": _trich_dan_ngoai(kq.get("trich_dan", []), kq.get("dieu_truy_hoi", []))}
        cau.append({"id": id_, "cau_hoi": cau_hoi, **kq} if kq else {"id": id_, "cau_hoi": cau_hoi, "loi": loi})
        log.info("[%d/%d] câu %s: %s", i, len(dong), id_, "LỖI" if loi else "xong")

    duoc = [c for c in cau if "loi" not in c]
    ket_qua = {
        "tong_ket": {
            "so_cau": len(cau),
            "tra_loi_duoc": len(duoc),
            "loi": len(cau) - len(duoc),
            "khong_co_can_cu": sum(c["tu_choi"] for c in duoc),
            "k": k,
            "retriever": retriever,
            "model": model,
        },
        "cau": cau,
    }
    with open(out_path, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["id", "cau_hoi", "cau_tra_loi"])
        w.writerows((c["id"], c["cau_hoi"], c["cau_tra_loi"]) for c in duoc)
    with open(out_path.with_suffix(".json"), "w", encoding="utf-8") as f:
        json.dump(ket_qua, f, ensure_ascii=False, indent=2)
    return ket_qua


def main(argv=None):
    import argparse

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")  # console Windows mặc định cp1252
        sys.stderr.reconfigure(encoding="utf-8")
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    p = argparse.ArgumentParser(description="RAG hỏi đáp Bộ luật Lao động, chạy theo lô")
    p.add_argument("csv_path", help="CSV có cột id, cau_hoi")
    p.add_argument("--out", default="results_answers.csv", help="CSV kết quả (kèm file .json cùng tên)")
    p.add_argument("--k", type=int, default=SO_DIEU_TRUY_HOI, help="số Điều truy hồi cho mỗi câu (mặc định 5)")
    a = p.parse_args(argv)
    try:
        tk = run_answer(a.csv_path, a.out, k=a.k)["tong_ket"]
    finally:
        vectordb = sys.modules.get("core.vectordb")
        if vectordb is not None and vectordb.get_client.cache_info().currsize:
            vectordb.get_client().close()  # Qdrant local khoá .qdrant/, đóng để process khác (vd audit) mở được
    print(f"Đã trả lời {tk['tra_loi_duoc']}/{tk['so_cau']} câu ({tk['khong_co_can_cu']} câu không có căn cứ, "
          f"{tk['loi']} lỗi). Kết quả: {a.out} và {Path(a.out).with_suffix('.json')}")
    if tk["loi"]:
        # Câu lỗi không có trong CSV nên audit sẽ chấm ít câu hơn đầu vào: báo rõ và trả mã lỗi.
        print(f"CẢNH BÁO: {tk['loi']} câu không trả lời được (xem trường 'loi' trong file .json); "
              "các câu này không có trong CSV đưa cho audit.")
        sys.exit(1)


if __name__ == "__main__":
    main()
