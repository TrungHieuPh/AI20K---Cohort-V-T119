import type { Metadata } from "next"
import Link from "next/link"
import { SearchX } from "lucide-react"

import { LawSearch } from "@/components/app/law-search"
import { PageHeader, PageShell } from "@/components/app/page-shell"
import { buttonVariants } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { getArticles, getLawInfo } from "@/lib/data"
import { sentenceCase, splitSection } from "@/lib/law"
import { PAGE } from "@/lib/pages"
import { searchArticles, type Segment } from "@/lib/search"
import type { Article } from "@/lib/types"
import { cn } from "@/lib/utils"

/** More hits than this and the list stops being useful; the reader should narrow the query. */
const MAX_HITS = 60

function readQuery(q: string | string[] | undefined): string {
  return (Array.isArray(q) ? q[0] : q)?.trim() ?? ""
}

export async function generateMetadata({
  searchParams,
}: PageProps<"/law">): Promise<Metadata> {
  const query = readQuery((await searchParams).q)
  return { title: query ? `Tìm “${query}” · ${PAGE.law}` : PAGE.law }
}

interface Chapter {
  roman: string
  name: string
  /** Consecutive runs of articles, one per Mục (a single run when the chapter has none). */
  sections: { section: ReturnType<typeof splitSection>; articles: Article[] }[]
  first: number
  last: number
}

function groupChapters(articles: Article[]): Chapter[] {
  const chapters: Chapter[] = []
  for (const article of articles) {
    let chapter = chapters.at(-1)
    if (chapter?.roman !== article.chuong) {
      chapter = {
        roman: article.chuong,
        name: sentenceCase(article.ten_chuong),
        sections: [],
        first: article.dieu,
        last: article.dieu,
      }
      chapters.push(chapter)
    }
    chapter.last = article.dieu
    const run = chapter.sections.at(-1)
    const section = splitSection(article.muc)
    if (run && run.section?.label === section?.label) run.articles.push(article)
    else chapter.sections.push({ section, articles: [article] })
  }
  return chapters
}

const fmt = new Intl.NumberFormat("vi-VN")

export default async function LawPage({ searchParams }: PageProps<"/law">) {
  const query = readQuery((await searchParams).q)
  const [articles, law] = await Promise.all([getArticles(), getLawInfo()])

  const hits = query ? searchArticles(articles, query) : []
  const shown = hits.slice(0, MAX_HITS)

  let status = `Mục lục ${law.chapters} Chương, ${law.articles} Điều.`
  if (query && !hits.length) status = `Không có Điều nào khớp với “${query}”.`
  else if (hits.length > MAX_HITS)
    status = `Hiện ${MAX_HITS}/${fmt.format(hits.length)} Điều khớp nhất với “${query}”. Gõ thêm từ để thu hẹp.`
  else if (query) status = `${hits.length} Điều khớp với “${query}”.`

  return (
    <PageShell>
      <PageHeader
        eyebrow={law.source}
        title={PAGE.law}
        description={`${law.articles} Điều trong ${law.chapters} Chương. Tìm theo số Điều hoặc từ khóa, gõ không dấu cũng được.`}
      >
        <div className="flex flex-col gap-2 pt-2">
          <LawSearch query={query} />
          {/* Always rendered in the same place, so screen readers announce each new count. */}
          <p role="status" className="text-sm text-muted-foreground">
            {status}
          </p>
        </div>
      </PageHeader>

      {!query ? (
        <Contents chapters={groupChapters(articles)} />
      ) : shown.length ? (
        <section aria-labelledby="hits-title" className="flex flex-col gap-3">
          <h2 id="hits-title" className="sr-only">
            Kết quả tìm kiếm
          </h2>
          <ol className="flex flex-col gap-3">
            {shown.map((hit) => (
              <li
                key={hit.article.dieu}
                className="relative flex flex-col gap-1.5 rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-colors hover:bg-muted/60 has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50"
              >
                <p className="font-mono text-xs text-muted-foreground">
                  Chương {hit.article.chuong} ·{" "}
                  {sentenceCase(hit.article.ten_chuong)}
                </p>
                <h3 className="leading-snug font-medium text-pretty">
                  <Link
                    href={`/law/${hit.article.dieu}`}
                    className="outline-none after:absolute after:inset-0"
                  >
                    Điều {hit.article.dieu}. <Marked segments={hit.title} />
                  </Link>
                </h3>
                <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
                  <Marked segments={hit.snippet} />
                </p>
              </li>
            ))}
          </ol>
        </section>
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchX aria-hidden />
            </EmptyMedia>
            <EmptyTitle>Không tìm thấy Điều nào</EmptyTitle>
            <EmptyDescription>
              Thử từ khóa ngắn hơn, bỏ bớt từ, hoặc gõ số Điều, ví dụ 107.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Link
              href="/law"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              Xem mục lục
            </Link>
          </EmptyContent>
        </Empty>
      )}
    </PageShell>
  )
}

