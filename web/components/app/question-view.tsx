"use client"

import { useState } from "react"
import Link from "next/link"
import {
  Bot,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  FileSearch,
  ListX,
  Quote,
} from "lucide-react"

import { AnswerText, locateClaims } from "@/components/app/answer-text"
import {
  ArticleSheet,
  ArticleTrigger,
  createArticleSheetHandle,
  useArticles,
} from "@/components/app/article-sheet"
import { ClaimComparison } from "@/components/app/claim-comparison"
import {
  PageHeader,
  PageShell,
  SectionLabel,
} from "@/components/app/page-shell"
import {
  sourceLabel,
  useHydrated,
  useResults,
} from "@/components/app/results-provider"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { VerdictBadge } from "@/components/verdict-badge"
import { formatScore, formatSeconds, formatUsd } from "@/lib/format"
import { citedArticles, evidencePhrases } from "@/lib/law"
import { MISSING_QUESTION, retrievedArticle } from "@/lib/results"
import type { Article } from "@/lib/types"
import { cn } from "@/lib/utils"
import { lowerFirst, QUESTION_VERDICT, questionRuleFor } from "@/lib/verdicts"

const CLAIM_ANCHOR = "y-"
const MISSING_ANSWER = "(không có nội dung câu trả lời)"

/**
 * Screen 3: one question of the active run, claim by claim. Every citation and retrieved
 * article opens the article panel instead of leaving the page.
 */
