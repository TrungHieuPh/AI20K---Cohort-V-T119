# web – giao diện lexgate

Giao diện Next.js cho bộ kiểm định: xem cổng kiểm định, từng câu trả lời của chatbot, từng ý được đối
chiếu với Điều luật nào, và bộ kiểm định tự chấm chính nó ra sao. Đặc tả màn hình ở
[`docs/ui-dac-ta.md`](../docs/ui-dac-ta.md), kịch bản demo ở [`docs/demo-chu-nhat.md`](../docs/demo-chu-nhat.md).

**Giai đoạn 1 (hiện tại): chỉ đọc JSON, không có backend.** Mọi trang được dựng tĩnh lúc build.

## Chạy

```bash
cd web
npm install
npm run dev        # http://localhost:3000
```

| Lệnh | Việc |
| --- | --- |
| `npm run dev` | Chạy bản phát triển |
| `npm run build` / `npm run start` | Build rồi chạy bản production |
| `npm run typecheck` | Kiểm kiểu (cần `npx next typegen` hoặc một lần `build` trước để có kiểu route) |
| `npm run lint` | ESLint |
| `npm run format` | Prettier cho `*.ts`, `*.tsx` |

## Trang

| Đường dẫn | Màn hình |
| --- | --- |
| `/` | Trang giới thiệu |
| `/dashboard` | 1 – Tổng quan: cổng 3 mức, số câu theo kết luận, faithfulness TB, tổng thời gian và chi phí |
| `/audit` | 2 – Danh sách câu, lọc theo kết luận |
| `/audit/[questionId]` | 3 – Chi tiết một câu: câu hỏi, câu trả lời, từng ý cạnh Điều luật được trích, 5 Điều truy hồi |
| `/audit/open` | Mở một `results.json` khác thay cho lượt demo |
| `/quality` | 4 – Chất lượng: số đo so với mục tiêu MVP, theo loại lỗi, từng câu |
| `/law`, `/law/[dieu]` | Tra cứu Bộ luật Lao động |

Bấm vào trích dẫn ("Điều 107 khoản 2") hoặc một Điều truy hồi sẽ mở panel bên phải với toàn văn Điều đó,
tô vàng đoạn bằng chứng khớp nguyên văn (bỏ qua dấu câu).

## Dữ liệu

Chỉ đọc, đọc ở [`lib/data.ts`](lib/data.ts) lúc build:

| Tệp | Dùng cho |
| --- | --- |
| `mock/mock_results.json` | Màn 1–3 (lượt demo) |
| `mock/mock_score.json` | Màn 4 |
| `data/law/dieu.jsonl` | Nội dung Điều luật; trang `/data/law.json` phục vụ bản tĩnh để panel tải khi cần |

`/audit/open` đọc tệp bằng FileReader ngay trong trình duyệt và giữ trong `sessionStorage` của tab đó.
Tệp không được gửi đi đâu. Tải lại trang vẫn giữ, đóng tab là mất. Định dạng tệp theo mục *Data formats* trong
README gốc; tệp cũ chưa có `cau_hoi` vẫn mở được.

Video thao tác trên trang giới thiệu nằm ở `public/demo/` (`walkthrough.webm`, `walkthrough.mp4`, ảnh poster),
quay liền một mạch trên bản build với lượt demo. Mốc thời gian từng bước ở [`lib/walkthrough.ts`](lib/walkthrough.ts).
Khi giao diện các màn hình đổi nhiều, quay lại video và cập nhật các mốc này.

## Cấu trúc

```
app/(marketing)/     trang giới thiệu
app/(app)/           các màn hình có sidebar
components/app/      thành phần của các màn hình
components/landing/  thành phần trang giới thiệu
components/ui/       shadcn/ui (base-nova, Base UI)
lib/                 kiểu dữ liệu, đọc dữ liệu, nhãn, định dạng số
```

Nhãn hiển thị nằm ở [`lib/verdicts.ts`](lib/verdicts.ts). Màu không bao giờ đứng một mình: mỗi nhãn có
biểu tượng và chữ.

## Giai đoạn 2

Khi có FastAPI (`api/`), thay phần đọc tệp trong `lib/data.ts` bằng lời gọi API và thêm chạy kiểm định
từ web. Các màn hình nhận dữ liệu qua `lib/` và `ResultsProvider`, nên phần lớn giữ nguyên.
