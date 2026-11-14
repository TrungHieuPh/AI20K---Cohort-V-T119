"use client"

import Link from "next/link"
import { FolderOpen } from "lucide-react"

import { AuditTable } from "@/components/app/audit-table"
import { PageHeader, PageShell } from "@/components/app/page-shell"
import { sourceLabel, useResults } from "@/components/app/results-provider"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { VerdictBadge } from "@/components/verdict-badge"
import { formatScore, formatSeconds, formatUsd } from "@/lib/format"
import { cn } from "@/lib/utils"
import { GATE_VERDICT, gateRuleFor, lowerFirst } from "@/lib/verdicts"

/** Screen 2: every question of the active run, filterable by verdict. */
export function AuditView() {
  const { run, source } = useResults()
  const { summary } = run
  const rule = gateRuleFor(summary.cong)

  const metrics = [
    { term: "Faithfulness TB", value: formatScore(summary.faithfulness_tb) },
    { term: "Tổng thời gian", value: formatSeconds(run.totalLatencyMs) },
    { term: "Tổng chi phí", value: formatUsd(run.totalCostUsd) },
  ]

  return (
    <PageShell>
      <PageHeader
        eyebrow={sourceLabel(source)}
        title="Kiểm định"
        description="Kết luận cho từng câu trả lời của chatbot. Mở một câu để xem từng ý được đối chiếu với Điều luật nào."
        actions={
          <Link
            href="/audit/open"
            className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
          >
            <FolderOpen data-icon="inline-start" aria-hidden />
            Mở results.json khác
          </Link>
        }
      />

      <Card size="sm">
        <CardContent className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="text-sm text-muted-foreground">
              Cổng kiểm định
            </span>
            <VerdictBadge verdict={GATE_VERDICT[summary.cong]} size="lg" />
            {rule && (
              <span className="text-sm">vì {lowerFirst(rule.when)}.</span>
            )}
          </div>
          <dl className="grid grid-cols-3 gap-4 lg:flex lg:gap-8">
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

      <AuditTable questions={run.questions} />
    </PageShell>
  )
}
