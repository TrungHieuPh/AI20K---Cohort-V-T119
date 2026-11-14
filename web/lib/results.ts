/**
 * Reads a results.json (core/audit.py output) into what the screens show. Runs on the
 * server for the demo file and in the browser for a file the user opens, so it must not
 * touch the file system. The format is README "results.json"; this only checks it.
 */
import type {
  AuditedQuestion,
  Claim,
  ClaimLabel,
  GateVerdict,
  QuestionVerdict,
  RunSummary,
} from "@/lib/types"

/** Shown in place of `cau_hoi` for files written before the field existed (14/11/2026). */
export const MISSING_QUESTION = "(không có nội dung câu hỏi)"

export interface AuditRun {
  summary: RunSummary
  questions: AuditedQuestion[]
  /** Sum of `thoi_gian_ms` over the questions. */
  totalLatencyMs: number
  /** Sum of `chi_phi_usd`, skipping null; null when no question has a cost. */
  totalCostUsd: number | null
  avgLatencyMs: number | null
  avgCostUsd: number | null
}

export type ParseResult =
  { ok: true; run: AuditRun } | { ok: false; error: string }

const QUESTION_VERDICTS: QuestionVerdict[] = [
  "DUNG",
  "SAI",
  "KHONG_CAN_CU",
  "LOI",
]
const CLAIM_LABELS: ClaimLabel[] = ["DUNG", "TRAI_LUAT", "KHONG_CAN_CU"]
const GATES: GateVerdict[] = ["DAT", "CAN_XEM_LAI", "KHONG_DAT"]

class FormatError extends Error {}

/** Checks a parsed results.json. Errors are Vietnamese sentences meant for the reader. */
export function parseResults(raw: unknown): ParseResult {
  try {
    if (!isObject(raw))
      throw new FormatError("Tệp không phải một đối tượng JSON.")
    if (!isObject(raw.tong_ket)) throw new FormatError("Thiếu phần tong_ket.")
    if (!Array.isArray(raw.cau)) throw new FormatError("Thiếu danh sách cau.")

    const summary = readSummary(raw.tong_ket)
    const questions = raw.cau.map(readQuestion)
    const seen = new Set<string>()
    for (const q of questions) {
      const id = String(q.id)
      if (seen.has(id)) throw new FormatError(`Có hai câu cùng id ${id}.`)
      seen.add(id)
    }

    const latencies = questions.map((q) => q.thoi_gian_ms)
    const costs = questions.map((q) => q.chi_phi_usd)
    return {
      ok: true,
      run: {
        summary,
        questions,
        totalLatencyMs: sum(latencies) ?? 0,
        totalCostUsd: sum(costs),
        avgLatencyMs: average(latencies),
        avgCostUsd: average(costs),
      },
    }
  } catch (error) {
    if (error instanceof FormatError) return { ok: false, error: error.message }
    throw error
  }
}

function readSummary(t: Record<string, unknown>): RunSummary {
  if (!GATES.includes(t.cong as GateVerdict))
    throw new FormatError(`tong_ket.cong phải là ${GATES.join(", ")}.`)
  return {
    so_cau: count(t.so_cau, "tong_ket.so_cau"),
    dung: count(t.dung, "tong_ket.dung"),
    sai: count(t.sai, "tong_ket.sai"),
    khong_can_cu: count(t.khong_can_cu, "tong_ket.khong_can_cu"),
    loi: count(t.loi, "tong_ket.loi"),
    faithfulness_tb: score(t.faithfulness_tb, "tong_ket.faithfulness_tb"),
    cong: t.cong as GateVerdict,
  }
}

