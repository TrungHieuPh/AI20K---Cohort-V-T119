/**
 * Names of the app's pages, in plain words. The dock, the phone menu, the results tabs and
 * each page's title read them from here so they never drift apart.
 */
export const PAGE = {
  chat: "Hỏi chatbot",
  check: "Kiểm một câu trả lời",
  dashboard: "Kết quả tổng",
  audit: "Từng câu trả lời",
  quality: "Độ chính xác bộ kiểm",
  open: "Mở tệp kết quả",
  law: "Bộ luật Lao động",
} as const

/** The dock item grouping the four pages about a whole audit run. */
export const RESULTS_SECTION = "Kết quả kiểm định"
