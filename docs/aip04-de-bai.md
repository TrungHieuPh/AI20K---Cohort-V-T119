# Đề bài AIP-04: AI Agent RAG Platform tự đánh giá & tối ưu chất lượng truy hồi (RAGAS)

> Nguyên văn đề bài của chương trình, đã bỏ các ví dụ lĩnh vực khác (nhóm làm lĩnh vực pháp lý: Bộ luật Lao động).
> Đối chiếu tiến độ với đề: `docs/project-brief.md`.

- **Khối / Lĩnh vực:** Mô hình nền tảng AI – Hạ tầng AI doanh nghiệp
- **Mã đề:** AIP-04
- **Tên đề tài:** AI Agent RAG Platform tự đánh giá & tối ưu chất lượng truy hồi (RAGAS)

## Mô tả bài toán

**📍 Thực trạng:** Nhiều ứng dụng RAG nội bộ bị trả lời sai/bịa do chất lượng chunk & retrieval kém, nhưng không đội nào
đo được chất lượng RAG một cách hệ thống. Khi doanh nghiệp vận hành hàng loạt ứng dụng AI ở quy mô lớn, hệ thống thường
đối mặt với bài toán đánh đổi gay gắt giữa chi phí token – độ trễ – chất lượng, hiện tượng trôi lệch ngữ cảnh, lặp vô hạn
giữa các tác tử và nguy cơ tấn công Prompt Injection.

**🎯 Vấn đề:** Bài toán đặt ra là làm thế nào để xây dựng nền tảng cho phép nạp tài liệu, dựng pipeline RAG, và một agent
tự đánh giá bằng RAGAS (faithfulness, context precision/recall, answer relevancy), tự đề xuất chỉnh
chunking/embedding/reranker; đồng thời giải bài toán tối ưu hóa đa mục tiêu trên đường biên Pareto
(Chi phí × Độ trễ × Chất lượng), tự động phát hiện điểm suy thoái hoặc lỗ hổng bảo mật từ dữ liệu trace thực tế và kiểm
chứng tự động qua cổng kiểm thử hồi quy.

**🔒 Ràng buộc:** HITL duyệt thay đổi cấu hình production; bảo mật tài liệu phân quyền theo đơn vị; ngưỡng chất lượng
eval tối thiểu; kiểm soát chi phí embedding & LLM judge. Mọi thay đổi cấu hình định tuyến, cập nhật prompt/model hoặc
quy tắc chặn an toàn phải được kiểm định định lượng trên tập dữ liệu giữ riêng (held-out regression gate) trước khi áp dụng.

## Techstack gợi ý

- LangGraph
- Ragas eval
- vector DB Qdrant/pgvector
- embeddings đa provider
- reranker Cohere/bge
- LiteLLM
- Langfuse
- backend FastAPI, PostgreSQL
- frontend Next.js (upload, cấu hình pipeline, dashboard chất lượng)
- deploy Docker.
- Dữ liệu & benchmark thực tế tham chiếu: Bộ dữ liệu & benchmark hạ tầng AI: RouterBench / LMSYS Chatbot Arena
  (định tuyến model), RAGBench / BEIR (truy hồi), BIPIA / HarmBench / Garak (an toàn & chống prompt injection),
  TRAIL (gỡ lỗi multi-agent) và chuẩn OpenTelemetry GenAI.

## Yêu cầu đầu ra gợi ý

**Cơ bản:**
- Web deploy, đăng nhập ≥2 vai trò (Kỹ sư RAG, Chủ dữ liệu)
- upload tài liệu, dựng pipeline RAG hỏi đáp, agent tính điểm RAGAS trên bộ câu hỏi test.

**Nâng cao:**
- Agent tự thử nghiệm nhiều cấu hình chunk/embedding/reranker và đề xuất tối ưu, HITL duyệt cấu hình, cảnh báo suy giảm
  chất lượng theo thời gian, memory lưu cấu hình tốt nhất
- Xây dựng cơ chế đánh giá và mô phỏng định lượng trên dữ liệu trace thực tế (tối ưu hóa chi phí – chất lượng – độ trễ)
  kèm khả năng tự động phát hiện và khoanh vùng điểm lỗi của hệ thống AI.
