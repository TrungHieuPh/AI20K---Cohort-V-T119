"""Test cho core/audit.py. Dùng retrieve và LLM giả, dữ liệu giả trong mock/."""

import json
from pathlib import Path

import pytest

from core.audit import audit_one

MOCK = json.loads(
    (Path(__file__).resolve().parent.parent / "mock" / "mock_chunks.json").read_text(encoding="utf-8")
)
CHUNKS = MOCK["chunks"]  # dieu-35, dieu-36


def fake_retrieve(query, k=5):
    return [dict(c) for c in CHUNKS]


def y(nhan, trich_dan="Điều 35 khoản 1 điểm a", noi_dung="ý giả"):
    return {
        "noi_dung": noi_dung,
        "nhan": nhan,
        "trich_dan": trich_dan,
        "bang_chung": "bằng chứng giả",
        "giai_thich": "giải thích giả",
    }


def fake_llm(cac_y, chi_phi=0.0):
    """LLM giả: luôn trả JSON {"cac_y": ...} và chi phí cố định."""

    def _llm(messages):
        return json.dumps({"cac_y": cac_y}, ensure_ascii=False), chi_phi

    return _llm


def chay(cac_y, **kw):
    return audit_one("câu hỏi giả", "câu trả lời giả", retrieve_fn=fake_retrieve, llm_fn=fake_llm(cac_y), **kw)


# --- Kết luận từng câu -------------------------------------------------------

@pytest.mark.parametrize(
    "nhan_cac_y, ket_luan",
    [
        (["DUNG", "TRAI_LUAT"], "SAI"),
        (["KHONG_CAN_CU", "TRAI_LUAT"], "SAI"),
        (["DUNG", "KHONG_CAN_CU"], "KHONG_CAN_CU"),
        (["DUNG", "DUNG"], "DUNG"),
    ],
)
def test_ket_luan_theo_nhan_cac_y(nhan_cac_y, ket_luan):
    kq = chay([y(n) for n in nhan_cac_y])
    assert kq["ket_luan"] == ket_luan
    assert [c["nhan"] for c in kq["cac_y"]] == nhan_cac_y


def test_tra_ve_chunk_id_da_truy_hoi_theo_thu_tu():
    kq = chay([y("DUNG")])
    assert kq["dieu_truy_hoi"] == ["dieu-35", "dieu-36"]


# --- Prompt gửi LLM ----------------------------------------------------------

def test_prompt_chua_cau_hoi_cau_tra_loi_va_van_ban_cac_dieu_truy_hoi():
    da_gui = []

    def llm(messages):
        da_gui.append(messages)
        return json.dumps({"cac_y": [y("DUNG")]}), 0.0

    audit_one("CÂU HỎI XYZ", "TRẢ LỜI ABC", retrieve_fn=fake_retrieve, llm_fn=llm)
    toan_bo = "\n".join(m["content"] for m in da_gui[0])
    assert len(da_gui) == 1  # một lần gọi LLM cho mỗi câu
    assert "CÂU HỎI XYZ" in toan_bo and "TRẢ LỜI ABC" in toan_bo
    for c in CHUNKS:
        assert f"Điều {c['dieu']}" in toan_bo
        assert c["noi_dung"] in toan_bo


def test_retrieve_duoc_goi_voi_k_bang_5():
    goi = []

    def retrieve(query, k=5):
        goi.append(k)
        return fake_retrieve(query, k)

    audit_one("q", "a", retrieve_fn=retrieve, llm_fn=fake_llm([y("DUNG")]))
    assert goi == [5]


# --- Đọc JSON trả về ---------------------------------------------------------

def test_doc_duoc_json_boc_trong_code_fence_va_co_chu_xung_quanh():
    noi_dung = json.dumps({"cac_y": [y("TRAI_LUAT")]}, ensure_ascii=False)
    van_ban = f"Kết quả đây:\n```json\n{noi_dung}\n```\nHết."
    kq = audit_one("q", "a", retrieve_fn=fake_retrieve, llm_fn=lambda m: (van_ban, 0.0))
    assert kq["ket_luan"] == "SAI"


