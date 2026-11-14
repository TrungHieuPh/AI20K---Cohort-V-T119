# CLAUDE.md – zero-one-lexgate

Đọc docs/project-brief.md trước mọi việc

**README.md là nguồn sự thật của dự án.** Đọc README.md trước mọi việc. Khi file này và README khác nhau,
làm theo README. File này chỉ thêm ngữ cảnh và quy tắc làm việc cho Claude Code.

## Ngữ cảnh

- Đề tài AIP-04 (AI Agent RAG Platform tự đánh giá & tối ưu chất lượng truy hồi – RAGAS), chương trình AI Thực chiến.
- Mục tiêu trước mắt: MVP demo cho mentor (Chủ nhật). Bộ luật Lao động + CSV câu trả lời của chatbot
  → kiểm từng ý, gán nhãn, trích Điều/khoản/điểm làm bằng chứng → `results.json` → giao diện Streamlit.
- Mỗi người sở hữu một phần (xem bảng Team trong README). Chỉ sửa file của phần đang được giao;
  muốn đổi định dạng dữ liệu dùng chung (Data formats trong README) thì phải hỏi người dùng trước.

## Quy tắc làm việc

1. Trước khi viết code: đọc README.md và các file hiện có trong thư mục liên quan. Bổ sung vào khung sẵn có,
   giữ đúng tên file và chữ ký hàm trong README (`build_index`, `retrieve`, `audit_one`, `run_audit`, `score`).
2. Làm từng việc một, chạy thử, báo kết quả cho người dùng kiểm tra rồi mới sang việc tiếp.
3. Không bao giờ ghi API key vào code hay commit `.env`. Cấu hình đọc từ `.env` (xem `.env.example`).
4. Không tự bịa nội dung luật hay đáp án. Dữ liệu thử phải đặt trong `mock/` và ghi rõ là dữ liệu giả.
5. Không đọc, tạo hay commit tập test và answer key (`data/test/test_set*.csv`, `answer_key*.csv`):
   chúng được giữ kín để đánh giá mù.
6. Làm trên nhánh `feat/<phần>` tách từ `develop`, commit nhỏ, thông điệp rõ.

## Lưu ý kỹ thuật đã thống nhất thêm

- **Văn bản luật:** dùng bản hợp nhất Bộ luật Lao động 18/VBHN-VPQH ngày 12/02/2026 (Luật 45/2019/QH14 sửa đổi
  bởi các Luật 71/2025/QH15, 113/2025/QH15, 124/2025/QH15) tải từ vbpl.vn;
  ghi rõ phiên bản trong dữ liệu chunk hoặc metadata.
- **Cắt văn bản:** tách tại mỗi dòng bắt đầu "Điều N."; bỏ dòng đầu trang, số trang, chú thích nếu có.
  Kiểm tra số Điều khoảng 220.
- **Nhãn `KHONG_CAN_CU`:** quyền lợi bịa thường rơi vào nhãn này, nên không được để nó lọt qua như câu đúng.
  Đã chốt (xem README):
  - Cổng 3 mức: `KHONG_DAT` nếu có câu `SAI`; `CAN_XEM_LAI` nếu không có câu `SAI` nhưng có câu `KHONG_CAN_CU`;
    `DAT` nếu tất cả `DUNG`.
  - Chấm điểm: câu cố tình sai ra `SAI` hoặc `KHONG_CAN_CU` đều tính là bắt được; câu đúng ra `SAI` hoặc
    `KHONG_CAN_CU` tính là báo nhầm.
- **Số lần gọi LLM:** gộp "tách ý + chấm từng ý" vào một lần gọi cho mỗi câu trả lời, `temperature=0`,
  yêu cầu trả JSON và đọc JSON chắc chắn; có thử lại khi gặp lỗi 429; lỗi một câu thì ghi lỗi và chạy tiếp.
- **Phương án dự phòng:** nếu embedding/Qdrant trục trặc, `retrieve` có thể dùng BM25 (`rank_bm25`)
  với cùng chữ ký hàm. Ragas faithfulness là phần cộng thêm, không chặn MVP.
- Đọc/ghi file `encoding="utf-8"`; CSV xuất cho Excel dùng `utf-8-sig`. Thông báo hiển thị bằng tiếng Việt.

## Hướng phát triển (để thiết kế không bị bó hẹp)

Agent chẩn đoán lỗi truy hồi và tự tối ưu pipeline (cách cắt, `k`, embedding) chấm bằng Ragas; so sánh embedding;
FastAPI (`api/`) + Next.js (`web/`); kiểm định lại khi luật thay đổi. Vì vậy giữ các bước ingest / retrieve / audit / score
tách biệt, cấu hình được, để thay thế từng phần mà không viết lại.