"use client"

import { useEffect, useRef, useState } from "react"
import {
  BookOpen,
  CircleAlert,
  CircleCheck,
  LoaderCircle,
  MessagesSquare,
  SendHorizontal,
  ShieldQuestion,
  Trash2,
  TriangleAlert,
  Unplug,
} from "lucide-react"

import {
  ArticleSheet,
  ArticleTrigger,
  createArticleSheetHandle,
  useArticles,
} from "@/components/app/article-sheet"
import {
  PageHeader,
  PageShell,
  SectionLabel,
} from "@/components/app/page-shell"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Textarea } from "@/components/ui/textarea"
import { formatScore, formatSeconds, formatUsd } from "@/lib/format"
import { citedArticles } from "@/lib/law"
import type { ChatApiError, ChatResponse } from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * Chat with the team's RAG bot over the Labor Code (POST /api/chat on api/server.py,
 * proxied by next.config.ts). Every question stands alone: the backend keeps no history,
 * the page only keeps the list of messages.
 */

const MAX_LENGTH = 1000

const SUGGESTIONS = [
  "Người lao động nghỉ việc phải báo trước bao nhiêu ngày?",
  "Thời gian thử việc tối đa là bao lâu?",
  "Thuế thu nhập cá nhân tính thế nào?",
]

const NO_BACKEND =
  "Chưa kết nối được backend hỏi đáp. Chạy ở thư mục gốc repo: python -m uvicorn api.server:app --port 8000, rồi gửi lại."

type Message =
  | { id: number; cau_hoi: string; state: "pending" }
  | { id: number; cau_hoi: string; state: "done"; answer: ChatResponse }
  | { id: number; cau_hoi: string; state: "error"; error: string }

type Health =
  | { state: "checking" }
  | { state: "ok"; model: string; retriever: string }
  | { state: "down" }

/** FastAPI validation types (422) in Vietnamese; others fall back to FastAPI's English msg. */
const VALIDATION: Record<string, string> = {
  string_too_short: "câu hỏi đang trống",
  string_too_long: `câu hỏi dài quá ${MAX_LENGTH} ký tự`,
  missing: "thiếu câu hỏi",
  greater_than_equal: "số Điều truy hồi phải từ 1 đến 10",
  less_than_equal: "số Điều truy hồi phải từ 1 đến 10",
}

/** A readable sentence from an error response: 422 lists, 502 strings, or no backend at all. */
async function errorMessage(response: Response): Promise<string> {
  let body: ChatApiError | null = null
  try {
    body = (await response.json()) as ChatApiError
  } catch {
    // The proxy answers with HTML or nothing when the backend is not running.
  }
  const detail = body?.detail
  if (response.status === 422) {
    if (typeof detail === "string") return detail
    if (Array.isArray(detail) && detail.length)
      return `Câu hỏi không hợp lệ: ${detail
        .map((d) => VALIDATION[d.type ?? ""] ?? d.msg ?? "dữ liệu sai")
        .join("; ")}.`
    return "Câu hỏi không hợp lệ."
  }
  if (response.status === 502 && typeof detail === "string")
    return `Hệ thống chưa trả lời được câu này. ${detail}`
  if (typeof detail === "string") return detail
  return NO_BACKEND
}

