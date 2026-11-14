import "server-only"

import { readFile } from "node:fs/promises"
import path from "node:path"
import { cache } from "react"

import { citedArticles } from "@/lib/law"
import { parseResults, type AuditRun } from "@/lib/results"
import type { Article, Claim, ScoreReport } from "@/lib/types"

/**
 * Reads the repo's files straight from disk, at build time or on the server. Phase 2
 * (FastAPI, docs/ui-dac-ta.md §6) swaps these bodies for fetch() calls; the pages keep
 * the same functions.
 *
 * mock_results.json is real pipeline output on the 4 demo questions and mock_score.json
 * the real score of the 10-question dev set: neither is the blind test set.
 */
const REPO_ROOT = path.join(process.cwd(), "..")
const RESULTS_FILE = path.join(REPO_ROOT, "mock", "mock_results.json")
const SCORE_FILE = path.join(REPO_ROOT, "mock", "mock_score.json")
const LAW_FILE = path.join(REPO_ROOT, "data", "law", "dieu.jsonl")

export type { AuditRun } from "@/lib/results"

/** The demo run. A file the user opens in the browser replaces it client-side only. */
export const getAuditRun = cache(async (): Promise<AuditRun> => {
  const parsed = parseResults(JSON.parse(await readFile(RESULTS_FILE, "utf8")))
  if (!parsed.ok)
    throw new Error(`mock/mock_results.json sai định dạng: ${parsed.error}`)
  return parsed.run
})

export const getScore = cache(async (): Promise<ScoreReport> => {
  return JSON.parse(await readFile(SCORE_FILE, "utf8")) as ScoreReport
})

export const getArticles = cache(async (): Promise<Article[]> => {
  const text = await readFile(LAW_FILE, "utf8")
  return text
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as Article)
})

export async function getArticle(dieu: number): Promise<Article | undefined> {
  return (await getArticles()).find((a) => a.dieu === dieu)
}

export interface LawInfo {
  articles: number
  chapters: number
  source: string
}

export async function getLawInfo(): Promise<LawInfo> {
  const articles = await getArticles()
  return {
    articles: articles.length,
    chapters: new Set(articles.map((a) => a.chuong)).size,
    source: articles[0]?.nguon ?? "",
  }
}

export interface ArticleAuditRef {
  questionId: string
  question: string
  /** Labels of the claims that cite this article (empty when it was only retrieved). */
  citedAs: Claim["nhan"][]
  /** 1-based rank among the retrieved articles, or null when not retrieved. */
  retrievedRank: number | null
}

/** Where an article shows up in the demo run: cited by a claim, retrieved, or both. */
export async function getArticleAuditRefs(
  dieu: number
): Promise<ArticleAuditRef[]> {
  const run = await getAuditRun()
  return run.questions
    .map((q) => {
      const rank = q.dieu_truy_hoi.indexOf(`dieu-${dieu}`)
      return {
        questionId: String(q.id),
        question: q.cau_hoi,
        citedAs: q.cac_y
          .filter((c) => citedArticles(c.trich_dan).includes(dieu))
          .map((c) => c.nhan),
        retrievedRank: rank === -1 ? null : rank + 1,
      }
    })
    .filter((r) => r.citedAs.length || r.retrievedRank !== null)
}
