"""Test eval/optimize.py (agent tối ưu cấu hình cổng kiểm định). Nguồn truy hồi và LLM giả, không gọi mạng."""

import pytest

from eval.optimize import chat_luong, dat_muc_tieu, de_xuat, luoi_cau_hinh, ma_cau_hinh, pareto


# --- Lưới cấu hình -------------------------------------------------------------------

def test_ma_cau_hinh_bo_tien_to_nha_cung_cap():
    assert ma_cau_hinh(5, "qdrant", "openai/gpt-4.1-mini") == "k5-qdrant-gpt-4.1-mini"
    assert ma_cau_hinh(3, "bm25", "gpt-4o-mini") == "k3-bm25-gpt-4o-mini"


def test_luoi_mac_dinh_18_cau_hinh_theo_thu_tu_retriever_model_k():
    luoi = luoi_cau_hinh([3, 5, 8], ["qdrant", "bm25"], ["openai/gpt-4o-mini", "openai/gpt-4.1-mini", "openai/gpt-4.1"])
    assert len(luoi) == 18
    assert [c["ma"] for c in luoi[:4]] == ["k3-qdrant-gpt-4o-mini", "k5-qdrant-gpt-4o-mini", "k8-qdrant-gpt-4o-mini",
                                           "k3-qdrant-gpt-4.1-mini"]
    assert luoi[9]["retriever"] == "bm25"
    assert luoi[0] == {"ma": "k3-qdrant-gpt-4o-mini", "k": 3, "retriever": "qdrant", "model": "openai/gpt-4o-mini"}


def test_luoi_thu_hep():
    assert [c["ma"] for c in luoi_cau_hinh([5], ["bm25"], ["openai/gpt-4.1"])] == ["k5-bm25-gpt-4.1"]


# --- Chất lượng, đạt mục tiêu -----------------------------------------------------------

def diem_gia(ket_qua, **dat):
    """diem kiểu eval.score.score: chi_tiet theo danh sách ket_qua; dat_muc_tieu từng chỉ số (mặc định True)."""
    chi_so = {ten: {"dat_muc_tieu": dat.get(ten, True)} for ten in ("bat_duoc", "bao_nham", "trich_dung_dieu", "truy_hoi_dung")}
    return {"so_cau": len(ket_qua), "chi_tiet": [{"ket_qua": k} for k in ket_qua],
            "thoi_gian": {"dat_muc_tieu": dat.get("thoi_gian", True)}, **chi_so}


def test_chat_luong_la_ti_le_cau_gan_co_dung_loi_tinh_sai():
    d = diem_gia(["bat_duoc"] * 5 + ["dung"] * 3 + ["bao_nham", "loi"])
    assert chat_luong(d) == 0.8


@pytest.mark.parametrize("dat, mong", [
    ({}, True),
    ({"trich_dung_dieu": None}, True),  # không áp dụng (0 câu) thì không chặn
    ({"bao_nham": False}, False),
    ({"thoi_gian": False}, False),
])
def test_dat_muc_tieu(dat, mong):
    assert dat_muc_tieu(diem_gia(["dung"], **dat)) is mong


# --- Pareto và đề xuất --------------------------------------------------------------------

def dong(ma, cl, phi, tg, dat=True, ro=True, trang_thai="xong"):
    return {"ma": ma, "trang_thai": trang_thai, "chat_luong": cl, "chi_phi_usd": phi, "chi_phi_ro": ro,
            "thoi_gian_s": tg, "dat_muc_tieu": dat}


def test_pareto_vi_du_tay():
    a, b = dong("A", 1.0, 0.010, 50), dong("B", 0.9, 0.004, 40)
    c = dong("C", 1.0, 0.060, 70)  # bị A trội
    d = dong("D", 0.8, 0.005, 45)  # bị B trội
    assert pareto([a, b, c, d]) == {"A", "B"}


def test_pareto_bo_dong_loi_bo_qua_va_chi_phi_chua_ro():
    cac = [dong("A", 0.5, 0.01, 50), dong("X", 1.0, 0.0, 1, trang_thai="loi"), dong("Y", 1.0, 0.0, 1, trang_thai="bo_qua"),
           dong("Z", 1.0, 0.0, 1, ro=False)]
    assert pareto(cac) == {"A"}


