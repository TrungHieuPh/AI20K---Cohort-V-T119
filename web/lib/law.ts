/**
 * Splits an article's text (dieu.jsonl `noi_dung`) into heading, clauses ("1.", "2.")
 * and points ("a)", "đ)"), so a page can quote one clause or point verbatim.
 */

export interface ArticlePoint {
  letter: string
  text: string
}

export interface ArticleClause {
  number: number
  text: string
  points: ArticlePoint[]
}

export interface ParsedArticle {
  /** "Điều 107. Làm thêm giờ" */
  heading: string
  /** Text before the first clause, for articles without numbered clauses. */
  intro: string[]
  clauses: ArticleClause[]
}

const CLAUSE = /^(\d+)\.\s+(.*)$/
const POINT = /^([a-zđ])\)\s+(.*)$/

export function parseArticle(text: string): ParsedArticle {
  const [heading = "", ...lines] = text.split("\n").map((l) => l.trim())
  const parsed: ParsedArticle = { heading, intro: [], clauses: [] }

  for (const line of lines.filter(Boolean)) {
    const clause = parsed.clauses.at(-1)
    const c = CLAUSE.exec(line)
    const p = POINT.exec(line)
    if (c) {
      parsed.clauses.push({ number: Number(c[1]), text: c[2], points: [] })
    } else if (p && clause) {
      clause.points.push({ letter: p[1], text: p[2] })
    } else if (clause) {
      const point = clause.points.at(-1)
      if (point) point.text += `\n${line}`
      else clause.text += `\n${line}`
    } else {
      parsed.intro.push(line)
    }
  }
  return parsed
}

export function getClause(
  article: ParsedArticle,
  number: number
): ArticleClause | undefined {
  return article.clauses.find((c) => c.number === number)
}

export type ExcerptLine =
  | { kind: "clause" | "point"; label: string; text: string }
  /** Points left out of the quote, shown as "…". */
  | { kind: "gap" }

/**
 * Verbatim quote of chosen clauses and points. Each clause keeps its lead sentence;
 * points not asked for collapse into a gap, so the reader can see text was left out.
 */
export function excerpt(
  article: ParsedArticle,
  picks: { clause: number; points?: string[] }[]
): ExcerptLine[] {
  const lines: ExcerptLine[] = []
  for (const pick of picks) {
    const clause = getClause(article, pick.clause)
    if (!clause) continue
    lines.push({
      kind: "clause",
      label: `${clause.number}.`,
      text: clause.text,
    })

    let skipped = false
    for (const point of clause.points) {
      if (!pick.points?.includes(point.letter)) {
        skipped = true
        continue
      }
      if (skipped) lines.push({ kind: "gap" })
      skipped = false
      lines.push({ kind: "point", label: `${point.letter})`, text: point.text })
    }
    if (skipped) lines.push({ kind: "gap" })
  }
  return lines
}

export interface Citation {
  article: number
  /** Clauses named in the citation; a clause without points means all of its points. */
  picks: { clause: number; points?: string[] }[]
}

/**
 * Reads a claim's `trich_dan`, e.g. "Điều 107 khoản 2 và khoản 3" or
 * "Điều 35 khoản 1 điểm a". Each "Điều N" starts a new citation.
 */
export function parseCitation(text: string): Citation[] {
  const citations: Citation[] = []
  for (const part of text.split(/(?=Điều\s+\d+)/i)) {
    const head = /Điều\s+(\d+)/i.exec(part)
    if (!head) continue
    const citation: Citation = { article: Number(head[1]), picks: [] }
    // Not \b: in JS it is ASCII-only, so it never matches after "đ".
    for (const m of part.matchAll(
      /(khoản|điểm)\s+(\d+|[a-zđ])(?![\p{L}\p{N}])/giu
    )) {
      const kind = m[1].toLowerCase()
      if (kind === "khoản") {
        citation.picks.push({ clause: Number(m[2]) })
      } else {
        const last = citation.picks.at(-1)
        if (last) last.points = [...(last.points ?? []), m[2].toLowerCase()]
      }
    }
    citations.push(citation)
  }
  return citations
}

export function citedArticles(text: string): number[] {
  return [...new Set(parseCitation(text).map((c) => c.article))]
}

export interface ResolvedCitation {
  /** The quoted clauses and points, or null when no clause is named (quote the whole article). */
  lines: ExcerptLine[] | null
  /** Parts the citation names that the article does not have, e.g. "khoản 9". */
  missing: string[]
}

/**
 * Turns a citation's picks into a verbatim quote. A clause named without points is quoted
 * whole; picks naming the same clause are merged; parts the article lacks are reported,
 * since a citation to a clause that does not exist is itself a finding.
 */
export function resolveCitation(
  article: ParsedArticle,
  picks: Citation["picks"]
): ResolvedCitation {
  if (!picks.length) return { lines: null, missing: [] }

  const missing: string[] = []
  const wanted = new Map<number, Set<string>>()
  for (const pick of picks) {
    const clause = getClause(article, pick.clause)
    if (!clause) {
      missing.push(`khoản ${pick.clause}`)
      continue
    }
    const letters = clause.points.map((p) => p.letter)
    const set = wanted.get(clause.number) ?? new Set<string>()
    for (const letter of pick.points ?? letters) {
      if (letters.includes(letter)) set.add(letter)
      else missing.push(`điểm ${letter} khoản ${clause.number}`)
    }
    wanted.set(clause.number, set)
  }

  const merged = [...wanted]
    .sort(([a], [b]) => a - b)
    .map(([clause, points]) => ({ clause, points: [...points] }))
  return { lines: merged.length ? excerpt(article, merged) : null, missing }
}

/**
 * Splits a claim's quoted evidence (`bang_chung`) into the pieces worth looking for in
 * the article: "2.c) ... không quá 200 giờ" becomes "không quá 200 giờ". Pieces that are
 * not verbatim in the article simply won't be highlighted.
 */
export function evidencePhrases(evidence: string): string[] {
  return evidence
    .split(/\s*(?:\.{3}|…|;)\s*/)
    .map((piece) =>
      piece
        .replace(/^(?:\d+\.\s*)?(?:[a-zđ]\)\s*)?/u, "")
        .replace(/[:.]$/, "")
        .trim()
    )
    .filter((piece) => piece.length >= 12)
}

/** "THỜI GIỜ LÀM VIỆC" -> "Thời giờ làm việc" (chapter and section names are all caps). */
export function sentenceCase(text: string): string {
  // The only proper noun in the Labor Code's chapter and section names.
  const lower = text.toLocaleLowerCase("vi").replace(/việt nam/g, "Việt Nam")
  return lower.charAt(0).toLocaleUpperCase("vi") + lower.slice(1)
}

/** "Mục 1. THỜI GIỜ LÀM VIỆC" -> { label: "Mục 1", name: "Thời giờ làm việc" }; null if no Mục. */
export function splitSection(
  muc: string
): { label: string; name: string } | null {
  const m = /^(Mục\s+\d+)\.?\s*(.*)$/u.exec(muc.trim())
  return m ? { label: m[1], name: sentenceCase(m[2]) } : null
}
