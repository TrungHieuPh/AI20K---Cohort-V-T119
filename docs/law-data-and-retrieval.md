# Dữ liệu luật và truy hồi (vector DB): đã làm gì, dùng thế nào

> **Đọc file này nếu bạn là agent hoặc thành viên team cần dùng `core/ingest.py` / `core/retrieve.py`.**
> Nhánh: `feat/retrieval` (tách từ `develop`). Ngày: 14/11/2026. Ngày chốt dữ liệu luật: **14/11/2026**.
> Phụ trách dữ liệu luật và retrieval: **Nguyễn Khắc Bào**. Dữ liệu tách điều (`dieu.jsonl`, `split_law.py`) do Vĩnh chuẩn bị.

---

## 1. Tóm tắt ngắn

- Toàn văn **Bộ luật Lao động 2019, bản hợp nhất 18/VBHN-VPQH ngày 12/02/2026** đã được tách thành **220 điều**, mỗi điều một dòng trong `data/law/dieu.jsonl`.
- 220 điều đó được embed bằng **`BAAI/bge-m3`** (chạy local trên CPU) và lưu vào **Qdrant local mode**, collection `labor_code__bge-m3__dieu`.
- Có 2 hàm cho phần audit:
  - `retrieve(query, k=5)`: tìm các điều liên quan nhất tới câu hỏi.
  - `get_article("Điều 35")`: lấy thẳng một điều theo số.
- Kiểm tra nhanh trên 20 câu hỏi: **Hit@1 = 19/20, Hit@3 = 20/20, MRR = 0,975**.
- Nạp lại index không bị nhân đôi. Mỗi lần dựng index mất khoảng **11 phút** trên CPU.

### Mỗi người cần biết gì
| Thành viên | Điều cần biết |
|---|---|
| **Vĩnh** (`core/audit.py`) | Gọi `retrieve()` để lấy căn cứ và `get_article()` để kiểm tra điều mà chatbot trích dẫn. Kết quả trả về là dict, xem mục 6. Không mở index từ 2 process cùng lúc (mục 8). |
| **Khoa** (test set, `eval/`) | Luật là bản hợp nhất 2026: Điều 139 đã sửa (sinh con thứ hai được nghỉ **07 tháng**, hiệu lực 01/07/2026). Test set chỉ nên hỏi những gì Bộ luật trả lời được, vì nghị định chưa được index. Xem qua `data/test/retrieval_smoke.csv` để tránh trùng với test set kín. |
| **Hiếu** (`app/`) | UI chỉ nên đọc `results.json`, không nạp model trong app. bge-m3 cùng torch tốn khoảng 2.5–3 GB RAM, nhiều khả năng vượt giới hạn của Streamlit Community Cloud. Muốn hiện toàn văn điều luật thì đọc `data/law/dieu.jsonl` (trường `noi_dung`). |
| **Cả team** | Format "Law chunk" trong README đã đổi, theo đúng file của Vĩnh. Báo cả nhóm trước khi merge vào `develop`. |

---

## 2. Nguồn dữ liệu và phiên bản luật

- **Văn bản dùng làm chuẩn:** 18/VBHN-VPQH (Văn phòng Quốc hội, 12/02/2026). Đây là bản hợp nhất của Bộ luật Lao động 45/2019/QH14 (hiệu lực từ 01/01/2021) với 3 luật sửa đổi:

  | Luật sửa đổi | Điều bị sửa | Hiệu lực |
  |---|---|---|
  | Luật Công nghiệp công nghệ số 71/2025/QH15 | Điều 154: bổ sung **khoản 8a** (nhân lực công nghệ số chất lượng cao không cần giấy phép lao động) | 01/01/2026 |
  | Luật Giáo dục nghề nghiệp 124/2025/QH15 | Điều 59 (một điểm), Điều 61 (một khoản) | 01/01/2026 |
  | Luật Dân số 113/2025/QH15 | Điều 139 khoản 1: nghỉ thai sản, con thứ hai **07 tháng** | 01/07/2026 |

