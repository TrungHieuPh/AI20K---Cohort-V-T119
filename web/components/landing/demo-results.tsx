import Link from "next/link"
import { ArrowUpRight } from "lucide-react"

import { SectionHeading } from "@/components/landing/section-heading"
import { VerdictBadge } from "@/components/verdict-badge"
import type { AuditRun } from "@/lib/data"
import { formatScore, formatSeconds, formatUsd } from "@/lib/format"
import { GATE_VERDICT, QUESTION_VERDICT } from "@/lib/verdicts"

export function DemoResults({ run }: { run: AuditRun }) {
  const { summary, questions } = run
  const gate = GATE_VERDICT[summary.cong]

  const counts = [
    { verdict: QUESTION_VERDICT.DUNG, value: summary.dung },
    { verdict: QUESTION_VERDICT.SAI, value: summary.sai },
    { verdict: QUESTION_VERDICT.KHONG_CAN_CU, value: summary.khong_can_cu },
    { verdict: QUESTION_VERDICT.LOI, value: summary.loi },
  ]
  // The three axes of the brief's trade-off: quality, latency, cost.
  const metrics = [
    { term: "Faithfulness TB", value: formatScore(summary.faithfulness_tb) },
    { term: "Độ trễ TB / câu", value: formatSeconds(run.avgLatencyMs) },
    { term: "Chi phí TB / câu", value: formatUsd(run.avgCostUsd) },
  ]

  return (
    <section
      id="demo"
      aria-labelledby="demo-title"
      className="scroll-mt-16 border-t border-hero-border"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
        <SectionHeading
          id="demo-title"
          index={3}
          eyebrow="Kết quả demo"
          title={`Chạy thật trên ${summary.so_cau} câu mẫu: cổng ${gate.label.toLowerCase()}.`}
          lead="Kết quả thật của pipeline trên bộ câu mẫu do nhóm soạn, không phải bộ test kín. Bấm vào từng câu để xem ý nào sai và sai theo Điều nào."
        />

        <div className="mt-12 grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="flex flex-col gap-6 rounded-2xl border border-hero-border bg-hero-raised p-6 sm:p-7">
            <div className="flex flex-col gap-3">
              <p className="font-mono text-xs tracking-[0.12em] text-hero-muted uppercase">
                Cổng kiểm định
              </p>
              <VerdictBadge verdict={gate} size="lg" className="self-start" />
              <p className="text-sm leading-relaxed text-hero-muted">
                {summary.sai} câu trả lời trái luật, {summary.khong_can_cu} câu
                không có căn cứ trong {summary.so_cau} câu đã kiểm.
              </p>
            </div>

            {/* On phones a 2×2 cell is too narrow for "Lỗi (không kiểm được)", so each count is a row. */}
            <dl className="grid gap-px overflow-hidden rounded-xl bg-hero-border sm:grid-cols-2">
              {counts.map(({ verdict, value }) => (
                <div
                  key={verdict.label}
                  className="flex items-center justify-between gap-3 bg-hero-raised px-4 py-3 sm:flex-col sm:items-start sm:justify-start sm:gap-2 sm:p-4"
                >
                  <dt>
                    <VerdictBadge verdict={verdict} />
                  </dt>
                  <dd className="font-heading text-2xl font-extrabold tabular-nums sm:text-3xl">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>

            <dl className="grid gap-4 border-t border-hero-border pt-5 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              {metrics.map(({ term, value }) => (
                <div key={term} className="flex flex-col gap-1">
                  <dt className="text-xs text-hero-muted">{term}</dt>
                  <dd className="font-heading text-lg font-bold tabular-nums">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <ol className="flex flex-col overflow-hidden rounded-2xl border border-hero-border">
            {questions.map((q) => (
              <li
                key={q.id}
                className="border-b border-hero-border last:border-b-0"
              >
                <Link
                  href={`/audit/${q.id}`}
                  className="group flex items-start gap-4 p-5 transition-colors hover:bg-hero-raised focus-visible:bg-hero-raised sm:p-6"
                >
                  <span className="pt-0.5 font-mono text-sm text-hero-muted">
                    #{q.id}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <p className="leading-snug font-semibold text-pretty">
                      {q.cau_hoi}
                    </p>
                    {/* On phones the badge drops under the question so the text keeps its width. */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <VerdictBadge
                        verdict={QUESTION_VERDICT[q.ket_luan]}
                        className="sm:hidden"
                      />
                      <p className="font-mono text-xs text-hero-muted">
                        {q.cac_y.length} ý · faithfulness{" "}
                        {formatScore(q.faithfulness)}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <VerdictBadge
                      verdict={QUESTION_VERDICT[q.ket_luan]}
                      className="hidden sm:inline-flex"
                    />
                    <ArrowUpRight
                      className="size-4 text-hero-muted transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-hero-foreground"
                      aria-hidden
                    />
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}
