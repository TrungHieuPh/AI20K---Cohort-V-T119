import {
  ArrowDownToLine,
  ArrowRight,
  FilePen,
  FileQuestion,
  LoaderCircle,
  Scale,
  TriangleAlert,
} from "lucide-react"

import {
  ArticleTrigger,
  type ArticleSheetHandle,
  type LawStatus,
} from "@/components/app/article-sheet"
import { ArticleBody, ArticleExcerpt } from "@/components/app/article-text"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { VerdictBadge } from "@/components/verdict-badge"
import {
  evidencePhrases,
  parseArticle,
  parseCitation,
  resolveCitation,
  sentenceCase,
  type Citation,
} from "@/lib/law"
import type { Article, Claim } from "@/lib/types"
import { cn } from "@/lib/utils"
import { CLAIM_LABEL } from "@/lib/verdicts"

/** Looks like a link, opens the article panel. */
const TRIGGER_LINK =
  "rounded-sm font-medium underline decoration-foreground/30 underline-offset-4 outline-none hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring"

/**
 * One claim from the answer next to the law it cites: what the chatbot said and how the
 * judge labelled it on the left, the cited clauses quoted verbatim on the right, with the
 * judge's evidence highlighted only where it appears word for word.
 */
export function ClaimComparison({
  claim,
  number,
  id,
  articles,
  status,
  handle,
}: {
  claim: Claim
  number: number
  /** Anchor for links from the answer text. */
  id: string
  articles: Map<number, Article>
  status: LawStatus
  handle: ArticleSheetHandle
}) {
  const label = CLAIM_LABEL[claim.nhan]
  const citations = byArticle(parseCitation(claim.trich_dan))
  const phrases = evidencePhrases(claim.bang_chung)

  return (
    <article
      id={id}
      aria-labelledby={`${id}-title`}
      className="grid scroll-mt-20 overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"
    >
      <div className="flex flex-col gap-4 p-5">
        <header className="flex flex-wrap items-center gap-2">
          <h3
            id={`${id}-title`}
            className="font-mono text-xs tracking-[0.12em] text-muted-foreground uppercase"
          >
            Ý {number}
          </h3>
          <VerdictBadge verdict={label} />
          {claim.ha_nhan && (
            <Badge variant="outline">
              <ArrowDownToLine data-icon="inline-start" aria-hidden />
              Hệ thống hạ nhãn
            </Badge>
          )}
        </header>

        <blockquote className="text-lg leading-relaxed font-medium text-pretty">
          “{claim.noi_dung}”
        </blockquote>

        <dl className="flex flex-col gap-3 text-sm">
          <div className="flex flex-col gap-1">
            <dt className="text-xs text-muted-foreground">Căn cứ</dt>
            <dd className="font-mono text-[0.8rem]">
              {claim.trich_dan ? (
                <CitationLinks
                  text={claim.trich_dan}
                  phrases={phrases}
                  handle={handle}
                />
              ) : (
                "Không dẫn Điều nào"
              )}
            </dd>
          </div>
          {claim.bang_chung && (
            <div className="flex flex-col gap-1">
              <dt className="text-xs text-muted-foreground">Bằng chứng</dt>
              <dd className="leading-relaxed text-pretty text-muted-foreground">
                {claim.bang_chung}
              </dd>
            </div>
          )}
          {claim.giai_thich && (
            <div className="flex flex-col gap-1">
              <dt className="text-xs text-muted-foreground">Giải thích</dt>
              <dd className="leading-relaxed text-pretty">
                {claim.giai_thich}
              </dd>
            </div>
          )}
        </dl>

        {claim.bang_chung_khop === false && (
          <Alert role="note">
            <TriangleAlert aria-hidden />
            <AlertTitle>Bằng chứng không khớp nguyên văn luật</AlertTitle>
            <AlertDescription>
              Chỉ là cảnh báo, nhãn giữ nguyên. Có đoạn judge trích không có y
              hệt trong Điều luật, nên chỉ đoạn khớp mới được tô vàng.
            </AlertDescription>
          </Alert>
        )}
        {claim.ha_nhan && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Nhãn này do hệ thống hạ xuống sau khi kiểm tra, không phải nhãn
            judge chấm.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-5 border-t border-paper-border bg-paper p-5 lg:border-t-0 lg:border-l">
        <p className="flex items-center gap-1.5 font-mono text-[0.7rem] tracking-wider text-muted-foreground uppercase">
          <Scale aria-hidden className="size-3.5" />
          Đối chiếu với luật
        </p>
        {citations.length === 0 ? (
          <Empty className="p-4">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileQuestion aria-hidden />
              </EmptyMedia>
              <EmptyTitle>
                {claim.nhan === "KHONG_CAN_CU"
                  ? "Không có căn cứ trong văn bản luật"
                  : "Không dẫn Điều luật nào"}
              </EmptyTitle>
              <EmptyDescription>
                Không có Điều nào của Bộ luật Lao động được dẫn làm căn cứ cho ý
                này.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          citations.map((c) => (
            <CitedArticle
              key={c.article}
              dieu={c.article}
              picks={c.picks}
              article={articles.get(c.article)}
              status={status}
              phrases={phrases}
              handle={handle}
            />
          ))
        )}
      </div>
    </article>
  )
}

/**
 * "Điều 107 khoản 2, Điều 108" becomes one button per article, the joining words left as
 * text. Same split as `parseCitation`, so each button opens the article it names.
 */
function CitationLinks({
  text,
  phrases,
  handle,
}: {
  text: string
  phrases: string[]
  handle: ArticleSheetHandle
}) {
  return text.split(/(?=Điều\s+\d+)/i).map((part, i) => {
    const head = /Điều\s+(\d+)/i.exec(part)
    if (!head) return <span key={i}>{part}</span>
    const split = /^([^]*?)((?:\s*(?:,|;|và|hoặc)\s*)*)$/u.exec(part)
    const cited = split?.[1] ?? part
    const tail = split?.[2] ?? ""
    return (
      <span key={i}>
        <ArticleTrigger
          handle={handle}
          dieu={Number(head[1])}
          phrases={phrases}
          className={TRIGGER_LINK}
        >
          {cited}
        </ArticleTrigger>
        {tail}
      </span>
    )
  })
}

function CitedArticle({
  dieu,
  picks,
  article,
  status,
  phrases,
  handle,
}: {
  dieu: number
  picks: Citation["picks"]
  article: Article | undefined
  status: LawStatus
  phrases: string[]
  handle: ArticleSheetHandle
}) {
  if (!article) {
    if (status === "loading") {
      return (
        <p
          role="status"
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <LoaderCircle
            aria-hidden
            className="size-4 animate-spin motion-reduce:animate-none"
          />
          Đang tải Điều {dieu}…
        </p>
      )
    }
    return status === "error" ? (
      <Alert role="note" variant="destructive">
        <TriangleAlert aria-hidden />
        <AlertTitle>Không tải được Điều {dieu}</AlertTitle>
        <AlertDescription>Tải lại trang để thử lần nữa.</AlertDescription>
      </Alert>
    ) : (
      <Alert role="note">
        <FileQuestion aria-hidden />
        <AlertTitle>Không có Điều {dieu} trong Bộ luật</AlertTitle>
        <AlertDescription>
          Bộ luật Lao động đang dùng không có Điều này, nên trích dẫn không đối
          chiếu được.
        </AlertDescription>
      </Alert>
    )
  }

  const parsed = parseArticle(article.noi_dung)
  const { lines, missing } = resolveCitation(parsed, picks)

  return (
    <section aria-labelledby={`cited-${dieu}`} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h4
          id={`cited-${dieu}`}
          className="font-heading text-[1.05rem] font-bold text-pretty"
        >
          {parsed.heading}
        </h4>
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-mono text-[0.7rem] text-muted-foreground">
            Chương {article.chuong} · {sentenceCase(article.ten_chuong)}
          </p>
          {article.sua_doi.length > 0 && (
            <Badge variant="outline">
              <FilePen data-icon="inline-start" aria-hidden />
              Có sửa đổi
            </Badge>
          )}
        </div>
      </div>
      {missing.length > 0 && (
        <Alert role="note">
          <TriangleAlert aria-hidden />
          <AlertTitle>Trích dẫn không có trong Điều {dieu}</AlertTitle>
          <AlertDescription>
            Điều {dieu} không có {missing.join(", ")}. Dưới đây là phần Điều
            luật có thật.
          </AlertDescription>
        </Alert>
      )}
      {lines ? (
        <ArticleExcerpt
          lines={lines}
          phrases={phrases}
          className="text-[0.95rem]"
        />
      ) : (
        <ArticleBody
          article={parsed}
          phrases={phrases}
          className="text-[0.95rem]"
        />
      )}
      <ArticleTrigger
        handle={handle}
        dieu={dieu}
        phrases={phrases}
        className={cn(
          "inline-flex items-center gap-1 self-start text-sm",
          TRIGGER_LINK
        )}
      >
        Xem toàn văn Điều {dieu}
        <ArrowRight aria-hidden className="size-3.5" />
      </ArticleTrigger>
    </section>
  )
}

/** "Điều 107 khoản 2, Điều 107 khoản 3" names one article twice: quote it once. */
function byArticle(citations: Citation[]): Citation[] {
  const merged = new Map<number, Citation>()
  for (const c of citations) {
    const seen = merged.get(c.article)
    if (!seen)
      merged.set(c.article, { article: c.article, picks: [...c.picks] })
    // A citation naming no clause asks for the whole article, which wins over any pick.
    else if (!seen.picks.length || !c.picks.length) seen.picks = []
    else seen.picks.push(...c.picks)
  }
  return [...merged.values()]
}
