import {
  CircleAlert,
  CircleCheck,
  CircleHelp,
  CircleX,
  type LucideIcon,
} from "lucide-react"

import type { ClaimLabel, GateVerdict, QuestionVerdict } from "@/lib/types"

/** Badge variant for each verdict colour (see components/ui/badge.tsx). */
export type VerdictTone = "correct" | "wrong" | "ungrounded" | "error"

export interface VerdictMeta {
  label: string
  tone: VerdictTone
  icon: LucideIcon
}

const ICON: Record<VerdictTone, LucideIcon> = {
  correct: CircleCheck,
  wrong: CircleX,
  ungrounded: CircleHelp,
  error: CircleAlert,
}

const meta = (label: string, tone: VerdictTone): VerdictMeta => ({
  label,
  tone,
  icon: ICON[tone],
})

export const QUESTION_VERDICT: Record<QuestionVerdict, VerdictMeta> = {
  DUNG: meta("Đúng", "correct"),
  SAI: meta("Sai", "wrong"),
  KHONG_CAN_CU: meta("Không căn cứ", "ungrounded"),
  LOI: meta("Lỗi (không kiểm được)", "error"),
}

export const CLAIM_LABEL: Record<ClaimLabel, VerdictMeta> = {
  DUNG: meta("Đúng", "correct"),
  TRAI_LUAT: meta("Trái luật", "wrong"),
  KHONG_CAN_CU: meta("Không căn cứ", "ungrounded"),
}

export const GATE_VERDICT: Record<GateVerdict, VerdictMeta> = {
  DAT: meta("Đạt", "correct"),
  CAN_XEM_LAI: meta("Cần xem lại", "ungrounded"),
  KHONG_DAT: meta("Không đạt", "wrong"),
}

/**
 * Gate rules, checked top to bottom; the first that holds decides. Restates how
 * core/audit.py sets `cong` (README, results.json); the UI shows it, never recomputes it.
 */
export const GATE_RULES: { when: string; gate: GateVerdict }[] = [
  { when: "Có ít nhất một câu Sai", gate: "KHONG_DAT" },
  { when: "Có câu Không căn cứ hoặc Lỗi", gate: "CAN_XEM_LAI" },
  { when: "Mọi câu đều Đúng", gate: "DAT" },
]

/** What each gate verdict means for shipping the chatbot, in plain words. */
export const GATE_MEANING: Record<GateVerdict, string> = {
  DAT: "Có thể đưa chatbot tới người dùng.",
  CAN_XEM_LAI:
    "Chưa nên đưa tới người dùng khi chưa có người đọc lại các câu bị đánh dấu.",
  KHONG_DAT: "Chưa được đưa tới người dùng: có câu trả lời trái luật.",
}

/** The rule behind a reported gate verdict, for "why" next to the verdict. */
export function gateRuleFor(gate: GateVerdict) {
  return GATE_RULES.find((r) => r.gate === gate)
}

/** How one answer's verdict follows from its claims (README, "Each answer then gets a verdict"). */
export const QUESTION_RULES: { when: string; verdict: QuestionVerdict }[] = [
  { when: "Có ít nhất một ý Trái luật", verdict: "SAI" },
  { when: "Có ý Không căn cứ, không có ý Trái luật", verdict: "KHONG_CAN_CU" },
  { when: "Mọi ý đều Đúng", verdict: "DUNG" },
  { when: "Hệ thống gặp lỗi khi chấm câu này", verdict: "LOI" },
]

export function questionRuleFor(verdict: QuestionVerdict) {
  return QUESTION_RULES.find((r) => r.verdict === verdict)
}

/** "Có ít nhất…" -> "có ít nhất…", for "vì …" after a verdict. Only the first letter changes. */
export function lowerFirst(text: string): string {
  return text.charAt(0).toLocaleLowerCase("vi") + text.slice(1)
}
