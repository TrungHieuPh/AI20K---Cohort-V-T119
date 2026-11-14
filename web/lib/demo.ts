/**
 * How the demo run (mock/mock_results.json) was produced, restated from its `_ghi_chu`
 * so the UI does not print the note verbatim. A results.json the user opens carries no
 * such facts, so these only show for the demo. The API will return them as fields.
 */
export const DEMO_RUN = {
  date: "14/11/2026",
  questionSet:
    "Bộ câu mẫu do nhóm soạn (data/demo/demo_samples.csv), không phải bộ test kín",
  retrieval: "bge-m3 + Qdrant, lấy 5 Điều gần nhất",
  judge: "openai/gpt-4.1-mini",
} as const
