/**
 * Shapes of the files the UI reads. Field names are the team's shared results.json
 * format (written by core/audit.py), so they stay in Vietnamese: do not rename them here.
 */

/** Verdict on one question: `ket_luan`. */
export type QuestionVerdict = "DUNG" | "SAI" | "KHONG_CAN_CU" | "LOI"

/** Label on one claim inside an answer: `nhan`. */
export type ClaimLabel = "DUNG" | "TRAI_LUAT" | "KHONG_CAN_CU"

/** Release gate for the whole run: `cong`. */
export type GateVerdict = "DAT" | "CAN_XEM_LAI" | "KHONG_DAT"

export interface Claim {
  noi_dung: string
  nhan: ClaimLabel
  /** e.g. "Điều 107 khoản 2 và khoản 3"; empty when the claim has no grounds. */
  trich_dan: string
  bang_chung: string
  giai_thich: string
  /** Set when the system, not the judge, forced the label down. */
  ha_nhan?: boolean
  /** false when the quoted evidence is not verbatim in the cited article. */
  bang_chung_khop?: boolean
}

export interface QuestionResult {
  id: number | string
  /** Copied from the input CSV. Missing in results.json files written before 14/11/2026. */
  cau_hoi?: string
  /** The chatbot answer that was audited. Missing in older files, like `cau_hoi`. */
  cau_tra_loi?: string
  ket_luan: QuestionVerdict
  /** null for a question that errored (LOI). */
  faithfulness: number | null
  cac_y: Claim[]
  /** Top-5 retrieved article ids, e.g. "dieu-107". */
  dieu_truy_hoi: string[]
  thoi_gian_ms: number
  chi_phi_usd: number | null
  /** Error message, only on LOI. */
  loi?: string
}

export interface RunSummary {
  so_cau: number
  dung: number
  sai: number
  khong_can_cu: number
  loi: number
  faithfulness_tb: number | null
  cong: GateVerdict
}

export interface AuditResults {
  _ghi_chu?: string
  tong_ket: RunSummary
  cau: QuestionResult[]
}

/**
 * A result as the screens use it: the optional fields filled in. `cau_hoi` and
 * `cau_tra_loi` are "" when the file predates them; show `MISSING_QUESTION` instead.
 */
export interface AuditedQuestion extends QuestionResult {
  cau_hoi: string
  cau_tra_loi: string
}

/** One line of data/law/dieu.jsonl: a whole article of the Labor Code. */
export interface Article {
  chunk_id: string
  chuong: string
  ten_chuong: string
  muc: string
  dieu: number
  tieu_de: string
  noi_dung: string
  so_khoan: number
  /** Amendment notes, e.g. "Khoản này được sửa đổi, bổ sung theo …". */
  sua_doi: string[]
  nguon: string
}

/** A ratio against its target in mock_score.json (eval/score.py `_chi_so`). */
export interface ScoreMetric {
  dat: number
  tong: number
  /** null when `tong` is 0. */
  ti_le: number | null
  muc_tieu: number
  /** null when there was nothing to measure (0 questions): "không áp dụng". */
  dat_muc_tieu: boolean | null
}

/** One question of the scored set: its true label against what the audit said. */
export interface ScoreRow {
  id: number | string
  /** True label from the answer key: "DUNG" or "SAI". */
  nhan_that: string
  /** Kind of planted error, empty for a correct answer. */
  loai_loi: string
  ket_luan: QuestionVerdict
  ket_qua: "bat_duoc" | "bo_sot" | "dung" | "bao_nham" | "loi"
  /** null when not checked for this question (correct answers, or no article in the key). */
  trich_dung_dieu: boolean | null
  truy_hoi_dung: boolean | null
}

/** mock/mock_score.json, the output of eval/score.py --out. */
export interface ScoreReport {
  so_cau: number
  /** Wrong answers caught (labelled SAI or KHONG_CAN_CU). */
  bat_duoc: ScoreMetric
  /** Correct answers flagged by mistake; the only "at most" target. */
  bao_nham: ScoreMetric
  /** Questions that errored, split by their true label. */
  loi: { cau_sai: number; cau_dung: number }
  trich_dung_dieu: ScoreMetric
  truy_hoi_dung: ScoreMetric
  /** null until a second run exists to compare against. */
  on_dinh: (ScoreMetric & { khac_nhau: (number | string)[] }) | null
  thoi_gian: {
    tong_s: number
    quy_ve_20_cau_s: number
    muc_tieu_s: number
    dat_muc_tieu: boolean
  }
  chi_phi_usd: number
  faithfulness_tb: number | null
  /** Catch rate per kind of planted error, e.g. "sai_con_so". */
  theo_loai_loi: Record<string, { dat: number; tong: number }>
  chi_tiet: ScoreRow[]
}

/** One retrieved article in a chat answer (POST /api/chat, docs/api-hoi-dap.md §3). */
export interface ChatArticle {
  dieu: number
  tieu_de: string
  /** Cosine with Qdrant + bge-m3, unbounded with BM25: never compare to a fixed threshold. */
  score: number | null
  /** First 300 characters of the article, with "…" when cut. */
  trich: string
}

/** Response of POST /api/chat. */
export interface ChatResponse {
  cau_hoi: string
  cau_tra_loi: string
  /** "Điều N khoản K điểm x"; empty when the bot declines. */
  trich_dan: string[]
  /** chunk_id of the retrieved articles, best first, e.g. "dieu-25". */
  dieu_truy_hoi: string[]
  thoi_gian_ms: number
  /** null when LiteLLM has no price for the model. */
  chi_phi_usd: number | null
  /** The question is outside the Labor Code. */
  tu_choi: boolean
  /** Cited articles that were not retrieved: the answer needs checking. */
  trich_dan_ngoai: number[]
  cac_dieu: ChatArticle[]
}

/** Error body of the chat API: 422 gives FastAPI's list (or a string for a blank question), 502 a string. */
export interface ChatApiError {
  detail?: string | { type?: string; msg?: string; loc?: (string | number)[] }[]
}
