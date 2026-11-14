# Agent tự tối ưu cấu hình cổng kiểm định (`eval/optimize.py`) – thiết kế

## Mục đích
Phần lõi đề AIP-04: "agent tự thử nghiệm nhiều cấu hình … và đề xuất tối ưu, HITL duyệt cấu hình, memory lưu cấu hình tốt nhất",
"tối ưu đa mục tiêu trên đường biên Pareto (Chi phí × Độ trễ × Chất lượng)", "mọi thay đổi … kiểm định định lượng trên tập dữ liệu
giữ riêng (held-out regression gate) trước khi áp dụng".

Vĩnh chọn: **tối ưu cổng kiểm định (audit)** trước (phương án A), **cách 1: chạy thử toàn bộ cấu hình, chọn theo quy tắc rõ ràng**.
Để sẵn chỗ cắm bước LLM chẩn đoán (cách 3) cho sau.

## Không làm lần này
- LLM tự chọn cấu hình kế tiếp (LangGraph); bước LLM chẩn đoán (chỉ để chỗ cắm).
- Hybrid, reranker, đổi cách chunk (cần Bào bổ sung `retrieve()` / ingest).
- Tối ưu chatbot hỏi đáp (phương án B) – dùng lại khung này sau.
- Giao diện web / API.

## Anti-goals
- Không được chọn cấu hình chỉ vì rẻ nếu nó không đạt mục tiêu chất lượng.
- Không được tự áp dụng cấu hình khi chưa có người duyệt hoặc chưa qua cổng.
- Không được vượt ngân sách chi phí đã đặt.

## Không gian cấu hình (18 cấu hình)
| Nút | Giá trị |
|---|---|
| `k` (số Điều truy hồi) | 3, 5, 8 |
| `retriever` | `qdrant` (bge-m3, `core.retrieve`), `bm25` (`core.retrieve_bm25`) |
| `model` (LLM judge) | `openai/gpt-4o-mini`, `openai/gpt-4.1-mini`, `openai/gpt-4.1` |
Mã cấu hình: `k5-qdrant-gpt-4.1-mini` (bỏ tiền tố nhà cung cấp). Danh sách giá trị đọc được từ tham số dòng lệnh để thu hẹp.

## Dữ liệu
- **Tập chạy thử:** `data/test/dev_set.csv` + `data/test/dev_set_dap_an.csv` (10 câu, 5 đúng / 5 sai).
- **Tập giữ lại (cổng hồi quy):** `data/demo/demo_samples.csv` (5 câu) + đáp án mới `data/demo/demo_samples_dap_an.csv`
  (1 DUNG; 2 SAI sai_con_so 107; 3 KHONG_CAN_CU bia_quyen_loi; 4 SAI luat_cu 139; 5 SAI trich_sai_dieu 26).
  **Hạn chế ghi rõ trong báo cáo:** tập này nhỏ và đã được nhóm xem, chưa phải test set kín; khi Khoa có test set kín thì cổng
  dùng test set kín (chỉ cần đổi tham số).

## Thay đổi cần trong `core/audit.py` (chỉ thêm, giữ hành vi mặc định)
- `audit_one(..., k=SO_DIEU_TRUY_HOI)`: `k` thành tham số (hiện cố định 5).
- `chon_nguon(ten=None)`: `ten` (`"qdrant"`/`""`/`"bm25"`) thay cho đọc `RETRIEVER` khi được truyền.
- `tao_llm(model) -> llm_fn`: giống `_llm_mac_dinh` nhưng dùng `model` truyền vào (temperature 0, chi phí qua LiteLLM).
- **Cấu hình đang dùng ("memory"):** nếu có file `cau_hinh_dang_dung.json` ở gốc repo thì `python -m core.audit` dùng `k`,
  `retriever`, `model` trong đó (ghi rõ ra log "Cấu hình: …"); không có file thì như hiện nay (`.env`, k=5).

## Quy trình (dòng lệnh)
1. **Thử nghiệm:** `python -m eval.optimize thu [--k 3,5,8] [--retriever qdrant,bm25] [--model ...] [--toi-da-usd 2]`
   - Chạy audit cho từng cấu hình trên tập chạy thử (một process; mỗi nguồn truy hồi chuẩn bị/chạy thử một lần; kiểm cấu hình LLM).
   - Chấm bằng `eval.score.score`. Mỗi cấu hình ghi `results_toi_uu/<lượt>/<mã cấu hình>.json` (kết quả audit) .
   - **Ngân sách:** cộng dồn `chi_phi_usd`; vượt `--toi-da-usd` thì dừng, các cấu hình còn lại ghi "bỏ qua (hết ngân sách)".
     Cấu hình lỗi (vd model không dùng được) ghi lỗi và chạy tiếp.
   - Ghi `results_toi_uu/<lượt>/ket_qua.json` và `bao_cao.md`, in bảng ra màn hình.
