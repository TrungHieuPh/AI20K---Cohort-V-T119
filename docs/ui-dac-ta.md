# Đặc tả giao diện lexgate (Next.js, `web/`) – cho Hiếu

> Đọc kèm: `README.md` (mục "results.json" và "Allowed values" là chuẩn của format), `docs/aip04-de-bai.md` (đề bài).
> Mọi số và ví dụ ở đây lấy từ dữ liệu thật trong `mock/`.

## 1. UI làm gì

lexgate kiểm định chatbot luật: đưa vào CSV câu hỏi + câu trả lời của chatbot, backend (Python) kiểm **từng ý** so với
Bộ luật Lao động, gán nhãn, trích Điều/khoản làm bằng chứng, ra **cổng** `KHONG_DAT` / `CAN_XEM_LAI` / `DAT`, ghi `results.json`.

**Giai đoạn này UI chỉ ĐỌC file JSON** (không gọi Python, không nạp model, không cần backend). Deploy tĩnh được (Vercel).
Chạy kiểm định, upload, đăng nhập cần FastAPI (`api/`), làm ở giai đoạn sau (mục 6).

## 2. Dữ liệu UI dùng (đều có sẵn trong repo)

| File | Là gì | Dùng ở màn hình |
|---|---|---|
| `mock/mock_results.json` | Kết quả audit thật của 4 câu mẫu (format `results.json`) | 1, 2, 3 |
| `mock/mock_score.json` | Kết quả chấm điểm thật của dev set 10 câu (`eval/score.py --out`) | 4 |
| `data/law/dieu.jsonl` | Toàn văn 220 Điều, mỗi dòng 1 JSON (~0,34 MB) | 3 (bấm vào trích dẫn → xem Điều) |

Gợi ý: chép 3 file vào `web/public/data/` (hoặc import lúc build). `dieu.jsonl` đọc từng dòng → `Map<số Điều, Điều>`.
Cho phép **chọn/tải lên một file `results.json` khác** từ máy (đọc bằng FileReader, không gửi đi đâu) để demo kết quả mới.

## 3. Các màn hình

### Màn hình 1 – Tổng quan lượt kiểm định (`tong_ket`)

```
┌──────────────────────────────────────────────────────────────┐
│  CỔNG KIỂM ĐỊNH:  ██ KHÔNG ĐẠT ██        (4 câu đã kiểm)      │
│  Đúng 1 · Sai 2 · Không căn cứ 1 · Lỗi 0                      │
│  Faithfulness TB: 0.38 · Thời gian: 9,0 s · Chi phí: $0,002   │
└──────────────────────────────────────────────────────────────┘
```
- Thời gian = tổng `cau[].thoi_gian_ms`; chi phí = tổng `cau[].chi_phi_usd` (bỏ qua `null`). Không có sẵn trong `tong_ket`.

### Màn hình 2 – Danh sách câu (`cau[]`)

```
 #  Câu hỏi (rút gọn)                          Kết luận        Ý   Faith.  Cờ
 1  Người lao động làm hợp đồng không xác…     [ĐÚNG]          1   1.00
 2  Trong điều kiện bình thường, người lao…    [SAI]           1   0.00    ⚠ bằng chứng
 3  Người lao động làm đủ 12 tháng thì được…   [KHÔNG CĂN CỨ]  2   0.50
 4  Lao động nữ sinh con thứ hai được nghỉ…    [SAI]           1   0.00
```
- Lọc theo kết luận; bấm một dòng → màn hình 3.
- Cột "Cờ": có ý `ha_nhan` hoặc `bang_chung_khop: false` → hiện biểu tượng cảnh báo.

### Màn hình 3 – Chi tiết một câu

```
Câu 2 · [SAI] · faithfulness 0.00 · 2,4 s · $0,0005
Hỏi:      Trong điều kiện bình thường, người lao động được làm thêm tối đa bao nhiêu giờ trong một năm?
Trả lời:  Người lao động được làm thêm không quá 300 giờ trong 01 năm, theo Điều 107 Bộ luật Lao động.

┌ Ý 1 ─ [TRÁI LUẬT] ───────────────────────────────────────────┐
│ "Người lao động được làm thêm không quá 300 giờ trong 01 năm" │
│ Căn cứ: [Điều 107 khoản 2 và khoản 3]  ← bấm: mở toàn văn Điều│
│ Bằng chứng: "…không quá 200 giờ trong 01 năm, trừ trường hợp…"│
│ Giải thích: Khoản 2 quy định tối đa 200 giờ/năm…              │
│ ⚠ Bằng chứng không khớp nguyên văn luật (chỉ cảnh báo)         │
└──────────────────────────────────────────────────────────────┘
Điều đã truy hồi: 107 · 105 · 108 · 98 · 109   (bấm để xem)
```
- Bấm trích dẫn / Điều truy hồi → panel bên phải hoặc modal: `Điều N. tiêu đề` + `noi_dung` (giữ xuống dòng),
  kèm `nguon`; nếu `sua_doi` khác rỗng thì hiện dòng "Đã sửa đổi: …".
- Lấy số Điều từ chuỗi trích dẫn bằng regex `/điều\s+(\d+)/i` (ví dụ "Điều 107 khoản 2 và khoản 3" → 107);
  từ `dieu_truy_hoi` thì cắt `"dieu-107"` → 107.
- Tô đậm `bang_chung` trong toàn văn Điều nếu tìm thấy (so sánh bỏ dấu câu/khoảng trắng; không thấy thì thôi).

### Màn hình 4 – Chất lượng (dashboard, từ `mock/mock_score.json`)

