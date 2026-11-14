import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ChevronLeft, ChevronRight, FilePen } from "lucide-react"

import { ArticleBody } from "@/components/app/article-text"
import { PageHeader, PageShell } from "@/components/app/page-shell"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { VerdictBadge } from "@/components/verdict-badge"
import {
  getArticleAuditRefs,
  getArticles,
  type ArticleAuditRef,
} from "@/lib/data"
import { parseArticle, sentenceCase, splitSection } from "@/lib/law"
import type { ClaimLabel } from "@/lib/types"
import { cn } from "@/lib/utils"
import { CLAIM_LABEL } from "@/lib/verdicts"

export async function generateStaticParams() {
  const articles = await getArticles()
  return articles.map((a) => ({ articleId: String(a.dieu) }))
}

/** "107" -> 107; anything else ("0107", "abc") is not an article address. */
function toDieu(articleId: string): number | null {
  return /^[1-9]\d*$/.test(articleId) ? Number(articleId) : null
}

export async function generateMetadata({
  params,
}: PageProps<"/law/[articleId]">): Promise<Metadata> {
  const dieu = toDieu((await params).articleId)
  const article = (await getArticles()).find((a) => a.dieu === dieu)
  return {
    title: article
      ? `Điều ${article.dieu}. ${article.tieu_de}`
      : "Không tìm thấy Điều",
  }
}

export default async function ArticlePage({
  params,
}: PageProps<"/law/[articleId]">) {
  const dieu = toDieu((await params).articleId)
  const articles = await getArticles()
  const at = articles.findIndex((a) => a.dieu === dieu)
  if (dieu === null || at === -1) notFound()

  const article = articles[at]
  const prev = articles[at - 1]
  const next = articles[at + 1]
  const parsed = parseArticle(article.noi_dung)
  const section = splitSection(article.muc)
  const refs = await getArticleAuditRefs(article.dieu)

  const facts = [
    {
      term: "Số khoản",
      value: parsed.clauses.length
        ? String(parsed.clauses.length)
        : "Không chia khoản",
    },
    { term: "Văn bản", value: article.nguon },
    {
      term: "Mã",
      value: <span className="font-mono text-xs">{article.chunk_id}</span>,
    },
  ]

  return (
    <PageShell>
      <PageHeader
        eyebrow={`Chương ${article.chuong}${section ? ` · ${section.label}` : ""}`}
        title={parsed.heading || `Điều ${article.dieu}. ${article.tieu_de}`}
        description={
          <>
            <Link
              href={`/law#chuong-${article.chuong}`}
              className="underline decoration-foreground/25 underline-offset-4 hover:text-foreground hover:decoration-foreground"
            >
              {sentenceCase(article.ten_chuong)}
            </Link>
            {section && <> › {section.name}</>}
          </>
        }
        actions={
          <nav aria-label="Chuyển Điều" className="flex gap-2">
            {prev ? (
              <Link
                href={`/law/${prev.dieu}`}
                aria-label={`Điều trước: Điều ${prev.dieu}`}
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" })
                )}
              >
                <ChevronLeft data-icon="inline-start" aria-hidden />
                Điều {prev.dieu}
              </Link>
            ) : (
              <Button variant="outline" size="lg" disabled>
                <ChevronLeft data-icon="inline-start" aria-hidden />
                Điều trước
              </Button>
            )}
            {next ? (
              <Link
                href={`/law/${next.dieu}`}
                aria-label={`Điều sau: Điều ${next.dieu}`}
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" })
                )}
              >
                Điều {next.dieu}
                <ChevronRight data-icon="inline-end" aria-hidden />
              </Link>
            ) : (
              <Button variant="outline" size="lg" disabled>
                Điều sau
                <ChevronRight data-icon="inline-end" aria-hidden />
              </Button>
            )}
          </nav>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <article
            aria-label={`Nội dung Điều ${article.dieu}`}
            className="rounded-xl border border-paper-border bg-paper p-6 sm:p-8"
          >
            <ArticleBody
              article={parsed}
              anchorClauses
              className="max-w-3xl text-[1.05rem]"
            />
          </article>

          {article.sua_doi.length > 0 && (
            <Alert role="note">
              <FilePen aria-hidden />
              <AlertTitle>Ghi chú sửa đổi</AlertTitle>
              <AlertDescription className="flex flex-col gap-1.5">
                <ul className="flex flex-col gap-1">
                  {article.sua_doi.map((note, i) => (
                    <li key={i}>{note}</li>
                  ))}
                </ul>
                <p className="text-muted-foreground">
                  Văn bản hợp nhất chỉ ghi “khoản này” hoặc “điểm này”, nên dữ
                  liệu chưa biết chính xác khoản, điểm nào được sửa.
                </p>
              </AlertDescription>
            </Alert>
          )}
        </div>

        <aside className="flex flex-col gap-4">
          <Card size="sm">
            <CardHeader>
              <CardTitle>
                <h2>Trong lượt kiểm định demo</h2>
              </CardTitle>
              <CardDescription>
                {refs.length
                  ? "Các câu hỏi có ý trích Điều này, hoặc được truy hồi Điều này làm căn cứ."
                  : "Không câu nào trong lượt demo trích hay truy hồi Điều này."}
              </CardDescription>
            </CardHeader>
            {refs.length > 0 && (
              <CardContent>
                <ul className="flex flex-col gap-2.5">
                  {refs.map((ref) => (
                    <AuditRef key={ref.questionId} item={ref} />
                  ))}
                </ul>
              </CardContent>
            )}
          </Card>

          <Card size="sm">
            <CardContent>
              <dl className="flex flex-col gap-3">
                {facts.map((f) => (
                  <div key={f.term} className="flex flex-col gap-0.5">
                    <dt className="text-xs text-muted-foreground">{f.term}</dt>
                    <dd className="text-sm">{f.value}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        </aside>
      </div>
    </PageShell>
  )
}

function AuditRef({ item: ref }: { item: ArticleAuditRef }) {
  // One badge per label, with a count when several claims share it.
  const labels = new Map<ClaimLabel, number>()
  for (const label of ref.citedAs)
    labels.set(label, (labels.get(label) ?? 0) + 1)

  return (
    <li className="relative flex flex-col gap-2 rounded-lg p-3 ring-1 ring-foreground/10 transition-colors hover:bg-muted/60 has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50">
      <Link
        href={`/audit/${ref.questionId}`}
        className="outline-none after:absolute after:inset-0"
      >
        <span className="block font-mono text-xs text-muted-foreground">
          Câu #{ref.questionId}
        </span>
        <span className="line-clamp-2 text-sm leading-snug font-medium">
          {ref.question}
        </span>
      </Link>
      <div className="flex flex-wrap items-center gap-1.5">
        {ref.citedAs.length ? (
          <>
            <span className="text-xs text-muted-foreground">
              {ref.citedAs.length} ý trích Điều này:
            </span>
            {[...labels].map(([label, count]) => (
              <span key={label} className="inline-flex items-center gap-1">
                <VerdictBadge verdict={CLAIM_LABEL[label]} />
                {count > 1 && (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    ×{count}
                  </span>
                )}
              </span>
            ))}
          </>
        ) : (
          <span className="text-xs text-muted-foreground">
            Chỉ được truy hồi, không ý nào trích
          </span>
        )}
        {ref.retrievedRank !== null && (
          <Badge variant="outline">Truy hồi #{ref.retrievedRank}</Badge>
        )}
      </div>
    </li>
  )
}