- **Vì sao không dùng bản gốc 45/2019?** Câu trả lời của chatbot phải được chấm theo luật **đang có hiệu lực**. Dùng bản gốc thì câu "con thứ hai nghỉ 07 tháng" (đúng theo luật hiện hành) sẽ bị chấm là sai.
- **Tầng dữ liệu:**
  - Hiện chỉ index **Bộ luật**.
  - Dự kiến tuần 2 mới thêm nghị định: NĐ 145/2020 (điều kiện lao động và quan hệ lao động), NĐ 293/2025 (lương tối thiểu vùng từ 01/01/2026), NĐ 135/2020 (tuổi nghỉ hưu).
  - Hệ quả: câu trả lời đúng theo nghị định nhưng Bộ luật không nói tới có thể bị judge gán `KHONG_CAN_CU`.
- **Pháp lý:** văn bản quy phạm pháp luật không thuộc đối tượng bảo hộ quyền tác giả (Điều 15 Luật SHTT), nên được lưu trong repo.
- **Nguồn file:** `data/law/18_VBHN-VPQH.doc`. Tên file gốc có mã 695336, trùng mã văn bản trên thuvienphapluat.vn. Nội dung đã đối chiếu với tên và số hiệu văn bản trên Công báo (congbao.chinhphu.vn).

---

## 3. Quy trình dữ liệu

```
data/law/18_VBHN-VPQH.doc
  │  (Vĩnh chuyển sang .txt, xem mục 10)
  ▼
data/law/bo-luat-lao-dong-vbhn18.txt
  │  scripts/split_law.py          (tách "Điều N." đầu dòng, bỏ ký hiệu chú thích [n],
  │                                 chuyển ghi chú sửa đổi vào trường sua_doi)
  ▼
data/law/dieu.jsonl                (220 dòng, 1 dòng = 1 điều)
  │  python -m core.ingest data/law/dieu.jsonl
  │    - kiểm tra trường bắt buộc, chunk_id không trùng, chuẩn hoá Unicode NFC
  │    - ghép văn bản embed = "Bộ luật Lao động\nChương …\nMục …\n" + noi_dung
  │    - bge-m3 → vector 1024 chiều, đã chuẩn hoá, metric cosine
  │    - upsert vào Qdrant với id = uuid5(chunk_id); xoá điểm có chunk_id không còn trong file
  ▼
.qdrant/  (collection labor_code__bge-m3__dieu, git-ignored, mỗi máy tự dựng)
  │
  ▼
core/retrieve.py: retrieve(query, k), get_article(dieu)
```

Lệnh tái tạo `dieu.jsonl` từ file .txt (chỉ cần khi file nguồn thay đổi):
```bash
python scripts/split_law.py data/law/bo-luat-lao-dong-vbhn18.txt data/law/dieu.jsonl
```

---

## 4. Kiểm tra chất lượng `dieu.jsonl` (đã làm)

| Kiểm tra | Kết quả |
|---|---|
| Số điều | 220, liên tục từ 1 đến 220, không trùng, đủ 17 chương |
| Unicode | Toàn bộ đã chuẩn NFC |
| Ký hiệu chú thích `[n]` | Không còn sót |
| Dòng rác (header, footer, "Nơi nhận") | Không có |
| Điều ngắn nhất | 101 ký tự (Điều 106). Đây là nội dung thật, không phải lỗi tách |
| Độ dài | Trung vị khoảng 700 ký tự. Dài nhất là Điều 219 với 7.247 ký tự (khoảng 2k token), vẫn nằm trong giới hạn 8.192 token của bge-m3. Tổng 187k ký tự |
| Đối chiếu tay | Điều 25, 35, 107, 112, 113, 169 khớp nội dung luật |
| `sua_doi` | Có ở đúng 4 điều 59, 61, 139, 154, khớp phần đầu của VBHN |
| `so_khoan = 0` (37 điều) | Đúng, vì các điều này chỉ có một đoạn (vd Điều 23, 77) |
| `muc` rỗng (62 điều) | Đúng, vì nhiều chương không chia mục |

