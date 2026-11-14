"use client"

import { useEffect, useRef, useState } from "react"
import { CircleAlert, LoaderCircle, ShieldCheck, Trash2 } from "lucide-react"

import { AnswerText, locateClaims } from "@/components/app/answer-text"
import {
  ArticleSheet,
  createArticleSheetHandle,
  useArticles,
} from "@/components/app/article-sheet"
import {
  LABEL_MEANING,
  LiveAuditPending,
  LiveAuditResult,
  auditArticles,
} from "@/components/app/live-audit"
import { Eyebrow, PageHero, PageShell } from "@/components/app/page-shell"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { VerdictBadge } from "@/components/verdict-badge"
import { MAX_ANSWER, MAX_QUESTION, auditAnswer } from "@/lib/audit-api"
import { PAGE } from "@/lib/pages"
import type { AuditedQuestion, ClaimLabel } from "@/lib/types"
import { cn } from "@/lib/utils"
import { CLAIM_LABEL, QUESTION_RULES, QUESTION_VERDICT } from "@/lib/verdicts"

export interface CheckSample {
  cau_hoi: string
  cau_tra_loi: string
}

type Audit =
  | { state: "pending" }
  | { state: "done"; result: AuditedQuestion }
  | { state: "error"; error: string }

const CLAIM_ANCHOR = "kiem-y-"

const STEPS = [
  "Tìm các Điều luật gần nhất với câu hỏi và câu trả lời, thêm các Điều chatbot tự dẫn.",
  "AI chấm tách câu trả lời thành từng ý, gán nhãn và trích Điều, khoản làm căn cứ.",
  "Hệ thống kiểm lại: ý dẫn một Điều không nằm trong các Điều đã đưa thì bị hạ xuống Không căn cứ.",
]

const LABELS: ClaimLabel[] = ["DUNG", "TRAI_LUAT", "KHONG_CAN_CU"]

/**
 * Paste any chatbot's question and answer, audit it on the spot (POST /api/audit). The
 * samples are the team's demo questions (mock/mock_results.json), only to fill the form.
 */
