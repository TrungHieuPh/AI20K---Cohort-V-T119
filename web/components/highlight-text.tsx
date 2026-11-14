import { Fragment } from "react"

import { cn } from "@/lib/utils"

/**
 * Renders `text` with every occurrence of the given phrases wrapped in <mark>. Matching
 * ignores case, punctuation and spacing (docs/ui-dac-ta.md §3), so "200 giờ trong 01
 * năm," still finds "200 giờ trong 01 năm;". A phrase that is not in the text is simply
 * not marked: quotes never get rewritten to fit a highlight.
 */
export function HighlightText({
  text,
  phrases,
  className,
}: {
  text: string
  phrases: string[]
  className?: string
}) {
  const ranges = findRanges(text, phrases)
  if (!ranges.length) return <>{text}</>

  const parts: React.ReactNode[] = []
  let at = 0
  for (const [start, end] of ranges) {
    if (start > at)
      parts.push(<Fragment key={`t${at}`}>{text.slice(at, start)}</Fragment>)
    parts.push(
      <mark
        key={`m${start}`}
        className={cn(
          "rounded-[3px] bg-mark [box-decoration-break:clone] px-0.5 text-foreground",
          className
        )}
      >
        {text.slice(start, end)}
      </mark>
    )
    at = end
  }
  if (at < text.length)
    parts.push(<Fragment key={`t${at}`}>{text.slice(at)}</Fragment>)
  return <>{parts}</>
}

const WORD_CHAR = /[\p{L}\p{N}]/u

/** Letters and digits only, lower-cased, with each one's position in the original text. */
function fold(text: string): { folded: string; origin: number[] } {
  let folded = ""
  const origin: number[] = []
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (!WORD_CHAR.test(ch)) continue
    const lower = ch.toLocaleLowerCase("vi")
    folded += lower
    for (let k = 0; k < lower.length; k++) origin.push(i)
  }
  return { folded, origin }
}

/** Sorted, non-overlapping [start, end) ranges of `text` matching any phrase. */
function findRanges(text: string, phrases: string[]): [number, number][] {
  const { folded, origin } = fold(text)
  const found: [number, number][] = []
  for (const phrase of phrases) {
    const needle = fold(phrase).folded
    if (!needle) continue
    for (
      let at = folded.indexOf(needle);
      at !== -1;
      at = folded.indexOf(needle, at + 1)
    ) {
      const start = origin[at]
      const end = origin[at + needle.length - 1] + 1
      // Whole words only: "200 giờ" must not light up the tail of "1200 giờ".
      const midWord =
        WORD_CHAR.test(text[start - 1] ?? "") || WORD_CHAR.test(text[end] ?? "")
      if (!midWord) found.push([start, end])
    }
  }
  found.sort((a, b) => a[0] - b[0])

  const merged: [number, number][] = []
  for (const range of found) {
    const last = merged.at(-1)
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1])
    else merged.push([...range])
  }
  return merged
}