def test_de_xuat_re_nhat_trong_nhom_dat():
    kq = de_xuat([dong("dat-dat", 1.0, 0.05, 50), dong("khong-dat-re", 0.7, 0.001, 30, dat=False),
                  dong("dat-re", 0.9, 0.004, 60), dong("dat-vua", 1.0, 0.010, 40)])
    assert kq["ma"] == "dat-re" and kq["dat_muc_tieu"] is True
    assert kq["du_phong"] == ["dat-vua", "dat-dat"]
    assert "rẻ nhất" in kq["ly_do"]


def test_de_xuat_hoa_chi_phi_thi_nhanh_hon_roi_chat_luong():
    assert de_xuat([dong("cham", 1.0, 0.01, 60), dong("nhanh", 0.9, 0.01, 40)])["ma"] == "nhanh"
    assert de_xuat([dong("thap", 0.9, 0.01, 40), dong("cao", 1.0, 0.01, 40)])["ma"] == "cao"


def test_de_xuat_khong_chon_chi_phi_chua_ro_khi_co_cau_hinh_ro():
    assert de_xuat([dong("chua-ro", 1.0, 0.0, 10, ro=False), dong("ro", 1.0, 0.02, 50)])["ma"] == "ro"


def test_khong_cau_hinh_nao_dat_thi_chon_chat_luong_cao_nhat_va_gan_co():
    kq = de_xuat([dong("A", 0.7, 0.001, 30, dat=False), dong("B", 0.9, 0.05, 60, dat=False),
                  dong("C", 1.0, 0.0, 1, dat=True, trang_thai="loi")])
    assert kq["ma"] == "B" and kq["dat_muc_tieu"] is False
    assert "chưa đạt" in kq["ly_do"]


def test_khong_co_cau_hinh_chay_xong_thi_khong_de_xuat():
    assert de_xuat([dong("A", 1.0, 0.01, 1, trang_thai="loi")])["ma"] is None


# --- Lệnh thu: chạy lưới, ngân sách, báo cáo ------------------------------------------

import csv  # noqa: E402
import json  # noqa: E402

from core.audit import Nguon  # noqa: E402
from eval.optimize import thu  # noqa: E402

CHUNK = {"chunk_id": "dieu-35", "dieu": 35, "tieu_de": "[GIẢ]", "noi_dung": "[GIẢ] nội dung Điều 35"}


def ghi(path, cot, dong):
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(cot)
        w.writerows(dong)
    return path


@pytest.fixture
def tap(tmp_path):
    q = ghi(tmp_path / "dev.csv", ["id", "cau_hoi", "cau_tra_loi"], [(1, "q1", "a1"), (2, "q2", "a2")])
    k = ghi(tmp_path / "dap_an.csv", ["id", "nhan_that", "loai_loi", "dieu_dung", "ghi_chu"],
            [(1, "DUNG", "", "35", ""), (2, "DUNG", "", "35", "")])
    return q, k


class Gia:
    """Nguồn truy hồi và LLM giả; ghi lại các lần gọi."""

    def __init__(self, phi=None, hong_model=(), json_hong_model=()):
        self.phi = phi or {}
        self.hong_model, self.json_hong_model = hong_model, json_hong_model
        self.k_chay_thu = []

    def tao_nguon(self, ten):
        def retrieve(query, k=5):
            if query == "kiểm tra truy hồi":
                self.k_chay_thu.append((ten, k))
            return [dict(CHUNK)]

        return Nguon(f"giả {ten}", retrieve, lambda d: None)

    def kiem_llm(self, model):
        if model in self.hong_model:
            raise RuntimeError(f"Model {model} cần API key")
        return model

    def tao_llm(self, model):
        def llm(messages):
            if model in self.json_hong_model:
                return "không phải JSON", None
            y = {"noi_dung": "ý", "nhan": "DUNG", "trich_dan": "Điều 35", "bang_chung": "", "giai_thich": ""}
            return json.dumps({"cac_y": [y]}), self.phi.get(model, 0.001)

        return llm


def chay_thu(tmp_path, tap, gia, **kw):
    q, k = tap
    tham_so = dict(ks=[3, 5], retrievers=["qdrant"], models=["a/m1", "a/m2"], thu_muc=tmp_path / "out",
                   tao_nguon=gia.tao_nguon, tao_llm_fn=gia.tao_llm, kiem_llm=gia.kiem_llm, ma_luot="L1")
    tham_so.update(kw)
    return thu(q, k, **tham_so)


