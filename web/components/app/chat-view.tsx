"use client"

import { useEffect, useRef, useState } from "react"
import { Collapsible } from "@base-ui/react/collapsible"
import {
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  ChevronDown,
  CircleAlert,
  Clock,
  DoorOpen,
  Hourglass,
  LoaderCircle,
  MessagesSquare,
  RotateCcw,
  Scale,
  ShieldCheck,
  ShieldQuestion,
  SquarePen,
  TextSearch,
  TriangleAlert,
  Unplug,
} from "lucide-react"

import { AnswerText, locateClaims } from "@/components/app/answer-text"
import {
  ArticleSheet,
  ArticleTrigger,
  createArticleSheetHandle,
  useArticles,
} from "@/components/app/article-sheet"
import { LiveAuditResult, auditArticles } from "@/components/app/live-audit"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupTextarea,
} from "@/components/ui/input-group"
import { Skeleton } from "@/components/ui/skeleton"
import { auditAnswer } from "@/lib/audit-api"
import { formatScore, formatSeconds } from "@/lib/format"
import { citedArticles } from "@/lib/law"
import { PAGE } from "@/lib/pages"
import type { AuditedQuestion, ChatApiError, ChatResponse } from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * Chat with the team's RAG bot over the Labor Code (POST /api/chat on api/server.py,
 * proxied by next.config.ts). Every question stands alone: the backend keeps no history,
 * the page only keeps the list of messages. Any answer can then be audited on the spot
 * (POST /api/audit, lib/audit-api.ts); audits live beside the messages, by message id.
 */

const MAX_LENGTH = 1000

/** The counter shows once a question gets this long, so it is not noise below that. */
const COUNT_FROM = 800

/**
 * Shortest time an audit shows as running. A faster reply (an error, typically) would
 * otherwise swap the button for its outcome before anyone sees the click land.
 */
const MIN_AUDIT_MS = 700

/** Starter questions on the empty screen; the last one shows the bot refusing. */
const SUGGESTIONS = [
  {
    icon: DoorOpen,
    question: "Người lao động nghỉ việc phải báo trước bao nhiêu ngày?",
  },
  { icon: Hourglass, question: "Thời gian thử việc tối đa là bao lâu?" },
  { icon: Clock, question: "Làm thêm giờ tối đa bao nhiêu giờ một năm?" },
  {
    icon: ShieldQuestion,
    question: "Thuế thu nhập cá nhân tính thế nào?",
    note: "Ngoài Bộ luật: chatbot sẽ từ chối thay vì đoán.",
  },
]

const NO_BACKEND =
  "Chưa kết nối được chatbot. Người chạy demo cần bật máy chủ (ở thư mục gốc repo: python -m uvicorn api.server:app --port 8000), rồi gửi lại."

type Message =
  | { id: number; cau_hoi: string; state: "pending" }
  | { id: number; cau_hoi: string; state: "done"; answer: ChatResponse }
  | { id: number; cau_hoi: string; state: "error"; error: string }

type Audit =
  | { state: "pending" }
  | { state: "done"; result: AuditedQuestion }
  | { state: "error"; error: string }

type Health =
  | { state: "checking" }
  | { state: "ok"; model: string; retriever: string }
  | { state: "down" }

type Handle = ReturnType<typeof createArticleSheetHandle>

