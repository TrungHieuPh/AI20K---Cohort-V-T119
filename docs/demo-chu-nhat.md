# Demo Chủ nhật 15/11/2026 – kịch bản (khoảng 5 phút)

Mục tiêu (brief mục 3): cho mentor thấy nhóm **đi đúng hướng** và có **luồng chạy thật từ đầu tới cuối**,
không phải sản phẩm hoàn chỉnh. Mọi số liệu dưới đây là số **chạy thật** ngày 14/11/2026 trên máy Windows, CPU.

## 0. Chuẩn bị trước khi vào phòng (5 phút)

```powershell
cd D:\AIP-04\zero-one-lexgate
git switch develop; git pull
.\.venv\Scripts\activate
$env:PYTHONIOENCODING = "utf-8"
```

- Mở sẵn trong VS Code: `data/demo/demo_samples.csv`, `results_demo.json`, `docs/aip04-de-bai.md`.
- **Chạy trước một lần** lệnh ở bước 3 để Windows nạp sẵn thư viện (lần đầu chậm hơn).
- Không mở hai lệnh dùng Qdrant cùng lúc (Qdrant local chỉ cho một process mở `.qdrant/`).
- Mỗi câu audit in thêm 2 dòng log của LiteLLM (`LiteLLM completion()...`, `Wrapper: Completed Call...`): bỏ qua, không lọc
  (PowerShell 5.1 biến stderr thành lỗi đỏ nếu dùng `2>&1 | Select-String`).
- **Dự phòng mất mạng / API lỗi:** các file kết quả thật đã có sẵn trong thư mục repo (git bỏ qua):
  `results_demo.json`, `results_dev.json`, `results_dev_lan2.json`, `results_answers.json`, `results_audit_bot.json`.
  Bước 5 (chấm điểm) chạy **không cần mạng**.

## 1. Vấn đề (30 giây)

Chatbot pháp lý ảo giác, tư vấn sai điều khoản → doanh nghiệp có thể phải đền bù lớn. Cần **cổng kiểm định chatbot trước khi
tung ra**: đưa luật + bộ câu hỏi/câu trả lời vào, hệ thống **bắt được câu sai và chỉ ra Điều/khoản bị vi phạm**.

## 2. Dữ liệu luật (30 giây)

- Bộ luật Lao động, bản hợp nhất **18/VBHN-VPQH ngày 12/02/2026** (gồm sửa đổi 2025: Điều 59, 61, 139, 154).
- Tách **220 Điều**, mỗi Điều một chunk (`data/law/dieu.jsonl`), embed bằng **bge-m3**, lưu **Qdrant** local.

## 3. Truy hồi (45 giây)

```powershell
python -m core.retrieve "Nhân viên hợp đồng không thời hạn muốn nghỉ việc phải báo trước mấy ngày?"
```
Kỳ vọng (≈ 13 s): Điều 35 đứng đầu (0.74), rồi 36, 45, 29, 48.

Số liệu: bộ 20 câu smoke **Hit@1 19/20, Hit@3 20/20, MRR 0,975** (`python -m scripts.check_retrieval data/test/retrieval_smoke.csv`).

## 4. Kiểm định câu mẫu (1 phút 30)

```powershell
python -m core.audit data/demo/demo_samples.csv --out results_demo.json
```
Kỳ vọng (≈ 30 s, ~0,005 USD): `DUNG, SAI, KHONG_CAN_CU, SAI, SAI` → **cổng `KHONG_DAT`**. Mở `results_demo.json` cho xem:

| Câu | Loại | Kết luận | Điểm đáng chỉ |
|---|---|---|---|
| 1 | Đúng | DUNG | trích Điều 35 khoản 1 điểm a, bằng chứng "Ít nhất 45 ngày…" |
| 2 | Sai con số (300 giờ) | SAI | bằng chứng Điều 107: 200 giờ; 300 giờ chỉ cho một số ngành |
| 3 | Bịa quyền lợi (tiền du lịch) | KHONG_CAN_CU | tách 2 ý: 12 ngày phép DUNG, tiền du lịch KHONG_CAN_CU |
| 4 | Luật cũ (thai sản 06 tháng) | SAI | Điều 139 bản 2026: con thứ hai **07 tháng** |
| 5 | Trích sai Điều (85% lương thử việc "theo Điều 90") | SAI | quy định đúng nhưng thuộc **Điều 26** |

