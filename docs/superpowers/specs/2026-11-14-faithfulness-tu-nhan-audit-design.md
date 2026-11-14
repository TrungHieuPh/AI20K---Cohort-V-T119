# Faithfulness tính từ nhãn của audit (thiết kế ngắn)

## Mục đích
- Điền trường `faithfulness` (đang `null`) trong `results.json` ngay, không tốn thêm lần gọi LLM nào.
- Ragas thật (thư viện) dùng để **đo bộ truy hồi và RAG của nhóm, so sánh cấu hình** ở tuần 2–3, làm thành bước riêng
  `eval/ragas_eval.py`, cài trong `requirements-eval.txt` và thử trong venv riêng để không phá LiteLLM.
  **Không** cài Ragas trước Chủ nhật, **không** đưa Ragas vào `audit_one`.
- Context precision/recall: tuần sau, chạy trên tập có `dieu_dung`.

## Định nghĩa (Vĩnh chốt)
- `cau[].faithfulness` = số ý có nhãn `DUNG` / tổng số ý, làm tròn 2 chữ số.
  Đây là faithfulness theo định nghĩa của Ragas (ý có căn cứ / tổng ý), tính từ nhãn của audit,
  không phải gọi thư viện Ragas. README ghi rõ điều này.
- `tong_ket.faithfulness_tb` = trung bình faithfulness của các câu (trường mới, báo team).

## Các điểm Claude tự quyết (sửa được)
- Đếm nhãn **sau** bước chặn trích dẫn: ý bị hạ (`ha_nhan`) không còn là `DUNG` nên không được tính là có căn cứ.
  `TRAI_LUAT` và `KHONG_CAN_CU` đều là không có căn cứ. `bang_chung_khop: false` không ảnh hưởng (chỉ cảnh báo).
- Câu `LOI`: `faithfulness = null`, không tính vào trung bình.
- `faithfulness_tb` = trung bình các giá trị chưa làm tròn của các câu không `LOI`, làm tròn 2 chữ số;
  không có câu nào hợp lệ thì `null`.
- Tên trường `faithfulness_tb` (theo kiểu tiếng Việt không dấu như các trường khác).
- Cập nhật cùng lúc: README (mục Allowed values + ví dụ `tong_ket`), dòng "faithfulness để null" trong brief mục 6,
  và tính lại `mock/mock_results.json` từ nhãn đã có (không gọi lại LLM).

## Phương án đã cân nhắc
- **Tính từ nhãn audit (chọn):** miễn phí, nhất quán với nhãn hiển thị cho người dùng.
- Gọi `ragas.Faithfulness` trong audit: tốn thêm khoảng 2 lần gọi LLM mỗi câu, cài thêm langchain và hạ `openai`
  (có thể làm hỏng LiteLLM); Vĩnh đã loại.
- Tính tại `eval/score.py`: tách khỏi kết quả nên UI không hiển thị được theo từng câu; loại.

## Kiểm thử (viết trước)
- `audit_one`: 1/1 DUNG → 1.0; 1 DUNG + 1 TRAI_LUAT → 0.5; 1/3 → 0.33; ý bị hạ nhãn → không tính là DUNG.
- `run_audit`: `faithfulness_tb` là trung bình đúng, bỏ qua câu `LOI`; toàn câu `LOI` → `null`.