```
Bắt được câu sai        5/5   100%   mục tiêu ≥ 80%   ✅
Báo nhầm câu đúng       0/5     0%   mục tiêu ≤ 7%    ✅
Trích đúng Điều         4/4   100%   mục tiêu 100%    ✅
Điều đúng trong top-5   9/9   100%   mục tiêu ≥ 90%   ✅
Ổn định 2 lần chạy     10/10  100%   mục tiêu ≥ 95%   ✅
Thời gian (20 câu)     54,5 s        mục tiêu ≤ 300 s ✅
Theo loại lỗi: sai_con_so 1/1 · luat_cu 1/1 · bia_quyen_loi 1/1 · trich_sai_dieu 1/1 · dung_mot_nua 1/1
```
- Bảng `chi_tiet`: id, nhãn thật, kết luận, kết quả (`bat_duoc` / `bo_sot` / `dung` / `bao_nham` / `loi`).
- Chỉ số `dat_muc_tieu: null` (0 câu) → hiện "không áp dụng"; `on_dinh: null` → "chưa chạy lần 2".
- Mục tiêu "tối đa" (báo nhầm) so sánh ≤, các mục khác ≥ (đã tính sẵn trong `dat_muc_tieu`).

## 4. Hiển thị nhãn (chữ tiếng Việt + màu gợi ý)

| Giá trị | Chữ hiển thị | Màu |
|---|---|---|
| `cong = KHONG_DAT` | Không đạt | đỏ |
| `cong = CAN_XEM_LAI` | Cần xem lại | cam |
| `cong = DAT` | Đạt | xanh lá |
| `ket_luan = DUNG` / `nhan = DUNG` | Đúng | xanh lá |
| `ket_luan = SAI` | Sai | đỏ |
| `nhan = TRAI_LUAT` | Trái luật | đỏ |
| `KHONG_CAN_CU` | Không căn cứ | cam/vàng |
| `ket_luan = LOI` | Lỗi (không kiểm được) | xám |

Không dùng màu làm tín hiệu duy nhất: luôn kèm chữ.

## 5. Format dữ liệu (TypeScript) và các trường hợp phải xử lý

```ts
type Nhan = "DUNG" | "TRAI_LUAT" | "KHONG_CAN_CU";
type KetLuan = "DUNG" | "SAI" | "KHONG_CAN_CU" | "LOI";
type Cong = "KHONG_DAT" | "CAN_XEM_LAI" | "DAT";

interface Y {                      // một ý trong câu trả lời
  noi_dung: string;
  nhan: Nhan;
  trich_dan: string;               // "" khi KHONG_CAN_CU
  bang_chung: string;              // "" khi KHONG_CAN_CU
  giai_thich: string;
  ha_nhan?: true;                  // CHỈ có khi hệ thống hạ DUNG → KHONG_CAN_CU (trích Điều judge không được xem)
  bang_chung_khop?: false;         // CHỈ có khi bằng chứng không khớp nguyên văn (cảnh báo, nhãn không đổi)
}

interface Cau {
  id: number | string;             // lấy từ CSV: số thì là number, còn lại string ("r01")
  cau_hoi: string;                 // chép từ CSV đầu vào (cả câu LOI)
  cau_tra_loi: string;             // câu trả lời của chatbot được kiểm
  ket_luan: KetLuan;
  loi?: string;                    // CHỈ có khi ket_luan = "LOI"
  faithfulness: number | null;     // 0..1, 2 chữ số; null khi LOI
  cac_y: Y[];                      // [] khi LOI
  dieu_truy_hoi: string[];         // ["dieu-107", ...] top-5; [] khi LOI
  thoi_gian_ms: number;
  chi_phi_usd: number | null;      // null khi LOI hoặc model chưa có bảng giá
}

interface Results {
  _ghi_chu?: string;               // chỉ có trong file mock: bỏ qua
  tong_ket: {
    so_cau: number; dung: number; sai: number; khong_can_cu: number; loi: number;
    faithfulness_tb: number | null; cong: Cong;
  };
  cau: Cau[];
}

interface Dieu {                   // một dòng của data/law/dieu.jsonl
  chunk_id: string; dieu: number; chuong: string; ten_chuong: string; muc: string;
  tieu_de: string; noi_dung: string; so_khoan: number; sua_doi: string[]; nguon: string;
}
```

Phải xử lý:
- Câu `LOI`: không có ý nào, hiện `loi` (thông báo lỗi), faithfulness "–".
- Trường tuỳ chọn (`ha_nhan`, `bang_chung_khop`, `loi`) **không có** nghĩa là bình thường.
- Trích dẫn trỏ tới Điều không tồn tại (ví dụ "Điều 999" do chatbot bịa) → hiện "Không có Điều này trong Bộ luật".
- Văn bản dài, có xuống dòng (`noi_dung` của Điều 219 dài ~7.000 ký tự) → cuộn trong panel.
- Toàn bộ chữ trên UI bằng tiếng Việt.

## 6. Giai đoạn sau (cần FastAPI `api/`, chưa làm)

Theo đề AIP-04: đăng nhập ≥ 2 vai trò (**Kỹ sư RAG**, **Chủ dữ liệu**), upload tài liệu, chạy kiểm định từ web, dashboard
chất lượng, duyệt cấu hình (HITL). Hợp đồng API sẽ thống nhất khi làm `api/`; UI nên tách phần **đọc dữ liệu** thành một module
(`lib/data.ts`) để sau chỉ đổi từ "đọc file" sang "gọi API".

## 7. Ghi chú

- Từ 14/11/2026 mỗi `cau` trong `results.json` có `cau_hoi`, `cau_tra_loi` (đứng ngay sau `id`); `mock/mock_results.json` đã
  cập nhật. File `results.json` cũ hơn ngày này không có hai trường đó: hiện "(không có nội dung câu hỏi)" thay vì lỗi.