/** Matched words get the same yellow marker as quoted evidence elsewhere in the app. */
function Marked({ segments }: { segments: Segment[] }) {
  return segments.map((s, i) =>
    s.hit ? (
      <mark key={i} className="rounded-[2px] bg-mark text-foreground">
        {s.text}
      </mark>
    ) : (
      s.text
    )
  )
}

function Contents({ chapters }: { chapters: Chapter[] }) {
  return (
    <div className="grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
      {/* Phones and tablets: chapter numerals in a row. */}
      <nav aria-label="Mục lục Chương" className="lg:hidden">
        <ol className="flex flex-wrap gap-1.5">
          {chapters.map((c) => (
            <li key={c.roman}>
              <a
                href={`#chuong-${c.roman}`}
                aria-label={`Chương ${c.roman}: ${c.name}`}
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "min-w-10 font-mono"
                )}
              >
                {c.roman}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <aside className="hidden lg:block">
        <nav
          aria-label="Mục lục Chương"
          className="sticky top-20 max-h-[calc(100svh-6rem)] overflow-y-auto pr-2"
        >
          <ol className="flex flex-col">
            {chapters.map((c) => (
              <li key={c.roman}>
                <a
                  href={`#chuong-${c.roman}`}
                  className="flex gap-2.5 rounded-md px-2 py-1.5 text-sm leading-snug text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <span className="w-8 shrink-0 font-mono text-xs leading-5">
                    {c.roman}
                  </span>
                  <span className="text-pretty">{c.name}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-col gap-10">
        {chapters.map((c) => (
          <section
            key={c.roman}
            id={`chuong-${c.roman}`}
            aria-labelledby={`chuong-${c.roman}-title`}
            className="flex scroll-mt-20 flex-col gap-4"
          >
            <header className="flex flex-col gap-1 border-b pb-3">
              <p className="text-sm font-semibold text-muted-foreground">
                Chương {c.roman} · Điều {c.first}–{c.last}
              </p>
              <h2
                id={`chuong-${c.roman}-title`}
                className="font-heading text-xl leading-snug font-bold text-balance"
              >
                {c.name}
              </h2>
            </header>
            {c.sections.map((run) => (
              <div key={run.articles[0].dieu} className="flex flex-col gap-1">
                {run.section && (
                  <h3 className="px-2 pt-2 pb-1 text-sm font-semibold">
                    <span className="font-mono text-xs font-normal text-muted-foreground">
                      {run.section.label} ·{" "}
                    </span>
                    {run.section.name}
                  </h3>
                )}
                <ol className="flex flex-col">
                  {run.articles.map((a) => (
                    <li key={a.dieu}>
                      <Link
                        href={`/law/${a.dieu}`}
                        className="flex gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-muted"
                      >
                        <span className="w-16 shrink-0 pt-0.5 font-mono text-xs text-muted-foreground tabular-nums">
                          Điều {a.dieu}
                        </span>
                        <span className="leading-snug text-pretty">
                          {a.tieu_de}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  )
}
