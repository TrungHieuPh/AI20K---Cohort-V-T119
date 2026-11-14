"use client"

import { useId, useState } from "react"
import Link from "next/link"
import {
  ArrowRight,
  CircleCheck,
  FileJson,
  LoaderCircle,
  TriangleAlert,
  Upload,
} from "lucide-react"

import { PageHeader, PageShell } from "@/components/app/page-shell"
import {
  closeResults,
  formatLoadedAt,
  openResults,
  readResultsFile,
  sourceLabel,
  useResults,
} from "@/components/app/results-provider"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { VerdictBadge } from "@/components/verdict-badge"
import { formatScore } from "@/lib/format"
import { PAGE } from "@/lib/pages"
import { cn } from "@/lib/utils"
import { GATE_VERDICT } from "@/lib/verdicts"

const MAX_BYTES = 5 * 1024 * 1024

type State =
  | { kind: "idle" }
  | { kind: "reading"; name: string }
  | { kind: "error"; name: string; message: string }
  | { kind: "opened"; name: string }

/**
 * Opens a results.json written by `core.audit` in place of the demo run. The file is
 * read in the browser and kept in this tab only: nothing is uploaded anywhere.
 */
export function OpenResults() {
  const { run, source } = useResults()
  const [state, setState] = useState<State>({ kind: "idle" })
  const [dragging, setDragging] = useState(false)
  const inputId = useId()
  const hintId = useId()

  async function open(file: File | undefined) {
    if (!file) return
    if (file.size > MAX_BYTES) {
      setState({
        kind: "error",
        name: file.name,
        message: "Tệp lớn hơn 5 MB, không giống một tệp kết quả.",
      })
      return
    }
    setState({ kind: "reading", name: file.name })
    const result = await readResultsFile(file)
    if (!result.ok || result.text === undefined) {
      setState({
        kind: "error",
        name: file.name,
        message: result.ok ? "Không đọc được tệp này." : result.error,
      })
      return
    }
    openResults(file.name, result.text, result.run)
    setState({ kind: "opened", name: file.name })
  }

  const { summary } = run

  return (
    <PageShell>
      <PageHeader
        eyebrow={sourceLabel(source)}
        title={PAGE.open}
        description="Xem tệp kết quả (results.json) do lexgate ghi ra, thay cho lượt demo. Tệp chỉ được đọc trong trình duyệt này, không gửi đi đâu."
      />

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="flex flex-col gap-4 lg:col-span-7">
          <label
            htmlFor={inputId}
            onDragOver={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault()
              setDragging(false)
              void open(event.dataTransfer.files[0])
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed bg-card px-6 py-12 text-center transition-colors hover:bg-muted/40 has-focus-visible:ring-2 has-focus-visible:ring-ring",
              dragging && "border-foreground/40 bg-muted/60"
            )}
          >
            <span className="grid size-12 place-items-center rounded-full bg-muted ring-1 ring-border">
              <Upload aria-hidden className="size-5 text-muted-foreground" />
            </span>
            <span className="font-medium">Chọn tệp kết quả</span>
            <span
              id={hintId}
              className="max-w-sm text-sm text-pretty text-muted-foreground"
            >
              Bấm để chọn, hoặc kéo thả tệp results.json vào đây. Tối đa 5 MB.
            </span>
            <input
              id={inputId}
              type="file"
              accept=".json,application/json"
              aria-describedby={hintId}
              className="sr-only"
              onChange={(event) => {
                void open(event.target.files?.[0])
                // Choosing the same file again should read it again.
                event.target.value = ""
              }}
            />
          </label>

          <div aria-live="polite" className="flex flex-col gap-4">
            {state.kind === "reading" && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <LoaderCircle
                  aria-hidden
                  className="size-4 animate-spin motion-reduce:animate-none"
                />
                Đang đọc {state.name}…
              </p>
            )}
            {state.kind === "error" && (
              <Alert variant="destructive">
                <TriangleAlert aria-hidden />
                <AlertTitle>Không mở được {state.name}</AlertTitle>
                <AlertDescription>
                  {state.message} Lượt đang xem không đổi.
                </AlertDescription>
              </Alert>
            )}
            {state.kind === "opened" && source.kind === "file" && (
              <Alert>
                <CircleCheck aria-hidden />
                <AlertTitle>Đã mở {state.name}</AlertTitle>
                <AlertDescription>
                  Mọi màn hình kiểm định giờ hiển thị tệp này.
                  {!source.persisted &&
                    " Trình duyệt không cho lưu tạm, nên tải lại trang là tệp mất."}
                </AlertDescription>
              </Alert>
            )}
          </div>

          <Card size="sm">
            <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <FileJson
                  aria-hidden
                  className="mt-0.5 size-5 shrink-0 text-muted-foreground"
                />
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="text-sm text-muted-foreground">Đang xem</p>
                  <p className="font-medium break-all">
                    {source.kind === "demo"
                      ? "Lượt kiểm định demo"
                      : source.name}
                  </p>
                  <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <VerdictBadge verdict={GATE_VERDICT[summary.cong]} />
                    <span>
                      {summary.so_cau} câu · ý đúng{" "}
                      {formatScore(summary.faithfulness_tb)}
                      {source.kind === "file" &&
                        ` · mở lúc ${formatLoadedAt(source.loadedAt)}`}
                    </span>
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {source.kind === "file" && (
                  <Button variant="outline" onClick={closeResults}>
                    Quay về lượt demo
                  </Button>
                )}
                <Link href="/dashboard" className={cn(buttonVariants())}>
                  Xem kết quả tổng
                  <ArrowRight data-icon="inline-end" aria-hidden />
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle>Tạo tệp kết quả</CardTitle>
            <CardDescription>
              Chạy bộ kiểm định trên máy, rồi mở tệp nó ghi ra.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm">
            <pre className="rounded-lg bg-muted px-3 py-2.5 font-mono text-[0.8rem] leading-relaxed whitespace-pre-wrap">
              <code>
                python -m core.audit &lt;tệp.csv&gt; --out results.json
              </code>
            </pre>
            <p className="leading-relaxed text-muted-foreground">
              CSV gồm câu hỏi và câu trả lời của chatbot. Ví dụ với bộ câu mẫu:{" "}
              <code className="font-mono text-[0.8rem] text-foreground">
                data/demo/demo_samples.csv
              </code>
              .
            </p>
            <p className="leading-relaxed text-muted-foreground">
              Kiểm định cả bộ câu ngay trên web, không cần dòng lệnh, sẽ có ở
              giai đoạn sau. Tệp cũ chưa có nội dung câu hỏi vẫn mở được, chỉ
              hiện số câu.
            </p>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  )
}
