# API hỏi đáp Bộ luật Lao động (`api/`)

Server FastAPI để hỏi đáp trực tiếp trên Bộ luật Lao động đã có trong index. Đây là bản MVP để test hệ thống trước:
người dùng gõ câu hỏi, nhận câu trả lời có trích Điều. Chưa có hỏi đáp trên tài liệu riêng do người dùng tải lên.

| Mục | Nội dung |
|---|---|
| Code | `api/server.py` (FastAPI), `api/chat.html` (trang chat tối giản để test) |
| Bọc | `core.answer.answer_one` (Vĩnh) và nguồn truy hồi `core.retrieve` (Bào), không sửa file nào trong `core/` |
| Phạm vi | Chỉ Bộ luật Lao động (VBHN 18/VBHN-VPQH). Mỗi câu hỏi độc lập, chưa nhớ hội thoại. Chưa có đăng nhập. |
| Người dùng tiếp | Hiếu: cắm API vào giao diện `web/` (xem mục 5) |

## 1. Luồng xử lý một câu hỏi

```
POST /api/chat {"cau_hoi": "..."}
  │
  ▼
Truy hồi (core.retrieve: bge-m3 + Qdrant, không có LLM)
  Embed câu hỏi, lấy k Điều gần nghĩa nhất (mặc định 5) kèm score cosine
  │
  ▼
Sinh câu trả lời (core.answer: một lần gọi LLM qua LiteLLM, temperature 0)
  LLM đọc toàn văn k Điều (không thấy score), trả lời và ghi căn cứ "Điều N khoản K"
  Không có căn cứ trong k Điều → trả câu cố định "Bộ luật Lao động không có quy định trực tiếp về vấn đề này."
  │
  ▼
JSON: câu trả lời + trích dẫn + các Điều đã truy hồi + thời gian + chi phí
```

LLM chỉ thấy k Điều mà bước truy hồi đưa vào. Điều đúng không nằm trong top k thì LLM không thể trả lời đúng.

## 2. Cài đặt và chạy

Yêu cầu: Python 3.11+ (đã test trên 3.12, Windows, CPU).

```bash
git switch develop && git pull
python -m venv .venv
# Windows: .venv\Scripts\activate    macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt       # đã gồm fastapi, uvicorn, litellm
cp .env.example .env
```

Trong `.env` cần điền:

| Biến | Giá trị |
|---|---|
| `LLM_MODEL` | Tên model theo LiteLLM, ví dụ `openai/gpt-4.1-mini` (bản đang test) |
| `OPENAI_API_KEY` (hoặc key của nhà cung cấp khác) | API key riêng của bạn. Không commit `.env`. |
| `RETRIEVER` | Để trống = Qdrant + bge-m3 (mặc định). `bm25` = truy hồi tạm bằng BM25, không cần model. |

Chọn một trong hai nguồn truy hồi:

- **Qdrant + bge-m3 (giống bản thật):**
  ```bash
  python -m core.ingest data/law/dieu.jsonl   # dựng index .qdrant/ từ vector có sẵn trong repo, khoảng 1 giây
  ```
  Truy vấn cần model `BAAI/bge-m3` (khoảng 4,3 GB) trong cache Hugging Face. Lần đầu tải: đặt `HF_HUB_OFFLINE=0`
  trong `.env`, chạy server một lần cho model tải về, rồi đặt lại `1`. Mạng chậm thì chép thư mục cache từ máy
  đã có (xem `docs/law-data-and-retrieval.md` mục 7.1).
- **BM25 (nhẹ, đủ để làm giao diện):** đặt `RETRIEVER=bm25` trong `.env`. Không cần model, không cần `.qdrant/`.
  Chất lượng truy hồi kém hơn và `score` không cùng thang với cosine (xem mục 4).

Chạy server (đứng ở thư mục gốc repo):

```bash
python -m uvicorn api.server:app --port 8000
```

Khởi động mất vài giây đến vài chục giây vì nạp model ngay lúc đầu. Thấy `Application startup complete` là xong.

| Địa chỉ | Dùng cho |
|---|---|
| http://localhost:8000 | Trang chat để test nhanh, không cần Next.js |
| http://localhost:8000/docs | Swagger: xem và gọi thử từng API |

Server dừng ngay lúc khởi động nếu thiếu `LLM_MODEL`, thiếu API key, chưa dựng index (khi dùng Qdrant) hoặc
không nạp được model. Thông báo lỗi ghi rõ thiếu gì.

## 3. API

### `POST /api/chat`

Request:

```json
{ "cau_hoi": "Thời gian thử việc tối đa là bao lâu?", "k": 3 }
```