export function ChatView({ lawSource }: { lawSource: string }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState("")
  const [health, setHealth] = useState<Health>({ state: "checking" })
  const [handle] = useState(createArticleSheetHandle)
  const nextId = useRef(1)
  const endRef = useRef<HTMLDivElement>(null)

  const sending = messages.some((m) => m.state === "pending")
  const question = draft.trim()
  const tooLong = draft.length > MAX_LENGTH

  // Articles the panel may open: every citation and retrieved article on the page.
  const needed = messages.flatMap((m) =>
    m.state === "done"
      ? [
          ...m.answer.trich_dan.flatMap(citedArticles),
          ...m.answer.cac_dieu.map((a) => a.dieu),
        ]
      : []
  )
  const { articles, status } = useArticles([], [], needed)

  useEffect(() => {
    let live = true
    fetch("/api/health")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const h = (await r.json()) as { model: string; retriever: string }
        if (live) setHealth({ state: "ok", ...h })
      })
      .catch(() => live && setHealth({ state: "down" }))
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [messages])

  async function ask(text: string) {
    const cau_hoi = text.trim()
    if (!cau_hoi || cau_hoi.length > MAX_LENGTH || sending) return
    const id = nextId.current++
    setMessages((list) => [...list, { id, cau_hoi, state: "pending" }])
    setDraft("")
    let next: Message
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cau_hoi }),
      })
      next = response.ok
        ? {
            id,
            cau_hoi,
            state: "done",
            answer: (await response.json()) as ChatResponse,
          }
        : { id, cau_hoi, state: "error", error: await errorMessage(response) }
      if (response.ok && health.state !== "ok") setHealth({ state: "checking" })
    } catch {
      next = { id, cau_hoi, state: "error", error: NO_BACKEND }
    }
    setMessages((list) => list.map((m) => (m.id === id ? next : m)))
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Thử trực tiếp · Bộ luật Lao động"
        title="Hỏi đáp"
        description="Chatbot của nhóm: tìm các Điều liên quan rồi trả lời có trích Điều. Câu nằm ngoài Bộ luật Lao động thì từ chối thay vì đoán. Mỗi câu hỏi độc lập, chưa nhớ hội thoại."
        actions={
          messages.length > 0 && (
            <Button
              variant="outline"
              onClick={() => setMessages([])}
              disabled={sending}
            >
              <Trash2 data-icon="inline-start" aria-hidden />
              Xoá hội thoại
            </Button>
          )
        }
      >
        <HealthLine health={health} />
      </PageHeader>

      <section
        aria-labelledby="chat-title"
        aria-live="polite"
        className="flex flex-col gap-4"
      >
        <SectionLabel id="chat-title">
          Hội thoại · {messages.length} câu
        </SectionLabel>
        {messages.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MessagesSquare aria-hidden />
              </EmptyMedia>
              <EmptyTitle>Chưa có câu hỏi nào</EmptyTitle>
              <EmptyDescription>
                Gõ câu hỏi bên dưới, hoặc bấm một câu gợi ý.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ol className="flex flex-col gap-6">
            {messages.map((m) => (
              <li key={m.id} className="flex flex-col gap-3">
                <p className="max-w-[85%] self-end rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-pretty whitespace-pre-line text-primary-foreground">
                  <span className="sr-only">Câu hỏi: </span>
                  {m.cau_hoi}
                </p>
                {m.state === "pending" && (
                  <p
                    role="status"
                    className="flex items-center gap-2 text-sm text-muted-foreground"
                  >
                    <LoaderCircle
                      aria-hidden
                      className="size-4 animate-spin motion-reduce:animate-none"
                    />
                    Đang tìm Điều luật và soạn câu trả lời…
                  </p>
                )}
                {m.state === "error" && (
                  <Alert variant="destructive" className="max-w-[85%]">
                    <Unplug aria-hidden />
                    <AlertTitle>Không trả lời được</AlertTitle>
                    <AlertDescription>{m.error}</AlertDescription>
                  </Alert>
                )}
                {m.state === "done" && (
                  <AnswerCard answer={m.answer} handle={handle} />
                )}
              </li>
            ))}
          </ol>
        )}
        <div ref={endRef} />
      </section>

      <form
        className="sticky bottom-4 flex flex-col gap-3 rounded-xl bg-card p-4 shadow-sm ring-1 ring-foreground/10"
        onSubmit={(e) => {
          e.preventDefault()
          void ask(draft)
        }}
      >
        <label htmlFor="cau-hoi" className="text-sm font-medium">
          Câu hỏi về Bộ luật Lao động
        </label>
        <Textarea
          id="cau-hoi"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault()
              void ask(draft)
            }
          }}
          placeholder="Ví dụ: Làm thêm giờ tối đa bao nhiêu giờ một năm?"
          aria-invalid={tooLong || undefined}
          aria-describedby="cau-hoi-goi-y"
          className="max-h-48 bg-background"
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p
            id="cau-hoi-goi-y"
            className={cn(
              "text-xs text-muted-foreground tabular-nums",
              tooLong && "font-medium text-destructive"
            )}
          >
            {tooLong
              ? `Quá dài: ${draft.length}/${MAX_LENGTH} ký tự.`
              : `Enter để gửi, Shift+Enter xuống dòng · ${draft.length}/${MAX_LENGTH}`}
          </p>
          <Button type="submit" disabled={sending || !question || tooLong}>
            {sending ? (
              <LoaderCircle
                data-icon="inline-start"
                aria-hidden
                className="animate-spin motion-reduce:animate-none"
              />
            ) : (
              <SendHorizontal data-icon="inline-start" aria-hidden />
            )}
            {sending ? "Đang chờ…" : "Gửi"}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <Button
              key={s}
              type="button"
              variant="outline"
              size="sm"
              disabled={sending}
              onClick={() => void ask(s)}
              className="h-auto py-1 text-left whitespace-normal"
            >
              {s}
            </Button>
          ))}
        </div>
      </form>

      <ArticleSheet
        handle={handle}
        articles={articles}
        status={status}
        lawSource={lawSource}
      />
    </PageShell>
  )
}

