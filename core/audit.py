"""Kiểm từng ý trong câu trả lời của chatbot so với Bộ luật Lao động.

audit_one(cau_hoi, cau_tra_loi) -> dict  : kiểm một câu (một lần gọi LLM: tách ý + chấm từng ý)
run_audit(csv_path) -> results.json      : kiểm cả CSV, tổng kết và quyết định cổng 3 mức

Chạy: python -m core.audit data/test/dev_set.csv [--out results.json]
"""

import csv
import json
import logging
import os
import re
import sys
import time
import unicodedata
from collections import namedtuple
from functools import partial
from pathlib import Path

log = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).resolve().parent.parent
NHAN_HOP_LE = ("DUNG", "TRAI_LUAT", "KHONG_CAN_CU")
TRUONG_Y = ("noi_dung", "nhan", "trich_dan", "bang_chung", "giai_thich")
SO_DIEU_TRUY_HOI = 5
SO_DIEU_TRICH_TOI_DA = 3  # số Điều chatbot tự trích được lấy thêm bằng get_article
SO_LAN_THU = 4  # tổng số lần gọi LLM tối đa khi gặp lỗi 429
CHO_GIAY = 2.0  # thời gian chờ lần đầu, nhân đôi mỗi lần

HUONG_DAN = """Bạn là chuyên gia kiểm định câu trả lời về Bộ luật Lao động Việt Nam.
Chỉ được dựa vào VĂN BẢN LUẬT được cung cấp bên dưới, không dùng kiến thức bên ngoài.

Việc cần làm:
1. Tách CÂU TRẢ LỜI thành các ý; mỗi ý là một khẳng định có thể kiểm tra được.
2. Chấm từng ý bằng đúng một nhãn:
   - DUNG: văn bản luật được cung cấp hỗ trợ ý này.
   - TRAI_LUAT: ý này mâu thuẫn với văn bản luật (sai con số, sai điều kiện, dùng quy định cũ đã bị thay,
     hoặc ghi sai số Điều/khoản so với quy định thật sự điều chỉnh vấn đề đó).
   - KHONG_CAN_CU: văn bản luật được cung cấp không có căn cứ cho ý này (ví dụ quyền lợi không điều nào quy định).
3. Với mỗi ý, ghi trich_dan dạng "Điều N khoản K điểm x" (bỏ phần không có), bang_chung là đoạn trích
   nguyên văn ngắn từ văn bản luật, giai_thich ngắn gọn bằng tiếng Việt. Nếu KHONG_CAN_CU thì trich_dan và
   bang_chung để chuỗi rỗng.

Chỉ trả về JSON đúng dạng sau, không thêm chữ nào khác:
{"cac_y": [{"noi_dung": "...", "nhan": "DUNG|TRAI_LUAT|KHONG_CAN_CU", "trich_dan": "...",
"bang_chung": "...", "giai_thich": "..."}]}"""


def _ti_le_dung(cac_y):
    """Tỉ lệ ý có nhãn DUNG trên tổng số ý, chưa làm tròn. cac_y phải khác rỗng."""
    return sum(y["nhan"] == "DUNG" for y in cac_y) / len(cac_y)


def _faithfulness(cac_y):
    """Tỉ lệ ý có căn cứ (nhãn DUNG) trên tổng số ý, làm tròn 2 chữ số.

    Theo định nghĩa faithfulness của Ragas (ý có căn cứ / tổng ý), tính từ nhãn cuối của audit
    (sau bước chặn trích dẫn), không gọi thư viện Ragas. cac_y luôn khác rỗng (_kiem_cac_y đã kiểm).
    """
    return round(_ti_le_dung(cac_y), 2)


def _faithfulness_chua_lam_tron(c):
    """Giá trị để lấy trung bình: tính lại từ nhãn nếu có cac_y (để trung bình trên số chưa làm tròn),
    không thì dùng faithfulness đã lưu; câu LOI cho None."""
    if c.get("ket_luan") == "LOI":
        return None
    return _ti_le_dung(c["cac_y"]) if c.get("cac_y") else c.get("faithfulness")


def _ket_luan(cac_nhan):
    if "TRAI_LUAT" in cac_nhan:
        return "SAI"
    if "KHONG_CAN_CU" in cac_nhan:
        return "KHONG_CAN_CU"
    return "DUNG"


def _van_ban_luat(chunks):
    """Ghép các Điều; thêm dòng "Điều N. tiêu đề" nếu noi_dung chưa có sẵn."""
    phan = []
    for c in chunks:
        dau = f"Điều {c['dieu']}."
        noi_dung = c["noi_dung"]
        phan.append(noi_dung if noi_dung.lstrip().startswith(dau) else f"{dau} {c.get('tieu_de', '')}\n{noi_dung}")
    return "\n\n".join(phan)


