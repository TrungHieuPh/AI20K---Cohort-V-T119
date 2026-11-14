import { HighlightText } from "@/components/highlight-text"
import type { ExcerptLine, ParsedArticle } from "@/lib/law"
import { cn } from "@/lib/utils"

/**
 * Statute text set like the printed law: serif, clause and point labels hanging in the
 * margin. `phrases` are highlighted only where they appear verbatim.
 */
export function ArticleBody({
  article,
  phrases = [],
  anchorClauses = false,
  className,
}: {
  article: ParsedArticle
  phrases?: string[]
  /**
   * Give each clause the id `khoan-N` so links can jump to it. Only for a page showing a
   * single article: two articles on one page would repeat the ids.
   */
  anchorClauses?: boolean
  className?: string
}) {
  return (
    <div className={cn("flex flex-col gap-3 leading-relaxed", className)}>
      {article.intro.map((text, i) => (
        <p key={i} className="whitespace-pre-line">
          <HighlightText text={text} phrases={phrases} />
        </p>
      ))}
      {article.clauses.length > 0 && (
        <ol className="flex flex-col gap-3">
          {article.clauses.map((clause) => (
            <li
              key={clause.number}
              id={anchorClauses ? `khoan-${clause.number}` : undefined}
              className={cn(
                "flex flex-col gap-2",
                // The clause a link jumped to stays marked, so the reader finds it on arrival.
                anchorClauses &&
                  "scroll-mt-20 rounded-sm target:bg-mark/45 target:ring-8 target:ring-mark/45"
              )}
            >
              <Line
                label={`${clause.number}.`}
                text={clause.text}
                phrases={phrases}
              />
              {clause.points.length > 0 && (
                <ol className="flex flex-col gap-1.5 pl-7">
                  {clause.points.map((point) => (
                    <li key={point.letter}>
                      <Line
                        label={`${point.letter})`}
                        text={point.text}
                        phrases={phrases}
                      />
                    </li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

/** Only the clauses and points a citation names, with "…" where text was left out. */
export function ArticleExcerpt({
  lines,
  phrases = [],
  className,
}: {
  lines: ExcerptLine[]
  phrases?: string[]
  className?: string
}) {
  return (
    <div className={cn("flex flex-col gap-2 leading-relaxed", className)}>
      {lines.map((line, i) =>
        line.kind === "gap" ? (
          <p key={i} className="pl-7 text-muted-foreground">
            <span aria-hidden>…</span>
            <span className="sr-only">lược bớt</span>
          </p>
        ) : (
          <div key={i} className={cn(line.kind === "point" && "pl-7")}>
            <Line label={line.label} text={line.text} phrases={phrases} />
          </div>
        )
      )}
    </div>
  )
}

function Line({
  label,
  text,
  phrases,
}: {
  label: string
  text: string
  phrases: string[]
}) {
  return (
    <p className="flex gap-2">
      <span className="min-w-6 shrink-0 font-semibold tabular-nums">
        {label}
      </span>
      <span className="min-w-0 flex-1 whitespace-pre-line">
        <HighlightText text={text} phrases={phrases} />
      </span>
    </p>
  )
}