/** FastAPI validation types (422) in Vietnamese; others fall back to FastAPI's English msg. */
const VALIDATION: Record<string, string> = {
  string_too_short: "câu hỏi đang trống",
  string_too_long: `câu hỏi dài quá ${MAX_LENGTH} ký tự`,
  missing: "thiếu câu hỏi",
  greater_than_equal: "số Điều cần tìm phải từ 1 đến 10",
  less_than_equal: "số Điều cần tìm phải từ 1 đến 10",
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
  const [audits, setAudits] = useState<Record<number, Audit>>({})
  const [draft, setDraft] = useState("")
  const [health, setHealth] = useState<Health>({ state: "checking" })
  const [handle] = useState(createArticleSheetHandle)
  const nextId = useRef(1)
  const endRef = useRef<HTMLDivElement>(null)

  const sending = messages.some((m) => m.state === "pending")
  const auditing = Object.values(audits).some((a) => a.state === "pending")
  const question = draft.trim()
  const tooLong = draft.length > MAX_LENGTH

  // Articles the panel may open: every citation and retrieved article on the page,
  // those of the audits included.
  const needed = [
    ...messages.flatMap((m) =>
      m.state === "done"
        ? [
            ...m.answer.trich_dan.flatMap(citedArticles),
            ...m.answer.cac_dieu.map((a) => a.dieu),
          ]
        : []
    ),
    ...Object.values(audits).flatMap((a) =>
      a.state === "done" ? auditArticles(a.result) : []
    ),
  ]
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

  /** Audits the answer of message `id`; the result stays next to that message. */
  async function check(id: number, cau_hoi: string, cau_tra_loi: string) {
    if (audits[id]?.state === "pending") return
    setAudits((all) => ({ ...all, [id]: { state: "pending" } }))
    const [outcome] = await Promise.all([
      auditAnswer(cau_hoi, cau_tra_loi),
      new Promise((resolve) => setTimeout(resolve, MIN_AUDIT_MS)),
    ])
    setAudits((all) => ({
      ...all,
      [id]: outcome.ok
        ? { state: "done", result: outcome.result }
        : { state: "error", error: outcome.error },
    }))
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 sm:px-6">
      <h1 className="sr-only">{PAGE.chat}</h1>

      <div className="flex min-h-14 items-center justify-between gap-3 py-3">
        <HealthLine health={health} />
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setMessages([])
              setAudits({})
            }}
            disabled={sending || auditing}
          >
            <SquarePen data-icon="inline-start" aria-hidden />
            Cuộc trò chuyện mới
          </Button>
        )}
      </div>

      <section
        aria-labelledby="chat-title"
        aria-live="polite"
        className="flex flex-1 flex-col"
      >
        <h2 id="chat-title" className="sr-only">
          Cuộc trò chuyện ({messages.length} câu)
        </h2>
        {messages.length === 0 ? (
          <Welcome onAsk={(q) => void ask(q)} disabled={sending} />
        ) : (
          <ol className="flex flex-col gap-10 pt-2 pb-10">
            {messages.map((m) => (
              <li key={m.id} className="flex flex-col gap-5">
                <div className="flex justify-end">
                  <p className="max-w-[85%] rounded-3xl rounded-br-lg bg-hero px-4 py-2.5 text-pretty whitespace-pre-line text-hero-foreground shadow-sm sm:px-5">
                    <span className="sr-only">Câu hỏi: </span>
                    {m.cau_hoi}
                  </p>
                </div>
                {m.state === "pending" && <PendingTurn />}
                {m.state === "error" && (
                  <div className="flex flex-col gap-3">
                    <BotHeader />
                    <Alert variant="destructive">
                      <Unplug aria-hidden />
                      <AlertTitle>Không trả lời được</AlertTitle>
                      <AlertDescription>{m.error}</AlertDescription>
                    </Alert>
                  </div>
                )}
                {m.state === "done" && (
                  <BotTurn
                    answer={m.answer}
                    audit={audits[m.id]}
                    onAudit={() =>
                      void check(m.id, m.cau_hoi, m.answer.cau_tra_loi)
                    }
                    anchorPrefix={`c${m.id}-y-`}
                    articles={articles}
                    status={status}
                    handle={handle}
                  />
                )}
              </li>
            ))}
          </ol>
        )}
        {/* Keeps the last message clear of the composer stuck to the bottom. Not on the
            empty screen, so opening the page never scrolls it. */}
        {messages.length > 0 && <div ref={endRef} className="scroll-mb-44" />}
      </section>

      <form
        className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-2 bg-linear-to-t from-background from-75% to-transparent px-4 pt-6 pb-3 sm:-mx-6 sm:px-6"
        onSubmit={(e) => {
          e.preventDefault()
          void ask(draft)
        }}
      >
        <label htmlFor="cau-hoi" className="sr-only">
          Câu hỏi về Bộ luật Lao động
        </label>
        <InputGroup className="rounded-3xl bg-card shadow-lg shadow-foreground/5 has-disabled:bg-card has-disabled:opacity-100 dark:has-disabled:bg-card">
          <InputGroupTextarea
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
            placeholder="Hỏi về Bộ luật Lao động…"
            aria-invalid={tooLong || undefined}
            aria-describedby="cau-hoi-goi-y"
            className="max-h-48 min-h-12 px-5 pt-3.5 text-base md:text-base"
          />
          <InputGroupAddon align="block-end" className="gap-3 px-3 pb-3">
            <InputGroupText
              id="cau-hoi-goi-y"
              className={cn(
                "min-w-0 pl-2 text-xs font-normal tabular-nums",
                tooLong && "font-medium text-destructive"
              )}
            >
              {tooLong
                ? `Quá dài: ${draft.length}/${MAX_LENGTH} ký tự.`
                : draft.length >= COUNT_FROM
                  ? `${draft.length}/${MAX_LENGTH} ký tự`
                  : "Enter để gửi · Shift+Enter xuống dòng"}
            </InputGroupText>
            <InputGroupButton
              type="submit"
              variant="default"
              size="icon-sm"
              className="ml-auto rounded-full"
              disabled={sending || !question || tooLong}
              aria-label={sending ? "Đang chờ câu trả lời" : "Gửi câu hỏi"}
            >
              {sending ? (
                <LoaderCircle
                  aria-hidden
                  className="animate-spin motion-reduce:animate-none"
                />
              ) : (
                <ArrowUp aria-hidden />
              )}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        <p className="text-center text-xs text-pretty text-muted-foreground">
          Mỗi câu hỏi độc lập, chatbot chưa nhớ câu trước. Chatbot có thể sai,
          hãy bấm kiểm để soát lại từng ý.
        </p>
      </form>

      <ArticleSheet
        handle={handle}
        articles={articles}
        status={status}
        lawSource={lawSource}
      />
    </div>
  )
}