**Trường hợp đặc biệt: Điều 219** ("Sửa đổi, bổ sung một số điều của các luật có liên quan đến lao động").
- Điều này chép nguyên văn các đoạn sửa Luật BHXH 2014 và Bộ luật Tố tụng dân sự 2015, có cả "Điều 54", "Điều 55" của luật khác. Luật BHXH 2014 nay đã được thay bằng luật mới.
- Nếu để nguyên, câu hỏi về lương hưu dễ kéo Điều 219 lên top và judge sẽ trích nhầm.
- **Cách xử lý:** gắn cờ `chi_tham_chieu = true`. `retrieve()` mặc định **loại** điều này, còn `get_article(219)` vẫn trả về bình thường.
- Ngoài ra, `so_khoan` của Điều 219 bị đếm lẫn khoản của luật khác. Trường này không dùng cho retrieval nên bỏ qua.

---

## 5. Các quyết định kỹ thuật và lý do

| Quyết định | Lý do | Phương án đã cân nhắc |
|---|---|---|
| **Qdrant local mode** (`qdrant-client`, lưu ở `.qdrant/`) | Chỉ cần `pip install`, không cần Docker (máy dev chưa cài Docker). Mỗi thành viên tự chạy được. Có lọc payload. Có sẵn sparse vector và hybrid cho giai đoạn tối ưu AIP-04. Lên server chỉ cần đổi `QDRANT_URL` | pgvector (starter Lab Day 06): cần Docker, và Postgres không có full-text tiếng Việt. Chroma: hybrid yếu |
| **Embedding `BAAI/bge-m3`, local, CPU** | Đa ngôn ngữ, tiếng Việt tốt. Nhận tới 8.192 token nên đủ cho điều dài nhất. Miễn phí, văn bản không phải gửi ra ngoài | Embedding qua API (tốn phí, phải gửi dữ liệu). `AITeamVN/Vietnamese_Embedding` (để so sánh sau). `vietnamese-bi-encoder` (giới hạn khoảng 256 token, phải tách từ, không hợp với điều luật dài) |
| **1 chunk = 1 điều** | Khớp đúng đơn vị trích dẫn của judge ("Điều 35 khoản 1 điểm a"). `noi_dung` giữ nguyên số khoản và ký hiệu điểm | Chunk theo khoản: để dành làm thí nghiệm ở giai đoạn tối ưu |
| **Header ngữ cảnh trong văn bản embed** (tên chương và mục) | Câu hỏi đời thường hay dùng từ của tên chương ("hợp đồng", "thời giờ nghỉ ngơi"). Header chỉ dùng khi embed, `noi_dung` vẫn giữ nguyên để hiển thị | Không có header |
| **Point id = `uuid5(chunk_id)`**, xoá điểm cũ không còn trong file | Ingest lại không nhân đôi. Sửa file thì index tự đồng bộ | Id ngẫu nhiên |
| **Không fallback** | Model hoặc DB lỗi thì báo lỗi luôn, không âm thầm trả vector giả hay kết quả rỗng (cùng nguyên tắc với Lab Day 06) | |
| **Tên collection chứa tên model** | Đổi model hoặc cách chunk thì tạo collection mới, so sánh được với cấu hình cũ, không ghi đè | |

---

## 6. API cho các module khác

```python
from core.retrieve import retrieve, get_article

hits = retrieve("Nghỉ việc phải báo trước bao nhiêu ngày?", k=5)
# list[dict], sắp xếp theo score giảm dần

art = get_article("Điều 35 khoản 1 điểm a")   # nhận 35, "35", "Điều 35", "Điều 35 khoản 1 điểm a"
# dict hoặc None nếu không có điều đó
```

**Mỗi dict có các trường sau** (từ `dieu.jsonl` cộng với trường do ingest thêm):

