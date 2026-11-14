"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowRight, SearchX, TriangleAlert } from "lucide-react"

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { VerdictBadge } from "@/components/verdict-badge"
import { formatScore } from "@/lib/format"
import { isFlagged, questionText } from "@/lib/results"
import type { AuditedQuestion, QuestionVerdict } from "@/lib/types"
import { cn } from "@/lib/utils"
import { QUESTION_VERDICT } from "@/lib/verdicts"

type Filter = "ALL" | QuestionVerdict

const VERDICT_ORDER: QuestionVerdict[] = ["DUNG", "SAI", "KHONG_CAN_CU", "LOI"]

interface Row {
  id: string
  question: string
  /** false when the file predates `cau_hoi`: the text is the placeholder. */
  hasQuestion: boolean
  verdict: QuestionVerdict
  claims: number
  /** Claims labelled Trái luật or Không căn cứ. */
  badClaims: number
  faithfulness: number | null
  /** What the warning flag says, or null when no claim is flagged. */
  flag: string | null
}

/** Names the warnings on a question's claims, for the "Cờ" column. */
function flagOf(q: AuditedQuestion): string | null {
  const flagged = q.cac_y.filter(isFlagged)
  if (!flagged.length) return null
  const kinds = []
  if (flagged.some((c) => c.bang_chung_khop === false)) kinds.push("bằng chứng")
  if (flagged.some((c) => c.ha_nhan)) kinds.push("hạ nhãn")
  return kinds.join(", ")
}

function toRow(q: AuditedQuestion): Row {
  return {
    id: String(q.id),
    question: questionText(q),
    hasQuestion: Boolean(q.cau_hoi),
    verdict: q.ket_luan,
    claims: q.cac_y.length,
    badClaims: q.cac_y.filter((c) => c.nhan !== "DUNG").length,
    faithfulness: q.faithfulness,
    flag: flagOf(q),
  }
}

/** Long words of the flag, for screen readers and the tooltip. */
function flagTitle(flag: string) {
  return `Cảnh báo: ${flag
    .replace("bằng chứng", "bằng chứng không khớp nguyên văn luật")
    .replace("hạ nhãn", "hệ thống hạ nhãn")}`
}

function Flag({ flag }: { flag: string | null }) {
  if (!flag) return <span className="sr-only">Không có cảnh báo</span>
  return (
    <span
      title={flagTitle(flag)}
      className="inline-flex items-center gap-1 text-xs font-medium"
    >
      <TriangleAlert
        aria-hidden
        className="size-3.5 shrink-0 text-verdict-ungrounded"
      />
      <span aria-hidden>{flag}</span>
      <span className="sr-only">{flagTitle(flag)}</span>
    </span>
  )
}

export function AuditTable({ questions }: { questions: AuditedQuestion[] }) {
  const [filter, setFilter] = useState<Filter>("ALL")
  const rows = questions.map(toRow)

  const options: { value: Filter; label: string; count: number }[] = [
    { value: "ALL", label: "Tất cả", count: rows.length },
    ...VERDICT_ORDER.map((v) => ({
      value: v,
      label: QUESTION_VERDICT[v].label,
      count: rows.filter((r) => r.verdict === v).length,
    })),
  ]

  // A filter whose verdict vanished (another file was opened) falls back to all.
  const active =
    options.find((o) => o.value === filter && o.count > 0) ?? options[0]
  const shown =
    active.value === "ALL"
      ? rows
      : rows.filter((r) => r.verdict === active.value)

  return (
    <div className="flex flex-col gap-4">
      <ToggleGroup
        aria-label="Lọc theo kết luận"
        variant="outline"
        size="sm"
        value={[active.value]}
        // A single-choice group: clicking the pressed item again keeps it pressed.
        onValueChange={(value) => value[0] && setFilter(value[0] as Filter)}
        className="flex-wrap"
      >
        {options.map((o) => (
          <ToggleGroupItem
            key={o.value}
            value={o.value}
            disabled={o.count === 0}
          >
            {o.label}
            <span className="font-mono text-[0.7rem] text-muted-foreground tabular-nums">
              {o.count}
            </span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <p className="sr-only" aria-live="polite">
        {active.label}: {shown.length} câu
      </p>

      {shown.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchX aria-hidden />
            </EmptyMedia>
            <EmptyTitle>Không có câu nào</EmptyTitle>
            <EmptyDescription>Lượt chạy này chưa có câu nào.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          {/* Phones: one card per question. */}
          <ul className="flex flex-col gap-3 md:hidden">
            {shown.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/audit/${r.id}`}
                  className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-colors hover:bg-muted/60"
                >
                  <div className="flex items-start gap-3">
                    <span className="pt-0.5 font-mono text-xs text-muted-foreground">
                      #{r.id}
                    </span>
                    <p
                      className={cn(
                        "flex-1 leading-snug text-pretty",
                        r.hasQuestion
                          ? "font-medium"
                          : "text-muted-foreground italic"
                      )}
                    >
                      {r.question}
                    </p>
                    <ArrowRight
                      aria-hidden
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pl-7">
                    <VerdictBadge verdict={QUESTION_VERDICT[r.verdict]} />
                    <span className="font-mono text-xs text-muted-foreground">
                      {r.claims} ý · faithfulness {formatScore(r.faithfulness)}
                    </span>
                    {r.flag && <Flag flag={r.flag} />}
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {/* Tablets and up: the table. The question cell's link covers the whole row. */}
          <div className="hidden overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-12 pl-4">#</TableHead>
                  <TableHead>Câu hỏi</TableHead>
                  <TableHead>Kết luận</TableHead>
                  <TableHead className="text-right">Số ý</TableHead>
                  <TableHead className="text-right">Faithfulness</TableHead>
                  <TableHead>Cờ</TableHead>
                  <TableHead className="w-10 pr-4">
                    <span className="sr-only">Mở</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((r) => (
                  <TableRow
                    key={r.id}
                    className="group relative has-[a:focus-visible]:bg-muted/60"
                  >
                    <TableCell className="pl-4 font-mono text-xs text-muted-foreground">
                      {r.id}
                    </TableCell>
                    <TableCell className="max-w-md whitespace-normal">
                      <Link
                        href={`/audit/${r.id}`}
                        className={cn(
                          "text-pretty outline-none after:absolute after:inset-0 focus-visible:underline",
                          r.hasQuestion
                            ? "font-medium"
                            : "text-muted-foreground italic"
                        )}
                      >
                        {r.question}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <VerdictBadge verdict={QUESTION_VERDICT[r.verdict]} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.claims}
                      {r.badClaims > 0 && (
                        <span className="block text-xs text-muted-foreground">
                          {r.badClaims} chưa đúng
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatScore(r.faithfulness)}
                    </TableCell>
                    <TableCell>
                      <Flag flag={r.flag} />
                    </TableCell>
                    <TableCell className="pr-4">
                      <ArrowRight
                        aria-hidden
                        className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  )
}
