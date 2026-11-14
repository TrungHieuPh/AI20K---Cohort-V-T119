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


# --- Chọn retriever: mặc định core.retrieve, BM25 chỉ khi RETRIEVER=bm25 ---------

@pytest.fixture
def env_rieng(monkeypatch):
    """Không đọc .env thật; mỗi test tự đặt RETRIEVER."""
    from core import audit

    monkeypatch.setattr(audit, "_nap_env", lambda: None)
    monkeypatch.delenv("RETRIEVER", raising=False)
    return monkeypatch


def test_mac_dinh_dung_retrieve_va_get_article_cua_core_retrieve(env_rieng):
    import core.retrieve
    from core.audit import chon_nguon

    nguon = chon_nguon()
    assert nguon.retrieve is core.retrieve.retrieve
    assert nguon.get_article is core.retrieve.get_article
    assert "qdrant" in nguon.ten


@pytest.mark.parametrize("gia_tri", ["bm25", " BM25 "])
def test_retriever_bm25_chi_khi_chon_ro(env_rieng, gia_tri):
    import core.retrieve_bm25
    from core.audit import chon_nguon

    env_rieng.setenv("RETRIEVER", gia_tri)
    nguon = chon_nguon()
    assert nguon.retrieve is core.retrieve_bm25.retrieve
    assert nguon.get_article is core.retrieve_bm25.get_article
    assert "bm25" in nguon.ten


def test_retriever_la_thi_bao_loi(env_rieng):
    from core.audit import chon_nguon

    env_rieng.setenv("RETRIEVER", "elastic")
    with pytest.raises(ValueError, match="RETRIEVER"):
        chon_nguon()


def test_core_retrieve_loi_thi_bao_loi_ngay_khong_chuyen_bm25(env_rieng):
    da_goi_bm25 = []

    def hong(query, k=5):
        raise RuntimeError("Chưa có collection")

    env_rieng.setattr("core.retrieve.retrieve", hong)
    env_rieng.setattr("core.retrieve_bm25.retrieve", lambda q, k=5: da_goi_bm25.append(q) or fake_retrieve(q, k))
    with pytest.raises(RuntimeError, match="collection"):
        audit_one("q", "a", llm_fn=fake_llm([y("DUNG")]))
    assert da_goi_bm25 == []


# --- Lấy thêm các Điều chatbot trích bằng get_article ----------------------------

def dieu_gia(n):
    return {"chunk_id": f"dieu-{n}", "dieu": n, "tieu_de": f"[GIẢ] Điều {n}",
            "noi_dung": f"Điều {n}. [GIẢ] Điều {n}\n[GIẢ] nội dung riêng của Điều {n}"}


def get_article_gia(co=(50, 60, 70, 80)):
    """get_article giả: ghi lại số Điều được hỏi; Điều không có trong `co` thì trả None."""
    da_hoi = []

    def _get(dieu):
        da_hoi.append(dieu)
        return dieu_gia(dieu) if dieu in co else None

    return _get, da_hoi


def chay_trich(cau_tra_loi, cac_y=None, co=(50, 60, 70, 80)):
    get_fn, da_hoi = get_article_gia(co)
    da_gui = []

    def llm(messages):
        da_gui.append(messages)
        return json.dumps({"cac_y": cac_y or [y("DUNG")]}, ensure_ascii=False), 0.0

    kq = audit_one("q", cau_tra_loi, retrieve_fn=fake_retrieve, get_article_fn=get_fn, llm_fn=llm)
    return kq, da_hoi, da_gui[0][1]["content"]


def test_dieu_chatbot_trich_duoc_lay_them_dua_cho_judge(env_rieng):
    kq, da_hoi, prompt = chay_trich("Theo Điều 50 khoản 2 thì được nghỉ.")
    assert da_hoi == [50]
    assert "[GIẢ] nội dung riêng của Điều 50" in prompt


def test_dieu_truy_hoi_chi_gom_top5_khong_gom_dieu_trich_them(env_rieng):
    kq, _, _ = chay_trich("Theo Điều 50.")
    assert kq["dieu_truy_hoi"] == ["dieu-35", "dieu-36"]


def test_lay_toi_da_3_dieu_trich_dau_tien_bo_qua_dieu_da_co_trong_top5(env_rieng):
    _, da_hoi, _ = chay_trich("Điều 35, rồi Điều 50, Điều 50 nữa, Điều 60, Điều 70 và Điều 80.")
    assert da_hoi == [50, 60]  # 3 Điều khác nhau đầu tiên là 35, 50, 60; Điều 35 đã có trong top-5


def test_nhan_ra_chu_dieu_viet_thuong_va_unicode_to_hop(env_rieng):
    import unicodedata

    _, da_hoi, _ = chay_trich(unicodedata.normalize("NFD", "theo điều 60 và ĐIỀU 70"))
    assert da_hoi == [60, 70]


def test_dieu_trich_khong_ton_tai_thi_bo_qua(env_rieng):
    kq, da_hoi, prompt = chay_trich("Theo Điều 999.")
    assert da_hoi == [999]
    assert kq["ket_luan"] == "DUNG"  # ý giả trích Điều 35 (đã truy hồi)


def test_y_dung_trich_dieu_duoc_lay_them_khong_bi_ha_nhan(env_rieng):
    kq, _, _ = chay_trich("Theo Điều 50.", cac_y=[y("DUNG", trich_dan="Điều 50 khoản 2")])
    assert kq["cac_y"][0]["nhan"] == "DUNG"
    assert "ha_nhan" not in kq["cac_y"][0]


def test_y_dung_trich_dieu_khong_truy_hoi_cung_khong_duoc_trich_van_bi_ha(env_rieng):
    kq, _, _ = chay_trich("Theo Điều 50.", cac_y=[y("DUNG", trich_dan="Điều 60")])
    assert kq["cac_y"][0]["nhan"] == "KHONG_CAN_CU"
    assert kq["cac_y"][0]["ha_nhan"] is True


def test_noi_dung_da_co_dong_dieu_thi_khong_lap_lai_trong_prompt():
    chunk = {"chunk_id": "dieu-2", "dieu": 2, "tieu_de": "[GIẢ] T", "noi_dung": "Điều 2. [GIẢ] T\n[GIẢ] nội dung", "score": 1.0}
    da_gui = []

    def llm(messages):
        da_gui.append(messages)
        return json.dumps({"cac_y": [y("DUNG", trich_dan="Điều 2")]}), 0.0

    audit_one("q", "a", retrieve_fn=lambda q, k=5: [chunk], llm_fn=llm)
    assert da_gui[0][1]["content"].count("Điều 2.") == 1