function readQuestion(c: unknown, index: number): AuditedQuestion {
  const where = `cau[${index}]`
  if (!isObject(c)) throw new FormatError(`${where} không phải một đối tượng.`)
  if (typeof c.id !== "number" && typeof c.id !== "string")
    throw new FormatError(`${where} thiếu id.`)
  const at = `câu ${c.id}`
  if (!QUESTION_VERDICTS.includes(c.ket_luan as QuestionVerdict))
    throw new FormatError(
      `ket_luan của ${at} phải là ${QUESTION_VERDICTS.join(", ")}.`
    )

  const claims = c.cac_y ?? []
  if (!Array.isArray(claims))
    throw new FormatError(`cac_y của ${at} phải là một danh sách.`)
  const retrieved = c.dieu_truy_hoi ?? []
  if (!Array.isArray(retrieved) || retrieved.some((d) => typeof d !== "string"))
    throw new FormatError(`dieu_truy_hoi của ${at} phải là danh sách chuỗi.`)

  return {
    id: c.id,
    cau_hoi: text(c.cau_hoi),
    cau_tra_loi: text(c.cau_tra_loi),
    ket_luan: c.ket_luan as QuestionVerdict,
    faithfulness: score(c.faithfulness, `faithfulness của ${at}`),
    cac_y: claims.map((y, i) => readClaim(y, `ý ${i + 1} của ${at}`)),
    dieu_truy_hoi: retrieved as string[],
    thoi_gian_ms: typeof c.thoi_gian_ms === "number" ? c.thoi_gian_ms : 0,
    chi_phi_usd: typeof c.chi_phi_usd === "number" ? c.chi_phi_usd : null,
    ...(typeof c.loi === "string" && c.loi ? { loi: c.loi } : {}),
  }
}

function readClaim(y: unknown, at: string): Claim {
  if (!isObject(y)) throw new FormatError(`${at} không phải một đối tượng.`)
  if (!CLAIM_LABELS.includes(y.nhan as ClaimLabel))
    throw new FormatError(`Nhãn của ${at} phải là ${CLAIM_LABELS.join(", ")}.`)
  return {
    noi_dung: text(y.noi_dung),
    nhan: y.nhan as ClaimLabel,
    trich_dan: text(y.trich_dan),
    bang_chung: text(y.bang_chung),
    giai_thich: text(y.giai_thich),
    // Optional flags: absent means normal, so only `true` / `false` respectively count.
    ...(y.ha_nhan === true ? { ha_nhan: true } : {}),
    ...(y.bang_chung_khop === false ? { bang_chung_khop: false } : {}),
  }
}

/**
 * Checks one answer audited live (POST /api/audit): an `audit_one` result, i.e. one
 * results.json `cau` element without `id`. Same checks as a file, so a bad reply reads
 * like a bad file.
 */
export function parseAuditedAnswer(
  raw: unknown
): { ok: true; question: AuditedQuestion } | { ok: false; error: string } {
  try {
    if (!isObject(raw))
      throw new FormatError("Máy chủ không trả về một đối tượng JSON.")
    return { ok: true, question: readQuestion({ ...raw, id: "vừa kiểm" }, 0) }
  } catch (error) {
    if (error instanceof FormatError) return { ok: false, error: error.message }
    throw error
  }
}

/** A claim the system relabelled, or whose evidence is not verbatim in the law. */
export function isFlagged(claim: Claim): boolean {
  return claim.ha_nhan === true || claim.bang_chung_khop === false
}

export function questionText(q: AuditedQuestion): string {
  return q.cau_hoi || MISSING_QUESTION
}

/** "dieu-107" -> 107; anything else -> null. */
export function retrievedArticle(id: string): number | null {
  const m = /^dieu-(\d+)$/.exec(id.trim())
  return m ? Number(m[1]) : null
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

function text(v: unknown): string {
  return typeof v === "string" ? v : ""
}

function count(v: unknown, name: string): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0)
    throw new FormatError(`${name} phải là số nguyên không âm.`)
  return v
}

function score(v: unknown, name: string): number | null {
  if (v === null || v === undefined) return null
  if (typeof v !== "number" || v < 0 || v > 1)
    throw new FormatError(`${name} phải là số từ 0 đến 1 hoặc null.`)
  return v
}

function sum(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => typeof v === "number")
  return nums.length ? nums.reduce((a, b) => a + b, 0) : null
}

function average(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => typeof v === "number")
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null
}
