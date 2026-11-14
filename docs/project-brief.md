# Project brief: zero-one-lexgate (AIP-04)

> Đọc file này trước mọi việc. Nó giải thích **vì sao** làm đề tài này, **mentor muốn gì**, **Chủ nhật cần show gì**, và **hiện đang ở đâu**. Chi tiết kỹ thuật (format, chữ ký hàm) vẫn lấy theo `README.md`, phần retrieval lấy theo `docs/law-data-and-retrieval.md`. Nếu ba file mâu thuẫn nhau thì hỏi Vĩnh, không tự chọn.

## 1. Bối cảnh

- Chương trình: **AI Thực chiến** (Vingroup / VinUni). Nhóm **Zero One Team (#119)**, 4 người, khoảng 4 tuần.
- Đề tài: **AIP-04 – AI Agent RAG Platform tự đánh giá & tối ưu chất lượng truy hồi**.
- Tên sản phẩm: **lexgate**, một cổng kiểm định chatbot pháp lý trước khi đưa ra thị trường.

## 2. Góp ý của mentor (đây là yêu cầu gốc)

- Chọn lĩnh vực **pháp lý**, cụ thể là tư vấn luật. Dữ liệu là văn bản luật: rõ ràng, công khai, dễ tải.
- Vấn đề thật: chatbot pháp lý của một công ty, hay của một công ty luật, nếu bị ảo giác và tư vấn sai điều khoản thì công ty có thể phải đền bù hàng tỷ đồng. Vì vậy doanh nghiệp cần một **công cụ kiểm định chatbot trước khi tung ra**.
- **MVP mentor đề xuất:**
  1. Tải lên văn bản **Bộ luật Lao động**.
  2. Soạn **20 câu hỏi kèm 20 câu trả lời** xoay quanh bộ luật đó. Trong đó **cố tình cài 5 câu trả lời sai luật**.
  3. Đưa file này vào ứng dụng demo. Ứng dụng phải **phát hiện được 5 câu sai** đó.

Mọi thứ nhóm làm đều phải phục vụ đúng kịch bản này. Tính năng nào không giúp phát hiện 5 câu sai thì để sau.

## 3. Mục tiêu buổi Chủ nhật

**Không phải nộp sản phẩm hoàn chỉnh.** Mục tiêu là cho mentor thấy nhóm **đã đi đúng hướng** và có một luồng chạy thật từ đầu tới cuối.

Phải có (theo thứ tự ưu tiên):
1. **Dữ liệu luật đã xử lý:** bản hợp nhất 18/VBHN-VPQH, 220 Điều, mỗi Điều là một chunk. *(Đã xong, Bào.)*
2. **Truy hồi thật:** nhập câu hỏi, ra top-5 Điều đúng (bge-m3 + Qdrant local). *(Đã xong, Bào. Hit@1 19/20, Hit@3 20/20 trên tập smoke.)*
3. **Kiểm định thật một câu:** `audit_one` gọi LLM thật, ra nhãn từng ý, trích Điều/khoản và đoạn bằng chứng. *(Code và test xong, Vĩnh. **Chưa chạy với LLM và retrieve thật.**)*
4. **Chạy cả file:** `run_audit` trên tập dev 10 câu, ra `results.json` có `tong_ket` và cổng 3 mức. *(Code xong, chưa chạy thật.)*

Nên có, nếu kịp:
5. Giao diện Streamlit hiển thị kết quả *(Hiếu)*. Nếu chưa xong thì chiếu `results.json` hoặc output console.
6. `score.py` chấm trên tập dev: bắt được bao nhiêu câu sai, báo nhầm bao nhiêu *(Khoa)*.

**Kịch bản demo (khoảng 5 phút):**
1. Nêu vấn đề theo lời mentor: chatbot luật ảo giác thì công ty mất tiền.
2. Dữ liệu: bộ luật bản mới nhất, 220 Điều, cách tách chunk.
3. Truy hồi: gõ một câu hỏi, cho thấy top-5 Điều đúng, kèm số Hit@k.
4. Kiểm định 3 câu mẫu: một câu đúng ra `DUNG`, một câu sai con số ra `SAI` kèm bằng chứng, một câu bịa quyền lợi ra `KHONG_CAN_CU`.
5. Chạy cả tập dev, cho thấy cổng `KHONG_DAT` / `CAN_XEM_LAI` / `DAT`.
6. Kế hoạch 3 tuần tới (mục 8).

## 4. Hệ thống làm gì

```
Bộ luật Lao động (VBHN 18/VBHN-VPQH, 12/02/2026)
  └─ ingest: tách theo "Điều N." → 220 chunk → embedding bge-m3 → Qdrant local

CSV: id, cau_hoi, cau_tra_loi
  └─ với mỗi câu:
       retrieve(cau_hoi + cau_tra_loi, k=5)        → top-5 Điều
       + get_article() cho các Điều chatbot tự trích (tối đa 3)
       → 1 lần gọi LLM (temperature 0): tách ý + chấm từng ý
       → mỗi ý: DUNG / TRAI_LUAT / KHONG_CAN_CU, kèm trich_dan, bang_chung, giai_thich
       → kết luận câu: SAI / KHONG_CAN_CU / DUNG (hoặc LOI nếu chạy hỏng)
  └─ tong_ket + cổng:
       có SAI                      → KHONG_DAT
       không SAI, có KHONG_CAN_CU/LOI → CAN_XEM_LAI
       tất cả DUNG                 → DAT
```

5 loại lỗi cần bắt (mỗi loại cài 1 câu trong tập test 20 câu): sai con số, dùng luật cũ, bịa quyền lợi, trích sai Điều, đúng một nửa.

## 5. Phân công và trạng thái

| Người | Phần | Nhánh | Trạng thái |
|---|---|---|---|
| **Bào** | Dữ liệu luật, ingest, `retrieve()`, `get_article()` | `feat/retrieval` | Xong, chưa merge vào `develop` |
| **Vĩnh** | `core/audit.py`: `audit_one`, `run_audit` | `feat/audit` | Đã nối với retrieve thật (bge-m3 + Qdrant) và LLM thật (gpt-4.1-mini), 84 test pass. 4 câu demo ra đúng 4/4, ổn định qua 2 lần chạy. Chưa push |
| **Khoa** | `eval/score.py`, tập dev và tập test | `feat/eval` | Hỏi Vĩnh |
| **Hiếu** | `app/app.py` (Streamlit) | `feat/ui` | Hỏi Vĩnh |

Tập test 20 câu và answer key do Khoa và Hiếu giữ kín. Vĩnh và Bào không được xem, để kết quả chạy mù là thật.

## 6. Các quyết định đã chốt

- Luật: **bản hợp nhất 18/VBHN-VPQH ngày 12/02/2026** (Luật 45/2019/QH14, sửa đổi bởi các Luật 71/2025, 113/2025, 124/2025). Chỉ dùng 1 bộ luật này cho MVP.
- Embedding: bge-m3 chạy CPU, Qdrant local mode.
- **Không fallback âm thầm.** Mặc định chỉ dùng `retrieve()` thật, lỗi thì báo ngay. BM25 chỉ chạy khi `.env` có `RETRIEVER=bm25`. Model chỉ nạp 1 lần cho mỗi lượt chạy. `HF_HUB_OFFLINE=1`.
- Mỗi câu gọi LLM 1 lần, temperature 0, gặp 429 thì thử lại, lỗi khác thì báo luôn. Câu lỗi được chạy lại 1 lần, vẫn lỗi thì ghi `LOI`.
- Chặn trích dẫn: ý được chấm `DUNG` nhưng trích Điều không nằm trong top-5 hoặc trong các Điều đã lấy bằng `get_article` thì hạ xuống `KHONG_CAN_CU`, đặt `ha_nhan: true`.
- `faithfulness` để `null`. Ragas là phần cộng thêm, làm sau.
- Chấm điểm: câu cố tình sai ra `SAI` hoặc `KHONG_CAN_CU` thì tính là bắt được; ra `DUNG` hoặc `LOI` thì tính là bỏ sót. Câu đúng ra `SAI` hoặc `KHONG_CAN_CU` thì tính là báo nhầm; ra `LOI` thì đếm riêng.
- Mục tiêu MVP: bắt ≥ 4/5 câu sai, báo nhầm ≤ 1/15, ổn định ≥ 19/20 giữa 2 lần chạy, Điều đúng nằm trong top-5 ≥ 9/10, chạy hết 20 câu ≤ 5 phút.

## 7. Việc cần làm ngay, trước Chủ nhật (phần của Vĩnh)

1. Python 3.12, `.venv`, cài requirements, chép cache bge-m3 từ Bào, `python -m core.ingest data/law/dieu.jsonl`, chạy kiểm tra retrieval ra 19/20 và 20/20.
2. Nối `audit.py` với `retrieve()` thật (bỏ fallback âm thầm), thêm `get_article()`. Viết test trước.
3. Điền API key vào `.env`. Chạy `audit_one` thật với 3 câu mẫu **do Vĩnh tự soạn** (một đúng, một sai số, một bịa quyền). Kiểm tra nhãn và trích dẫn có hợp lý không.
4. Chạy `run_audit` trên `data/test/dev_set.csv` (10 câu) khi Khoa/Hiếu gửi. Ghi lại thời gian và chi phí.
5. Push `feat/audit`, mở PR vào `develop` (sau khi Bào merge `feat/retrieval`).

**Ngoài phạm vi Chủ nhật:** Ragas, so sánh nhiều model, nhiều bộ luật, tối ưu tốc độ, giao diện đẹp.

## 8. Lộ trình 3–4 tuần (để nói với mentor)

| Tuần | Mục tiêu |
|---|---|
| 1 (tuần này) | Luồng chạy thật từ đầu tới cuối trên tập dev. **Demo Chủ nhật.** |
| 2 | Tập test 20 câu, chạy mù 2 lần, `score.py` ra các chỉ số mục 6. Sửa prompt và retrieval dựa trên tập dev, không dựa trên tập test |
| 3 | Phần "tự đánh giá & tối ưu truy hồi" của đề AIP-04: so sánh BM25 / bge-m3 / hybrid và các giá trị k, chấm bằng Hit@k / nDCG; thêm chỉ số Ragas (faithfulness, context precision/recall); so sánh 2–3 LLM theo chất lượng × chi phí × thời gian |
| 4 | Hoàn thiện UI, báo cáo, video demo, chạy lại toàn bộ để lấy số cuối |

## 9. Cách làm việc với Claude Code

- Làm **từng bước một**, xong bước nào thì báo bước đó. Không tự nhảy sang việc của người khác.
- Không sửa code của Bào (`core/vectordb.py`, `core/ingest.py`, `core/retrieve.py`, `data/law/`). Cần đổi gì ở đó thì báo Vĩnh.
- Không tự bịa nội dung luật hay đáp án. Dữ liệu test giả để trong `mock/` và ghi rõ là giả.
- Không đọc, tạo hay commit `data/test/test_set*.csv`, `answer_key*.csv`, `.env`, `.qdrant/`, `.venv/`, `results*.json`.
- Không thêm Co-Authored-By hay dòng attribution AI nào vào commit, PR hay docs.
- Chỉ commit hoặc push khi Vĩnh yêu cầu.
- Khi có lựa chọn, đưa ra đề xuất kèm lý do ngắn rồi hỏi, như đã làm.