Ý mỗi câu có: nhãn, `trich_dan`, `bang_chung` (nguyên văn), `giai_thich`; cờ `ha_nhan` / `bang_chung_khop` khi có vấn đề.

## 5. Chấm cả tập dev + cổng (1 phút)

```powershell
python -m eval.score results_dev.json data/test/dev_set_dap_an.csv --lan2 results_dev_lan2.json
```
(Không gọi LLM.) Dev set 10 câu (5 đúng, 5 sai – mỗi loại lỗi một câu), chạy 2 lần:

| Chỉ số | Kết quả | Mục tiêu MVP |
|---|---|---|
| Bắt được câu sai | 5/5 | ≥ 4/5 |
| Báo nhầm câu đúng | 0/5 | ≤ 1/15 |
| Trích đúng Điều | 4/4 | 100% |
| Điều đúng trong top-5 | 9/9 | ≥ 9/10 |
| Ổn định 2 lần chạy | 10/10 | ≥ 19/20 |
| Thời gian (quy về 20 câu) | 54,5 s | ≤ 5 phút |
| Chi phí 1 lần chạy | 0,011 USD | |

**Nói rõ:** dev set do AI soạn (đã đối chiếu nguyên văn VBHN 18) nên dễ hơn câu thật; số cuối cùng sẽ lấy từ **test set kín**
20 câu (5 câu cài sai), chạy mù 2 lần.

Thêm (nếu còn thời gian): **chatbot RAG của nhóm** trả lời 20 câu smoke → audit chấm chính nó:
trích đúng Điều 20/20, audit 20/20 DUNG, cổng `DAT`, ~0,034 USD (`results_answers.json`, `results_audit_bot.json`).

## 6. Đối chiếu đề AIP-04 và kế hoạch (1 phút)

| Yêu cầu đề AIP-04 | Hiện có | Kế hoạch |
|---|---|---|
| Nạp tài liệu, dựng pipeline RAG | ✅ ingest + retrieve (bge-m3, Qdrant), ✅ RAG hỏi đáp chạy theo lô | Upload qua web (tuần 2) |
| Agent tính điểm RAGAS | 🟡 faithfulness tính từ nhãn audit; Hit@k, MRR; `score.py` | Ragas thật: faithfulness, answer relevancy, context precision/recall (tuần 2) |
| Cổng kiểm thử hồi quy trên tập giữ riêng | ✅ cổng 3 mức + chấm theo mục tiêu; quy trình test set kín | Chạy mù test set 20 câu (tuần 2) |
| Kiểm soát chi phí | ✅ đo chi phí, thời gian từng câu; ~0,001 USD/câu | |
| Agent tự thử cấu hình, Pareto chi phí × độ trễ × chất lượng, HITL | ❌ | Tuần 3: thử k, BM25 / bge-m3 / hybrid, reranker, model; Kỹ sư RAG duyệt |
| Web, đăng nhập 2 vai trò, dashboard | ❌ | Next.js (`web/`) + FastAPI (`api/`), tuần 2–4 |
| Trace, cảnh báo suy giảm, khoanh vùng lỗi | ❌ | Langfuse / OpenTelemetry, tuần 4 |

## 7. Câu hỏi cho mentor

1. Sản phẩm cuối chấm theo kịch bản "bắt 5 câu sai" hay theo đủ yêu cầu đầu ra AIP-04?
2. Hướng "lexgate là bộ chấm chuyên sâu (từng ý, có trích Điều) cho RAG của nhóm, agent tối ưu dựa trên điểm chấm" có ổn không?
3. Một lĩnh vực pháp lý, thêm Luật BHXH làm bộ luật thứ hai, có đủ không?

## Không nói quá

- Dev set do AI soạn; **test set kín chưa có** (cần người không viết code soạn).
- Ragas thư viện **chưa tích hợp**; faithfulness hiện tính từ nhãn audit.
- Chưa có agent tối ưu, web, đăng nhập.