def _tao_messages(cau_hoi, cau_tra_loi, chunks):
    return [
        {"role": "system", "content": HUONG_DAN},
        {
            "role": "user",
            "content": (
                f"VĂN BẢN LUẬT:\n{_van_ban_luat(chunks)}\n\n"
                f"CÂU HỎI:\n{cau_hoi}\n\n"
                f"CÂU TRẢ LỜI:\n{cau_tra_loi}"
            ),
        },
    ]


def _doc_json(van_ban):
    """Đọc JSON từ câu trả lời của LLM, chịu được code fence và chữ thừa xung quanh."""
    van_ban = van_ban.strip()
    ung_vien = [van_ban]
    fence = re.search(r"```(?:json)?\s*(.*?)```", van_ban, re.DOTALL)
    if fence:
        ung_vien.append(fence.group(1))
    dau, cuoi = van_ban.find("{"), van_ban.rfind("}")
    if 0 <= dau < cuoi:
        ung_vien.append(van_ban[dau : cuoi + 1])
    for s in ung_vien:
        try:
            return json.loads(s)
        except json.JSONDecodeError:
            continue
    raise ValueError("LLM không trả về JSON đọc được")


def _kiem_cac_y(du_lieu):
    cac_y = du_lieu.get("cac_y") if isinstance(du_lieu, dict) else None
    if not isinstance(cac_y, list) or not cac_y:
        raise ValueError("Kết quả LLM không có danh sách 'cac_y' hoặc danh sách rỗng")
    ket_qua = []
    for i, y in enumerate(cac_y, 1):
        if not isinstance(y, dict) or "nhan" not in y:
            raise ValueError(f"Ý thứ {i} thiếu trường 'nhan'")
        nhan = str(y["nhan"]).strip().upper()
        if nhan not in NHAN_HOP_LE:
            raise ValueError(f"Ý thứ {i} có nhãn không hợp lệ: {y['nhan']!r}")
        ket_qua.append({**{k: str(y.get(k) or "") for k in TRUONG_Y}, "nhan": nhan})
    return ket_qua


def _dieu_duoc_trich(cau_tra_loi):
    """Các số Điều câu trả lời tự trích ("Điều 35", "điều 35 khoản 1"), theo thứ tự, không trùng, tối đa 3."""
    van_ban = unicodedata.normalize("NFC", cau_tra_loi)
    ket_qua = []
    for m in re.finditer(r"điều\s+(\d+)", van_ban, flags=re.IGNORECASE):
        so = int(m.group(1))
        if so not in ket_qua:
            ket_qua.append(so)
    return ket_qua[:SO_DIEU_TRICH_TOI_DA]


def _lay_dieu_trich_them(cau_tra_loi, chunks, get_article_fn):
    """Lấy các Điều chatbot trích mà chưa có trong top-k; Điều không tồn tại thì bỏ qua."""
    da_co = {int(c["dieu"]) for c in chunks}
    them = []
    for so in _dieu_duoc_trich(cau_tra_loi):
        if so in da_co:
            continue
        dieu = get_article_fn(so)
        if dieu is not None:
            them.append(dieu)
    return them


def _chan_trich_dan_ngoai(cac_y, chunks):
    """Ý DUNG phải trích một Điều nằm trong các Điều đưa cho judge (top-k + Điều trích thêm);
    nếu không, coi là không có căn cứ."""
    dieu_co = {int(c["dieu"]) for c in chunks}
    for y in cac_y:
        if y["nhan"] != "DUNG":
            continue
        m = re.search(r"Điều\s+(\d+)", y["trich_dan"])
        if m is None or int(m.group(1)) not in dieu_co:
            y["nhan"] = "KHONG_CAN_CU"
            y["ha_nhan"] = True  # để lúc chấm phân biệt nhãn do hệ thống chặn hay do LLM
            y["giai_thich"] = (
                y["giai_thich"] + " [Hệ thống: trích dẫn không thuộc các Điều đã truy hồi, hạ từ DUNG.]"
            ).strip()
    return cac_y


def _chuan_hoa_chu(van_ban):
    """Chữ thường, NFC, bỏ dấu câu/ký hiệu, gộp khoảng trắng: để so nguyên văn theo từng chữ."""
    van_ban = unicodedata.normalize("NFC", van_ban).lower()
    return " ".join(re.sub(r"[^\w]+", " ", van_ban).split())


