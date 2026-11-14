"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Dialog } from "@base-ui/react/dialog"
import {
  ArrowRight,
  FilePen,
  FileQuestion,
  LoaderCircle,
  TriangleAlert,
} from "lucide-react"

import { ArticleBody } from "@/components/app/article-text"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { buttonVariants } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { parseArticle, sentenceCase } from "@/lib/law"
import type { Article } from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * Side panel with one whole article of the Labor Code, opened from a citation or a
 * retrieved article on the question screen. One panel per page; every button that opens
 * it passes which article to show and which evidence to highlight.
 */

export interface ArticlePayload {
  dieu: number
  /** Evidence quoted by the judge, highlighted where it appears in the article. */
  phrases: string[]
}

export type ArticleSheetHandle = Dialog.Handle<ArticlePayload>

export function createArticleSheetHandle(): ArticleSheetHandle {
  return Dialog.createHandle<ArticlePayload>()
}

export type LawStatus = "ready" | "loading" | "error"

export function ArticleTrigger({
  handle,
  dieu,
  phrases = [],
  className,
  children,
  ...props
}: {
  handle: ArticleSheetHandle
  dieu: number
  phrases?: string[]
  className?: string
  children: React.ReactNode
} & Omit<React.ComponentProps<"button">, "children" | "className">) {
  return (
    <Dialog.Trigger
      handle={handle}
      payload={{ dieu, phrases }}
      className={cn("cursor-pointer", className)}
      {...props}
    >
      {children}
    </Dialog.Trigger>
  )
}

export function ArticleSheet({
  handle,
  articles,
  status,
  lawSource,
}: {
  handle: ArticleSheetHandle
  articles: Map<number, Article>
  status: LawStatus
  lawSource: string
}) {
  return (
    <Dialog.Root handle={handle}>
      {({ payload }) => (
        <SheetContent
          side="right"
          className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
        >
          {payload && (
            <ArticlePanel
              dieu={payload.dieu}
              phrases={payload.phrases}
              article={articles.get(payload.dieu)}
              status={status}
              lawSource={lawSource}
            />
          )}
        </SheetContent>
      )}
    </Dialog.Root>
  )
}

function ArticlePanel({
  dieu,
  phrases,
  article,
  status,
  lawSource,
}: {
  dieu: number
  phrases: string[]
  article: Article | undefined
  status: LawStatus
  lawSource: string
}) {
  const parsed = useMemo(
    () => (article ? parseArticle(article.noi_dung) : null),
    [article]
  )

  if (!article || !parsed) {
    const waiting = status === "loading"
    return (
      <>
        <SheetHeader className="border-b pr-12">
          <SheetTitle className="text-lg font-bold">Điều {dieu}</SheetTitle>
          <SheetDescription>{lawSource}</SheetDescription>
        </SheetHeader>
        <div className="p-4">
          {waiting ? (
            <p
              role="status"
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              <LoaderCircle
                aria-hidden
                className="size-4 animate-spin motion-reduce:animate-none"
              />
              Đang tải văn bản luật…
            </p>
          ) : status === "error" ? (
            <Alert variant="destructive">
              <TriangleAlert aria-hidden />
              <AlertTitle>Không tải được văn bản luật</AlertTitle>
              <AlertDescription>
                Đóng panel rồi bấm lại để thử lần nữa.
              </AlertDescription>
            </Alert>
          ) : (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileQuestion aria-hidden />
                </EmptyMedia>
                <EmptyTitle>Không có Điều này trong Bộ luật</EmptyTitle>
                <EmptyDescription>
                  Bộ luật Lao động đang dùng không có Điều {dieu}, nên trích dẫn
                  này không đối chiếu được. Chatbot có thể đã bịa ra số Điều.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>
      </>
    )
  }

  return (
    <>
      <SheetHeader className="border-b pr-12">
        <p className="text-xs font-semibold text-muted-foreground">
          Chương {article.chuong} · {sentenceCase(article.ten_chuong)}
        </p>
        <SheetTitle className="text-lg leading-snug font-bold text-pretty">
          {parsed.heading || `Điều ${article.dieu}. ${article.tieu_de}`}
        </SheetTitle>
        <SheetDescription>{article.nguon}</SheetDescription>
      </SheetHeader>

      {/* Long articles (Điều 219 runs ~7.000 characters) scroll here, not the page. */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto bg-paper p-5">
        <ArticleBody
          article={parsed}
          phrases={phrases}
          className="text-[0.95rem]"
        />
        {article.sua_doi.length > 0 && (
          <Alert role="note" className="bg-card">
            <FilePen aria-hidden />
            <AlertTitle>Đã sửa đổi</AlertTitle>
            <AlertDescription>
              <ul className="flex flex-col gap-1">
                {article.sua_doi.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
      </div>

      <div className="border-t p-4">
        <Link
          href={`/law/${article.dieu}`}
          className={cn(
            buttonVariants({ variant: "outline" }),
            "w-full sm:w-auto"
          )}
        >
          Mở trang Điều {article.dieu}
          <ArrowRight data-icon="inline-end" aria-hidden />
        </Link>
      </div>
    </>
  )
}

let lawRequest: Promise<Map<number, Article>> | null = null

/** The whole law, fetched once per page load from the static /data/law.json. */
function loadLaw(): Promise<Map<number, Article>> {
  lawRequest ??= fetch("/data/law.json")
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return response.json() as Promise<Article[]>
    })
    .then((list) => new Map(list.map((a) => [a.dieu, a])))
  // A failed request is forgotten, so the next question screen tries again.
  lawRequest.catch(() => {
    lawRequest = null
  })
  return lawRequest
}

/**
 * The articles a question needs. The server sends those of the demo question with this
 * id (`known` lists every article it looked up, found or not); anything else, as with an
 * opened file, comes from the full law.
 */
export function useArticles(
  initial: Article[],
  known: number[],
  needed: number[]
): { articles: Map<number, Article>; status: LawStatus } {
  const initialMap = useMemo(
    () => new Map(initial.map((a) => [a.dieu, a])),
    [initial]
  )
  const covered = needed.every((n) => known.includes(n))
  const [law, setLaw] = useState<Map<number, Article> | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (covered || law) return
    let live = true
    loadLaw().then(
      (map) => live && setLaw(map),
      () => live && setFailed(true)
    )
    return () => {
      live = false
    }
  }, [covered, law])

  if (covered) return { articles: initialMap, status: "ready" }
  if (law) return { articles: law, status: "ready" }
  return { articles: initialMap, status: failed ? "error" : "loading" }
}
