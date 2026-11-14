import { Badge } from "@/components/ui/badge"
import type { VerdictMeta } from "@/lib/verdicts"

/**
 * A verdict is always shown as icon + word + colour, never colour alone. Pass
 * `surface="dark"` on the landing's navy, where the light-theme chip would read as a
 * sticker.
 */
export function VerdictBadge({
  verdict,
  size,
  surface,
  className,
}: {
  verdict: VerdictMeta
  size?: "default" | "lg"
  surface?: "light" | "dark"
  className?: string
}) {
  const Icon = verdict.icon
  return (
    <Badge
      variant={verdict.tone}
      size={size}
      surface={surface}
      className={className}
    >
      <Icon data-icon="inline-start" aria-hidden />
      {verdict.label}
    </Badge>
  )
}
