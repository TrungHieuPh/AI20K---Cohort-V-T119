import Link from "next/link"
import { ArrowRight, CornerDownRight, FileText } from "lucide-react"

import { SectionHeading } from "@/components/landing/section-heading"
import { VerdictBadge } from "@/components/verdict-badge"
import type { LawInfo } from "@/lib/data"
import { formatSeconds, formatUsd } from "@/lib/format"
import type { AuditedQuestion, Claim, RunSummary } from "@/lib/types"
import { cn } from "@/lib/utils"
import {
  CLAIM_LABEL,
  GATE_RULES,
  GATE_VERDICT,
  QUESTION_VERDICT,
  questionRuleFor,
} from "@/lib/verdicts"

export interface RetrievedArticle {
  dieu: number
  title: string
  /** The chatbot's answer itself cites this article. */
  citedByAnswer: boolean
}

/**
 * Follows demo question #2 through the four steps of core/audit.py: read the CSV,
 * retrieve top-5 articles, judge each claim, then the question verdict and the gate.
 * Every value shown is from the data files.
 */
export function HowItWorks({
  law,
  csv,
  question,
  claim,
  retrieved,
  summary,
}: {
  law: LawInfo
  /** Header and the question's row, quoted as a CSV file would be. */
  csv: string
  question: AuditedQuestion
  claim: Claim
  retrieved: RetrievedArticle[]
  summary: RunSummary
}) {
  const questionRule = questionRuleFor(question.ket_luan)

  const steps = [
    {
      title: "Nạp dữ liệu",
      text: "Bộ câu hỏi và câu trả lời của chatbot cần kiểm, dạng CSV, cùng văn bản luật đã cắt theo từng Điều.",
      panel: (
        <div className="flex flex-col gap-3">
          <pre className="overflow-x-auto rounded-lg bg-hero px-4 py-3 font-mono text-[0.78rem] leading-relaxed whitespace-pre-wrap text-hero-muted">
            <code>
              {csv.split("\n").map((line, i) => (
                <span
                  key={i}
                  className={cn("block", i > 0 && "text-hero-foreground")}
                >
                  {line}
                </span>
              ))}
            </code>
          </pre>
          <p className="flex items-center gap-2 text-sm text-hero-muted">
            <FileText aria-hidden className="size-4 shrink-0" />
            {law.source} · {law.articles} Điều
          </p>
        </div>
      ),
      tag: "data/demo/demo_samples.csv",
    },
    {
      title: "Tìm Điều liên quan",
      text: "Cặp hỏi–đáp được đem đi tìm các Điều gần nghĩa nhất. Điều mà chính câu trả lời trích dẫn cũng được đưa vào để đối chiếu.",
      panel: (
        <ol className="flex flex-col">
          {retrieved.map((a, i) => (
            <li
              key={a.dieu}
              className="border-b border-hero-border last:border-b-0"
            >
              <Link
                href={`/law/${a.dieu}`}
                className="flex items-baseline gap-3 px-1 py-2.5 transition-colors hover:bg-hero/60"
              >
                <span className="w-4 font-mono text-xs text-hero-muted tabular-nums">
                  {i + 1}
                </span>
                <span className="w-20 shrink-0 font-mono text-sm whitespace-nowrap text-hero-accent">
                  Điều {a.dieu}
                </span>
                {/* The pill drops under the title when the row is too narrow for both. */}
                <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-sm text-pretty">{a.title}</span>
                  {a.citedByAnswer && (
                    <span className="rounded-full border border-hero-accent/40 px-2 py-0.5 text-[0.7rem] font-semibold whitespace-nowrap text-hero-accent">
                      câu trả lời trích
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      ),
      tag: "bge-m3 · Qdrant · 5 Điều",
    },
    {
      title: "Chấm từng ý",
      text: "Judge tách câu trả lời thành từng ý, gắn một trong ba nhãn và phải chỉ ra Điều, khoản làm căn cứ.",
      panel: (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <VerdictBadge verdict={CLAIM_LABEL[claim.nhan]} />
            <span className="font-mono text-xs text-hero-accent">
              {claim.trich_dan}
            </span>
          </div>
          <p className="font-medium text-pretty">“{claim.noi_dung}”</p>
          <p className="flex gap-2 text-sm leading-relaxed text-pretty text-hero-muted">
            <CornerDownRight aria-hidden className="mt-0.5 size-4 shrink-0" />
            {claim.giai_thich}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 border-t border-hero-border pt-3">
            <span className="mr-1 text-xs text-hero-muted">Ba nhãn:</span>
            {Object.values(CLAIM_LABEL).map((v) => (
              <VerdictBadge key={v.label} verdict={v} />
            ))}
          </div>
        </div>
      ),
      tag: "gpt-4.1-mini · temperature 0",
    },
    {
      title: "Cổng kiểm định",
      text: "Từ nhãn của từng ý ra kết luận của câu, rồi gộp mọi câu thành một quyết định: có cho chatbot ra thị trường hay không.",
      panel: (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-mono text-xs text-hero-muted">
              Câu #{question.id}
            </span>
            <span className="text-hero-muted">{questionRule?.when}</span>
            <ArrowRight aria-hidden className="size-3.5 text-hero-muted" />
            <span className="sr-only">nên câu này</span>
            <VerdictBadge verdict={QUESTION_VERDICT[question.ket_luan]} />
          </div>
          <div className="flex flex-col gap-2">
            <p className="font-mono text-xs text-hero-muted">
              Cả lượt · {summary.so_cau} câu
            </p>
            <ol className="flex flex-col gap-1">
              {GATE_RULES.map((rule) => {
                const fired = rule.gate === summary.cong
                return (
                  <li
                    key={rule.gate}
                    aria-current={fired ? "step" : undefined}
                    className={cn(
                      "flex flex-wrap items-center justify-between gap-2 rounded-md px-3 py-2 text-sm",
                      fired
                        ? "bg-hero font-semibold ring-1 ring-hero-accent/40"
                        : "text-hero-muted"
                    )}
                  >
                    <span>
                      {rule.when}
                      {fired && (
                        <span className="sr-only"> (quy tắc đã áp dụng)</span>
                      )}
                    </span>
                    <VerdictBadge
                      verdict={GATE_VERDICT[rule.gate]}
                      className={cn(!fired && "opacity-60")}
                    />
                  </li>
                )
              })}
            </ol>
          </div>
        </div>
      ),
      tag: `Câu #${question.id}: ${formatSeconds(question.thoi_gian_ms)} · ${formatUsd(question.chi_phi_usd)} · ghi vào results.json`,
    },
  ]

  return (
    <section
      id="how-it-works"
      aria-labelledby="how-title"
      className="scroll-mt-16 border-t border-hero-border"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
        <SectionHeading
          id="how-title"
          index={2}
          eyebrow="Cách hoạt động"
          title={`Theo chân câu #${question.id} qua bốn bước.`}
          lead="Không chấm cả câu trả lời bằng một điểm mơ hồ: từng ý phải chỉ ra được Điều, khoản làm căn cứ. Mọi giá trị dưới đây lấy từ lượt chạy demo."
        />

        <ol className="mt-14 flex flex-col">
          {steps.map((step, i) => (
            <li
              key={step.title}
              className="relative grid gap-5 pb-12 pl-12 last:pb-0 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-12 lg:pl-14"
            >
              {/* The rail joining the step numbers. */}
              {i < steps.length - 1 && (
                <span
                  aria-hidden
                  className="absolute top-10 bottom-0 left-[15px] w-px bg-hero-border lg:left-[19px]"
                />
              )}
              <span
                aria-hidden
                className="absolute top-0 left-0 grid size-8 place-items-center rounded-full border border-hero-accent/50 font-mono text-xs font-medium text-hero-accent lg:size-10 lg:text-sm"
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="flex flex-col gap-2.5 lg:pt-1.5">
                <h3 className="font-heading text-xl font-bold">
                  <span className="sr-only">Bước {i + 1}: </span>
                  {step.title}
                </h3>
                <p className="leading-relaxed text-pretty text-hero-muted">
                  {step.text}
                </p>
                <p className="font-mono text-xs text-hero-accent">{step.tag}</p>
              </div>
              <div className="rounded-xl border border-hero-border bg-hero-raised/60 p-4 sm:p-5">
                {step.panel}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