def test_chay_du_luoi_va_chay_thu_moi_nguon_mot_lan(tmp_path, tap):
    gia = Gia()
    kq = chay_thu(tmp_path, tap, gia, retrievers=["qdrant", "bm25"])
    assert [d["ma"] for d in kq["dong"]] == ["k3-qdrant-m1", "k5-qdrant-m1", "k3-qdrant-m2", "k5-qdrant-m2",
                                              "k3-bm25-m1", "k5-bm25-m1", "k3-bm25-m2", "k5-bm25-m2"]
    assert all(d["trang_thai"] == "xong" for d in kq["dong"])
    assert gia.k_chay_thu == [("qdrant", 1), ("bm25", 1)]
    assert kq["dong"][0]["chat_luong"] == 1.0 and kq["dong"][0]["dat_muc_tieu"] is True
    assert kq["de_xuat"]["ma"] is not None


def test_model_khong_dung_duoc_thi_ghi_loi_va_chay_tiep(tmp_path, tap):
    kq = chay_thu(tmp_path, tap, Gia(hong_model=("a/m1",)))
    trang_thai = {d["ma"]: d["trang_thai"] for d in kq["dong"]}
    assert trang_thai == {"k3-qdrant-m1": "loi", "k5-qdrant-m1": "loi", "k3-qdrant-m2": "xong", "k5-qdrant-m2": "xong"}
    assert "API key" in kq["dong"][0]["loi"]


def test_moi_cau_deu_loi_thi_cau_hinh_la_loi(tmp_path, tap):
    kq = chay_thu(tmp_path, tap, Gia(json_hong_model=("a/m1",)), ks=[5])
    assert kq["dong"][0]["trang_thai"] == "loi" and "JSON" in kq["dong"][0]["loi"]
    assert kq["dong"][1]["trang_thai"] == "xong"


def test_het_ngan_sach_thi_bo_qua_phan_con_lai_va_van_de_xuat(tmp_path, tap):
    kq = chay_thu(tmp_path, tap, Gia(phi={"a/m1": 0.6, "a/m2": 0.6}), toi_da_usd=1.0)
    assert [d["trang_thai"] for d in kq["dong"]] == ["xong", "bo_qua", "bo_qua", "bo_qua"]
    assert kq["tong_chi_phi_usd"] == pytest.approx(1.2)
    assert kq["de_xuat"]["ma"] == "k3-qdrant-m1"


def test_chi_phi_khong_ro_thi_danh_dau(tmp_path, tap):
    kq = chay_thu(tmp_path, tap, Gia(phi={"a/m1": None}), ks=[5])
    assert [d["chi_phi_ro"] for d in kq["dong"]] == [False, True]


def test_ghi_ket_qua_va_bao_cao(tmp_path, tap):
    kq = chay_thu(tmp_path, tap, Gia())
    thu_muc = tmp_path / "out" / "L1"
    assert json.loads((thu_muc / "ket_qua.json").read_text(encoding="utf-8"))["luot"] == "L1"
    assert (thu_muc / "k3-qdrant-m1.json").exists()
    bao_cao = (thu_muc / "bao_cao.md").read_text(encoding="utf-8")
    assert "ĐỀ XUẤT:" in bao_cao and f"python -m eval.optimize duyet L1 {kq['de_xuat']['ma']}" in bao_cao


def test_ma_luot_trung_thi_them_hau_to(tmp_path, tap):
    chay_thu(tmp_path, tap, Gia(), ks=[5], models=["a/m1"])
    assert chay_thu(tmp_path, tap, Gia(), ks=[5], models=["a/m1"])["luot"] == "L1-2"


# --- Cổng "không kém hơn" và lệnh duyet -------------------------------------------------

from eval import optimize  # noqa: E402
from eval.optimize import duyet, qua_cong  # noqa: E402


def diem_cong(so_dung, tong=5, doi=None):
    """diem kiểu score: so_dung câu gắn cờ đúng trên tong câu; doi = danh sách id đổi kết luận (chỉ ở lần 1)."""
    d = {"so_cau": tong, "chi_tiet": [{"ket_qua": "dung"}] * so_dung + [{"ket_qua": "bao_nham"}] * (tong - so_dung)}
    d["on_dinh"] = None if doi is None else {"khac_nhau": doi}
    return d


