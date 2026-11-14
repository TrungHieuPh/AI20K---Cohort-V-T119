import { ArrowDownUp, Bot } from "lucide-react"

import { HighlightText } from "@/components/highlight-text"
import { WrongPhrase } from "@/components/landing/wrong-phrase"
import { VerdictBadge } from "@/components/verdict-badge"
import { Separator } from "@/components/ui/separator"
import { formatSeconds } from "@/lib/format"
import type { ExcerptLine } from "@/lib/law"
import type { Article, AuditedQuestion, Claim } from "@/lib/types"
import { CLAIM_LABEL } from "@/lib/verdicts"
import { cn } from "@/lib/utils"

/**
 * The hero's proof: one real answer from the demo run set against the article it
 * cites. Every string comes from the data files; only the highlights are chosen.
 */
export function ComparisonCard({
  question,
  claim,
  article,
  lines,
  wrongPhrase,
  evidencePhrases,
}: {
  question: AuditedQuestion
  claim: Claim
  article: Article
  lines: ExcerptLine[]
  /** Part of the chatbot's answer that the judge flagged. */
  wrongPhrase: string
  /** Parts of the article that settle it. */
  evidencePhrases: string[]
}) {
  const verdict = CLAIM_LABEL[claim.nhan]

  return (
    <figure className="relative">
      <div
        aria-hidden
        className="absolute -inset-8 -z-10 rounded-[2.5rem] bg-primary/40 blur-3xl"
      />
      <div className="overflow-hidden rounded-2xl bg-card text-card-foreground shadow-2xl ring-1 shadow-black/40 ring-white/10">
        <div className="flex flex-col gap-3 p-5 sm:p-6">
          <div className="flex items-center justify-between font-mono text-xs text-muted-foreground">
            <span>CÂU HỎI #{question.id}</span>
            <span>{formatSeconds(question.thoi_gian_ms)}</span>
          </div>
          <p className="font-semibold text-pretty">{question.cau_hoi}</p>
          <div className="flex gap-3 rounded-xl bg-muted p-3.5">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-card ring-1 ring-border">
              <Bot className="size-4 text-muted-foreground" aria-hidden />
            </span>
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-muted-foreground">
                Chatbot trả lời
              </p>
              <p className="leading-relaxed">
                <WrongPhrase text={question.cau_tra_loi} phrase={wrongPhrase} />
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 px-5 sm:px-6" aria-hidden>
          <Separator className="flex-1" />
          <span className="flex items-center gap-1.5 font-mono text-[0.7rem] tracking-wider text-muted-foreground uppercase">
            <ArrowDownUp className="size-3.5" />
            đối chiếu với luật
          </span>
          <Separator className="flex-1" />
        </div>

        <blockquote className="relative mx-5 mt-4 mb-5 rounded-xl border border-paper-border bg-paper p-5 sm:mx-6 sm:mb-6">
          <span
            aria-hidden
            className="absolute -top-3.5 right-4 rotate-[-7deg] rounded-md border-[3px] border-double border-verdict-wrong bg-paper px-2.5 py-0.5 text-xs font-bold tracking-[0.22em] text-verdict-wrong uppercase shadow-sm"
          >
            {verdict.label}
          </span>
          <p className="font-heading text-[1.05rem] font-bold">
            {article.noi_dung.split("\n")[0]}
          </p>
          <p className="mt-0.5 font-mono text-[0.7rem] text-muted-foreground">
            Bộ luật Lao động · Chương {article.chuong}
          </p>
          <div className="mt-3 flex flex-col gap-1.5 text-[0.95rem] leading-relaxed">
            {lines.map((line, i) =>
              line.kind === "gap" ? (
                <p
                  key={i}
                  className="pl-5 text-muted-foreground"
                  aria-label="lược bớt"
                >
                  …
                </p>
              ) : (
                <p key={i} className={cn(line.kind === "point" && "pl-5")}>
                  <span className="font-bold">{line.label}</span>{" "}
                  <HighlightText text={line.text} phrases={evidencePhrases} />
                </p>
              )
            )}
          </div>
        </blockquote>

        <figcaption className="flex flex-col gap-2 border-t bg-muted/60 px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <VerdictBadge verdict={verdict} />
            <span className="font-mono text-xs text-muted-foreground">
              {claim.trich_dan}
            </span>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {claim.giai_thich}
          </p>
        </figcaption>
      </div>
    </figure>
  )
}
