import { VerdictBadge } from "@/components/verdict-badge"
import { formatPercent } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { VerdictMeta, VerdictTone } from "@/lib/verdicts"

const TONE_FILL: Record<VerdictTone, string> = {
  correct: "bg-verdict-correct",
  wrong: "bg-verdict-wrong",
  ungrounded: "bg-verdict-ungrounded",
  error: "bg-verdict-error",
}

/**
 * Part-to-whole of the verdicts: a thin segmented bar for the shape, and a list that
 * carries the figures (the bar is decoration, so screen readers get the list only).
 */
export function VerdictBreakdown({
  items,
  className,
}: {
  items: { verdict: VerdictMeta; value: number }[]
  className?: string
}) {
  const total = items.reduce((n, i) => n + i.value, 0)

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div aria-hidden className="flex h-2 gap-0.5">
        {items
          .filter((i) => i.value > 0)
          .map((i) => (
            <div
              key={i.verdict.label}
              className={cn(
                "h-full basis-0 rounded-full",
                TONE_FILL[i.verdict.tone]
              )}
              style={{ flexGrow: i.value }}
            />
          ))}
      </div>
      <ul className="flex flex-col divide-y">
        {items.map((i) => (
          <li
            key={i.verdict.label}
            className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
          >
            <VerdictBadge verdict={i.verdict} />
            <span className="ml-auto font-semibold tabular-nums">
              {i.value}
            </span>
            <span className="w-11 text-right text-sm text-muted-foreground tabular-nums">
              {total ? formatPercent(i.value / total) : "—"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
