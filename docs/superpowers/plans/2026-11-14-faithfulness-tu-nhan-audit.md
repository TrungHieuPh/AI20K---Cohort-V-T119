# Faithfulness từ nhãn audit – kế hoạch thực hiện

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Điền `cau[].faithfulness` (= số ý DUNG / tổng số ý) và thêm `tong_ket.faithfulness_tb`, không gọi thêm LLM.

**Architecture:** Tính trong `core/audit.py` từ nhãn cuối cùng của các ý (sau bước chặn trích dẫn). `run_audit` lấy trung bình
các giá trị không `None`. Không cài, không import Ragas.

**Tech Stack:** Python 3.12, pytest (`.venv/Scripts/python -m pytest`, đặt `HF_HUB_OFFLINE=1`).

**Spec:** `docs/superpowers/specs/2026-11-14-faithfulness-tu-nhan-audit-design.md`

## Global Constraints
- Không cài Ragas, không thêm lần gọi LLM nào.
- Làm tròn 2 chữ số bằng `round(x, 2)`.
- Tên trường: `faithfulness` (đã có trong mỗi `cau`), `faithfulness_tb` (mới, trong `tong_ket`).
- Không sửa code của Bào; không đọc `.env`; chỉ commit khi Vĩnh yêu cầu; không dòng attribution.

## Review Focus
1. Câu `LOI` (`faithfulness = None`) không được kéo trung bình về 0 → bỏ qua. Test ở Task 2.
2. Câu không `LOI` nhưng `faithfulness = None` (audit giả trong test cũ) → cũng bỏ qua, không lỗi. Test ở Task 2.
3. Ý bị hạ nhãn (`ha_nhan`) không được tính là DUNG. Test ở Task 1.
4. Phân số lặp (1/3, 2/3) làm tròn đúng 0.33 / 0.67. Test ở Task 1.
5. `mock/mock_results.json` (Hiếu đang dùng) phải có giá trị mới khớp nhãn, không còn `null`. Kiểm ở Task 2, bước cuối.

---

### Task 1: `faithfulness` cho từng câu trong `audit_one`

**Files:**
- Modify: `core/audit.py` (hàm `audit_one`, thêm hàm `_faithfulness`)
- Test: `tests/test_audit.py`

**Interfaces:**
- Produces: `_faithfulness(cac_y: list[dict]) -> float` (tỉ lệ ý `nhan == "DUNG"`, đã làm tròn 2 chữ số; `cac_y` luôn khác rỗng
  vì `_kiem_cac_y` đã báo lỗi nếu rỗng). `audit_one(...)["faithfulness"]` trả giá trị này.

- [ ] **Step 1: Viết test (dùng helper `chay`, `y`, `chay_trich` có sẵn)**
  - `test_faithfulness_la_ti_le_y_dung`, tham số hoá: `["DUNG"] → 1.0`, `["DUNG","TRAI_LUAT"] → 0.5`,
    `["DUNG","KHONG_CAN_CU","TRAI_LUAT"] → 0.33`, `["DUNG","DUNG","KHONG_CAN_CU"] → 0.67`, `["TRAI_LUAT"] → 0.0`.
  - `test_y_bi_ha_nhan_khong_tinh_la_dung_trong_faithfulness`: `chay_trich("Theo Điều 50.", cac_y=[y("DUNG", trich_dan="Điều 60"), y("DUNG")])`
    → ý 1 bị hạ, `faithfulness == 0.5`.
- [ ] **Step 2: Chạy test, xác nhận FAIL** (`faithfulness` đang là `None`).
- [ ] **Step 3: Thêm `_faithfulness` và dùng trong dict trả về của `audit_one`** (thay `"faithfulness": None`).
- [ ] **Step 4: Chạy toàn bộ test, xác nhận PASS.**

### Task 2: `tong_ket.faithfulness_tb`, tài liệu, dữ liệu mẫu

**Files:**
- Modify: `core/audit.py` (hàm `run_audit`), `README.md` (ví dụ `results.json` + Allowed values),
  `docs/project-brief.md` (mục 6, dòng "faithfulness để null"), `mock/mock_results.json`
- Test: `tests/test_run_audit.py`

**Interfaces:**
- Consumes: `cau[i]["faithfulness"]` (float hoặc `None`) từ Task 1.
- Produces: `tong_ket["faithfulness_tb"]`: trung bình các `faithfulness` khác `None` (chưa làm tròn), làm tròn 2 chữ số;
  không có giá trị nào → `None`. Đặt sau `"loi"`, trước `"cong"`.

- [ ] **Step 1: Viết test** (audit giả trả `faithfulness` theo dữ liệu đầu vào)
  - `test_faithfulness_tb_la_trung_binh_cac_cau`: các câu 1.0, 0.5, 0.0 → `0.5`.
  - `test_faithfulness_tb_bo_qua_cau_loi`: câu 1.0 + một câu `LOI` → `1.0`.
  - `test_faithfulness_tb_null_khi_khong_cau_nao_co_gia_tri`: toàn `LOI` → `None`; và câu `DUNG` có `faithfulness=None` → `None`.
- [ ] **Step 2: Chạy test, xác nhận FAIL** (`KeyError: 'faithfulness_tb'`).
- [ ] **Step 3: Thêm `faithfulness_tb` vào `tong_ket` trong `run_audit`.**
- [ ] **Step 4: Chạy toàn bộ test, xác nhận PASS.**
- [ ] **Step 5: README:** ví dụ `tong_ket` thêm `"faithfulness_tb": 0.0`; Allowed values thêm 2 dòng: `cau[].faithfulness`
  (tỉ lệ ý DUNG / tổng ý, 2 chữ số, `null` khi `LOI`; *theo định nghĩa faithfulness của Ragas, tính từ nhãn audit, không gọi thư viện Ragas*)
  và `tong_ket.faithfulness_tb`.
- [ ] **Step 6: Brief mục 6:** đổi dòng "`faithfulness` để `null`…" thành định nghĩa mới; Ragas thật làm ở `eval/ragas_eval.py`,
  venv riêng, tuần 2–3.
- [ ] **Step 7: Tính lại `mock/mock_results.json`** từ nhãn đang có bằng `_faithfulness` (không gọi LLM), thêm `faithfulness_tb`.
  Kỳ vọng 4 câu: 1.0, 0.0, 0.5, 0.0 → `faithfulness_tb = 0.38`.
- [ ] **Step 8: Báo Vĩnh kết quả; commit khi Vĩnh đồng ý.**
