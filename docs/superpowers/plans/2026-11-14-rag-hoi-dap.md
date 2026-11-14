# RAG hỏi đáp (chạy theo lô) – kế hoạch thực hiện

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `core/answer.py`: câu hỏi → top-k Điều → LLM trả lời có trích Điều; chạy theo lô ra CSV mà `core.audit` đọc được.

**Architecture:** Module mới, dùng lại từ `core.audit` (import, không tách): `chon_nguon`, `Nguon`, `_llm_mac_dinh`,
`_goi_co_thu_lai`, `_doc_json`, `_kiem_cau_hinh_llm`, `_van_ban_luat`, `_doc_id`. Điều khiển lượt chạy theo đúng mẫu
`run_audit` (chọn nguồn một lần, kiểm LLM, chạy thử truy hồi, chạy lại câu lỗi 1 lần).

**Tech Stack:** Python 3.12, pytest (`HF_HUB_OFFLINE=1 .venv/Scripts/python -m pytest -q`).

**Spec:** `docs/superpowers/specs/2026-11-14-rag-hoi-dap-design.md`

## Global Constraints
- Một lần gọi LLM mỗi câu, `temperature=0` (đi qua `_llm_mac_dinh` có sẵn); không gọi `get_article`.
- Câu không có căn cứ: đúng chuỗi `KHONG_CO_CAN_CU = "Bộ luật Lao động không có quy định trực tiếp về vấn đề này."`
- Đầu ra mặc định `results_answers.csv` + `results_answers.json` (cùng tên, đuôi `.json`); thêm `results*.csv` vào `.gitignore`.
- Không sửa code của Bào; không đọc `.env`; commit/push chỉ khi Vĩnh nói; không dòng attribution.

## Review Focus
1. Câu trả lời có dấu phẩy, dấu nháy, xuống dòng → CSV đọc lại phải ra đúng nguyên văn (audit chấm đúng chữ). Test ở Task 2.
2. Dòng có `cau_hoi` rỗng → không gọi LLM, ghi `loi` trong JSON, không có trong CSV. Test ở Task 2.
3. LLM trả `cau_tra_loi` rỗng → coi là lỗi (không ghi câu rỗng cho audit). Test ở Task 1.
4. LLM trả `trich_dan` là một chuỗi thay vì list → chấp nhận thành `[chuỗi]`; kiểu khác → lỗi. Test ở Task 1.
5. CSV đầu vào có BOM và cột thừa (`dieu_dung` của `retrieval_smoke.csv`) → vẫn chạy, `id` giữ đúng kiểu. Test ở Task 2.

---

### Task 1: `answer_one`

**Files:** Create `core/answer.py`; Test `tests/test_answer.py` (dùng `mock/mock_chunks.json`, retrieve và LLM giả).

**Interfaces:**
- Produces: `answer_one(cau_hoi: str, *, retrieve_fn=None, llm_fn=None, k: int = 5) -> dict` với khoá
  `cau_tra_loi: str`, `trich_dan: list[str]`, `dieu_truy_hoi: list[str]` (chunk_id theo thứ tự retrieve),
  `thoi_gian_ms: int`, `chi_phi_usd: float | None`. Mặc định: `chon_nguon().retrieve`, `_llm_mac_dinh`.
  Hằng `KHONG_CO_CAN_CU`, `HUONG_DAN_TRA_LOI` (prompt hệ thống, có nhắc nguyên văn `KHONG_CO_CAN_CU`).

- [ ] **Step 1: Viết test**
  - `test_tra_ve_cau_tra_loi_trich_dan_va_dieu_truy_hoi`: LLM giả trả `{"cau_tra_loi": "A", "trich_dan": ["Điều 35 khoản 1"]}`
    → đúng 3 khoá đó, `dieu_truy_hoi == ["dieu-35", "dieu-36"]`.
  - `test_prompt_chua_cau_hoi_van_ban_dieu_va_cau_khong_can_cu`: messages[0] chứa `KHONG_CO_CAN_CU`; messages[1] chứa câu hỏi
    và `noi_dung` của từng chunk; chỉ 1 lần gọi LLM.
  - `test_k_truyen_xuong_retrieve` (k=3 → retrieve nhận k=3).
  - `test_doc_json_trong_code_fence`.
  - `test_trich_dan_la_chuoi_thi_thanh_list`: `"Điều 35"` → `["Điều 35"]`.
  - `test_ket_qua_llm_khong_hop_le_thi_bao_loi` (ValueError), tham số: không JSON; thiếu `cau_tra_loi`; `cau_tra_loi` rỗng/khoảng trắng;
    `trich_dan` là số.
  - `test_loi_429_duoc_thu_lai` (tái dùng `_goi_co_thu_lai`, `time.sleep` bị thay).