| Trường | Kiểu | Ràng buộc |
|---|---|---|
| `cau_hoi` | string | bắt buộc, 1 đến 1000 ký tự, không được chỉ có khoảng trắng |
| `k` | int | tuỳ chọn, 1 đến 10, mặc định 5: số Điều truy hồi |

Response 200 (kết quả thật, `trich` đã rút gọn):

```json
{
  "cau_hoi": "Thời gian thử việc tối đa là bao lâu?",
  "cau_tra_loi": "Thời gian thử việc tối đa là 180 ngày đối với người quản lý doanh nghiệp; 60 ngày đối với công việc cần trình độ cao đẳng trở lên; 30 ngày đối với công việc cần trình độ trung cấp, công nhân kỹ thuật, nhân viên nghiệp vụ; và 6 ngày làm việc đối với công việc khác.",
  "trich_dan": ["Điều 25"],
  "dieu_truy_hoi": ["dieu-25", "dieu-24", "dieu-26"],
  "thoi_gian_ms": 3333,
  "chi_phi_usd": 0.0004,
  "tu_choi": false,
  "trich_dan_ngoai": [],
  "cac_dieu": [
    { "dieu": 25, "tieu_de": "Thời gian thử việc", "score": 0.7419, "trich": "Điều 25. Thời gian thử việc\nThời gian thử việc do hai bên thỏa thuận…" },
    { "dieu": 24, "tieu_de": "Thử việc", "score": 0.6125, "trich": "Điều 24. Thử việc\n1. Người sử dụng lao động…" },
    { "dieu": 26, "tieu_de": "Tiền lương thử việc", "score": 0.6025, "trich": "Điều 26. Tiền lương thử việc\n…" }
  ]
}
```

| Trường | Ý nghĩa |
|---|---|
| `cau_hoi` | Câu hỏi đã bỏ khoảng trắng hai đầu |
| `cau_tra_loi` | Câu trả lời, văn bản thuần (có thể có `\n`) |
| `trich_dan` | Căn cứ LLM ghi, dạng `"Điều N khoản K điểm x"` (phần không có thì bỏ). Rỗng khi từ chối. |
| `dieu_truy_hoi` | `chunk_id` các Điều đã truy hồi, theo thứ tự score giảm dần |
| `thoi_gian_ms` | Thời gian truy hồi + gọi LLM |
| `chi_phi_usd` | Chi phí gọi LLM; `null` nếu LiteLLM không có bảng giá của model. Là số thực, nên làm tròn khi hiển thị. |
| `tu_choi` | `true` khi câu trả lời là câu "không có quy định trực tiếp" (ngoài phạm vi luật) |
| `trich_dan_ngoai` | Số các Điều được trích nhưng không nằm trong các Điều đã truy hồi. Khác rỗng thì nên hiện cảnh báo "cần kiểm lại". |
| `cac_dieu` | Các Điều đã truy hồi: `dieu` (số), `tieu_de`, `score`, `trich` (300 ký tự đầu, có `…` nếu bị cắt) |

Lỗi:

| Mã | Khi nào | `detail` |
|---|---|---|
| 422 | Sai dữ liệu vào (rỗng, quá dài, `k` ngoài 1–10) | Danh sách lỗi của FastAPI, ví dụ `[{"type": "string_too_short", "loc": ["body", "cau_hoi"], ...}]`. Riêng câu chỉ có khoảng trắng: chuỗi `"Câu hỏi rỗng"`. |
| 502 | Gọi LLM lỗi hoặc LLM trả kết quả không đọc được | Chuỗi, ví dụ `"Không trả lời được: RuntimeError: ..."` |

### `GET /api/dieu/{so}`

Toàn văn một Điều, dùng khi người dùng bấm vào trích dẫn. 404 nếu không có Điều đó.

```json
{ "dieu": 26, "tieu_de": "Tiền lương thử việc", "noi_dung": "Điều 26. Tiền lương thử việc\nTiền lương của người lao động…", "nguon": "Bộ luật Lao động – VBHN 18/VBHN-VPQH ngày 12/02/2026" }
```

Khi `RETRIEVER=bm25`, `nguon` là `null`.

### `GET /api/health`

```json
{ "retriever": "qdrant (core.retrieve, collection labor_code__bge-m3__dieu, model BAAI/bge-m3)", "model": "openai/gpt-4.1-mini" }
```

## 4. Số đo khi test (máy Bào, CPU, `openai/gpt-4.1-mini`, Qdrant + bge-m3)

