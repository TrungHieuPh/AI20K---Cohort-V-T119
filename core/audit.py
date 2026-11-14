"""Kiểm từng ý trong câu trả lời của chatbot so với Bộ luật Lao động.

audit_one(cau_hoi, cau_tra_loi) -> dict  : kiểm một câu (một lần gọi LLM: tách ý + chấm từng ý)
"""

import json
import logging
import os
import re
import time

log = logging.getLogger(__name__)

NHAN_HOP_LE = ("DUNG", "TRAI_LUAT", "KHONG_CAN_CU")
TRUONG_Y = ("noi_dung", "nhan", "trich_dan", "bang_chung", "giai_thich")
SO_DIEU_TRUY_HOI = 5
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


def _chan_trich_dan_ngoai(cac_y, chunks):
    """Ý DUNG phải trích một Điều nằm trong các Điều đã truy hồi; nếu không, coi là không có căn cứ."""
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
    from dotenv import load_dotenv

    load_dotenv()


def _lay(obj, khoa):
    return obj[khoa] if isinstance(obj, dict) else getattr(obj, khoa)


def _llm_mac_dinh(messages):
    """Gọi LLM qua LiteLLM, model lấy từ biến môi trường LLM_MODEL. Trả (nội dung, chi phí USD hoặc None)."""
    import litellm

    _nap_env()
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


def _retrieve_mac_dinh(query, k=SO_DIEU_TRUY_HOI):
    """Dùng core.retrieve (Qdrant) nếu chạy được; chưa có hoặc lỗi thì dùng BM25 tạm."""
    from core import retrieve_bm25

    try:
        from core.retrieve import retrieve
    except ImportError:
        return retrieve_bm25.retrieve(query, k=k)
    try:
        return retrieve(query, k=k)
    except Exception as e:
        log.warning("core.retrieve lỗi (%s), chuyển sang BM25", e)
        return retrieve_bm25.retrieve(query, k=k)


def audit_one(cau_hoi, cau_tra_loi, *, retrieve_fn=None, llm_fn=None):
    """Kiểm một câu trả lời. Trả dict theo một phần tử của results.json["cau"] (chưa có "id").

    retrieve_fn, llm_fn chỉ để thay thế khi test; mặc định dùng _retrieve_mac_dinh và LiteLLM.
    """
    if retrieve_fn is None:
        retrieve_fn = _retrieve_mac_dinh
    if llm_fn is None:
        llm_fn = _llm_mac_dinh
    bat_dau = time.perf_counter()
    chunks = retrieve_fn(f"{cau_hoi}\n{cau_tra_loi}", k=SO_DIEU_TRUY_HOI)
    van_ban, chi_phi = _goi_co_thu_lai(llm_fn, _tao_messages(cau_hoi, cau_tra_loi, chunks))
    cac_y = _chan_trich_dan_ngoai(_kiem_cac_y(_doc_json(van_ban)), chunks)
    return {
        "ket_luan": _ket_luan([y["nhan"] for y in cac_y]),
        "faithfulness": None,
        "cac_y": cac_y,
        "dieu_truy_hoi": [c["chunk_id"] for c in chunks],
        "thoi_gian_ms": round((time.perf_counter() - bat_dau) * 1000),
        "chi_phi_usd": chi_phi,
    }
