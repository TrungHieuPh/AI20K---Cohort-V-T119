import { notFound } from "next/navigation"

import { ComparisonCard } from "@/components/landing/comparison-card"
import { DemoResults } from "@/components/landing/demo-results"
import { FinalCta } from "@/components/landing/final-cta"
import { Hero } from "@/components/landing/hero"
import { HowItWorks } from "@/components/landing/how-it-works"
import {
  ProblemSection,
  type ProblemCase,
} from "@/components/landing/problem-section"
import { WalkthroughSection } from "@/components/landing/walkthrough-section"
import { getArticle, getArticles, getAuditRun, getLawInfo } from "@/lib/data"
import {
  citedArticles,
  excerpt,
  parseArticle,
  type ExcerptLine,
} from "@/lib/law"
import { retrievedArticle } from "@/lib/results"
import type { Article, AuditedQuestion } from "@/lib/types"

/**
 * The hero's example: demo question #2 against Điều 107. Only the choice of question,
 * clauses and highlighted phrases lives here; every quoted string is read from the
 * data files, and a phrase that is not found there is simply not highlighted.
 */
const FEATURED = {
  questionId: "2",
  article: 107,
  clauses: [{ clause: 2, points: ["c"] }, { clause: 3 }],
  wrongPhrase: "không quá 300 giờ trong 01 năm",
  evidencePhrases: [
    "không quá 200 giờ trong 01 năm",
    "không quá 300 giờ trong 01 năm trong một số ngành, nghề, công việc hoặc trường hợp sau đây",
  ],
}

/**
 * The three planted errors of the demo set, named as in docs/demo-chu-nhat.md §4. Same
 * rule as FEATURED: this picks what to quote and highlight, the text comes from the data.
 */
const PROBLEMS = [
  {
    questionId: "2",
    kind: "Sai con số",
    wrongPhrase: "không quá 300 giờ trong 01 năm",
    law: {
      article: 107,
      clauses: [{ clause: 2, points: ["c"] }],
      phrases: ["không quá 200 giờ trong 01 năm"],
    },
  },
  {
    questionId: "3",
    kind: "Bịa quyền lợi",
    wrongPhrase: "hỗ trợ thêm tiền du lịch bằng 01 tháng lương",
    law: null,
  },
  {
    questionId: "4",
    kind: "Luật cũ",
    wrongPhrase: "06 tháng cho mọi lần sinh",
    law: {
      article: 139,
      clauses: [{ clause: 1 }],
      phrases: [
        "trường hợp sinh con thứ hai, lao động nữ được nghỉ thai sản trước và sau khi sinh con là 07 tháng",
      ],
    },
  },
]

/** A field as a CSV writer would quote it (the demo CSV uses minimal quoting). */
function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/** Keeps each clause to its first paragraph, so a long clause does not swamp the quote. */
function firstParagraphs(lines: ExcerptLine[]): ExcerptLine[] {
  return lines.flatMap((line): ExcerptLine[] => {
    if (line.kind === "gap" || !line.text.includes("\n")) return [line]
    return [{ ...line, text: line.text.split("\n")[0] }, { kind: "gap" }]
  })
}

function buildProblem(
  spec: (typeof PROBLEMS)[number],
  question: AuditedQuestion | undefined,
  byNumber: Map<number, Article>
): ProblemCase | null {
  const claim = question?.cac_y.find((c) => c.nhan !== "DUNG")
  if (!question || !claim) return null
  const base = {
    questionId: spec.questionId,
    kind: spec.kind,
    question: question.cau_hoi,
    claim,
    wrongPhrase: spec.wrongPhrase,
  }

  if (!spec.law) {
    const checked = question.dieu_truy_hoi
      .map(retrievedArticle)
      .flatMap((n) => {
        const article = n === null ? undefined : byNumber.get(n)
        return article ? [{ dieu: article.dieu, title: article.tieu_de }] : []
      })
    return { ...base, law: { kind: "none", checked } }
  }

  const article = byNumber.get(spec.law.article)
  if (!article) return null
  const lines = firstParagraphs(
    excerpt(parseArticle(article.noi_dung), spec.law.clauses)
  )
  return {
    ...base,
    law: {
      kind: "excerpt",
      dieu: article.dieu,
      heading: article.noi_dung.split("\n")[0],
      chapter: article.chuong,
      lines,
      phrases: spec.law.phrases,
      note: article.sua_doi[0],
    },
  }
}

export default async function LandingPage() {
  const [run, law, article, articles] = await Promise.all([
    getAuditRun(),
    getLawInfo(),
    getArticle(FEATURED.article),
    getArticles(),
  ])
  const byNumber = new Map(articles.map((a) => [a.dieu, a]))
  const findQuestion = (id: string) =>
    run.questions.find((q) => String(q.id) === id)

  const question = findQuestion(FEATURED.questionId)
  const claim = question?.cac_y.find((c) => c.nhan === "TRAI_LUAT")
  if (!question || !claim || !article) notFound()

  const problems = PROBLEMS.map((spec) =>
    buildProblem(spec, findQuestion(spec.questionId), byNumber)
  ).filter((p): p is ProblemCase => p !== null)

  const answerCites = citedArticles(question.cau_tra_loi)
  const retrieved = question.dieu_truy_hoi
    .map(retrievedArticle)
    .flatMap((n) => {
      const a = n === null ? undefined : byNumber.get(n)
      return a
        ? [
            {
              dieu: a.dieu,
              title: a.tieu_de,
              citedByAnswer: answerCites.includes(a.dieu),
            },
          ]
        : []
    })
  const csv = [
    "id,cau_hoi,cau_tra_loi",
    [question.id, question.cau_hoi, question.cau_tra_loi]
      .map((v) => csvField(String(v)))
      .join(","),
  ].join("\n")

  return (
    <>
      <Hero law={law}>
        <ComparisonCard
          question={question}
          claim={claim}
          article={article}
          lines={excerpt(parseArticle(article.noi_dung), FEATURED.clauses)}
          wrongPhrase={FEATURED.wrongPhrase}
          evidencePhrases={FEATURED.evidencePhrases}
        />
      </Hero>
      <WalkthroughSection />
      <ProblemSection cases={problems} />
      <HowItWorks
        law={law}
        csv={csv}
        question={question}
        claim={claim}
        retrieved={retrieved}
        summary={run.summary}
      />
      <DemoResults run={run} />
      <FinalCta />
    </>
  )
}