- [ ] **Step 2: Chạy test, xác nhận FAIL** (chưa có `core.answer`).
- [ ] **Step 3: Viết `answer_one` và hai hằng trong `core/answer.py`.** User message: `VĂN BẢN LUẬT:\n{_van_ban_luat(chunks)}\n\nCÂU HỎI:\n{cau_hoi}`.
- [ ] **Step 4: Chạy toàn bộ test, xác nhận PASS.**

### Task 2: `run_answer`, dòng lệnh, `.gitignore`, README

**Files:** Modify `core/answer.py`, `.gitignore`, `README.md` (mục Run); Test `tests/test_answer.py`.

**Interfaces:**
- Consumes: `answer_one` (Task 1).
- Produces: `run_answer(csv_path, out_path="results_answers.csv", *, k=5, answer_fn=None, nguon=None, llm_fn=None) -> dict`
  `{"tong_ket": {"so_cau", "tra_loi_duoc", "loi", "k", "retriever", "model"}, "cau": [ {id, cau_hoi, cau_tra_loi, trich_dan,
  dieu_truy_hoi, thoi_gian_ms, chi_phi_usd} | {id, cau_hoi, loi} ]}`; ghi CSV `id,cau_hoi,cau_tra_loi` (chỉ câu thành công)
  và JSON `Path(out_path).with_suffix(".json")`. `answer_fn` được truyền thì bỏ qua chuẩn bị (như `run_audit`);
  `retriever`/`model` lấy từ `nguon.ten` / `LLM_MODEL`, `None` khi dùng `answer_fn`. `main(argv)`: `csv_path`, `--out`, `--k`.

- [ ] **Step 1: Viết test**
  - `test_ghi_csv_dung_dinh_dang_audit_doc_duoc`: đọc lại CSV bằng `csv.DictReader` → cột `id, cau_hoi, cau_tra_loi`, giữ thứ tự, `id` từ CSV.
  - `test_cau_tra_loi_co_dau_phay_nhay_xuong_dong_doc_lai_nguyen_van` (Review Focus 1).
  - `test_cau_loi_hai_lan_khong_co_trong_csv_co_loi_trong_json`; answer giả lỗi lần 1 rồi thành công → có trong CSV, gọi 2 lần.
  - `test_cau_hoi_rong_khong_goi_llm_va_ghi_loi` (Review Focus 2).
  - `test_doc_csv_co_bom_va_cot_thua` (Review Focus 5): cột `id,cau_hoi,dieu_dung`, id "r01" giữ là chuỗi.
  - `test_thieu_cot_cau_hoi_thi_bao_loi` (ValueError nhắc "cau_hoi").
  - `test_truy_hoi_hong_thi_dung_truoc_cau_dau` (nguồn giả ném lỗi → RuntimeError, retrieve gọi 1 lần, không có file).
  - `test_tong_ket_va_json_cung_ten`: `so_cau`, `tra_loi_duoc`, `loi`, `k`; file `.json` cạnh `.csv`.
  - `test_dong_lenh_ghi_hai_file` (thay `chon_nguon`, `_kiem_cau_hinh_llm`, `answer_one`).
- [ ] **Step 2: Chạy test, xác nhận FAIL.**
- [ ] **Step 3: Viết `run_answer`, `main`;** thêm `results*.csv` vào `.gitignore` (cạnh `results*.json`); README mục Run thêm 2 dòng:
  `python -m core.answer data/test/retrieval_smoke.csv` và `python -m core.audit results_answers.csv`.
- [ ] **Step 4: Chạy toàn bộ test, xác nhận PASS.**
- [ ] **Step 5: Chạy thật** trên `data/test/retrieval_smoke.csv` rồi audit `results_answers.csv`; ghi lại số câu trả lời được,
  số câu "không có căn cứ", cổng, faithfulness_tb, thời gian, chi phí. Kết quả để trong scratchpad, không commit.
- [ ] **Step 6: Báo Vĩnh; commit/push khi Vĩnh nói.**