@pytest.mark.parametrize("moi, dang_dung, qua", [
    ((5, 5, []), (4, 5, []), True),       # tốt hơn
    ((5, 5, []), (5, 5, []), True),       # bằng nhau
    ((4, 5, []), (5, 5, []), False),      # kém hơn ở lần 1
    ((5, 4, []), (5, 5, []), False),      # kém hơn ở lần 2
    ((5, 5, [3]), (5, 5, []), False),     # đổi kết luận nhiều hơn
])
def test_qua_cong(moi, dang_dung, qua):
    kq = qua_cong([diem_cong(moi[0], doi=moi[2]), diem_cong(moi[1])],
                  [diem_cong(dang_dung[0], doi=dang_dung[2]), diem_cong(dang_dung[1])])
    assert kq["qua"] is qua
    assert kq["moi"]["gan_co_dung"] == [moi[0], moi[1]]


class GiaNhan(Gia):
    """Như Gia nhưng model trong `sai` luôn chấm TRAI_LUAT (báo nhầm câu đúng); đếm số lần gọi LLM."""

    def __init__(self, sai=(), **kw):
        super().__init__(**kw)
        self.sai, self.so_lan_goi, self.model_da_tao = sai, 0, []

    def tao_llm(self, model):
        self.model_da_tao.append(model)
        goc = super().tao_llm(model)

        def llm(messages):
            self.so_lan_goi += 1
            if model in self.sai:
                y = {"noi_dung": "ý", "nhan": "TRAI_LUAT", "trich_dan": "Điều 35", "bang_chung": "", "giai_thich": ""}
                return json.dumps({"cac_y": [y]}), 0.001
            return goc(messages)

        return llm


@pytest.fixture
def luot(tmp_path, tap):
    """Một lượt thu đã chạy (4 cấu hình đều xong) trong tmp_path/out/L1."""
    chay_thu(tmp_path, tap, Gia())
    return tmp_path


def chay_duyet(tmp, tap, gia, ma="k3-qdrant-m1", **kw):
    q, k = tap
    tham_so = dict(csv_giu_lai=q, dap_an_giu_lai=k, thu_muc=tmp / "out", cau_hinh_path=tmp / "cau_hinh_dang_dung.json",
                   lich_su_path=tmp / "lich_su_cau_hinh.jsonl", tao_nguon=gia.tao_nguon, tao_llm_fn=gia.tao_llm,
                   kiem_llm=gia.kiem_llm)
    tham_so.update(kw)
    return duyet("L1", ma, "Vĩnh", **tham_so)


def lich_su(tmp):
    return [json.loads(d) for d in (tmp / "lich_su_cau_hinh.jsonl").read_text(encoding="utf-8").splitlines()]


def test_duyet_qua_cong_thi_ghi_cau_hinh_va_lich_su(luot, tap):
    kq = chay_duyet(luot, tap, GiaNhan())
    assert kq["qua"] is True
    ch = json.loads((luot / "cau_hinh_dang_dung.json").read_text(encoding="utf-8"))
    assert {k: ch[k] for k in ("ma", "k", "retriever", "model", "nguoi_duyet", "luot")} == {
        "ma": "k3-qdrant-m1", "k": 3, "retriever": "qdrant", "model": "a/m1", "nguoi_duyet": "Vĩnh", "luot": "L1"}
    ls = lich_su(luot)
    assert len(ls) == 1 and ls[0]["qua"] is True and ls[0]["ma"] == "k3-qdrant-m1"


def test_chua_co_cau_hinh_thi_so_voi_mac_dinh(luot, tap):
    gia = GiaNhan()
    chay_duyet(luot, tap, gia)
    assert lich_su(luot)[0]["so_voi"] == "k5-qdrant-gpt-4.1-mini"
    assert "openai/gpt-4.1-mini" in gia.model_da_tao


def test_truot_cong_thi_khong_ghi_cau_hinh_van_ghi_lich_su(luot, tap):
    kq = chay_duyet(luot, tap, GiaNhan(sai=("a/m1",)))
    assert kq["qua"] is False
    assert not (luot / "cau_hinh_dang_dung.json").exists()
    assert lich_su(luot)[0]["qua"] is False


