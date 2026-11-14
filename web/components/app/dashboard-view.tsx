"use client"

import Link from "next/link"
import { ArrowRight, FolderOpen } from "lucide-react"

import {
  PageHeader,
  PageShell,
  SectionLabel,
} from "@/components/app/page-shell"
import {
  closeResults,
  formatLoadedAt,
  sourceLabel,
  useResults,
} from "@/components/app/results-provider"
import { VerdictBreakdown } from "@/components/app/verdict-breakdown"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { VerdictBadge } from "@/components/verdict-badge"
import { DEMO_RUN } from "@/lib/demo"
import { formatScore, formatSeconds, formatUsd } from "@/lib/format"
import { PAGE } from "@/lib/pages"
import { questionText } from "@/lib/results"
import { cn } from "@/lib/utils"
import {
  CLAIM_LABEL,
  GATE_MEANING,
  GATE_RULES,
  GATE_VERDICT,
  QUESTION_VERDICT,
} from "@/lib/verdicts"

/** "2,2 giây" -> ["2,2", "giây"], so the unit can sit smaller than the figure. */
function splitUnit(text: string): [string, string] {
  const at = text.indexOf(" ")
  return at === -1 ? [text, ""] : [text.slice(0, at), text.slice(at + 1)]
}

/** Screen 1: the gate and totals of the active run (`tong_ket`). */
export function DashboardView({ lawSource }: { lawSource: string }) {
  const { run, source } = useResults()
  const { summary, questions } = run
  const gate = GATE_VERDICT[summary.cong]

  const breakdown = [
    { verdict: QUESTION_VERDICT.DUNG, value: summary.dung },
    { verdict: QUESTION_VERDICT.SAI, value: summary.sai },
    { verdict: QUESTION_VERDICT.KHONG_CAN_CU, value: summary.khong_can_cu },
    { verdict: QUESTION_VERDICT.LOI, value: summary.loi },
  ]

  // Brief's trade-off: quality against time and cost. Totals are summed from `cau`
  // because `tong_ket` does not carry them (docs/ui-dac-ta.md, screen 1).
  const stats = [
    {
      label: "Câu đã kiểm",
      value: String(summary.so_cau),
      note: `${summary.dung} Đúng, ${summary.sai + summary.khong_can_cu + summary.loi} cần xem`,
    },
    {
      label: "Tỉ lệ ý đúng trung bình",
      value: formatScore(summary.faithfulness_tb),
      note: "Phần ý có căn cứ trong luật, tính trên mỗi câu (faithfulness)",
    },
    {
      label: "Tổng thời gian",
      value: formatSeconds(run.totalLatencyMs),
      note: "Cả lượt, gồm tìm Điều luật và AI chấm",
    },
    {
      label: "Tổng chi phí",
      value: formatUsd(run.totalCostUsd),
      note: "Cả lượt, tiền gọi AI chấm",
    },
  ]

  const attention = questions
    .filter((q) => q.ket_luan !== "DUNG")
    .map((q) => ({ ...q, firstBad: q.cac_y.find((c) => c.nhan !== "DUNG") }))

  return (
    <PageShell>
      <PageHeader
        eyebrow={sourceLabel(source)}
        title={PAGE.dashboard}
        description={
          source.kind === "demo"
            ? "lexgate kiểm từng câu trả lời của chatbot với Bộ luật Lao động, rồi cho biết chatbot đã đủ tin cậy để đưa tới người dùng chưa. Đây là kết quả trên bộ câu mẫu do nhóm soạn."
            : "lexgate kiểm từng câu trả lời của chatbot với Bộ luật Lao động, rồi cho biết chatbot đã đủ tin cậy để đưa tới người dùng chưa. Đây là kết quả trong tệp bạn vừa mở."
        }
        actions={
          <>
            <Link
              href="/audit"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
            >
              Xem từng câu
            </Link>
            <Link
              href="/audit/open"
              className={cn(buttonVariants({ size: "lg" }))}
            >
              <FolderOpen data-icon="inline-start" aria-hidden />
              {PAGE.open}
            </Link>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle>Cổng kiểm định</CardTitle>
            <CardDescription>
              Xét lần lượt từ trên xuống, dòng đầu tiên đúng sẽ quyết định.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <VerdictBadge verdict={gate} size="lg" className="self-start" />
              <p className="leading-relaxed font-medium text-pretty">
                {GATE_MEANING[summary.cong]}
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Trong {summary.so_cau} câu đã kiểm: {summary.sai} câu Sai,{" "}
                {summary.khong_can_cu} câu Không căn cứ, {summary.loi} câu không
                kiểm được.
              </p>
            </div>
            <ol className="flex flex-col gap-1.5">
              {GATE_RULES.map((rule, i) => {
                const fired = rule.gate === summary.cong
                return (
                  <li
                    key={rule.gate}
                    aria-current={fired ? "step" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm",
                      fired
                        ? "bg-muted font-medium ring-1 ring-foreground/10"
                        : "text-muted-foreground"
                    )}
                  >
                    <span className="font-mono text-xs text-muted-foreground">
                      {i + 1}
                    </span>
                    <span className="flex-1">
                      {rule.when}
                      {fired && (
                        <span className="sr-only"> (quy tắc đã áp dụng)</span>
                      )}
                    </span>
                    <VerdictBadge verdict={GATE_VERDICT[rule.gate]} />
                  </li>
                )
              })}
            </ol>
          </CardContent>
        </Card>

        <Card className="lg:col-span-7">
          <CardHeader>
            <CardTitle>Kết luận theo câu</CardTitle>
            <CardDescription>
              {summary.so_cau} câu đã có kết quả.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <VerdictBreakdown items={breakdown} />
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="stats-title" className="flex flex-col gap-3">
        <SectionLabel id="stats-title">
          Chất lượng, thời gian, chi phí
        </SectionLabel>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {stats.map((s) => {
            const [figure, unit] = splitUnit(s.value)
            return (
              <Card key={s.label} size="sm">
                <CardContent>
                  <dl className="flex flex-col gap-1.5">
                    <dt className="text-sm text-muted-foreground">{s.label}</dt>
                    <dd className="flex flex-wrap items-baseline gap-x-1.5">
                      <span className="text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">
                        {figure}
                      </span>
                      {unit && (
                        <span className="text-sm text-muted-foreground">
                          {unit}
                        </span>
                      )}
                    </dd>
                    <dd className="text-xs leading-relaxed text-muted-foreground">
                      {s.note}
                    </dd>
                  </dl>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader>
            <CardTitle>Những câu chưa Đúng</CardTitle>
            <CardDescription>
              {attention.length
                ? "Mỗi câu kèm ý có vấn đề đầu tiên. Bấm vào để xem chi tiết."
                : "Mọi câu đều Đúng, không có câu nào cần xem."}
            </CardDescription>
          </CardHeader>
          {attention.length > 0 && (
            <CardContent className="px-0">
              <ul className="flex flex-col border-t">
                {attention.map((q) => (
                  <li key={q.id} className="border-b last:border-b-0">
                    <Link
                      href={`/audit/${q.id}`}
                      className="group flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-muted/60 focus-visible:bg-muted/60"
                    >
                      <div className="flex items-start gap-3">
                        <span className="pt-0.5 font-mono text-xs text-muted-foreground">
                          #{q.id}
                        </span>
                        <p
                          className={cn(
                            "flex-1 leading-snug text-pretty",
                            q.cau_hoi
                              ? "font-medium"
                              : "text-muted-foreground italic"
                          )}
                        >
                          {questionText(q)}
                        </p>
                        <ArrowRight
                          aria-hidden
                          className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                        />
                      </div>
                      <div className="flex flex-col gap-2 pl-7">
                        <div className="flex flex-wrap items-center gap-2">
                          <VerdictBadge
                            verdict={QUESTION_VERDICT[q.ket_luan]}
                          />
                          {q.firstBad && (
                            <span className="text-xs text-muted-foreground">
                              Ý{" "}
                              {CLAIM_LABEL[q.firstBad.nhan].label.toLowerCase()}
                              {q.firstBad.trich_dan
                                ? ` · ${q.firstBad.trich_dan}`
                                : " · không dẫn Điều nào"}
                            </span>
                          )}
                        </div>
                        {q.firstBad ? (
                          <p className="leading-relaxed font-medium text-pretty">
                            “{q.firstBad.noi_dung}”
                          </p>
                        ) : (
                          q.loi && (
                            <p className="text-sm text-muted-foreground">
                              {q.loi}
                            </p>
                          )
                        )}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          )}
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle>Về lượt chạy này</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {source.kind === "demo" ? (
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-sm">
                <dt className="text-muted-foreground">Câu hỏi</dt>
                <dd>{DEMO_RUN.questionSet}</dd>
                <dt className="text-muted-foreground">Tìm Điều luật</dt>
                <dd>{DEMO_RUN.retrieval}</dd>
                <dt className="text-muted-foreground">AI chấm</dt>
                <dd className="font-mono text-[0.8rem]">{DEMO_RUN.judge}</dd>
                <dt className="text-muted-foreground">Văn bản luật</dt>
                <dd>
                  <Link
                    href="/law"
                    className="underline-offset-4 hover:underline"
                  >
                    {lawSource}
                  </Link>
                </dd>
              </dl>
            ) : (
              <>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-sm">
                  <dt className="text-muted-foreground">Tệp</dt>
                  <dd className="font-mono text-[0.8rem] break-all">
                    {source.name}
                  </dd>
                  <dt className="text-muted-foreground">Mở lúc</dt>
                  <dd className="tabular-nums">
                    {formatLoadedAt(source.loadedAt)}
                  </dd>
                  <dt className="text-muted-foreground">Văn bản luật</dt>
                  <dd>
                    <Link
                      href="/law"
                      className="underline-offset-4 hover:underline"
                    >
                      {lawSource}
                    </Link>
                  </dd>
                </dl>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Tệp chỉ nằm trong trình duyệt này, không gửi đi đâu.
                  {source.persisted
                    ? " Đóng tab là mất."
                    : " Trình duyệt không cho lưu tạm, nên tải lại trang là mất."}
                </p>
                <Button
                  variant="outline"
                  className="self-start"
                  onClick={closeResults}
                >
                  Quay về lượt demo
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  )
}