function HealthLine({ health }: { health: Health }) {
  if (health.state === "checking")
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle
          aria-hidden
          className="size-4 animate-spin motion-reduce:animate-none"
        />
        Đang kiểm tra backend…
      </p>
    )
  if (health.state === "down")
    return (
      <p className="flex items-center gap-2 text-sm font-medium">
        <CircleAlert aria-hidden className="size-4 text-verdict-error" />
        Chưa kết nối được backend hỏi đáp (cổng 8000).
      </p>
    )
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <CircleCheck aria-hidden className="size-4 text-verdict-correct" />
      <span className="font-medium">Đã kết nối backend</span>
      <span className="text-muted-foreground">
        · LLM {health.model.split("/").pop()} · truy hồi{" "}
        {health.retriever.split(" ")[0]}
      </span>
    </p>
  )
}

function AnswerCard({
  answer,
  handle,
}: {
  answer: ChatResponse
  handle: ReturnType<typeof createArticleSheetHandle>
}) {
  return (
    <Card className="max-w-[92%]">
      <CardContent className="flex flex-col gap-4">
        {answer.tu_choi && (
          <p className="flex items-center gap-2 text-sm font-medium">
            <ShieldQuestion
              aria-hidden
              className="size-4 shrink-0 text-verdict-ungrounded"
            />
            Câu hỏi nằm ngoài phạm vi Bộ luật Lao động: chatbot từ chối thay vì
            đoán.
          </p>
        )}
        <p className="leading-relaxed text-pretty whitespace-pre-line">
          {answer.cau_tra_loi}
        </p>

        {answer.trich_dan.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-medium text-muted-foreground">
              Căn cứ chatbot trích
            </h3>
            <ul className="flex flex-wrap gap-2">
              {answer.trich_dan.map((t) => {
                const [dieu] = citedArticles(t)
                return (
                  <li key={t}>
                    {dieu ? (
                      <ArticleTrigger
                        handle={handle}
                        dieu={dieu}
                        className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-sm font-medium hover:bg-muted"
                      >
                        <BookOpen aria-hidden className="size-3.5" />
                        {t}
                      </ArticleTrigger>
                    ) : (
                      <Badge variant="outline">{t}</Badge>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {answer.trich_dan_ngoai.length > 0 && (
          <Alert role="note">
            <TriangleAlert aria-hidden className="text-verdict-ungrounded" />
            <AlertTitle>Cần kiểm lại</AlertTitle>
            <AlertDescription>
              Chatbot trích Điều {answer.trich_dan_ngoai.join(", ")} nhưng Điều
              đó không nằm trong các Điều đã truy hồi, nên câu trả lời có thể
              không dựa trên văn bản luật được đưa vào.
            </AlertDescription>
          </Alert>
        )}

        {answer.cac_dieu.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-medium text-muted-foreground">
              Điều đã truy hồi · điểm tương đồng (chỉ để so thứ hạng trong câu
              này)
            </h3>
            <ol className="flex flex-col divide-y rounded-lg border">
              {answer.cac_dieu.map((a, i) => (
                <li key={a.dieu}>
                  <ArticleTrigger
                    handle={handle}
                    dieu={a.dieu}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <span className="w-5 shrink-0 font-mono text-xs text-muted-foreground">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium">Điều {a.dieu}.</span>{" "}
                      {a.tieu_de}
                    </span>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                      điểm {formatScore(a.score)}
                    </span>
                  </ArticleTrigger>
                </li>
              ))}
            </ol>
          </div>
        )}

        <p className="text-xs text-muted-foreground tabular-nums">
          {formatSeconds(answer.thoi_gian_ms)} · {formatUsd(answer.chi_phi_usd)}
        </p>
      </CardContent>
    </Card>
  )
}