def test_duyet_lai_dung_cau_hinh_dang_dung_thi_qua(luot, tap):
    (luot / "cau_hinh_dang_dung.json").write_text(json.dumps(
        {"ma": "k3-qdrant-m1", "k": 3, "retriever": "qdrant", "model": "a/m1"}), encoding="utf-8")
    gia = GiaNhan()
    kq = chay_duyet(luot, tap, gia)
    assert kq["qua"] is True
    assert gia.so_lan_goi == 4  # 2 lần × 2 câu, dùng chung cho cả hai bên


@pytest.mark.parametrize("ma", ["k9-qdrant-m1", "k3-qdrant-m2"])
def test_ma_khong_co_hoac_khong_chay_xong_thi_bao_loi(tmp_path, tap, ma):
    chay_thu(tmp_path, tap, Gia(hong_model=("a/m2",)))  # các cấu hình m2 bị lỗi
    with pytest.raises(ValueError, match=ma):
        chay_duyet(tmp_path, tap, GiaNhan(), ma=ma)


def test_dong_lenh_thu_va_duyet(monkeypatch):
    goi = {}
    monkeypatch.setattr(optimize, "thu", lambda *a, **kw: goi.setdefault("thu", (a, kw)) and {
        "luot": "L", "dong": [], "pareto": [], "tong_chi_phi_usd": 0, "tap": {"csv": "x"},
        "de_xuat": {"ma": None, "ly_do": "", "du_phong": []}})
    monkeypatch.setattr(optimize, "duyet", lambda *a, **kw: goi.setdefault("duyet", (a, kw)) and {
        "qua": True, "so_voi": "k5-qdrant-gpt-4.1-mini", "chi_phi_usd": 0,
        "cong": {"ly_do": "ok", "moi": {"gan_co_dung": [5, 5], "doi_ket_luan": 0, "so_cau": 5},
                 "dang_dung": {"gan_co_dung": [5, 5], "doi_ket_luan": 0, "so_cau": 5}}})
    optimize.main(["thu", "--k", "3,5", "--retriever", "bm25", "--model", "a/m1", "--toi-da-usd", "0.5"])
    assert goi["thu"][1]["ks"] == [3, 5] and goi["thu"][1]["retrievers"] == ["bm25"] and goi["thu"][1]["toi_da_usd"] == 0.5
    optimize.main(["duyet", "L", "k3-bm25-m1", "--nguoi-duyet", "Vĩnh"])
    assert goi["duyet"][0] == ("L", "k3-bm25-m1", "Vĩnh")


# --- Sửa sau review ------------------------------------------------------------------------

def test_cong_truot_khi_co_cau_loi_trong_luot_cong():
    loi = {**diem_cong(0, doi=[]), "loi": {"cau_sai": 2, "cau_dung": 3}}
    kq = qua_cong([loi, {**diem_cong(0), "loi": {"cau_sai": 2, "cau_dung": 3}}],
                  [diem_cong(0, doi=[]), diem_cong(0)])
    assert kq["qua"] is False and "LOI" in kq["ly_do"]


def test_duyet_khi_moi_cau_deu_loi_thi_khong_ghi_cau_hinh(luot, tap):
    gia = GiaNhan(json_hong_model=("a/m1", "openai/gpt-4.1-mini"))
    kq = chay_duyet(luot, tap, gia)
    assert kq["qua"] is False
    assert not (luot / "cau_hinh_dang_dung.json").exists()


def test_cau_hinh_co_cau_loi_khong_duoc_tinh_dat_muc_tieu():
    d = diem_gia(["bat_duoc"] * 5 + ["loi"] * 5)
    d["loi"] = {"cau_sai": 0, "cau_dung": 5}
    assert dat_muc_tieu(d) is False


def test_duyet_het_ngan_sach_van_ghi_lich_su(luot, tap):
    gia = GiaNhan(phi={"a/m1": 0.001})
    with pytest.raises(RuntimeError, match="ngân sách"):
        chay_duyet(luot, tap, gia, toi_da_usd=0.001)
    ls = lich_su(luot)
    assert len(ls) == 1 and ls[0]["qua"] is False and "ngân sách" in ls[0]["loi"]
    assert not (luot / "cau_hinh_dang_dung.json").exists()