export function QuestionView({
  questionId,
  initialArticles,
  knownArticles,
  lawSource,
}: {
  questionId: string
  /** Articles the server already looked up for the demo question with this id. */
  initialArticles: Article[]
  /** Every number the server looked up, found or not. */
  knownArticles: number[]
  lawSource: string
}) {
  const { run, source } = useResults()
  const hydrated = useHydrated()
  const [handle] = useState(createArticleSheetHandle)

  const at = run.questions.findIndex((q) => String(q.id) === questionId)
  const q = at === -1 ? undefined : run.questions[at]

  const cited = new Set(
    q?.cac_y.flatMap((c) => citedArticles(c.trich_dan)) ?? []
  )
  const retrieved = (q?.dieu_truy_hoi ?? []).map((raw) => ({
    raw,
    dieu: retrievedArticle(raw),
  }))
  const needed = [
    ...cited,
    ...retrieved.flatMap((r) => (r.dieu === null ? [] : [r.dieu])),
  ]
  const { articles, status } = useArticles(
    initialArticles,
    knownArticles,
    needed
  )

  if (!q) {
    // Until hydration the run is always the demo: an opened file may still have this id.
    if (!hydrated) return <QuestionSkeleton />
    return (
      <PageShell>
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileSearch aria-hidden />
            </EmptyMedia>
            <EmptyTitle>
              Không có câu #{questionId} trong lượt đang xem
            </EmptyTitle>
            <EmptyDescription>
              Đang xem: {sourceLabel(source)}. Câu này có thể thuộc một tệp
              results.json khác.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="flex-row flex-wrap justify-center">
            <Link
              href="/audit"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              Về danh sách câu
            </Link>
            <Link
              href="/audit/open"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              Mở results.json khác
            </Link>
          </EmptyContent>
        </Empty>
      </PageShell>
    )
  }

  const prev = run.questions[at - 1]
  const next = run.questions[at + 1]
  const verdict = QUESTION_VERDICT[q.ket_luan]
  const rule = questionRuleFor(q.ket_luan)
  const marked =
    Boolean(q.cau_tra_loi) &&
    locateClaims(q.cau_tra_loi, q.cac_y).some((s) => s.claim !== undefined)
  const citedNotRetrieved = [...cited].filter(
    (d) => !retrieved.some((r) => r.dieu === d)
  )

  // A retrieved article opens with the evidence of every claim citing it highlighted.
  const phrasesFor = (dieu: number) =>
    q.cac_y
      .filter((c) => citedArticles(c.trich_dan).includes(dieu))
      .flatMap((c) => evidencePhrases(c.bang_chung))

  const metrics = [
    { term: "Faithfulness", value: formatScore(q.faithfulness) },
    { term: "Số ý", value: String(q.cac_y.length) },
    { term: "Thời gian", value: formatSeconds(q.thoi_gian_ms) },
    { term: "Chi phí", value: formatUsd(q.chi_phi_usd) },
  ]

  return (
    <PageShell>
      <PageHeader
        eyebrow={`Câu hỏi #${q.id} · ${sourceLabel(source)}`}
        title={q.cau_hoi || `Câu #${q.id}`}
        description={q.cau_hoi ? undefined : MISSING_QUESTION}
        actions={
          <nav aria-label="Chuyển câu hỏi" className="flex gap-2">
            {prev ? (
              <Link
                href={`/audit/${prev.id}`}
                aria-label={`Câu trước: Câu #${prev.id}`}
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" })
                )}
              >
                <ChevronLeft data-icon="inline-start" aria-hidden />
                Câu #{prev.id}
              </Link>
            ) : (
              <Button variant="outline" size="lg" disabled>
                <ChevronLeft data-icon="inline-start" aria-hidden />
                Câu trước
              </Button>
            )}
            {next ? (
              <Link
                href={`/audit/${next.id}`}
                aria-label={`Câu sau: Câu #${next.id}`}
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" })
                )}
              >
                Câu #{next.id}
                <ChevronRight data-icon="inline-end" aria-hidden />
              </Link>
            ) : (
              <Button variant="outline" size="lg" disabled>
                Câu sau
                <ChevronRight data-icon="inline-end" aria-hidden />
              </Button>
            )}
          </nav>
        }
      />

      <Card size="sm">
        <CardContent className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="text-sm text-muted-foreground">Kết luận</span>
            <VerdictBadge verdict={verdict} size="lg" />
            {rule && (
              <span className="text-sm">vì {lowerFirst(rule.when)}.</span>
            )}
          </div>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:flex lg:gap-8">
            {metrics.map((m) => (
              <div key={m.term} className="flex flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">{m.term}</dt>
                <dd className="text-sm font-semibold tabular-nums">
                  {m.value}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      {q.loi && (
        <Alert role="note">
          <CircleAlert aria-hidden />
          <AlertTitle>Pipeline lỗi ở câu này</AlertTitle>
          <AlertDescription>{q.loi}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-full bg-muted ring-1 ring-border">
              <Bot aria-hidden className="size-4 text-muted-foreground" />
            </span>
            Câu trả lời của chatbot
          </CardTitle>
          {q.cau_tra_loi && q.cac_y.length > 0 && (
            <CardDescription>
              {marked
                ? "Phần gạch chân là ý được chấm riêng; số nhỏ dẫn tới ý đó ở bên dưới."
                : `Câu trả lời được tách thành ${q.cac_y.length} ý để chấm riêng ở bên dưới.`}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {q.cau_tra_loi ? (
            <blockquote className="max-w-3xl text-[1.05rem] leading-loose text-pretty">
              <AnswerText
                answer={q.cau_tra_loi}
                claims={q.cac_y}
                anchorPrefix={CLAIM_ANCHOR}
              />
            </blockquote>
          ) : (
            <p className="text-muted-foreground italic">{MISSING_ANSWER}</p>
          )}
        </CardContent>
      </Card>

      <section aria-labelledby="claims-title" className="flex flex-col gap-3">
        <SectionLabel id="claims-title">
          Đối chiếu từng ý · {q.cac_y.length} ý
        </SectionLabel>
        {q.cac_y.length ? (
          <ol className="flex flex-col gap-4">
            {q.cac_y.map((claim, i) => (
              <li key={i}>
                <ClaimComparison
                  claim={claim}
                  number={i + 1}
                  id={`${CLAIM_ANCHOR}${i + 1}`}
                  articles={articles}
                  status={status}
                  handle={handle}
                />
              </li>
            ))}
          </ol>
        ) : (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ListX aria-hidden />
              </EmptyMedia>
              <EmptyTitle>Chưa có ý nào được chấm</EmptyTitle>
              <EmptyDescription>
                {q.loi
                  ? "Câu này lỗi trước khi judge kịp chấm."
                  : "Judge không tách được ý nào từ câu trả lời này."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </section>

      {retrieved.length > 0 && (
        <section
          aria-labelledby="retrieved-title"
          className="flex flex-col gap-3"
        >
          <div className="flex flex-col gap-1">
            <SectionLabel id="retrieved-title">
              Điều truy hồi · top {retrieved.length}
            </SectionLabel>
            <p className="text-sm text-muted-foreground">
              Bộ truy hồi đưa {retrieved.length} Điều này cho judge làm căn cứ,
              xếp theo độ gần với câu hỏi. Bấm để đọc toàn văn.
            </p>
          </div>
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {retrieved.map(({ raw, dieu }, i) => {
              const card =
                "flex h-full w-full flex-col gap-2 rounded-xl bg-card p-3.5 text-left ring-1 ring-foreground/10"
              const rank = (
                <span className="font-mono text-xs text-muted-foreground">
                  #{i + 1}
                </span>
              )
              if (dieu === null) {
                return (
                  <li key={`${raw}-${i}`}>
                    <div className={card}>
                      {rank}
                      <span className="font-mono text-sm break-all">{raw}</span>
                      <span className="text-sm text-muted-foreground">
                        Không đọc được mã Điều
                      </span>
                    </div>
                  </li>
                )
              }
              const article = articles.get(dieu)
              return (
                <li key={`${raw}-${i}`}>
                  <ArticleTrigger
                    handle={handle}
                    dieu={dieu}
                    phrases={phrasesFor(dieu)}
                    className={cn(
                      card,
                      "transition-colors outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
                    )}
                  >
                    <span className="flex w-full items-center justify-between gap-2">
                      {rank}
                      {cited.has(dieu) && (
                        <Badge variant="outline">
                          <Quote data-icon="inline-start" aria-hidden />
                          Được trích
                        </Badge>
                      )}
                    </span>
                    <span className="font-medium">Điều {dieu}</span>
                    <span className="text-sm leading-snug text-pretty text-muted-foreground">
                      {article?.tieu_de ??
                        (status === "loading"
                          ? "Đang tải…"
                          : "Không có trong Bộ luật")}
                    </span>
                  </ArticleTrigger>
                </li>
              )
            })}
          </ol>
          {citedNotRetrieved.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {citedNotRetrieved.map((d) => `Điều ${d}`).join(", ")} được trích
              nhưng không nằm trong các Điều truy hồi.
            </p>
          )}
        </section>
      )}

      <ArticleSheet
        handle={handle}
        articles={articles}
        status={status}
        lawSource={lawSource}
      />
    </PageShell>
  )
}

function QuestionSkeleton() {
  return (
    <PageShell aria-busy="true">
      <p role="status" className="sr-only">
        Đang mở câu hỏi…
      </p>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-9 w-full max-w-2xl" />
      </div>
      <Skeleton className="h-20 w-full rounded-xl" />
      <Skeleton className="h-48 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </PageShell>
  )
}