def _bang_chung_khop(bang_chung, trich_dan, can_cu):
    """Bằng chứng phải nằm nguyên văn trong Điều được trích (hoặc trong mọi Điều judge nhận, nếu
    trích dẫn không chỉ ra Điều nào có trong đó). Judge được ngắt đoạn bằng "..." / "…";
    đoạn dưới 3 chữ (vd "2.b)") bỏ qua, trừ khi cả bằng chứng chỉ có vậy."""
    m = re.search(r"điều\s+(\d+)", unicodedata.normalize("NFC", trich_dan), flags=re.IGNORECASE)
    dieu_trich = [c for c in can_cu if m and int(c["dieu"]) == int(m.group(1))]
    van_ban = _chuan_hoa_chu("\n".join(c["noi_dung"] for c in (dieu_trich or can_cu)))
    doan = [_chuan_hoa_chu(d) for d in re.split(r"\.{3,}|…", bang_chung)]
    doan_dai = [d for d in doan if len(d.split()) >= 3] or [d for d in doan if d]
    return all(d in van_ban for d in doan_dai)


def _kiem_bang_chung(cac_y, can_cu):
    """Gắn bang_chung_khop=False cho ý có bằng chứng không đúng nguyên văn; không đổi nhãn."""
    for y in cac_y:
        if y["bang_chung"].strip() and not _bang_chung_khop(y["bang_chung"], y["trich_dan"], can_cu):
            y["bang_chung_khop"] = False
    return cac_y


def _goi_co_thu_lai(llm_fn, messages):
    """Gọi LLM, chỉ thử lại khi gặp lỗi 429 (quá giới hạn tốc độ), chờ tăng dần."""
    for lan in range(SO_LAN_THU):
        try:
            return llm_fn(messages)
        except Exception as e:
            if getattr(e, "status_code", None) != 429 or lan == SO_LAN_THU - 1:
                raise
            time.sleep(CHO_GIAY * 2**lan)


def _nap_env():
    """Nạp .env của repo (gồm HF_HUB_OFFLINE) trước khi import thư viện có dùng Hugging Face."""
    from dotenv import load_dotenv

    load_dotenv(REPO_ROOT / ".env")


def _lay(obj, khoa):
    return obj[khoa] if isinstance(obj, dict) else getattr(obj, khoa)


def _llm_mac_dinh(messages):
    """Gọi LLM qua LiteLLM, model lấy từ biến môi trường LLM_MODEL. Trả (nội dung, chi phí USD hoặc None)."""
    _nap_env()
    import litellm

    model = os.getenv("LLM_MODEL")
    if not model:
        raise RuntimeError("Chưa cấu hình LLM_MODEL trong .env (xem .env.example)")
    resp = litellm.completion(model=model, messages=messages, temperature=0)
    noi_dung = _lay(_lay(_lay(resp, "choices")[0], "message"), "content")
    try:
        chi_phi = float(litellm.completion_cost(completion_response=resp))
    except Exception:
        chi_phi = None  # model chưa có bảng giá trong LiteLLM
    return noi_dung, chi_phi


Nguon = namedtuple("Nguon", "ten retrieve get_article")


def chon_nguon():
    """Chọn nguồn truy hồi theo RETRIEVER trong .env. Không tự chuyển nguồn khi lỗi.

    Để trống (mặc định): core.retrieve của Bào (Qdrant + bge-m3). "bm25": core.retrieve_bm25 (tạm).
    """
    _nap_env()
    ten = (os.getenv("RETRIEVER") or "").strip().lower()
    if ten == "":
        from core import retrieve
        from core.vectordb import COLLECTION, EMBED_MODEL

        return Nguon(f"qdrant (core.retrieve, collection {COLLECTION}, model {EMBED_MODEL})",
                     retrieve.retrieve, retrieve.get_article)
    if ten == "bm25":
        from core import retrieve_bm25

        return Nguon("bm25 (core.retrieve_bm25, bản tạm)", retrieve_bm25.retrieve, retrieve_bm25.get_article)
    raise ValueError(f"RETRIEVER không hợp lệ: {ten!r}. Để trống (Qdrant) hoặc đặt bm25.")