export function CheckView({
  samples,
  lawSource,
}: {
  samples: CheckSample[]
  lawSource: string
}) {
  const [question, setQuestion] = useState("")
  const [answer, setAnswer] = useState("")
  const [audit, setAudit] = useState<Audit | null>(null)
  const [handle] = useState(createArticleSheetHandle)
  const resultRef = useRef<HTMLElement>(null)

  const needed = audit?.state === "done" ? auditArticles(audit.result) : []
  const { articles, status } = useArticles([], [], needed)

  const pending = audit?.state === "pending"
  const questionTooLong = question.length > MAX_QUESTION
  const answerTooLong = answer.length > MAX_ANSWER
  const ready =
    question.trim() !== "" &&
    answer.trim() !== "" &&
    !questionTooLong &&
    !answerTooLong &&
    !pending

  useEffect(() => {
    if (audit)
      resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [audit])

  async function submit() {
    if (!ready) return
    setAudit({ state: "pending" })
    const outcome = await auditAnswer(question.trim(), answer.trim())
    setAudit(
      outcome.ok
        ? { state: "done", result: outcome.result }
        : { state: "error", error: outcome.error }
    )
  }

  const form = (
    <Card className="shadow-2xl shadow-black/30 [--card-spacing:--spacing(5)] [--ring:var(--primary)] sm:[--card-spacing:--spacing(6)]">
      <CardHeader>
        <CardTitle>Câu cần kiểm</CardTitle>
        <CardDescription>
          Mỗi lần kiểm một câu hỏi cùng câu trả lời của chatbot cho câu đó.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          id="check-form"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <FieldGroup>
            <Field data-invalid={questionTooLong || undefined}>
              <FieldLabel htmlFor="check-question">Câu hỏi</FieldLabel>
              <Textarea
                id="check-question"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ví dụ: Thời gian thử việc tối đa là bao lâu?"
                aria-invalid={questionTooLong || undefined}
                aria-describedby="check-question-count"
                className="min-h-16 bg-background"
              />
              <FieldDescription
                id="check-question-count"
                className={cn(
                  "text-xs tabular-nums",
                  questionTooLong && "font-medium text-destructive"
                )}
              >
                {questionTooLong
                  ? `Quá dài: ${question.length}/${MAX_QUESTION} ký tự.`
                  : `${question.length}/${MAX_QUESTION} ký tự`}
              </FieldDescription>
            </Field>
            <Field data-invalid={answerTooLong || undefined}>
              <FieldLabel htmlFor="check-answer">
                Câu trả lời của chatbot
              </FieldLabel>
              <Textarea
                id="check-answer"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Dán nguyên văn câu trả lời cần kiểm."
                aria-invalid={answerTooLong || undefined}
                aria-describedby="check-answer-count"
                className="min-h-36 bg-background"
              />
              <FieldDescription
                id="check-answer-count"
                className={cn(
                  "text-xs tabular-nums",
                  answerTooLong && "font-medium text-destructive"
                )}
              >
                {answerTooLong
                  ? `Quá dài: ${answer.length}/${MAX_ANSWER} ký tự.`
                  : `${answer.length}/${MAX_ANSWER} ký tự`}
              </FieldDescription>
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="lg" disabled={!ready}>
                {pending ? (
                  <LoaderCircle
                    data-icon="inline-start"
                    aria-hidden
                    className="animate-spin motion-reduce:animate-none"
                  />
                ) : (
                  <ShieldCheck data-icon="inline-start" aria-hidden />
                )}
                {pending ? "Đang kiểm…" : "Kiểm định"}
              </Button>
              {(question || answer) && (
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  disabled={pending}
                  onClick={() => {
                    setQuestion("")
                    setAnswer("")
                  }}
                >
                  <Trash2 data-icon="inline-start" aria-hidden />
                  Xoá nội dung
                </Button>
              )}
            </div>
          </FieldGroup>
        </form>
      </CardContent>
      {samples.length > 0 && (
        <CardFooter className="flex-col items-start gap-2.5">
          <p className="text-sm text-muted-foreground">
            Chưa có câu nào để dán? Bấm một câu mẫu để điền sẵn cả hai ô:
          </p>
          <ul className="flex flex-wrap gap-2">
            {samples.map((s) => (
              <li key={s.cau_hoi}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    setQuestion(s.cau_hoi)
                    setAnswer(s.cau_tra_loi)
                  }}
                  className="h-auto bg-card py-1 text-left whitespace-normal"
                >
                  {s.cau_hoi}
                </Button>
              </li>
            ))}
          </ul>
        </CardFooter>
      )}
    </Card>
  )

  return (
    <>
      <PageHero
        eyebrow="§ Thử trực tiếp"
        title={PAGE.check}
        description="Dán câu hỏi và câu trả lời của bất kỳ chatbot nào. lexgate tách câu trả lời thành từng ý, so từng ý với Bộ luật Lao động, rồi chỉ ra ý nào đúng, ý nào trái luật, ý nào không có căn cứ."
        aside={form}
      >
        <section
          aria-labelledby="check-how"
          className="mt-4 flex flex-col gap-3"
        >
          <h2
            id="check-how"
            className="text-xs font-bold tracking-[0.08em] text-hero-muted uppercase"
          >
            lexgate kiểm thế nào
          </h2>
          <ol className="flex flex-col border-t border-hero-border">
            {STEPS.map((step, i) => (
              <li
                key={i}
                className="flex gap-4 border-b border-hero-border py-3.5"
              >
                <span className="pt-px font-mono text-sm font-semibold text-hero-accent tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="leading-relaxed text-pretty">{step}</span>
              </li>
            ))}
          </ol>
        </section>
      </PageHero>

      <PageShell className="gap-14 lg:py-14">
        {audit && (
          <section
            ref={resultRef}
            aria-labelledby="check-result-title"
            aria-live="polite"
            className="flex scroll-mt-24 flex-col gap-5"
          >
            <div className="flex flex-col gap-2">
              <Eyebrow>§ Kết quả</Eyebrow>
              <h2
                id="check-result-title"
                className="font-heading text-2xl font-extrabold tracking-tight sm:text-3xl"
              >
                Kết quả kiểm
              </h2>
            </div>
            {audit.state === "pending" && <LiveAuditPending />}
            {audit.state === "error" && (
              <Alert variant="destructive" className="bg-card">
                <CircleAlert aria-hidden />
                <AlertTitle>Chưa kiểm được</AlertTitle>
                <AlertDescription>{audit.error}</AlertDescription>
              </Alert>
            )}
            {audit.state === "done" && (
              <>
                <CheckedAnswer result={audit.result} />
                <LiveAuditResult
                  result={audit.result}
                  articles={articles}
                  status={status}
                  handle={handle}
                  anchorPrefix={CLAIM_ANCHOR}
                />
              </>
            )}
          </section>
        )}

        <section aria-labelledby="check-labels" className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <Eyebrow>§ Cách đọc kết quả</Eyebrow>
            <h2
              id="check-labels"
              className="font-heading text-2xl font-extrabold tracking-tight sm:text-3xl"
            >
              Ba nhãn cho mỗi ý
            </h2>
          </div>
          <dl className="grid gap-4 md:grid-cols-3">
            {LABELS.map((label) => (
              <div
                key={label}
                className="flex flex-col gap-3 rounded-xl bg-card p-5 ring-1 ring-foreground/10"
              >
                <dt>
                  <VerdictBadge verdict={CLAIM_LABEL[label]} size="lg" />
                </dt>
                <dd className="leading-relaxed text-pretty text-muted-foreground">
                  {LABEL_MEANING[label]}
                </dd>
              </div>
            ))}
          </dl>
          <div className="flex max-w-3xl flex-col gap-3">
            <h3 className="font-heading text-base font-bold">
              Từ các ý ra kết luận cho cả câu trả lời
            </h3>
            <ul className="flex flex-col border-t">
              {QUESTION_RULES.map((rule) => (
                <li
                  key={rule.verdict}
                  className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b py-3"
                >
                  <span className="text-pretty">{rule.when}</span>
                  <VerdictBadge verdict={QUESTION_VERDICT[rule.verdict]} />
                </li>
              ))}
            </ul>
          </div>
        </section>

        <ArticleSheet
          handle={handle}
          articles={articles}
          status={status}
          lawSource={lawSource}
        />
      </PageShell>
    </>
  )
}

/** What was audited, kept as sent even if the form is edited afterwards. */
function CheckedAnswer({ result }: { result: AuditedQuestion }) {
  const marked = locateClaims(result.cau_tra_loi, result.cac_y).some(
    (s) => s.claim !== undefined
  )
  return (
    <Card>
      <CardHeader>
        <CardDescription>Câu hỏi</CardDescription>
        <CardTitle className="text-pretty">{result.cau_hoi}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">Câu trả lời đã kiểm</p>
        <blockquote className="max-w-3xl text-[1.05rem] leading-loose text-pretty whitespace-pre-line">
          <AnswerText
            answer={result.cau_tra_loi}
            claims={result.cac_y}
            anchorPrefix={CLAIM_ANCHOR}
          />
        </blockquote>
        {result.cac_y.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {marked
              ? "Mỗi phần gạch chân là một ý được chấm riêng. Bấm số nhỏ để xuống ý đó."
              : `Câu trả lời được tách thành ${result.cac_y.length} ý để chấm riêng ở bên dưới.`}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
