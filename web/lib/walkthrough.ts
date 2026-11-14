/**
 * The screen recording on the landing (public/demo/). It was made by driving the
 * production build in headless Chrome on /chat, with the real chat backend answering,
 * in one continuous take; the chapter times are the marks the recording script wrote
 * while it drove the app, and the details describe what the take shows.
 */
export const WALKTHROUGH = {
  sources: [
    { src: "/demo/walkthrough.webm", type: "video/webm" },
    { src: "/demo/walkthrough.mp4", type: "video/mp4" },
  ],
  poster: "/demo/walkthrough-poster.jpg",
  width: 1280,
  height: 720,
  /** Seconds. */
  duration: 25.6,
  chapters: [
    {
      start: 0,
      label: "Đặt câu hỏi",
      detail: "Gõ câu hỏi: nghỉ việc phải báo trước bao nhiêu ngày?",
      route: "/chat",
    },
    {
      start: 5,
      label: "Nhận trả lời",
      detail:
        "lexgate tìm Điều liên quan rồi trả lời 45, 30 hoặc 03 ngày tùy hợp đồng.",
      route: "/chat",
    },
    {
      start: 11.5,
      label: "Đọc căn cứ",
      detail: "Bấm Điều 35 khoản 1 để mở đúng Điều luật câu trả lời dựa vào.",
      route: "/chat",
    },
    {
      start: 17.3,
      label: "Điều đã tìm",
      detail:
        "5 Điều tìm được, gần câu hỏi nhất ở trên; Điều được dẫn có đánh dấu.",
      route: "/chat",
    },
  ],
} as const

/** 21.4 -> "0:21" */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}