def audit_one(cau_hoi, cau_tra_loi, *, retrieve_fn=None, get_article_fn=None, llm_fn=None):
    """Kiểm một câu trả lời. Trả dict theo một phần tử của results.json["cau"] (chưa có "id").

    Judge nhận top-5 từ retrieve() cộng tối đa 3 Điều chatbot tự trích (lấy bằng get_article);
    dieu_truy_hoi chỉ ghi top-5. retrieve_fn, get_article_fn, llm_fn để thay khi test;
    mặc định lấy theo chon_nguon() và LiteLLM.
    """
    if retrieve_fn is None or get_article_fn is None:
        nguon = chon_nguon()
        retrieve_fn = retrieve_fn or nguon.retrieve
        get_article_fn = get_article_fn or nguon.get_article
    if llm_fn is None:
        llm_fn = _llm_mac_dinh
    bat_dau = time.perf_counter()
    chunks = retrieve_fn(f"{cau_hoi}\n{cau_tra_loi}", k=SO_DIEU_TRUY_HOI)
    can_cu = chunks + _lay_dieu_trich_them(cau_tra_loi, chunks, get_article_fn)
    van_ban, chi_phi = _goi_co_thu_lai(llm_fn, _tao_messages(cau_hoi, cau_tra_loi, can_cu))
    cac_y = _kiem_bang_chung(_chan_trich_dan_ngoai(_kiem_cac_y(_doc_json(van_ban)), can_cu), can_cu)
    return {
        "ket_luan": _ket_luan([y["nhan"] for y in cac_y]),
        "faithfulness": _faithfulness(cac_y),
        "cac_y": cac_y,
        "dieu_truy_hoi": [c["chunk_id"] for c in chunks],
        "thoi_gian_ms": round((time.perf_counter() - bat_dau) * 1000),
        "chi_phi_usd": chi_phi,
    }


COT_CSV = ("id", "cau_hoi", "cau_tra_loi")


def _doc_id(gia_tri):
    gia_tri = gia_tri.strip()
    return int(gia_tri) if gia_tri.isdigit() else gia_tri


def _trung_binh(gia_tri):
    """Trung bình các giá trị khác None (câu LOI có faithfulness None nên bị bỏ qua), làm tròn 2 chữ số."""
    co = [g for g in gia_tri if g is not None]
    return round(sum(co) / len(co), 2) if co else None


def _cong(cac_ket_luan):
    if "SAI" in cac_ket_luan:
        return "KHONG_DAT"
    if "KHONG_CAN_CU" in cac_ket_luan or "LOI" in cac_ket_luan:
        return "CAN_XEM_LAI"  # câu lỗi chưa được kiểm, cần người xem
    return "DAT"


KET_LUAN_HOP_LE = ("DUNG", "SAI", "KHONG_CAN_CU")
SO_LAN_CHAY_MOT_CAU = 2  # lỗi thì chạy lại câu đó 1 lần


def _audit_mot_cau(audit_fn, id_, cau_hoi, cau_tra_loi):
    """Gọi audit cho một câu; lỗi (kể cả ket_luan lạ) thì chạy lại, vẫn lỗi thì trả kết quả LOI."""
    bat_dau = time.perf_counter()
    for lan in range(1, SO_LAN_CHAY_MOT_CAU + 1):
        try:
            kq = audit_fn(cau_hoi, cau_tra_loi)
            if kq.get("ket_luan") not in KET_LUAN_HOP_LE:
                raise ValueError(f"ket_luan không hợp lệ: {kq.get('ket_luan')!r}")
            return kq
        except Exception as e:
            loi = e
            log.error("Câu %s lỗi (lần %d/%d): %s", id_, lan, SO_LAN_CHAY_MOT_CAU, e)
    return {
        "ket_luan": "LOI",
        "loi": f"{type(loi).__name__}: {loi}",
        "faithfulness": None,
        "cac_y": [],
        "dieu_truy_hoi": [],
        "thoi_gian_ms": round((time.perf_counter() - bat_dau) * 1000),
        "chi_phi_usd": None,
    }


def _kiem_cau_hinh_llm():
    """Kiểm LLM_MODEL và API key của nhà cung cấp (không gọi mạng). Thiếu thì báo lỗi, trả tên model.

    Biến *_API_KEY để trống trong .env bị coi là thiếu (LiteLLM coi biến rỗng là đã có key).
    """
    _nap_env()
    model = (os.getenv("LLM_MODEL") or "").strip()
    if not model:
        raise RuntimeError("Chưa cấu hình LLM_MODEL trong .env (xem .env.example)")
    import litellm

    key_rong = {k: v for k, v in os.environ.items() if k.endswith("_API_KEY") and not v.strip()}
    for k in key_rong:
        del os.environ[k]
    try:
        thieu = litellm.validate_environment(model=model).get("missing_keys") or []
    finally:
        os.environ.update(key_rong)
    if thieu:
        raise RuntimeError(f"Model {model} cần API key: điền {', '.join(thieu)} vào .env")
    return model


