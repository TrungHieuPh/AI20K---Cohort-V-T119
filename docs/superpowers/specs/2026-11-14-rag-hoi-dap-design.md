# RAG hỏi đáp của nhóm (`core/answer.py`) – thiết kế ngắn

## Mục đích
- Đề AIP-04 yêu cầu "dựng pipeline RAG hỏi đáp". Chatbot này cũng là **đối tượng để đo**: câu trả lời của nó được
  lexgate audit, Ragas (sau này) và agent tối ưu chấm, để so sánh cấu hình truy hồi / model.
- Vĩnh chọn **phương án A: chạy theo lô** (CSV câu hỏi → CSV câu trả lời → đưa thẳng vào audit). Giao diện chat trực tiếp
  (FastAPI + Next.js) làm sau.

## Không làm lần này
- API / giao diện chat; hybrid, reranker (cần Bào bổ sung trong `retrieve()`); Ragas; nhiều bộ luật.

## Thiết kế
- `answer_one(cau_hoi, *, retrieve_fn=None, llm_fn=None, k=5) -> dict` trả:
  `cau_tra_loi` (str), `trich_dan` (list[str], vd `["Điều 35 khoản 1 điểm a"]`), `dieu_truy_hoi` (list chunk_id top-k),
  `thoi_gian_ms`, `chi_phi_usd`.
  - Một lần gọi LLM, temperature 0, trả JSON `{"cau_tra_loi": "...", "trich_dan": [...]}`.
  - Prompt: chỉ dựa vào các Điều được cung cấp; trích theo dạng "Điều N khoản K điểm x"; nếu không có căn cứ thì trả lời
    đúng câu cố định `KHONG_CO_CAN_CU` = "Bộ luật Lao động không có quy định trực tiếp về vấn đề này." (không được bịa).
- `run_answer(csv_path, out_path="results_answers.csv", *, k=5, answer_fn=None) -> dict`
  - Đọc CSV có cột `id, cau_hoi` (bỏ qua cột khác, nên chạy được trên `retrieval_smoke.csv`, `dev_set.csv`).
  - Ghi **CSV `id, cau_hoi, cau_tra_loi`** đúng định dạng audit đọc, và **JSON cùng tên** (`results_answers.json`) có chi tiết
    từng câu (`trich_dan`, `dieu_truy_hoi`, thời gian, chi phí, `k`, retriever, model) để Ragas/agent dùng sau.
  - Giống `run_audit`: chọn nguồn truy hồi một lần, kiểm cấu hình LLM, chạy thử truy hồi lúc bắt đầu (hỏng thì dừng ngay);
    câu lỗi chạy lại 1 lần, vẫn lỗi thì **không ghi vào CSV** (để audit không chấm câu rỗng), ghi `loi` trong JSON.
- Dòng lệnh: `python -m core.answer <csv> [--out results_answers.csv] [--k 5]`, rồi
  `python -m core.audit results_answers.csv` để chấm chính chatbot của nhóm.

## Các điểm Claude tự quyết (sửa được)
- **Dùng lại** `chon_nguon`, `_llm_mac_dinh`, `_goi_co_thu_lai`, `_doc_json`, `_kiem_cau_hinh_llm` bằng cách import từ
  `core.audit`, chưa tách module chung (tránh sửa đường dẫn trong ~100 test hiện có). Tách ra `core/llm.py` khi có module thứ ba cần.
- `k` là tham số (mặc định 5) để agent tối ưu thay được; retriever theo `RETRIEVER`, model theo `LLM_MODEL` như audit.
- Đặt tên đầu ra `results_answers.*` và thêm `results*.csv` vào `.gitignore` (hiện chỉ có `results*.json`) để kết quả chạy không bị commit nhầm.
- Không dùng `get_article` ở đây (câu hỏi thường không trích Điều); audit vẫn dùng như cũ khi chấm câu trả lời.

## Kiểm thử (viết trước, retrieve/LLM giả)
- Prompt chứa câu hỏi và văn bản các Điều top-k; `k` truyền đúng xuống retrieve.
- Đọc JSON trả về (chịu code fence); thiếu `cau_tra_loi` → lỗi; `trich_dan` không phải list → lỗi.
- `run_answer`: CSV đầu ra đúng 3 cột và audit đọc được; câu lỗi 2 lần không có trong CSV mà có `loi` trong JSON;
  đọc được CSV có thêm cột (`dieu_dung`); truy hồi hỏng thì dừng trước câu đầu.
