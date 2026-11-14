/**
 * The screen recording on the landing (public/demo/). It was made by driving the
 * production build in headless Chrome over the demo run, in one continuous take; the
 * chapter times are the marks the recording script wrote while it drove the app.
 */
export const WALKTHROUGH = {
  sources: [
    { src: "/demo/walkthrough.webm", type: "video/webm" },
    { src: "/demo/walkthrough.mp4", type: "video/mp4" },
  ],
  poster: "/demo/walkthrough-poster.jpg",
  width: 1280,
  height: 800,
  /** Seconds. */
  duration: 21.4,
  chapters: [
    {
      start: 0,
      label: "Tổng quan",
      detail: "Cổng Không đạt: 2 câu Sai trong 4 câu mẫu.",
      route: "/dashboard",
    },
    {
      start: 5.9,
      label: "Mở câu #2",
      detail: "Câu trả lời được tách thành từng ý và chấm riêng.",
      route: "/audit/2",
    },
    {
      start: 11.5,
      label: "Bấm trích dẫn",
      detail: "Ý sai dẫn Điều 107 khoản 2 và khoản 3.",
      route: "/audit/2",
    },
    {
      start: 14,
      label: "Đọc khoản luật",
      detail: "Đoạn bằng chứng được tô vàng ngay trong Điều luật.",
      route: "/audit/2",
    },
  ],
} as const

/** 21.4 -> "0:21" */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}