| Trường | Kiểu | Ý nghĩa |
|---|---|---|
| `chunk_id` | str | `"dieu-35"` |
| `chuong`, `ten_chuong` | str | `"III"`, `"HỢP ĐỒNG LAO ĐỘNG"` |
| `muc` | str | `"Mục 3. CHẤM DỨT HỢP ĐỒNG LAO ĐỘNG"` hoặc `""` |
| `dieu` | int | 35 |
| `tieu_de` | str | Tên điều |
| `noi_dung` | str | **Toàn văn điều**, bắt đầu bằng `"Điều 35. <tiêu đề>\n"`, mỗi khoản và điểm nằm trên một dòng |
| `so_khoan` | int | Số khoản |
| `sua_doi` | list[str] | Ghi chú sửa đổi của VBHN (rỗng nếu điều không bị sửa) |
| `nguon` | str | `"Bộ luật Lao động – VBHN 18/VBHN-VPQH ngày 12/02/2026"` |
| `chi_tham_chieu` | bool | `true` chỉ với Điều 219 *(do ingest thêm)* |
| `embed_model`, `nguon_file` | str | Truy vết *(do ingest thêm)* |
| `score` | float | Độ tương đồng cosine, chỉ có trong kết quả của `retrieve()` |

`retrieve(query, k, include_reference=True)` sẽ tìm cả Điều 219.

**Gợi ý cho `audit.py`:**
- Khi câu trả lời của chatbot **trích một số điều cụ thể**, gọi `get_article()` cho điều đó, đừng chỉ dựa vào `retrieve()`. Đây là cách bắt được loại lỗi "trích sai điều".
- `score` tuyệt đối không nên dùng làm ngưỡng cứng. Ví dụ, câu hỏi về lương hưu có điểm top-1 khoảng 0,65. Hãy dựa vào thứ hạng.

---

## 7. Cài đặt và chạy

