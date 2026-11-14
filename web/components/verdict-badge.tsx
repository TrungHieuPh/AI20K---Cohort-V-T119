import { Badge } from "@/components/ui/badge"
import type { VerdictMeta } from "@/lib/verdicts"

/** A verdict is always shown as icon + word + colour, never colour alone. */
export function VerdictBadge({
  verdict,
  size,
  className,
}: {
  verdict: VerdictMeta
  size?: "default" | "lg"
  className?: string
}) {
  const Icon = verdict.icon
  return (
    <Badge variant={verdict.tone} size={size} className={className}>
      <Icon data-icon="inline-start" aria-hidden />
      {verdict.label}
    </Badge>
  )
}
