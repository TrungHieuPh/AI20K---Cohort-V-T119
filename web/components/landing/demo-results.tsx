import Link from "next/link"
import { ArrowUpRight } from "lucide-react"

import { SectionHeading } from "@/components/landing/section-heading"
import { VerdictBadge } from "@/components/verdict-badge"
import type { AuditRun } from "@/lib/data"
import { formatScore, formatSeconds, formatUsd } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  GATE_VERDICT,
  gateRuleFor,
  lowerFirst,
  QUESTION_VERDICT,
} from "@/lib/verdicts"

const LABEL = "text-xs font-bold tracking-[0.08em] text-hero-muted uppercase"

/**
 * The demo run in one panel: the gate and why, how the answers split, the three axes
 * of the brief's trade-off, then each question.
 */
export function DemoResults({ run }: { run: AuditRun }) {
  const { summary, questions } = run
  const gate = GATE_VERDICT[summary.cong]
  const rule = gateRuleFor(summary.cong)

  // Worst first, the order the gate reads them. Colours are the dark verdict tokens;
  // the legend repeats each one with its icon and word, so colour is never alone.
  const split = [
    { verdict: QUESTION_VERDICT.SAI, value: summary.sai, bar: "bg-hero-wrong" },
    {
      verdict: QUESTION_VERDICT.KHONG_CAN_CU,
      value: summary.khong_can_cu,
      bar: "bg-hero-ungrounded",
    },
    {
      verdict: QUESTION_VERDICT.DUNG,
      value: summary.dung,
      bar: "bg-hero-correct",
    },
    { verdict: QUESTION_VERDICT.LOI, value: summary.loi, bar: "bg-hero-error" },
  ]
  const splitText = split
    .map(({ verdict, value }) => `${value} ${verdict.label}`)
    .join(", ")

  const metrics = [
    { term: "Faithfulness TB", value: formatScore(summary.faithfulness_tb) },
    { term: "Độ trễ TB / câu", value: formatSeconds(run.avgLatencyMs) },
    { term: "Chi phí TB / câu", value: formatUsd(run.avgCostUsd) },
  ]

  return (
    <section id="demo" aria-labelledby="demo-title" className="scroll-mt-16">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
        <SectionHeading
          id="demo-title"
          eyebrow="Kết quả demo"
          title={`Chạy thật trên ${summary.so_cau} câu mẫu: cổng ${gate.label.toLowerCase()}.`}
          lead="Kết quả thật của pipeline trên bộ câu mẫu do nhóm soạn, không phải bộ test kín. Bấm vào từng câu để xem ý nào sai và sai theo Điều nào."
        />

        <div
          data-reveal
          className="mt-12 overflow-hidden rounded-2xl border border-hero-border bg-hero-raised"
        >
          <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12">
            <div className="flex flex-col items-start gap-3">
              <p className={LABEL}>Cổng kiểm định</p>
              <VerdictBadge verdict={gate} size="lg" surface="dark" />
              {rule && (
                <p className="text-lg font-semibold text-pretty">
                  Vì {lowerFirst(rule.when)}.
                </p>
              )}
              <p className="text-sm leading-relaxed text-pretty text-hero-muted">
                {summary.sai} câu trả lời trái luật, {summary.khong_can_cu} câu
                không có căn cứ trong {summary.so_cau} câu đã kiểm.
              </p>
            </div>

            <div className="flex flex-col gap-4 lg:pt-1">
              <p className={LABEL}>Kết luận {summary.so_cau} câu</p>
              <div
                role="img"
                aria-label={`Kết luận ${summary.so_cau} câu: ${splitText}.`}
                className="flex h-3.5 gap-0.5"
              >
                {split
                  .filter(({ value }) => value > 0)
                  .map(({ verdict, value, bar }) => (
                    <span
                      key={verdict.label}
                      title={`${verdict.label}: ${value} câu`}
                      style={{ flexGrow: value }}
                      className={cn("basis-0 rounded-sm", bar)}
                    />
                  ))}
              </div>
              <ul className="flex flex-wrap gap-x-6 gap-y-3" aria-hidden>
                {split.map(({ verdict, value }) => (
                  <li key={verdict.label} className="flex items-center gap-2">
                    <VerdictBadge verdict={verdict} surface="dark" />
                    <span className="font-heading text-xl font-extrabold tabular-nums">
                      {value}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <dl className="grid divide-y divide-hero-border border-hero-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {metrics.map(({ term, value }) => (
              <div
                key={term}
                className="flex items-baseline justify-between gap-3 px-6 py-4 sm:flex-col sm:justify-start sm:gap-1.5 sm:px-8 sm:py-5"
              >
                <dt className={LABEL}>{term}</dt>
                <dd className="font-heading text-xl font-bold tabular-nums sm:text-2xl">
                  {value}
                </dd>
              </div>
            ))}
          </dl>

          <div className="border-hero-border">
            <p className={cn(LABEL, "px-6 pt-6 pb-2 sm:px-8")}>Từng câu</p>
            <ol className="flex flex-col">
              {questions.map((q) => {
                const verdict = QUESTION_VERDICT[q.ket_luan]
                return (
                  <li
                    key={q.id}
                    className="border-b border-hero-border last:border-b-0"
                  >
                    <Link
                      href={`/audit/${q.id}`}
                      className="group flex items-start gap-4 px-6 py-4 transition-colors hover:bg-hero/50 focus-visible:bg-hero/50 sm:items-center sm:px-8"
                    >
                      <span className="w-7 shrink-0 pt-px text-sm font-semibold text-hero-muted tabular-nums sm:pt-0">
                        #{q.id}
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <p className="leading-snug font-semibold text-pretty">
                          {q.cau_hoi}
                        </p>
                        {/* On phones the chip drops under the question so the text keeps its width. */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                          <VerdictBadge
                            verdict={verdict}
                            surface="dark"
                            className="sm:hidden"
                          />
                          <p className="text-sm text-hero-muted tabular-nums">
                            {q.cac_y.length} ý · faithfulness{" "}
                            {formatScore(q.faithfulness)}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <VerdictBadge
                          verdict={verdict}
                          surface="dark"
                          className="hidden sm:inline-flex"
                        />
                        <ArrowUpRight
                          className="size-4 text-hero-muted transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-hero-foreground"
                          aria-hidden
                        />
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ol>
          </div>
        </div>
      </div>
    </section>
  )
}
