# Agent tự tối ưu cấu hình cổng kiểm định – kế hoạch thực hiện

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `eval/optimize.py`: thử lưới cấu hình (k × retriever × model) cho audit, chấm, Pareto, đề xuất; `duyet` chạy cổng
"không kém hơn" rồi lưu `cau_hinh_dang_dung.json` + lịch sử; `core.audit` dùng cấu hình đang dùng.

**Architecture:** Logic thuần (lưới, chất lượng, Pareto, đề xuất, cổng) tách khỏi phần chạy; phần chạy nhận hàm tạo nguồn / LLM
qua tham số để test bằng đồ giả. Chạy audit qua `run_audit(..., audit_fn=partial(audit_one, ...))`, chấm qua `eval.score.score`.

**Tech Stack:** Python 3.12, pytest (`HF_HUB_OFFLINE=1 .venv/Scripts/python -m pytest -q`).

**Spec:** `docs/superpowers/specs/2026-11-14-agent-toi-uu-cau-hinh-design.md`

## Global Constraints
- Lưới mặc định: `k` 3,5,8 · `retriever` qdrant,bm25 · `model` openai/gpt-4o-mini, openai/gpt-4.1-mini, openai/gpt-4.1.
- Mã cấu hình `k{k}-{retriever}-{model bỏ tiền tố}` (vd `k5-qdrant-gpt-4.1-mini`). Mặc định hiện tại: `k5-qdrant-gpt-4.1-mini`.
- Ngân sách: `thu --toi-da-usd 2`, `duyet --toi-da-usd 1`; kiểm trước mỗi lần chạy audit.
- Cổng (b): mỗi lần chạy (1↔1, 2↔2) số câu gắn cờ đúng của mới ≥ đang dùng; số câu đổi kết luận của mới ≤ đang dùng.
- `results_toi_uu/` vào `.gitignore`; `cau_hinh_dang_dung.json`, `lich_su_cau_hinh.jsonl` ở gốc repo, được commit.
- Không sửa code của Bào; không đọc `.env`; commit/push khi Vĩnh nói; không dòng attribution.

## Review Focus
1. Một model không dùng được (vd key không có quyền gpt-4.1) → cấu hình đó ghi lỗi, lượt chạy tiếp. Test ở Task 3.
2. Hết ngân sách giữa lưới → cấu hình còn lại "bỏ qua (hết ngân sách)", vẫn ghi báo cáo và đề xuất từ phần đã chạy. Test ở Task 3.
3. Duyệt lại đúng cấu hình đang dùng → so với chính nó, phải qua cổng. Test ở Task 4.
4. `cau_hinh_dang_dung.json` hỏng/thiếu khoá → `core.audit` báo lỗi rõ, không lặng lẽ dùng mặc định. Test ở Task 1.
5. Không cấu hình nào đạt mục tiêu → vẫn đề xuất (chất lượng cao nhất) với cờ "chưa đạt". Test ở Task 2.

---

### Task 1: `core/audit.py` nhận cấu hình (k, retriever, model) và đọc cấu hình đang dùng

**Files:** Modify `core/audit.py`; Test `tests/test_audit.py`, `tests/test_run_audit.py`.

**Interfaces – Produces:**
- `audit_one(..., k: int = SO_DIEU_TRUY_HOI)` (truyền xuống `retrieve_fn(query, k=k)`).
- `chon_nguon(ten: str | None = None) -> Nguon` (`None` → đọc `RETRIEVER` như cũ; `"qdrant"`/`""` → Qdrant; `"bm25"`; khác → ValueError).
- `tao_llm(model: str) -> Callable[[list], tuple[str, float | None]]` (như `_llm_mac_dinh` nhưng model cố định).
- `_kiem_cau_hinh_llm(model: str | None = None) -> str` (`None` → `LLM_MODEL` như cũ).
- `run_audit(..., k=SO_DIEU_TRUY_HOI, retriever=None, model=None)`; `_chuan_bi_audit(nguon, llm_fn, k=…, retriever=None, model=None)`.
- `doc_cau_hinh(path) -> dict | None` (không có file → None; thiếu `k`/`retriever`/`model` hoặc JSON hỏng → ValueError nêu tên file).
- `main(argv=None, *, cau_hinh_path=DUONG_DAN_CAU_HINH)`; `DUONG_DAN_CAU_HINH = REPO_ROOT / "cau_hinh_dang_dung.json"`.