def _chuan_bi_audit(nguon, llm_fn):
    """Chuẩn bị một lượt chạy: chọn nguồn truy hồi một lần, kiểm cấu hình LLM, rồi chạy thử truy hồi
    để nạp model/mở index ngay. Hỏng chỗ nào thì dừng luôn (không ghi LOI cho từng câu,
    không chuyển sang nguồn khác). Kiểm LLM trước vì rẻ, nạp model bge-m3 mất vài chục giây.
    """
    nguon = nguon or chon_nguon()
    log.info("Truy hồi: %s", nguon.ten)
    if llm_fn is None:
        log.info("LLM: %s", _kiem_cau_hinh_llm())
        llm_fn = _llm_mac_dinh
    try:
        nguon.retrieve("kiểm tra truy hồi", k=1)
    except Exception as e:
        raise RuntimeError(f"Truy hồi không chạy được ({nguon.ten}): {e}") from e
    return partial(audit_one, retrieve_fn=nguon.retrieve, get_article_fn=nguon.get_article, llm_fn=llm_fn)


def run_audit(csv_path, out_path="results.json", *, audit_fn=None, nguon=None, llm_fn=None):
    """Kiểm mọi câu trong CSV (id, cau_hoi, cau_tra_loi), ghi results.json, trả về dict kết quả.

    Nguồn truy hồi và cấu hình LLM được kiểm một lần khi bắt đầu; hỏng thì dừng ngay.
    Lỗi ở một câu: chạy lại câu đó 1 lần; vẫn lỗi thì ghi ket_luan "LOI" và thông báo vào "loi",
    rồi chạy tiếp câu sau. audit_fn, nguon, llm_fn để thay khi test.
    """
    with open(csv_path, encoding="utf-8-sig", newline="") as f:
        doc = csv.DictReader(f)
        thieu = [c for c in COT_CSV if c not in (doc.fieldnames or [])]
        if thieu:
            raise ValueError(f"CSV thiếu cột: {', '.join(thieu)}")
        dong = list(doc)
    if not dong:
        raise ValueError(f"CSV không có câu nào để kiểm: {csv_path}")  # tránh cổng DAT rỗng
    if audit_fn is None:
        audit_fn = _chuan_bi_audit(nguon, llm_fn)

    cau = []
    for i, d in enumerate(dong, 1):
        id_ = _doc_id(d["id"])
        kq = _audit_mot_cau(audit_fn, id_, d["cau_hoi"], d["cau_tra_loi"])
        cau.append({"id": id_, **kq})
        log.info("[%d/%d] câu %s: %s", i, len(dong), id_, kq["ket_luan"])

    cac_ket_luan = [c["ket_luan"] for c in cau]
    tong_ket = {
        "so_cau": len(cau),
        "dung": cac_ket_luan.count("DUNG"),
        "sai": cac_ket_luan.count("SAI"),
        "khong_can_cu": cac_ket_luan.count("KHONG_CAN_CU"),
        "loi": cac_ket_luan.count("LOI"),
        "faithfulness_tb": _trung_binh([_faithfulness_chua_lam_tron(c) for c in cau]),
        "cong": _cong(cac_ket_luan),
    }
    if tong_ket["dung"] + tong_ket["sai"] + tong_ket["khong_can_cu"] + tong_ket["loi"] != tong_ket["so_cau"]:
        raise AssertionError(f"Tổng các loại không khớp so_cau: {tong_ket}")
    ket_qua = {"tong_ket": tong_ket, "cau": cau}
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(ket_qua, f, ensure_ascii=False, indent=2)
    return ket_qua


def main(argv=None):
    import argparse

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")  # console Windows mặc định cp1252
        sys.stderr.reconfigure(encoding="utf-8")
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    p = argparse.ArgumentParser(description="Kiểm câu trả lời của chatbot so với Bộ luật Lao động")
    p.add_argument("csv_path", help="CSV có cột id, cau_hoi, cau_tra_loi")
    p.add_argument("--out", default="results.json", help="file kết quả (mặc định results.json)")
    a = p.parse_args(argv)
    try:
        tk = run_audit(a.csv_path, a.out)["tong_ket"]
    finally:
        vectordb = sys.modules.get("core.vectordb")
        if vectordb is not None and vectordb.get_client.cache_info().currsize:
            vectordb.get_client().close()  # Qdrant local khoá thư mục .qdrant/, đóng để process khác dùng được
    print(
        f"Đã kiểm {tk['so_cau']} câu: {tk['dung']} đúng, {tk['sai']} sai, "
        f"{tk['khong_can_cu']} không căn cứ, {tk['loi']} lỗi. Cổng: {tk['cong']}. Kết quả: {a.out}"
    )


if __name__ == "__main__":
    main()