def test_nhan_viet_thuong_hoac_co_khoang_trang_duoc_chuan_hoa():
    kq = chay([y(" trai_luat ")])
    assert kq["cac_y"][0]["nhan"] == "TRAI_LUAT"
    assert kq["ket_luan"] == "SAI"


@pytest.mark.parametrize(
    "van_ban",
    [
        "không phải JSON",
        json.dumps({"cac_y": []}),
        json.dumps({"khac": 1}),
        json.dumps({"cac_y": [y("SAI_ROI")]}),
        json.dumps({"cac_y": [{"noi_dung": "thiếu nhãn"}]}),
    ],
    ids=["khong_json", "khong_co_y", "thieu_cac_y", "nhan_la", "thieu_truong_nhan"],
)
def test_ket_qua_llm_khong_hop_le_thi_bao_loi(van_ban):
    with pytest.raises(ValueError):
        audit_one("q", "a", retrieve_fn=fake_retrieve, llm_fn=lambda m: (van_ban, 0.0))


# --- Chặn trích dẫn không có trong văn bản truy hồi ----------------------------

@pytest.mark.parametrize("trich_dan", ["Điều 99 khoản 1", "", "khoản 2"])
def test_y_dung_trich_dieu_khong_duoc_truy_hoi_bi_ha_xuong_khong_can_cu(trich_dan):
    kq = chay([y("DUNG", trich_dan=trich_dan)])
    assert kq["cac_y"][0]["nhan"] == "KHONG_CAN_CU"
    assert kq["cac_y"][0]["ha_nhan"] is True
    assert kq["ket_luan"] == "KHONG_CAN_CU"


def test_y_dung_trich_dieu_da_truy_hoi_giu_nguyen():
    kq = chay([y("DUNG", trich_dan="Điều 36 khoản 2")])
    assert kq["cac_y"][0]["nhan"] == "DUNG"
    assert "ha_nhan" not in kq["cac_y"][0]


def test_y_khong_can_cu_do_llm_cham_khong_co_ha_nhan():
    kq = chay([y("KHONG_CAN_CU", trich_dan="")])
    assert "ha_nhan" not in kq["cac_y"][0]


def test_y_trai_luat_trich_dieu_khong_duoc_truy_hoi_van_la_trai_luat():
    kq = chay([y("TRAI_LUAT", trich_dan="Điều 99")])
    assert kq["ket_luan"] == "SAI"


# --- Thử lại khi gặp lỗi 429 ---------------------------------------------------

class LoiGia(Exception):
    def __init__(self, status_code):
        super().__init__(f"lỗi {status_code}")
        self.status_code = status_code


def llm_loi_truoc(so_lan_loi, status_code):
    dem = {"goi": 0}

    def llm(messages):
        dem["goi"] += 1
        if dem["goi"] <= so_lan_loi:
            raise LoiGia(status_code)
        return json.dumps({"cac_y": [y("DUNG")]}), 0.0

    return llm, dem


@pytest.fixture
def khong_cho(monkeypatch):
    monkeypatch.setattr("core.audit.time.sleep", lambda s: None)


def test_loi_429_duoc_thu_lai_roi_thanh_cong(khong_cho):
    llm, dem = llm_loi_truoc(2, 429)
    kq = audit_one("q", "a", retrieve_fn=fake_retrieve, llm_fn=llm)
    assert kq["ket_luan"] == "DUNG"
    assert dem["goi"] == 3


def test_loi_429_qua_so_lan_thu_thi_bao_loi(khong_cho):
    llm, dem = llm_loi_truoc(100, 429)
    with pytest.raises(LoiGia):
        audit_one("q", "a", retrieve_fn=fake_retrieve, llm_fn=llm)
    assert 1 < dem["goi"] < 100


def test_loi_khac_429_khong_thu_lai(khong_cho):
    llm, dem = llm_loi_truoc(1, 500)
    with pytest.raises(LoiGia):
        audit_one("q", "a", retrieve_fn=fake_retrieve, llm_fn=llm)
    assert dem["goi"] == 1


# --- Hàm gọi LLM mặc định (LiteLLM) ------------------------------------------

