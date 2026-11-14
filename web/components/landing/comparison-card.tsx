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
 * cites. The card is navy like the page; only the text of the law sits on paper.
 * Every string comes from the data files; only the highlights are chosen.
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
    <figure className="overflow-hidden rounded-2xl border border-hero-border bg-hero-raised shadow-2xl shadow-black/40">
      <div className="flex flex-col gap-3 p-5 sm:p-6">
        <div className="flex items-center justify-between text-xs font-bold tracking-[0.08em] text-hero-muted uppercase">
          <span>Câu hỏi #{question.id}</span>
          <span className="font-semibold tracking-normal normal-case tabular-nums">
            {formatSeconds(question.thoi_gian_ms)}
          </span>
        </div>
        <p className="font-semibold text-pretty">{question.cau_hoi}</p>
        <div className="flex gap-3 rounded-xl bg-hero p-3.5 ring-1 ring-hero-border">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-hero-raised ring-1 ring-hero-border">
            <Bot className="size-4 text-hero-muted" aria-hidden />
          </span>
          <div className="flex flex-col gap-1">
            <p className="text-xs font-semibold text-hero-muted">
              Chatbot trả lời
            </p>
            <p className="leading-relaxed">
              <WrongPhrase
                text={question.cau_tra_loi}
                phrase={wrongPhrase}
                tone="dark"
              />
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 px-5 sm:px-6" aria-hidden>
        <Separator className="flex-1 bg-hero-border" />
        <span className="flex items-center gap-1.5 text-xs font-bold tracking-[0.08em] text-hero-muted uppercase">
          <ArrowDownUp className="size-3.5" />
          Đối chiếu với luật
        </span>
        <Separator className="flex-1 bg-hero-border" />
      </div>

      <blockquote className="relative mx-5 mt-5 mb-5 rounded-xl border border-paper-border bg-paper p-5 text-foreground sm:mx-6 sm:mb-6">
        <span
          aria-hidden
          className="absolute -top-3.5 right-4 rotate-[-7deg] rounded-md border-[3px] border-double border-verdict-wrong bg-paper px-2.5 py-0.5 text-xs font-bold tracking-[0.22em] text-verdict-wrong uppercase shadow-sm"
        >
          {verdict.label}
        </span>
        <p className="font-heading text-[1.05rem] font-bold">
          {article.noi_dung.split("\n")[0]}
        </p>
        <p className="mt-0.5 text-xs font-semibold text-muted-foreground">
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

      <figcaption className="flex flex-col gap-2 border-hero-border bg-hero/40 px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <VerdictBadge verdict={verdict} surface="dark" />
          <span className="text-sm font-semibold text-hero-accent">
            {claim.trich_dan}
          </span>
        </div>
        <p className="text-sm leading-relaxed text-pretty text-hero-muted">
          {claim.giai_thich}
        </p>
      </figcaption>
    </figure>
  )
}