| Câu hỏi | Kết quả | Thời gian | Chi phí |
|---|---|---|---|
| Nghỉ việc phải báo trước bao nhiêu ngày? | Đúng (45 / 30 / 3 ngày làm việc), trích Điều 35 khoản 1 | 3,9 s | $0,0009 |
| Thử việc tối đa bao lâu, lương ít nhất bao nhiêu? | Đúng, trích Điều 25, 26 | 2,1 s | $0,0006 |
| Tổng thời gian nghỉ của phụ nữ có thai | Đúng, trích Điều 139 khoản 1 | 2,5 s | $0,0008 |
| Thuế thu nhập cá nhân tính thế nào? | Từ chối đúng (ngoài phạm vi) | 2,4 s | $0,0005 |

Ghi chú về `score`:
- Qdrant + bge-m3: cosine, khoảng 0 đến 1. Ở các câu trên, Điều liên quan thường trên 0,6.
- BM25: điểm không giới hạn trên, không so được với cosine. Giao diện không nên tô màu theo
  ngưỡng cố định.
- Score cao nhất không có nghĩa là Điều đúng. Ở câu "báo trước bao nhiêu ngày", Điều 205 đứng hạng 1, Điều 35
  (Điều đúng) đứng hạng 2; LLM vẫn trích đúng Điều 35 vì nó đọc nội dung.

## 5. Cắm vào giao diện `web/`: những việc phía Hiếu cần làm

Server hiện **chưa bật CORS**. Trình duyệt mở `http://localhost:3000` (Next.js) gọi thẳng
`http://localhost:8000` sẽ bị chặn. Cách đề xuất, không cần sửa backend:

- Cấu hình proxy (rewrites) trong `web/next.config.ts`: chuyển `/api/:path*` sang `http://localhost:8000/api/:path*`.
  Phía giao diện chỉ gọi đường dẫn tương đối `/api/chat`. Đọc tài liệu rewrites của đúng phiên bản Next.js trong
  `node_modules/next/dist/docs/` (xem `web/AGENTS.md`).
- Đặt địa chỉ backend bằng biến môi trường (ví dụ `API_URL`, mặc định `http://localhost:8000`), không viết cứng.
- `web/` hiện không có route nào dưới `/api`, nên proxy không đụng route sẵn có.

Gợi ý giao diện (trang chat mẫu ở `api/chat.html` làm đúng các điểm này):
- Mỗi câu trả lời hiện: nội dung, các chip trích dẫn (bấm vào thì mở toàn văn Điều qua `GET /api/dieu/{so}`;
  web đã có panel Điều luật, có thể dùng lại), danh sách Điều đã truy hồi kèm score, thời gian, chi phí.
- `tu_choi = true`: hiện rõ là câu hỏi nằm ngoài phạm vi Bộ luật Lao động.
- `trich_dan_ngoai` khác rỗng: hiện cảnh báo.
- Một câu mất khoảng 2 đến 4 giây: cần trạng thái đang chờ và khoá nút gửi.
- Lỗi 422/502: hiện `detail`. 422 thường là danh sách, 502 là chuỗi.
- Thêm kiểu dữ liệu cho response vào `web/lib/types.ts` theo bảng ở mục 3.

## 6. Giới hạn đã biết

1. **Qdrant local khoá thư mục `.qdrant/`.** Khi server đang chạy, các lệnh khác dùng index (`core.answer`,
   `core.audit`, `core.retrieve`, `scripts.check_retrieval`) không mở được. Tắt server trước khi chạy chúng.
   Muốn chạy song song thì chuyển sang Qdrant server (đặt `QDRANT_URL`). Chế độ BM25 không bị khoá.
2. **Chỉ chạy một process** (không dùng `--workers` lớn hơn 1), cũng vì lý do trên.
3. **Mỗi câu hỏi độc lập**: chưa có lịch sử hội thoại, chưa stream câu trả lời.
4. **Chưa có đăng nhập, chưa giới hạn tần suất gọi.** Mặc định server chỉ nghe ở `127.0.0.1`. Không mở ra
   mạng ngoài khi chưa có hai thứ này, vì mỗi câu hỏi tốn tiền gọi LLM.
5. **Chưa có test tự động cho `api/`.** Đã test thủ công bằng các câu ở mục 4 và qua trang chat.

## 7. Việc tiếp theo (chưa làm trong bản này)

- CORS cấu hình được (nếu muốn gọi API trực tiếp, không qua proxy của Next.js).
- Test tự động cho `api/` với truy hồi và LLM giả.
- Qdrant server (Docker) để API và các lệnh đánh giá chạy cùng lúc.
- Lịch sử hội thoại, stream câu trả lời.
- Hỏi đáp trên tài liệu riêng do người dùng tải lên.
