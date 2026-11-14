import { Fragment } from "react"

import type { Claim } from "@/lib/types"
import { cn } from "@/lib/utils"
import { CLAIM_LABEL, type VerdictTone } from "@/lib/verdicts"

/** Underline style differs by label too, so the marks never rely on colour alone. */
const MARK: Record<VerdictTone, string> = {
  correct: "decoration-verdict-correct",
  wrong: "bg-verdict-wrong-soft decoration-verdict-wrong decoration-wavy",
  ungrounded:
    "bg-verdict-ungrounded-soft decoration-verdict-ungrounded decoration-dashed",
  error: "decoration-verdict-error decoration-dotted",
}

interface Segment {
  text: string
  /** Index into the claims, when this stretch of the answer is that claim word for word. */
  claim?: number
}

/**
 * The chatbot's answer with each claim marked where it appears verbatim (ignoring case and
 * the final full stop), numbered and linked to its card. Claims the judge paraphrased are
 * left unmarked rather than guessed at.
 */
export function AnswerText({
  answer,
  claims,
  anchorPrefix,
}: {
  answer: string
  claims: Claim[]
  /** Claim cards have ids `${anchorPrefix}${n}`, n counting from 1. */
  anchorPrefix: string
}) {
  return (
    <>
      {locateClaims(answer, claims).map((segment, i) => {
        if (segment.claim === undefined)
          return <Fragment key={i}>{segment.text}</Fragment>
        const n = segment.claim + 1
        const label = CLAIM_LABEL[claims[segment.claim].nhan]
        return (
          <Fragment key={i}>
            <span
              className={cn(
                "[box-decoration-break:clone] underline decoration-[1.5px] underline-offset-[5px]",
                MARK[label.tone]
              )}
            >
              {segment.text}
            </span>
            <sup className="ml-0.5">
              <a
                href={`#${anchorPrefix}${n}`}
                aria-label={`Ý ${n}: ${label.label}`}
                className="rounded-sm px-0.5 font-mono text-[0.7rem] font-semibold text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                {n}
              </a>
            </sup>
          </Fragment>
        )
      })}
    </>
  )
}

export function locateClaims(text: string, claims: Claim[]): Segment[] {
  const haystack = text.toLocaleLowerCase("vi")
  // Indexes into the lowercased copy are only valid if lowercasing kept the length.
  if (haystack.length !== text.length) return [{ text }]

  const found: { start: number; end: number; claim: number }[] = []
  claims.forEach((claim, i) => {
    const needle = claim.noi_dung
      .trim()
      .replace(/[.;:!?]+$/, "")
      .toLocaleLowerCase("vi")
    if (needle.length < 12) return
    const start = haystack.indexOf(needle)
    if (start === -1) return
    const end = start + needle.length
    if (found.some((f) => start < f.end && f.start < end)) return
    found.push({ start, end, claim: i })
  })
  found.sort((a, b) => a.start - b.start)

  const segments: Segment[] = []
  let at = 0
  for (const f of found) {
    if (f.start > at) segments.push({ text: text.slice(at, f.start) })
    segments.push({ text: text.slice(f.start, f.end), claim: f.claim })
    at = f.end
  }
  if (at < text.length) segments.push({ text: text.slice(at) })
  return segments
}