- [ ] **Step 1: Viết test:** `k` xuống retrieve (k=3); `chon_nguon("bm25")`/`("qdrant")`/`("x")`; `tao_llm("a/b")` gọi litellm với
  `model="a/b"`, `temperature=0`; `run_audit(..., k=8, nguon=…, llm_fn=…)` → retrieve nhận 8; `doc_cau_hinh` (không file → None,
  thiếu khoá → ValueError, JSON hỏng → ValueError); `main` có file cấu hình → `run_audit` nhận đúng k/retriever/model và log "Cấu hình:".
- [ ] **Step 2: Chạy, xác nhận FAIL.**
- [ ] **Step 3: Cài đặt.** `main`: có file → `run_audit(csv, out, k=…, retriever=…, model=…)`; `_chuan_bi_audit` dùng
  `chon_nguon(retriever)` và `tao_llm(model)` + `_kiem_cau_hinh_llm(model)` khi `model` được truyền.
- [ ] **Step 4: Chạy toàn bộ test, PASS.**

### Task 2: logic thuần trong `eval/optimize.py`

**Files:** Create `eval/optimize.py`; Test `tests/test_optimize.py`.

**Interfaces – Produces:**
- `ma_cau_hinh(k, retriever, model) -> str`; `luoi_cau_hinh(ks, retrievers, models) -> list[dict]` (`{"ma","k","retriever","model"}`,
  thứ tự: retriever theo danh sách (qdrant trước), rồi model, rồi k).
- `chat_luong(diem: dict) -> float` = số câu `ket_qua ∈ {bat_duoc, dung}` trong `diem["chi_tiet"]` / `diem["so_cau"]`.
- `dat_muc_tieu(diem) -> bool`: `bat_duoc`, `bao_nham`, `trich_dung_dieu`, `truy_hoi_dung` có `dat_muc_tieu` khác `False`, và `thoi_gian.dat_muc_tieu`.
- `pareto(dong: list[dict]) -> set[str]` (mỗi dòng có `ma`, `chat_luong`, `chi_phi_usd`, `thoi_gian_s`; dòng lỗi/bỏ qua/chi phí chưa rõ không tham gia).
- `de_xuat(dong) -> dict` `{"ma", "dat_muc_tieu": bool, "ly_do": str, "du_phong": list[str]}`.

- [ ] **Step 1: Viết test:** mã cấu hình; lưới 3×2×3 = 18, thứ tự đúng, thu hẹp; chất lượng (5 bắt + 4 đúng + 1 báo nhầm / 10 = 0.9;
  LOI tính sai); Pareto ví dụ tay 4 cấu hình; đề xuất rẻ nhất trong nhóm đạt, hoà → nhanh hơn, hoà → chất lượng; chi phí chưa rõ không
  được chọn khi có cấu hình rõ; không ai đạt → chất lượng cao nhất + `dat_muc_tieu=False` (Review Focus 5); `du_phong` = các cấu hình đạt còn lại theo thứ tự.
- [ ] **Step 2: FAIL.** - [ ] **Step 3: Cài đặt.** - [ ] **Step 4: PASS toàn bộ.**

### Task 3: lệnh `thu` (chạy lưới, ngân sách, báo cáo)

**Files:** Modify `eval/optimize.py`, `.gitignore`; Test `tests/test_optimize.py`.

