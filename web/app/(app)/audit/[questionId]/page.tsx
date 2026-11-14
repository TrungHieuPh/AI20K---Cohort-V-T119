import type { Metadata } from "next"

import { QuestionView } from "@/components/app/question-view"
import { getArticles, getAuditRun, getLawInfo } from "@/lib/data"
import { citedArticles } from "@/lib/law"
import { retrievedArticle } from "@/lib/results"
import type { Article } from "@/lib/types"

// The demo questions are prerendered. Any other id still renders: it may belong to a
// results.json opened in the browser, which only the client knows about.
export async function generateStaticParams() {
  const run = await getAuditRun()
  return run.questions.map((q) => ({ questionId: String(q.id) }))
}

export async function generateMetadata({
  params,
}: PageProps<"/audit/[questionId]">): Promise<Metadata> {
  const { questionId } = await params
  return { title: `Câu #${questionId}` }
}

export default async function QuestionPage({
  params,
}: PageProps<"/audit/[questionId]">) {
  const { questionId } = await params
  const [run, articles, law] = await Promise.all([
    getAuditRun(),
    getArticles(),
    getLawInfo(),
  ])

  // Ship only the articles the demo question with this id needs, not the whole law.
  const q = run.questions.find((item) => String(item.id) === questionId)
  const known = q
    ? [
        ...new Set([
          ...q.cac_y.flatMap((c) => citedArticles(c.trich_dan)),
          ...q.dieu_truy_hoi.flatMap((raw) => {
            const dieu = retrievedArticle(raw)
            return dieu === null ? [] : [dieu]
          }),
        ]),
      ]
    : []
  const byNumber = new Map(articles.map((a) => [a.dieu, a]))
  const initial = known.flatMap((dieu): Article[] => {
    const article = byNumber.get(dieu)
    return article ? [article] : []
  })

  return (
    <QuestionView
      questionId={questionId}
      initialArticles={initial}
      knownArticles={known}
      lawSource={law.source}
    />
  )
}