/** A small pill with whether the chatbot server answers, and which AI and search it uses. */
function HealthLine({ health }: { health: Health }) {
  const pill =
    "inline-flex min-w-0 items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs"
  if (health.state === "checking")
    return (
      <p className={cn(pill, "text-muted-foreground")}>
        <LoaderCircle
          aria-hidden
          className="size-3.5 animate-spin motion-reduce:animate-none"
        />
        Đang kết nối chatbot…
      </p>
    )
  if (health.state === "down")
    return (
      <p className={cn(pill, "font-medium")}>
        <CircleAlert aria-hidden className="size-3.5 text-verdict-error" />
        Chưa kết nối máy chủ chatbot (cổng 8000)
      </p>
    )
  return (
    <p className={pill}>
      <span aria-hidden className="size-2 rounded-full bg-verdict-correct" />
      <span className="font-medium">Chatbot sẵn sàng</span>
      <span className="truncate text-muted-foreground max-sm:hidden">
        · AI {health.model.split("/").pop()} · tìm Điều bằng{" "}
        {health.retriever.split(" ")[0]}
      </span>
    </p>
  )
}

/** The empty screen: what to ask, and four questions to start with. */
function Welcome({
  onAsk,
  disabled,
}: {
  onAsk: (question: string) => void
  disabled: boolean
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 py-6 text-center sm:gap-10 sm:py-12">
      <div className="flex flex-col items-center gap-4 sm:gap-5">
        <p className="inline-flex items-center gap-2.5 rounded-full bg-card py-1 pr-4 pl-1 text-sm font-semibold shadow-xs ring-1 ring-foreground/10">
          <span
            aria-hidden
            className="grid size-7 place-items-center rounded-full bg-hero text-hero-foreground"
          >
            <MessagesSquare className="size-3.5" />
          </span>
          Chatbot RAG trên Bộ luật Lao động
        </p>
        <p className="font-heading text-[2.1rem] leading-[1.08] font-extrabold tracking-tight text-balance sm:text-5xl">
          Hỏi gì về <span className="text-primary">Bộ luật Lao động</span>?
        </p>
        <p className="max-w-lg text-[1.05rem] leading-relaxed text-pretty text-muted-foreground">
          Chatbot tìm Điều luật liên quan rồi trả lời kèm Điều đã dẫn. Sau mỗi
          câu trả lời, bấm{" "}
          <span className="font-semibold text-foreground">
            Kiểm câu trả lời này
          </span>{" "}
          để lexgate soát từng ý với luật.
        </p>
      </div>
      <ul
        aria-label="Câu hỏi gợi ý"
        className="grid w-full gap-2 sm:grid-cols-2"
      >
        {SUGGESTIONS.map(({ icon: Icon, question, note }) => (
          <li key={question}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onAsk(question)}
              className="group flex size-full cursor-pointer items-center gap-3 rounded-xl bg-card py-2.5 pr-3 pl-2.5 text-left shadow-xs ring-1 ring-foreground/10 transition-[box-shadow] outline-none hover:shadow-md hover:shadow-foreground/5 hover:ring-primary/35 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
            >
              <span
                aria-hidden
                className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground motion-reduce:transition-none"
              >
                <Icon className="size-4" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-sm leading-snug font-semibold text-pretty">
                  {question}
                </span>
                {note && (
                  <span className="text-xs text-muted-foreground">{note}</span>
                )}
              </span>
              <ArrowUpRight
                aria-hidden
                className="size-4 shrink-0 text-muted-foreground transition-[color,translate] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary motion-reduce:transition-none"
              />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Who is speaking, above each answer: the lexgate mark (the dock's "§"), popping in with
 * the answer and breathing while it is still looking up the law. `children` go on the
 * same line.
 */
function BotHeader({
  thinking = false,
  children,
}: {
  thinking?: boolean
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
      <span
        aria-hidden
        className="relative grid size-8 shrink-0 animate-in place-items-center duration-500 fade-in-0 zoom-in-75 motion-reduce:animate-none"
      >
        {thinking && (
          <span className="absolute -inset-1 animate-pulse rounded-[0.95rem] bg-primary/20 motion-reduce:animate-none" />
        )}
        <span className="relative grid size-full place-items-center rounded-xl bg-hero font-heading text-base leading-none font-extrabold text-hero-foreground shadow-sm shadow-hero/25">
          §
        </span>
      </span>
      <span className="font-heading text-[0.95rem] font-extrabold tracking-tight">
        lexgate
      </span>
      {children}
    </div>
  )
}

function PendingTurn() {
  return (
    <div className="flex flex-col gap-3">
      <BotHeader thinking />
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
      <div aria-hidden className="flex flex-col gap-2.5">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  )
}

const CITE =
  "group/cite inline-flex max-w-full items-center gap-2 rounded-lg bg-card py-1 pr-2.5 pl-1 text-left text-sm leading-snug shadow-xs ring-1 ring-foreground/10 transition-[box-shadow] outline-none hover:shadow-md hover:shadow-foreground/5 hover:ring-primary/40 focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none"

/** "Điều 107 khoản 2 điểm c" -> ["Điều 107", "khoản 2 điểm c"], so the article stands out. */
function splitCitation(text: string): [string, string] {
  const match = /^(Điều\s+\d+[a-zđ]?)[\s,]*(.*)$/iu.exec(text.trim())
  return match ? [match[1], match[2]] : [text, ""]
}

/**
 * One answer as plain text (no card, like any chat), then one card with what it rests on
 * and the audit action, then the audit result once there is one.
 */
function BotTurn({
  answer,
  audit,
  onAudit,
  anchorPrefix,
  articles,
  status,
  handle,
}: {
  answer: ChatResponse
  audit: Audit | undefined
  onAudit: () => void
  anchorPrefix: string
  articles: React.ComponentProps<typeof LiveAuditResult>["articles"]
  status: React.ComponentProps<typeof LiveAuditResult>["status"]
  handle: Handle
}) {
  const claims = audit?.state === "done" ? audit.result.cac_y : []
  const marked = locateClaims(answer.cau_tra_loi, claims).some(
    (s) => s.claim !== undefined
  )
  const hasSources = answer.trich_dan.length > 0 || answer.cac_dieu.length > 0
  const showAction = !answer.tu_choi && audit?.state !== "done"

  return (
    <article
      aria-label="Câu trả lời của lexgate"
      className="flex flex-col gap-4"
    >
      <BotHeader>
        {answer.tu_choi && (
          <Badge variant="outline">
            <ShieldQuestion data-icon="inline-start" aria-hidden />
            Từ chối
          </Badge>
        )}
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {formatSeconds(answer.thoi_gian_ms)}
        </span>
      </BotHeader>

      {answer.tu_choi && (
        <p className="text-sm text-muted-foreground">
          Câu hỏi nằm ngoài phạm vi Bộ luật Lao động, nên chatbot từ chối thay
          vì đoán.
        </p>
      )}

      <div className="flex flex-col gap-2">
        <p className="text-base leading-7 text-pretty whitespace-pre-line sm:text-[1.0625rem] sm:leading-8">
          {marked ? (
            <AnswerText
              answer={answer.cau_tra_loi}
              claims={claims}
              anchorPrefix={anchorPrefix}
            />
          ) : (
            answer.cau_tra_loi
          )}
        </p>
        {marked && (
          <p className="text-xs text-muted-foreground">
            Mỗi phần gạch chân là một ý đã kiểm. Bấm số nhỏ để xuống ý đó.
          </p>
        )}
      </div>

      {(hasSources || showAction) && (
        <div className="overflow-hidden rounded-2xl bg-card shadow-xs ring-1 ring-foreground/10">
          {hasSources && <Sources answer={answer} handle={handle} />}
          {showAction && (
            <AuditAction audit={audit} onAudit={onAudit} divided={hasSources} />
          )}
        </div>
      )}

      {audit?.state === "done" && (
        <AuditResult
          result={audit.result}
          anchorPrefix={anchorPrefix}
          articles={articles}
          status={status}
          handle={handle}
        />
      )}
    </article>
  )
}

/**
 * What the answer rests on, as the card's first strip: the articles it cites (each opens
 * the law panel) and, behind a toggle that slides open, every article the search brought
 * back, best first, each with a bar for its score relative to the best one here. Scores
 * are cosine with Qdrant but unbounded with BM25, so a bar only compares articles within
 * this answer, never against a threshold.
 */
function Sources({ answer, handle }: { answer: ChatResponse; handle: Handle }) {
  const outside = new Set(answer.trich_dan_ngoai)
  const cited = new Set(answer.trich_dan.flatMap(citedArticles))
  const scores = answer.cac_dieu.flatMap((a) =>
    typeof a.score === "number" && a.score > 0 ? [a.score] : []
  )
  const best = scores.length ? Math.max(...scores) : null

  return (
    <Collapsible.Root>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 pr-2.5 pl-3.5">
        {answer.trich_dan.length > 0 ? (
          <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Scale aria-hidden className="size-3.5" />
              Căn cứ
            </p>
            <ul
              aria-label="Căn cứ đã dẫn"
              className="flex min-w-0 flex-wrap gap-1.5"
            >
              {answer.trich_dan.map((t, i) => {
                const [dieu] = citedArticles(t)
                const away = dieu !== undefined && outside.has(dieu)
                const [head, rest] = splitCitation(t)
                return (
                  <li key={`${t}-${i}`} className="max-w-full">
                    {dieu ? (
                      <ArticleTrigger
                        handle={handle}
                        dieu={dieu}
                        className={cn(
                          CITE,
                          away &&
                            "bg-verdict-ungrounded-soft ring-verdict-ungrounded/40 hover:ring-verdict-ungrounded/60"
                        )}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "grid size-6 shrink-0 place-items-center rounded-md transition-colors motion-reduce:transition-none",
                            away
                              ? "bg-verdict-ungrounded/15 text-verdict-ungrounded"
                              : "bg-primary/10 text-primary group-hover/cite:bg-primary group-hover/cite:text-primary-foreground"
                          )}
                        >
                          {away ? (
                            <TriangleAlert className="size-3.5" />
                          ) : (
                            <BookOpen className="size-3.5" />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="font-semibold">{head}</span>
                          {rest && (
                            <span className="text-muted-foreground">
                              {" "}
                              {rest}
                            </span>
                          )}
                          {away && (
                            <span className="sr-only">
                              {" "}
                              (không nằm trong các Điều tìm được)
                            </span>
                          )}
                        </span>
                      </ArticleTrigger>
                    ) : (
                      <Badge variant="outline">{t}</Badge>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Không dẫn Điều nào</p>
        )}

        {answer.cac_dieu.length > 0 && (
          <Collapsible.Trigger className="group/more ml-auto inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-[panel-open]:bg-muted data-[panel-open]:text-foreground motion-reduce:transition-none">
            <TextSearch aria-hidden className="size-3.5" />
            <span className="tabular-nums">
              {answer.cac_dieu.length} Điều đã tìm
            </span>
            <ChevronDown
              aria-hidden
              className="size-3.5 transition-transform duration-300 group-data-[panel-open]/more:rotate-180 motion-reduce:transition-none"
            />
          </Collapsible.Trigger>
        )}
      </div>

      {answer.cac_dieu.length > 0 && (
        <Collapsible.Panel className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] data-[ending-style]:h-0 data-[starting-style]:h-0 motion-reduce:transition-none">
          <div className="flex flex-col gap-1 border-t px-1.5 pt-2.5 pb-1.5">
            <p className="px-2 text-xs text-muted-foreground">
              Gần câu hỏi nhất ở trên. Thanh chỉ so các Điều trong câu này với
              nhau.
            </p>
            <ol className="flex flex-col">
              {answer.cac_dieu.map((a, i) => {
                const share =
                  best && typeof a.score === "number" && a.score > 0
                    ? Math.max(0.04, a.score / best)
                    : 0
                const isCited = cited.has(a.dieu)
                return (
                  <li key={`${a.dieu}-${i}`}>
                    <ArticleTrigger
                      handle={handle}
                      dieu={a.dieu}
                      className="grid w-full grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 rounded-xl px-2 py-2 text-left text-sm transition-colors hover:bg-muted/60"
                    >
                      <span className="font-mono text-xs text-muted-foreground">
                        {i + 1}
                      </span>
                      <span className="truncate">
                        <span className="font-medium">Điều {a.dieu}.</span>{" "}
                        {a.tieu_de}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground tabular-nums">
                        {formatScore(a.score)}
                      </span>
                      <span className="col-span-2 col-start-2 flex items-center gap-3">
                        <span
                          aria-hidden
                          className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted-foreground/15"
                        >
                          <span
                            className={cn(
                              "block h-full rounded-full",
                              isCited ? "bg-primary" : "bg-primary/40"
                            )}
                            style={{ width: `${Math.round(share * 100)}%` }}
                          />
                        </span>
                        {isCited && (
                          <span className="shrink-0 text-xs font-medium">
                            Chatbot dẫn
                          </span>
                        )}
                      </span>
                    </ArticleTrigger>
                  </li>
                )
              })}
            </ol>
          </div>
        </Collapsible.Panel>
      )}

      {answer.trich_dan_ngoai.length > 0 && (
        <p
          role="note"
          className="flex items-start gap-2 border-t bg-verdict-ungrounded-soft px-3.5 py-2.5 text-xs leading-relaxed text-pretty"
        >
          <TriangleAlert
            aria-hidden
            className="mt-0.5 size-3.5 shrink-0 text-verdict-ungrounded"
          />
          <span>
            <span className="font-semibold">Cần kiểm lại:</span> Điều{" "}
            {answer.trich_dan_ngoai.join(", ")} được dẫn nhưng không nằm trong
            các Điều tìm được, nên phần này có thể không dựa trên văn bản luật.
          </span>
        </p>
      )}
    </Collapsible.Root>
  )
}

/**
 * The card's last strip: the call to audit the answer. Clicked, it shows the audit
 * running (spinner, a bar sweeping along the card's edge); if the audit fails, the reason
 * and a retry. The result itself opens below the card.
 */
function AuditAction({
  audit,
  onAudit,
  divided,
}: {
  audit: Audit | undefined
  onAudit: () => void
  divided: boolean
}) {
  const pending = audit?.state === "pending"
  const error = audit?.state === "error" ? audit.error : null

  const title = pending
    ? "lexgate đang kiểm câu trả lời…"
    : error !== null
      ? "Chưa kiểm được câu trả lời này"
      : "Câu trả lời này có đúng luật không?"
  const detail = pending
    ? "Đang tách từng ý và so từng ý với Bộ luật Lao động."
    : (error ?? "Tách từng ý, so với Bộ luật rồi gán nhãn cho từng ý.")

  return (
    <div
      className={cn(
        "relative flex flex-col gap-3 py-2.5 pr-2.5 pl-3.5 sm:flex-row sm:items-center sm:gap-4",
        divided && "border-t"
      )}
    >
      <div
        role={pending ? "status" : undefined}
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        <span
          aria-hidden
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-lg transition-colors motion-reduce:transition-none",
            error !== null
              ? "bg-destructive/10 text-destructive"
              : "bg-primary/10 text-primary"
          )}
        >
          {error !== null ? (
            <CircleAlert className="size-4" />
          ) : (
            <ShieldCheck
              className={cn(
                "size-4",
                pending && "animate-pulse motion-reduce:animate-none"
              )}
            />
          )}
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs leading-relaxed text-pretty text-muted-foreground">
            {detail}
          </p>
        </div>
      </div>

      {error !== null ? (
        <Button
          variant="outline"
          size="lg"
          onClick={onAudit}
          className="shrink-0 rounded-full px-4"
        >
          <RotateCcw data-icon="inline-start" aria-hidden />
          Thử lại
        </Button>
      ) : (
        <Button
          size="lg"
          onClick={onAudit}
          disabled={pending}
          focusableWhenDisabled
          className="group/cta shrink-0 rounded-full px-4 has-data-[icon=inline-end]:pr-3.5 sm:min-w-44"
        >
          {pending ? (
            <>
              <LoaderCircle
                data-icon="inline-start"
                aria-hidden
                className="animate-spin motion-reduce:animate-none"
              />
              Đang kiểm…
            </>
          ) : (
            <>
              Kiểm câu trả lời này
              <ArrowRight
                data-icon="inline-end"
                aria-hidden
                className="transition-transform group-hover/cta:translate-x-0.5 motion-reduce:transition-none"
              />
            </>
          )}
        </Button>
      )}

      {pending && (
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-primary/10 motion-reduce:hidden"
        >
          <span className="block h-full w-1/3 animate-indeterminate rounded-full bg-primary" />
        </span>
      )}
    </div>
  )
}

/** The audit of one answer, once it has landed: under the answer's card. */
function AuditResult({
  result,
  anchorPrefix,
  articles,
  status,
  handle,
}: {
  result: AuditedQuestion
  anchorPrefix: string
  articles: React.ComponentProps<typeof LiveAuditResult>["articles"]
  status: React.ComponentProps<typeof LiveAuditResult>["status"]
  handle: Handle
}) {
  return (
    <section
      aria-label="Kết quả kiểm câu trả lời"
      className="animate-in overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-foreground/10 duration-500 fade-in-0 slide-in-from-bottom-2 motion-reduce:animate-none"
    >
      <div className="flex items-center gap-2.5 bg-hero px-4 py-3 text-hero-foreground">
        <span
          aria-hidden
          className="grid size-7 shrink-0 place-items-center rounded-lg bg-hero-foreground font-heading text-base leading-none font-extrabold text-hero"
        >
          §
        </span>
        <h3 className="text-sm font-semibold">
          lexgate kiểm {result.cac_y.length} ý trong câu trả lời
        </h3>
      </div>
      <div className="bg-muted/50 p-3 sm:p-4">
        <LiveAuditResult
          result={result}
          articles={articles}
          status={status}
          handle={handle}
          anchorPrefix={anchorPrefix}
        />
      </div>
    </section>
  )
}