**Interfaces:**
- Consumes: Task 1 (`audit_one`, `run_audit`, `chon_nguon`, `tao_llm`, `_kiem_cau_hinh_llm`), Task 2, `eval.score.score`.
- Produces: `thu(csv_path, dap_an_path, *, ks, retrievers, models, toi_da_usd=2.0, thu_muc="results_toi_uu", tao_nguon=chon_nguon,
  tao_llm_fn=tao_llm, kiem_llm=_kiem_cau_hinh_llm, ma_luot=None) -> dict` ghi `<thu_muc>/<lượt>/<ma>.json`, `ket_qua.json`, `bao_cao.md`.
  `ket_qua`: `{"luot", "tap", "dong": [ {ma,k,retriever,model, trang_thai: "xong"|"loi"|"bo_qua", loi?, chat_luong, chi_phi_usd,
  chi_phi_ro, thoi_gian_s, dat_muc_tieu, diem} ], "pareto": [...], "de_xuat": {...}, "tong_chi_phi_usd"}`.
  `chay_cau_hinh(cau_hinh, csv_path, dap_an_path, out_path, nguon, llm_fn) -> (results dict, diem dict)` dùng lại cho Task 4.
- Mã lượt `YYYYMMDD-HHMMSS`, trùng thì thêm `-2`, `-3`.

- [ ] **Step 1: Viết test (nguồn/LLM giả, CSV giả trong tmp):** 2×1×2 lưới chạy đủ, mỗi nguồn chạy thử 1 lần trước vòng lặp; model lỗi →
  dòng `loi`, lượt chạy tiếp (Review Focus 1); hết ngân sách → `bo_qua` và vẫn có `de_xuat` (Review Focus 2); `chi_phi_usd=None` →
  `chi_phi_ro=False`; file `ket_qua.json`, `bao_cao.md` (có dòng "ĐỀ XUẤT:" và lệnh `duyet`); mã lượt trùng → `-2`.
- [ ] **Step 2: FAIL.** - [ ] **Step 3: Cài đặt** (đóng Qdrant client trong `finally` của CLI; thêm `results_toi_uu/` vào `.gitignore`).
- [ ] **Step 4: PASS toàn bộ.**

### Task 4: lệnh `duyet` (cổng b, cấu hình đang dùng, lịch sử), dữ liệu giữ lại, CLI, README

**Files:** Modify `eval/optimize.py`, `README.md`; Create `data/demo/demo_samples_dap_an.csv`; Test `tests/test_optimize.py`.

**Interfaces:**
- Consumes: Task 1 `doc_cau_hinh`, `DUONG_DAN_CAU_HINH`; Task 3 `chay_cau_hinh`, `ket_qua.json`.
- Produces: `qua_cong(moi: list[dict], dang_dung: list[dict]) -> dict` (2 `diem` mỗi bên → `{"qua": bool, "moi": {...}, "dang_dung": {...}, "ly_do": str}`);
  `duyet(ma_luot, ma, nguoi_duyet, *, csv_giu_lai, dap_an_giu_lai, thu_muc, cau_hinh_path, lich_su_path, toi_da_usd=1.0, tao_nguon, tao_llm_fn, kiem_llm) -> dict`;
  `main(argv)` với lệnh con `thu` và `duyet`.

- [ ] **Step 1: Viết test:** `qua_cong` (mới tốt hơn → qua; kém hơn ở 1 lần chạy → trượt; đổi kết luận nhiều hơn → trượt; bằng nhau → qua);
  `duyet` qua → ghi `cau_hinh_dang_dung.json` đúng khoá + 1 dòng lịch sử; trượt → không ghi cấu hình, vẫn 1 dòng lịch sử `qua=false`;
  chưa có cấu hình đang dùng → so với `k5-qdrant-gpt-4.1-mini`; duyệt lại đúng cấu hình đang dùng → qua (Review Focus 3);
  mã cấu hình không có/lỗi/bỏ qua trong lượt → ValueError; CLI `thu` và `duyet` gọi đúng hàm.
- [ ] **Step 2: FAIL.** - [ ] **Step 3: Cài đặt;** tạo `demo_samples_dap_an.csv` theo spec; README mục Run thêm 2 lệnh.
- [ ] **Step 4: PASS toàn bộ.**
- [ ] **Step 5: Chạy thật** `python -m eval.optimize thu` (lưới mặc định, ngân sách 2 USD), ghi chi phí/thời gian, đọc đề xuất;
  báo Vĩnh trước khi chạy `duyet` (Vĩnh là người duyệt).