2. **Đề xuất** (ngay cuối bước 1): bảng các cấu hình + Pareto + đề xuất (quy tắc bên dưới), ghi `de_xuat` trong `ket_qua.json`.
3. **Duyệt (HITL):** `python -m eval.optimize duyet <lượt> <mã cấu hình> --nguoi-duyet "Tên"`
   - Người chạy lệnh này là người duyệt (ghi tên). Có thể duyệt cấu hình khác cấu hình được đề xuất.
   - Chạy **cổng hồi quy "không kém hơn"** (Vĩnh chọn phương án b): chạy **cấu hình mới** và **cấu hình đang dùng**
     (chưa có `cau_hinh_dang_dung.json` thì là mặc định `k5-qdrant-gpt-4.1-mini`) trên tập giữ lại, **mỗi cấu hình 2 lần**.
     Qua cổng khi cả hai điều sau đúng: (1) ở **mỗi lần chạy**, số câu gắn cờ đúng của cấu hình mới ≥ của cấu hình đang dùng
     (so lần 1 với lần 1, lần 2 với lần 2); (2) số câu đổi kết luận giữa 2 lần của cấu hình mới ≤ của cấu hình đang dùng.
     Duyệt lại đúng cấu hình đang dùng thì vẫn chạy (so với chính nó, luôn qua) để có số đo cổng.
   - Qua cổng → ghi `cau_hinh_dang_dung.json` và **thêm một dòng** vào
     `lich_su_cau_hinh.jsonl` (thời gian, người duyệt, cấu hình, chỉ số tập chạy thử, chỉ số cổng, lượt).
   - Không qua → không đổi gì, in chỉ số nào trượt, vẫn ghi lịch sử với kết quả "không qua cổng".

## Chỉ số và quy tắc
- Mỗi cấu hình: các chỉ số của `score` (bắt được, báo nhầm, trích đúng Điều, truy hồi đúng, thời gian quy về 20 câu,
  chi phí, faithfulness_tb) + **chất lượng** = số câu gắn cờ đúng / tổng câu (câu sai bị bắt + câu đúng không báo nhầm; LOI tính sai).
- **Pareto:** cấu hình A trội hơn B khi A không kém B ở cả ba (chất lượng cao hơn hoặc bằng, chi phí và thời gian thấp hơn hoặc bằng)
  và tốt hơn ở ít nhất một. Cấu hình không bị cấu hình nào trội là "trên đường Pareto".
- **Đề xuất:** trong các cấu hình đạt mọi mục tiêu MVP đo được ở tập chạy thử (bắt được, báo nhầm, trích đúng Điều, truy hồi đúng,
  thời gian), chọn **chi phí thấp nhất**; bằng nhau → thời gian thấp nhất; bằng nhau → chất lượng cao nhất; bằng nhau → thứ tự trong lưới.
  Không cấu hình nào đạt → đề xuất cấu hình chất lượng cao nhất, ghi rõ "chưa đạt mục tiêu" (vẫn phải duyệt và qua cổng mới áp dụng).
- Ổn định chỉ đo ở cổng (chạy 2 lần), không đo ở bước thử để tiết kiệm.

## Báo cáo (`bao_cao.md` và màn hình)
```
Lượt 20261114-2130 · tập chạy thử: dev_set (10 câu) · 18 cấu hình · chi phí 0,41 USD
Mã cấu hình                 Chất lượng  Bắt  Nhầm  Trích  Truy hồi  Thời gian  Chi phí   Pareto  Đạt MT
k5-qdrant-gpt-4.1-mini        1.00      5/5  0/5   4/4    9/9       54 s       $0,011     ★       ✓
...
ĐỀ XUẤT: k3-qdrant-gpt-4o-mini – rẻ nhất trong 7 cấu hình đạt mục tiêu.
Duyệt: python -m eval.optimize duyet 20261114-2130 k3-qdrant-gpt-4o-mini --nguoi-duyet "..."
```

## Chỗ cắm cho sau
- `chan_doan(ket_qua) -> str | None`: hiện trả `None`; sau này gọi LLM đọc các câu bỏ sót/báo nhầm và viết gợi ý vào báo cáo.

