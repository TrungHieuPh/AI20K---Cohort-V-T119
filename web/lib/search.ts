import type { Article } from "@/lib/types"

/**
 * Accent-insensitive search over the Labor Code for /law. "lam them gio" finds
 * "làm thêm giờ". Runs on the server so the 337 KB of article text stays off the client.
 */

/** Lowercase, no diacritics, đ -> d. One output character per input character. */
function foldChar(ch: string): string {
  const folded = ch.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
  return folded === "đ" ? "d" : folded
}

/** Folds `text` and keeps, for each folded character, the index it came from. */
function fold(text: string): { folded: string; origin: number[] } {
  let folded = ""
  const origin: number[] = []
  for (let i = 0; i < text.length; i++) {
    for (const ch of foldChar(text[i])) {
      folded += ch
      origin.push(i)
    }
  }
  return { folded, origin }
}

export function foldText(text: string): string {
  return fold(text).folded
}

export function queryTerms(query: string): string[] {
  return [
    ...new Set(
      foldText(query)
        .split(/[^\p{L}\p{N}%]+/u)
        .filter(Boolean)
    ),
  ]
}

/** Text cut into plain and matched parts, ready to render with <mark>. */
export type Segment = { text: string; hit: boolean }

/** Every range of `text` that matches one of the terms, merged where they overlap. */
function hitRanges(text: string, terms: string[]): [number, number][] {
  const { folded, origin } = fold(text)
  const ranges: [number, number][] = []
  for (const term of terms) {
    let at = folded.indexOf(term)
    while (at !== -1) {
      ranges.push([origin[at], origin[at + term.length - 1] + 1])
      at = folded.indexOf(term, at + term.length)
    }
  }
  ranges.sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []
  for (const r of ranges) {
    const last = merged.at(-1)
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1])
    else merged.push([...r])
  }
  return merged
}

export function highlight(text: string, terms: string[]): Segment[] {
  const segments: Segment[] = []
  let cursor = 0
  for (const [start, end] of hitRanges(text, terms)) {
    if (start > cursor)
      segments.push({ text: text.slice(cursor, start), hit: false })
    segments.push({ text: text.slice(start, end), hit: true })
    cursor = end
  }
  if (cursor < text.length)
    segments.push({ text: text.slice(cursor), hit: false })
  return segments
}

/** About `radius` characters either side of the first match, cut at word boundaries. */
function snippet(text: string, terms: string[], radius = 90): string {
  const first = hitRanges(text, terms)[0]
  if (!first) return text.slice(0, radius * 2)
  let start = Math.max(0, first[0] - radius)
  let end = Math.min(text.length, first[1] + radius)
  if (start > 0) start = text.indexOf(" ", start) + 1
  if (end < text.length) end = Math.max(text.lastIndexOf(" ", end), first[1])
  return `${start > 0 ? "… " : ""}${text.slice(start, end).trim()}${end < text.length ? " …" : ""}`
}

export interface SearchHit {
  article: Article
  title: Segment[]
  snippet: Segment[]
}

/**
 * An article matches when every term appears in its number, title or text.
 * Ranking: the article whose number was typed, then title matches, then how often
 * the terms appear in the text.
 */
export function searchArticles(
  articles: Article[],
  query: string
): SearchHit[] {
  const terms = queryTerms(query)
  if (!terms.length) return []
  const number = /(?:^|\D)(\d{1,3})(?:\D|$)/.exec(query.trim())?.[1]

  return articles
    .map((article) => {
      // The body without its "Điều N. Title" heading line.
      const body = article.noi_dung.slice(article.noi_dung.indexOf("\n") + 1)
      const title = foldText(article.tieu_de)
      const text = foldText(body)
      const all = `dieu ${article.dieu} ${title} ${text}`
      if (!terms.every((t) => all.includes(t))) return null

      const exactNumber =
        number !== undefined && Number(number) === article.dieu
      const titleHits = terms.filter((t) => title.includes(t)).length
      const textHits = terms.reduce((n, t) => n + (text.split(t).length - 1), 0)
      return {
        score: (exactNumber ? 1_000_000 : 0) + titleHits * 1_000 + textHits,
        hit: {
          article,
          title: highlight(article.tieu_de, terms),
          snippet: highlight(snippet(body.replace(/\n+/g, " "), terms), terms),
        },
      }
    })
    .filter((r) => r !== null)
    .sort(
      (a, b) => b.score - a.score || a.hit.article.dieu - b.hit.article.dieu
    )
    .map((r) => r.hit)
}