Yêu cầu: Python 3.11+ (đã test trên **3.12, Windows, CPU, 16 GB RAM**).

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate    macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt       # torch khá nặng, mạng chậm có thể mất 20–30 phút
cp .env.example .env                  # dùng giá trị mặc định là chạy được
python -m core.ingest data/law/dieu.jsonl
```

| Bước | Thời gian đo được |
|---|---|
| Lần đầu chạy ingest (gồm tải bge-m3 khoảng 2.2 GB vào cache Hugging Face) | khoảng 16,5 phút |
| Các lần ingest sau (chỉ embed 220 điều trên CPU) | khoảng 11 phút |
| `check_retrieval` 20 câu (gồm cả nạp model) | khoảng 1 phút |

Lệnh kiểm tra:
```bash
python -m core.retrieve "nghỉ việc phải báo trước bao nhiêu ngày" -k 5
python -m core.retrieve --dieu 154
python -m scripts.check_retrieval data/test/retrieval_smoke.csv     # in Hit@k và ghi results_retrieval.json
```

Biến trong `.env` (xem `.env.example`): `EMBED_MODEL`, `QDRANT_PATH`, `QDRANT_COLLECTION`, `QDRANT_URL`, `QDRANT_API_KEY`. Version các gói đã ghim trong `requirements.txt`: qdrant-client 1.20.0, sentence-transformers 6.3.0, torch 2.15.0, transformers 5.23.0.

Nếu máy không có mạng sau lần tải đầu, đặt `HF_HUB_OFFLINE=1` để dùng model đã có trong cache.

---

## 8. Giới hạn và rủi ro đã biết

1. **Qdrant local mode khoá thư mục `.qdrant/`.** Mỗi lúc chỉ một process mở được. Đang chạy `core.audit` thì không chạy `core.retrieve` hay Streamlit dùng chung index được. Khi lên FastAPI ở tuần 2, chuyển sang Qdrant server (Docker) bằng cách đặt `QDRANT_URL`.
2. **Mỗi máy phải tự dựng index** (khoảng 11 phút) và tải model (2.2 GB). `.qdrant/` không commit. Có thể nén `.qdrant/` gửi cho nhau, nhưng vẫn phải có model để embed câu hỏi.
3. **Chưa có nghị định**, nên câu hỏi về lương tối thiểu vùng hay cách tính trợ cấp chi tiết sẽ không tìm được căn cứ.
4. **Bộ smoke test nhỏ** (20 câu, do người làm retrieval tự soạn, diễn đạt khá sát luật). Kết quả 19/20 chỉ cho thấy pipeline chạy đúng, chưa phải đánh giá chất lượng. Đánh giá thật dùng test set kín của Khoa.
5. **Câu duy nhất không đứng đầu** (r18, "sa thải lao động nữ đang mang thai"): Điều 138 (quyền đơn phương chấm dứt, tạm hoãn HĐLĐ của lao động nữ mang thai) đứng trên Điều 137 và 37. Điều 138 cũng liên quan, nên judge vẫn nhận được đủ căn cứ trong top-5.
6. Thông báo lỗi `QdrantClient.__del__ … Python is likely shutting down` khi thoát là cảnh báo vô hại. Các lệnh CLI đã gọi `close()` để tránh nó. Nếu tự viết script, gọi `get_client().close()` ở cuối.

---

## 9. Thay đổi trên nhánh `feat/retrieval`

| File | Thay đổi |
|---|---|
| `core/vectordb.py` | **Mới.** Settings (đọc `.env`), class `Embedder`, `get_client()`, `point_id()` |
| `core/ingest.py` | `build_index(law_path, recreate=False)` và CLI |
| `core/retrieve.py` | `retrieve()`, `get_article()` và CLI |
| `scripts/split_law.py` | Script tách điều của Vĩnh (chép nguyên) |
| `scripts/check_retrieval.py` | **Mới.** Đo Hit@1/3/5 và MRR, ghi trace |
| `data/law/` | `18_VBHN-VPQH.doc`, `bo-luat-lao-dong-vbhn18.txt`, `dieu.jsonl` |
| `data/test/retrieval_smoke.csv` | 20 câu dùng làm dev set cho retrieval (`id, cau_hoi, dieu_dung`, nhiều đáp án ngăn bằng `\|`) |
| `requirements.txt`, `.env.example` | Ghim version, cấu hình mẫu |
| `README.md` | Phiên bản luật, flow, sơ đồ repo, lệnh chạy, format chunk |
| `docs/law-data-and-retrieval.md` | File này |

Không commit: `.qdrant/`, `.venv/`, `.env`, `results*.json` (đã có trong `.gitignore`). Không commit `bo-luat-lao-dong-danh-sach-dieu.xlsx`, bảng hỗ trợ soạn câu hỏi của Vĩnh. File này giữ ngoài repo, gửi riêng cho Khoa.

---

## 10. Việc còn mở

- [ ] **Vĩnh:** ghi lại cách chuyển `.doc` sang `.txt` (Word "Save as" .txt UTF-8? công cụ nào?) để tái lập được.
- [ ] **Khoa:** xem `retrieval_smoke.csv` để đảm bảo không trùng test set kín. Thống nhất phạm vi câu hỏi là chỉ trong Bộ luật, tính theo luật tại ngày 14/11/2026.
- [ ] **Cả team:** đồng ý format chunk mới trong README trước khi merge vào `develop`.
- [ ] Tuần 2: thêm nghị định (sửa `split_law.py`: số chú thích đang cố định từ 2 đến 6, và `chunk_id` cần thêm tiền tố văn bản để không trùng `dieu-35` giữa các văn bản). So sánh embedding model khác và hybrid search (dense + sparse của bge-m3). Chuyển Qdrant sang server.

---

## Ghi chú cho agent đọc file này

- Đừng đổi tên hay xoá trường trong `dieu.jsonl` / payload: `audit.py`, `eval/` và UI phụ thuộc vào chúng. Muốn thêm thì thêm trường mới, và báo team.
- Đổi embedding model hoặc cách chunk thì **đổi `QDRANT_COLLECTION`** (vd `labor_code__<model>__<chunk>`), đừng ghi đè collection hiện có.
- Mọi truy vấn phải dùng cùng model với lúc ingest (`embed_model` trong payload cho biết model nào).
- Không tạo câu hỏi kiểm tra từ test set kín (`data/test/test_set*.csv`, `answer_key*.csv`), vì các file đó cố tình không có trong repo.
- Khi giải thích cho team, các con số trong file này (220 điều, 19/20, khoảng 11 phút) là số **đo thật ngày 14/11/2026** trên một máy Windows CPU. Máy khác sẽ cho thời gian khác.
