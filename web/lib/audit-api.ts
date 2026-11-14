/**
 * Audits one chatbot answer on the backend: POST /api/audit, proxied to api/server.py by
 * next.config.ts. The endpoint runs `core.audit.audit_one(cau_hoi, cau_tra_loi)` and returns
 * its dict (one results.json `cau` element without `id`), so the UI reads it with the same
 * checks as a results file.
 *
 * Contract the UI expects (api/server.py does not have it yet, see the 404 message):
 *   request  {"cau_hoi": str (1..1000), "cau_tra_loi": str (1..4000)}
 *   200      {"ket_luan", "faithfulness", "cac_y", "dieu_truy_hoi", "thoi_gian_ms", "chi_phi_usd"}
 *   422      FastAPI validation list, or a string
 *   502      {"detail": str} when retrieval or the judge failed
 */
import { parseAuditedAnswer } from "@/lib/results"
import type { AuditedQuestion, ChatApiError } from "@/lib/types"

export const MAX_QUESTION = 1000
export const MAX_ANSWER = 4000

export type AuditOutcome =
  { ok: true; result: AuditedQuestion } | { ok: false; error: string }

const NO_BACKEND =
  "Chưa kết nối được máy chủ kiểm định. Người chạy demo cần bật máy chủ (ở thư mục gốc repo: python -m uvicorn api.server:app --port 8000), rồi thử lại."

const NO_ENDPOINT =
  "Máy chủ đang chạy chưa có chức năng kiểm trực tiếp (POST /api/audit). Trong lúc chờ, xem kết quả kiểm cả bộ câu ở trang Kết quả tổng."

/** FastAPI validation types (422) in Vietnamese, as on the chat screen. */
const VALIDATION: Record<string, string> = {
  string_too_short: "câu hỏi hoặc câu trả lời đang trống",
  string_too_long: `câu hỏi quá ${MAX_QUESTION} ký tự hoặc câu trả lời quá ${MAX_ANSWER} ký tự`,
  missing: "thiếu câu hỏi hoặc câu trả lời",
}

async function errorMessage(response: Response): Promise<string> {
  if (response.status === 404 || response.status === 405) return NO_ENDPOINT
  let body: ChatApiError | null = null
  try {
    body = (await response.json()) as ChatApiError
  } catch {
    // The proxy answers with HTML or nothing when the backend is not running.
  }
  const detail = body?.detail
  if (response.status === 422) {
    if (typeof detail === "string") return detail
    if (Array.isArray(detail) && detail.length)
      return `Dữ liệu gửi đi không hợp lệ: ${detail
        .map((d) => VALIDATION[d.type ?? ""] ?? d.msg ?? "dữ liệu sai")
        .join("; ")}.`
    return "Dữ liệu gửi đi không hợp lệ."
  }
  if (response.status === 502 && typeof detail === "string")
    return `Hệ thống chưa kiểm được câu này. ${detail}`
  if (typeof detail === "string") return detail
  return NO_BACKEND
}

export async function auditAnswer(
  cau_hoi: string,
  cau_tra_loi: string
): Promise<AuditOutcome> {
  let response: Response
  try {
    response = await fetch("/api/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cau_hoi, cau_tra_loi }),
    })
  } catch {
    return { ok: false, error: NO_BACKEND }
  }
  if (!response.ok) return { ok: false, error: await errorMessage(response) }
  let raw: unknown
  try {
    raw = await response.json()
  } catch {
    return { ok: false, error: "Máy chủ trả về dữ liệu không đọc được." }
  }
  const parsed = parseAuditedAnswer(raw)
  if (!parsed.ok)
    return {
      ok: false,
      error: `Kết quả kiểm không đúng định dạng: ${parsed.error}`,
    }
  // The endpoint may omit the texts it was sent; the screen shows what was asked.
  return {
    ok: true,
    result: {
      ...parsed.question,
      cau_hoi: parsed.question.cau_hoi || cau_hoi,
      cau_tra_loi: parsed.question.cau_tra_loi || cau_tra_loi,
    },
  }
}