class LiteLLMGia:
    """Module litellm giả: ghi lại tham số, trả response dạng OpenAI."""

    def __init__(self, noi_dung, chi_phi=0.0123):
        self.tham_so = None
        self._noi_dung, self._chi_phi = noi_dung, chi_phi

    def completion(self, **kw):
        self.tham_so = kw
        return {"choices": [{"message": {"content": self._noi_dung}}]}

    def completion_cost(self, completion_response):
        return self._chi_phi


def test_llm_mac_dinh_dung_model_trong_env_va_temperature_0(monkeypatch):
    from core import audit

    gia = LiteLLMGia(json.dumps({"cac_y": [y("DUNG")]}))
    monkeypatch.setitem(__import__("sys").modules, "litellm", gia)
    monkeypatch.setenv("LLM_MODEL", "nha-cung-cap/model-gia")

    van_ban, chi_phi = audit._llm_mac_dinh([{"role": "user", "content": "x"}])

    assert gia.tham_so["model"] == "nha-cung-cap/model-gia"
    assert gia.tham_so["temperature"] == 0
    assert gia.tham_so["messages"] == [{"role": "user", "content": "x"}]
    assert json.loads(van_ban)["cac_y"][0]["nhan"] == "DUNG"
    assert chi_phi == 0.0123


def test_llm_mac_dinh_thieu_llm_model_thi_bao_loi_ro_rang(monkeypatch):
    from core import audit

    monkeypatch.setitem(__import__("sys").modules, "litellm", LiteLLMGia("{}"))
    monkeypatch.setattr(audit, "_nap_env", lambda: None)
    monkeypatch.delenv("LLM_MODEL", raising=False)
    with pytest.raises(RuntimeError, match="LLM_MODEL"):
        audit._llm_mac_dinh([])


# --- Chọn retrieve mặc định: core.retrieve nếu chạy được, không thì BM25 ----------

def _gan_retrieve(monkeypatch, retrieve_chinh):
    """Thay core.retrieve bằng module giả; retrieve_chinh=None nghĩa là module chưa có hàm retrieve."""
    import sys
    import types

    mod = types.ModuleType("core.retrieve")
    if retrieve_chinh is not None:
        mod.retrieve = retrieve_chinh
    monkeypatch.setitem(sys.modules, "core.retrieve", mod)
    da_goi = []

    def bm25(query, k=5):
        da_goi.append("bm25")
        return fake_retrieve(query, k)

    monkeypatch.setattr("core.retrieve_bm25.retrieve", bm25)
    return da_goi


def test_core_retrieve_chua_co_ham_thi_dung_bm25(monkeypatch):
    da_goi = _gan_retrieve(monkeypatch, None)
    kq = audit_one("q", "a", llm_fn=fake_llm([y("DUNG")]))
    assert da_goi == ["bm25"]
    assert kq["dieu_truy_hoi"] == ["dieu-35", "dieu-36"]


def test_core_retrieve_chay_duoc_thi_dung_no(monkeypatch):
    da_goi = _gan_retrieve(monkeypatch, lambda query, k=5: fake_retrieve(query, k)[:1])
    kq = audit_one("q", "a", llm_fn=fake_llm([y("DUNG")]))
    assert da_goi == []
    assert kq["dieu_truy_hoi"] == ["dieu-35"]


def test_core_retrieve_loi_khi_chay_thi_chuyen_sang_bm25(monkeypatch):
    def hong(query, k=5):
        raise ConnectionError("Qdrant không chạy")

    da_goi = _gan_retrieve(monkeypatch, hong)
    audit_one("q", "a", llm_fn=fake_llm([y("DUNG")]))
    assert da_goi == ["bm25"]


def test_noi_dung_da_co_dong_dieu_thi_khong_lap_lai_trong_prompt():
    chunk = {"chunk_id": "dieu-2", "dieu": 2, "tieu_de": "[GIẢ] T", "noi_dung": "Điều 2. [GIẢ] T\n[GIẢ] nội dung", "score": 1.0}
    da_gui = []

    def llm(messages):
        da_gui.append(messages)
        return json.dumps({"cac_y": [y("DUNG", trich_dan="Điều 2")]}), 0.0

    audit_one("q", "a", retrieve_fn=lambda q, k=5: [chunk], llm_fn=llm)
    assert da_gui[0][1]["content"].count("Điều 2.") == 1