## Các điểm Claude tự quyết sau khi người đọc thử hỏi (sửa được)
- **Đáp án tập giữ lại** `data/demo/demo_samples_dap_an.csv` do Claude ghi theo các câu demo đã chạy (đã đối chiếu VBHN 18):
  `1,DUNG,,35` · `2,SAI,sai_con_so,107` · `3,KHONG_CAN_CU,bia_quyen_loi,` (không có Điều đúng → không tính trích dẫn/truy hồi) ·
  `4,SAI,luat_cu,139` · `5,SAI,trich_sai_dieu,26`; cột `ghi_chu` kèm căn cứ.
- **Chi phí không rõ** (có câu `chi_phi_usd = null`, model chưa có bảng giá): cấu hình ghi "chi phí chưa rõ", không được coi là rẻ nhất,
  xếp sau mọi cấu hình có chi phí rõ khi đề xuất; ngân sách cộng phần biết được và in cảnh báo.
- **Ngân sách:** kiểm **trước** mỗi cấu hình (đã tiêu ≥ ngân sách thì dừng), nên cấu hình cuối có thể vượt một chút. Lệnh `duyet`
  có ngân sách riêng `--toi-da-usd` mặc định 1 USD. Ước tính lưới ~0,4 USD từ số thật: dev 10 câu với gpt-4.1-mini = 0,011 USD;
  gpt-4.1 khoảng ×5, gpt-4o-mini khoảng ×0,4.
- **Đo thời gian:** trước vòng lặp, chuẩn bị và chạy thử mọi nguồn truy hồi (nạp bge-m3, dựng BM25) để cấu hình đầu không bị tính thời gian nạp.
  Chạy hết cấu hình `qdrant` rồi mới `bm25`; đóng Qdrant client trong `finally` ở cả `thu` và `duyet`.
- **`truy_hoi_dung` theo đúng `k` của cấu hình** (Điều đúng có trong các Điều judge được xem), không ép top-5: đó là điều judge thật sự thấy.
  Mục tiêu ≥ 90% giữ nguyên; `k=3` khó hơn là đúng bản chất.
- **`dat_muc_tieu = None`** (chỉ số có 0 câu áp dụng) tính là "không áp dụng" = không chặn.
- **Không chạy tiếp lượt cũ:** mỗi lần `thu` tạo lượt mới, mã lượt theo giây (`20261114-213045`, trùng thì thêm `-2`).
  `duyet` báo lỗi nếu mã cấu hình không có trong lượt hoặc cấu hình đó lỗi/bị bỏ qua.
- **Trượt cổng:** không đổi cấu hình đang dùng; báo cáo in thêm các cấu hình đạt mục tiêu kế tiếp để người duyệt chọn và chạy `duyet` lại.
- **Ưu tiên cấu hình:** `core.audit.main` đọc `cau_hinh_dang_dung.json` nếu có; giá trị trong file **ghi đè** `.env` cho `k`,
  `retriever`, `model` (kể cả kiểm API key theo model trong file). `run_audit` nhận thêm tham số `k`, `retriever`, `model`
  (mặc định như cũ) và truyền xuống `_chuan_bi_audit`; chỉ `main` đọc file, hàm thư viện không tự đọc.

## Các điểm Claude tự quyết (sửa được)
- Module `eval/optimize.py` (thuộc phần đánh giá, cạnh `score.py`); thư mục kết quả `results_toi_uu/` thêm vào `.gitignore`;
  `cau_hinh_dang_dung.json` và `lich_su_cau_hinh.jsonl` **được commit** (là cấu hình chính thức và lịch sử duyệt).
- Ngân sách mặc định 2 USD (ước tính cả lưới ~0,5 USD).
- Chất lượng tính theo tỉ lệ gắn cờ đúng để có một con số cho Pareto; chi tiết vẫn giữ các chỉ số của `score`.

## Kiểm thử (viết trước, retrieve/LLM giả)
- Lưới cấu hình và mã cấu hình; thu hẹp bằng tham số.
- Pareto: ví dụ tay với 4 cấu hình (một trội hẳn, hai cân bằng, một bị trội).
- Quy tắc đề xuất: rẻ nhất trong nhóm đạt; hoà → nhanh hơn; không ai đạt → chất lượng cao nhất + cờ "chưa đạt".
- Ngân sách: vượt thì dừng và ghi "bỏ qua"; cấu hình lỗi không làm dừng lượt.
- Duyệt: qua cổng → ghi `cau_hinh_dang_dung.json` + thêm 1 dòng lịch sử; không qua → không ghi cấu hình, vẫn ghi lịch sử.
- `core.audit`: `k` truyền xuống retrieve; `chon_nguon(ten)`; `tao_llm(model)` dùng đúng model; có file cấu hình thì `main` dùng nó.
