import Link from "next/link"
import { SearchX } from "lucide-react"

import { HighlightText } from "@/components/highlight-text"
import { SectionHeading } from "@/components/landing/section-heading"
import { WrongPhrase } from "@/components/landing/wrong-phrase"
import { VerdictBadge } from "@/components/verdict-badge"
import type { ExcerptLine } from "@/lib/law"
import type { Claim } from "@/lib/types"
import { cn } from "@/lib/utils"
import { CLAIM_LABEL } from "@/lib/verdicts"

/** One planted error of the demo run, as the audit caught it. Built in app/(marketing)/page.tsx. */
export interface ProblemCase {
  questionId: string
  /** Kind of planted error, as docs/demo-chu-nhat.md names it. */
  kind: string
  question: string
  claim: Claim
  /** Part of the claim to underline. */
  wrongPhrase: string
  law:
    | {
        kind: "excerpt"
        dieu: number
        heading: string
        chapter: string
        lines: ExcerptLine[]
        phrases: string[]
        /** Amendment note of the quoted clause, verbatim from dieu.jsonl. */
        note?: string
      }
    | {
        kind: "none"
        /** The articles retrieved and read, none of which grants the claim. */
        checked: { dieu: number; title: string }[]
      }
}

// Framing from the brief (AIP-04 and the team's problem statement).
const FRAMING = [
  {
    term: "Ảo giác điều khoản",
    text: "Sai con số, bịa thêm quyền lợi, dùng luật đã cũ, mà giọng vẫn chắc chắn.",
  },
  {
    term: "Rủi ro bồi thường",
    text: "Tư vấn sai nhiều điều khoản có thể khiến doanh nghiệp phải đền bù hàng tỷ đồng.",
  },
  {
    term: "Không ai đo được",
    text: "Hiếm đội làm RAG đo chất lượng câu trả lời một cách hệ thống, nên lỗi chỉ lộ ra khi đã tới tay người dùng.",
  },
]

export function ProblemSection({ cases }: { cases: ProblemCase[] }) {
  return (
    <section
      id="problem"
      aria-labelledby="problem-title"
      className="scroll-mt-16 border-t border-hero-border"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
        <SectionHeading
          id="problem-title"
          index={1}
          eyebrow="Vấn đề"
          title="Chatbot sai luật vẫn trả lời trôi chảy, có cả số Điều."
          lead="Ba câu dưới đây nghe đều hợp lý. Câu trả lời là câu mẫu do nhóm soạn, cố tình cài lỗi; nhãn và đoạn luật bên cạnh là kết quả thật của bộ kiểm định."
        />

        <ol className="mt-14 flex flex-col border-b border-hero-border">
          {cases.map((c) => (
            <li
              key={c.questionId}
              className="grid gap-6 border-t border-hero-border py-9 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-12 lg:py-11"
            >
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="font-mono text-sm text-hero-muted">
                    Câu #{c.questionId}
                  </span>
                  <h3 className="font-heading text-xl font-bold">{c.kind}</h3>
                  <VerdictBadge verdict={CLAIM_LABEL[c.claim.nhan]} />
                </div>
                <p className="text-sm leading-relaxed text-pretty text-hero-muted">
                  <span className="font-semibold text-hero-foreground">
                    Hỏi:
                  </span>{" "}
                  {c.question}
                </p>
                <blockquote className="border-l-2 border-hero-wrong/70 pl-4 text-lg leading-relaxed font-medium text-pretty sm:text-xl sm:leading-relaxed">
                  <span className="sr-only">Chatbot trả lời: </span>
                  <WrongPhrase
                    text={c.claim.noi_dung}
                    phrase={c.wrongPhrase}
                    tone="dark"
                  />
                </blockquote>
              </div>

              {c.law.kind === "excerpt" ? (
                <LawSlip
                  law={c.law}
                  citation={c.claim.trich_dan}
                  explanation={c.claim.giai_thich}
                />
              ) : (
                <NoGroundsSlip
                  checked={c.law.checked}
                  explanation={c.claim.giai_thich}
                />
              )}
            </li>
          ))}
        </ol>

        <dl className="mt-12 grid gap-8 sm:grid-cols-3">
          {FRAMING.map(({ term, text }, i) => (
            <div key={term} className="flex flex-col gap-2">
              <dt className="flex items-baseline gap-2.5 font-heading text-lg font-bold">
                <span className="font-mono text-xs font-normal text-hero-accent">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {term}
              </dt>
              <dd className="leading-relaxed text-pretty text-hero-muted">
                {text}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}

/** The cited clause on paper, evidence highlighted: the printed law against the chatbot. */
function LawSlip({
  law,
  citation,
  explanation,
}: {
  law: Extract<ProblemCase["law"], { kind: "excerpt" }>
  citation: string
  explanation: string
}) {
  return (
    <figure className="flex flex-col gap-3">
      <div className="rounded-lg bg-paper p-5 text-foreground shadow-lg shadow-black/25 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <Link
            href={`/law/${law.dieu}`}
            className="font-heading text-[1.05rem] font-bold underline-offset-4 hover:underline focus-visible:underline"
          >
            {law.heading}
          </Link>
          <span className="font-mono text-[0.7rem] text-muted-foreground">
            Chương {law.chapter}
          </span>
        </div>
        <div className="mt-3 flex flex-col gap-1.5 text-[0.95rem] leading-relaxed">
          {law.lines.map((line, i) =>
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
                <HighlightText text={line.text} phrases={law.phrases} />
              </p>
            )
          )}
        </div>
        {law.note && (
          <p className="mt-4 border-t border-paper-border pt-3 text-xs leading-relaxed text-muted-foreground">
            {law.note}
          </p>
        )}
      </div>
      <figcaption className="text-sm leading-relaxed text-pretty text-hero-muted">
        <span className="font-mono text-xs text-hero-accent">{citation}</span>
        <span aria-hidden> · </span>
        {explanation}
      </figcaption>
    </figure>
  )
}

/** No article grants the claim: show what was searched, not an empty box. */
function NoGroundsSlip({
  checked,
  explanation,
}: {
  checked: { dieu: number; title: string }[]
  explanation: string
}) {
  return (
    <figure className="flex flex-col gap-4 rounded-lg border border-dashed border-hero-muted/45 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <SearchX
          aria-hidden
          className="mt-0.5 size-5 shrink-0 text-verdict-ungrounded-soft"
        />
        <p className="leading-relaxed font-semibold text-pretty">
          {explanation}
        </p>
      </div>
      <figcaption className="flex flex-col gap-2">
        <p className="font-mono text-xs text-hero-muted">
          Đã đối chiếu {checked.length} Điều truy hồi được
        </p>
        <ul className="flex flex-wrap gap-2">
          {checked.map((a) => (
            <li key={a.dieu}>
              <Link
                href={`/law/${a.dieu}`}
                className="inline-flex items-baseline gap-1.5 rounded-md border border-hero-border px-2.5 py-1 text-sm transition-colors hover:border-hero-muted/60 hover:bg-hero-raised"
              >
                <span className="font-mono text-xs text-hero-accent">
                  Điều {a.dieu}
                </span>
                <span className="text-hero-muted">{a.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  )
}
