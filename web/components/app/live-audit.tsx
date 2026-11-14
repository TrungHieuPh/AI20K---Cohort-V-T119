import { BookOpen, CircleAlert, ListX, LoaderCircle } from "lucide-react"

import {
  ArticleTrigger,
  type ArticleSheetHandle,
  type LawStatus,
} from "@/components/app/article-sheet"
import { ClaimComparison } from "@/components/app/claim-comparison"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { VerdictBadge } from "@/components/verdict-badge"
import { formatScore, formatSeconds, formatUsd } from "@/lib/format"
import { citedArticles } from "@/lib/law"
import { retrievedArticle } from "@/lib/results"
import type { Article, AuditedQuestion, ClaimLabel } from "@/lib/types"
import { cn } from "@/lib/utils"
import {
  CLAIM_LABEL,
  QUESTION_VERDICT,
  lowerFirst,
  questionRuleFor,
} from "@/lib/verdicts"

/** In the order a reader should look at them: problems first. */
const LABEL_ORDER: ClaimLabel[] = ["TRAI_LUAT", "KHONG_CAN_CU", "DUNG"]

/** What each claim label means, for a reader who has not seen the audit before. */
export const LABEL_MEANING: Record<ClaimLabel, string> = {
  DUNG: "Khớp với Điều luật được dẫn.",
  TRAI_LUAT: "Ngược với văn bản luật, ví dụ sai con số hay dùng luật cũ.",
  KHONG_CAN_CU:
    "Bộ luật không có căn cứ cho ý này, ví dụ một quyền lợi tự thêm vào.",
}

/** Every article a live result may open in the panel: cited by a claim, or retrieved. */
export function auditArticles(result: AuditedQuestion): number[] {
  return [
    ...result.cac_y.flatMap((c) => citedArticles(c.trich_dan)),
    ...result.dieu_truy_hoi.flatMap((id) => {
      const dieu = retrievedArticle(id)
      return dieu === null ? [] : [dieu]
    }),
  ]
}

/** While POST /api/audit runs: one request, so no fake progress, only what is happening. */
export function LiveAuditPending() {
  return (
    <div className="flex flex-col gap-3">
      <p
        role="status"
        className="flex items-center gap-2 text-sm text-muted-foreground"
      >
        <LoaderCircle
          aria-hidden
          className="size-4 animate-spin motion-reduce:animate-none"
        />
        Đang tách câu trả lời thành từng ý và so từng ý với Bộ luật Lao động…
      </p>
      <div aria-hidden className="grid gap-3">
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
      </div>
    </div>
  )
}

/**
 * The audit of one answer, done live: the verdict and why, a count of claims per label,
 * then every claim next to the law it cites. Same pieces as the per-question screen, so
 * a live result reads exactly like one from a results file.
 */
export function LiveAuditResult({
  result,
  articles,
  status,
  handle,
  anchorPrefix,
}: {
  result: AuditedQuestion
  articles: Map<number, Article>
  status: LawStatus
  handle: ArticleSheetHandle
  /** Claim cards get ids `${anchorPrefix}${n}`, n from 1, for links from the answer. */
  anchorPrefix: string
}) {
  const verdict = QUESTION_VERDICT[result.ket_luan]
  const rule = questionRuleFor(result.ket_luan)
  const tally = LABEL_ORDER.map((label) => ({
    label,
    count: result.cac_y.filter((c) => c.nhan === label).length,
  })).filter((t) => t.count > 0)
  const retrieved = result.dieu_truy_hoi.flatMap((id) => {
    const dieu = retrievedArticle(id)
    return dieu === null ? [] : [dieu]
  })

  const metrics = [
    { term: "Tỉ lệ ý đúng", value: formatScore(result.faithfulness) },
    { term: "Thời gian", value: formatSeconds(result.thoi_gian_ms) },
    { term: "Chi phí", value: formatUsd(result.chi_phi_usd) },
  ]

  return (
    <div className="@container flex flex-col gap-4">
      <div className="flex flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10 @3xl:flex-row @3xl:items-center @3xl:justify-between">
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="text-sm text-muted-foreground">Kết luận</span>
            <VerdictBadge verdict={verdict} size="lg" />
            {rule && (
              <span className="text-sm">vì {lowerFirst(rule.when)}.</span>
            )}
          </div>
          {tally.length > 0 && (
            <ul
              aria-label="Số ý theo nhãn"
              className="flex flex-wrap gap-x-4 gap-y-1 text-sm"
            >
              {tally.map(({ label, count }) => {
                const meta = CLAIM_LABEL[label]
                const Icon = meta.icon
                return (
                  <li key={label} className="flex items-center gap-1.5">
                    <Icon
                      aria-hidden
                      className={cn("size-4", TONE_TEXT[meta.tone])}
                    />
                    <span className="font-semibold tabular-nums">{count}</span>ý{" "}
                    {meta.label.toLowerCase()}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
        <dl className="grid grid-cols-3 gap-4 @3xl:flex @3xl:gap-8">
          {metrics.map((m) => (
            <div key={m.term} className="flex flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">{m.term}</dt>
              <dd className="text-sm font-semibold tabular-nums">{m.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {result.loi && (
        <Alert role="note">
          <CircleAlert aria-hidden />
          <AlertTitle>Không kiểm được câu này</AlertTitle>
          <AlertDescription>{result.loi}</AlertDescription>
        </Alert>
      )}

      {result.cac_y.length ? (
        <ol className="flex flex-col gap-4">
          {result.cac_y.map((claim, i) => (
            <li key={i}>
              <ClaimComparison
                claim={claim}
                number={i + 1}
                id={`${anchorPrefix}${i + 1}`}
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
              {result.loi
                ? "Câu này gặp lỗi trước khi AI chấm kịp chấm."
                : "AI chấm không tách được ý nào từ câu trả lời này."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {retrieved.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            AI chấm đã đọc {retrieved.length} Điều luật gần nhất với câu hỏi và
            câu trả lời. Bấm để đọc toàn văn.
          </p>
          <ul className="flex flex-wrap gap-2">
            {retrieved.map((dieu, i) => (
              <li key={`${dieu}-${i}`}>
                <ArticleTrigger
                  handle={handle}
                  dieu={dieu}
                  className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-sm hover:bg-muted"
                >
                  <BookOpen aria-hidden className="size-3.5" />
                  Điều {dieu}
                </ArticleTrigger>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

const TONE_TEXT = {
  correct: "text-verdict-correct",
  wrong: "text-verdict-wrong",
  ungrounded: "text-verdict-ungrounded",
  error: "text-verdict-error",
} as const
