import type { Metadata } from "next"
import {
  CircleAlert,
  CircleCheck,
  CircleMinus,
  CircleX,
  Clock,
  Info,
} from "lucide-react"

import {
  PageHeader,
  PageShell,
  SectionLabel,
} from "@/components/app/page-shell"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { VerdictBadge } from "@/components/verdict-badge"
import { getScore } from "@/lib/data"
import { formatPercent, formatScore, formatUsd } from "@/lib/format"
import { PAGE } from "@/lib/pages"
import type { QuestionVerdict, ScoreMetric, ScoreRow } from "@/lib/types"
import { cn } from "@/lib/utils"
import { QUESTION_VERDICT } from "@/lib/verdicts"

export const metadata: Metadata = { title: PAGE.quality }

const ERROR_KIND: Record<string, string> = {
  sai_con_so: "Sai con số",
  luat_cu: "Luật cũ",
  bia_quyen_loi: "Bịa quyền lợi",
  trich_sai_dieu: "Trích sai Điều",
  dung_mot_nua: "Đúng một nửa",
}

type Tone = "good" | "bad" | "muted" | "error"

const OUTCOME: Record<ScoreRow["ket_qua"], { label: string; tone: Tone }> = {
  bat_duoc: { label: "Bắt được", tone: "good" },
  dung: { label: "Đúng", tone: "good" },
  bo_sot: { label: "Bỏ sót", tone: "bad" },
  bao_nham: { label: "Báo nhầm", tone: "bad" },
  loi: { label: "Lỗi", tone: "error" },
}

const TONE_ICON = {
  good: { Icon: CircleCheck, className: "text-verdict-correct" },
  bad: { Icon: CircleX, className: "text-verdict-wrong" },
  muted: { Icon: CircleMinus, className: "text-muted-foreground" },
  error: { Icon: CircleAlert, className: "text-verdict-error" },
}

/** Icon plus words: the colour only repeats what the text says. */
function Status({
  tone,
  label,
  icon,
}: {
  tone: Tone
  label: string
  icon?: typeof Clock
}) {
  const { Icon, className } = TONE_ICON[tone]
  const Shown = icon ?? Icon
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium">
      <Shown aria-hidden className={cn("size-4 shrink-0", className)} />
      {label}
    </span>
  )
}

function metricStatus(metric: ScoreMetric) {
  if (metric.dat_muc_tieu === null)
    return <Status tone="muted" label="Không áp dụng" />
  return metric.dat_muc_tieu ? (
    <Status tone="good" label="Đạt" />
  ) : (
    <Status tone="bad" label="Chưa đạt" />
  )
}

function verdictOf(value: string) {
  return QUESTION_VERDICT[value as QuestionVerdict]
}

function yesNo(value: boolean | null) {
  if (value === null) return <span className="text-muted-foreground">–</span>
  return value ? "Có" : "Không"
}

/** Screen 4: how well the audit itself scores against the dev set's answer key. */
export default async function QualityPage() {
  const score = await getScore()

  const tiles: {
    label: string
    figure: string
    detail: string
    target: string
    status: React.ReactNode
  }[] = [
    {
      label: "Bắt được câu sai",
      figure:
        score.bat_duoc.ti_le === null
          ? "—"
          : formatPercent(score.bat_duoc.ti_le),
      detail: `${score.bat_duoc.dat}/${score.bat_duoc.tong} câu cài sai bị chặn`,
      target: `Mục tiêu ≥ ${formatPercent(score.bat_duoc.muc_tieu)}`,
      status: metricStatus(score.bat_duoc),
    },
    {
      label: "Báo nhầm câu đúng",
      figure:
        score.bao_nham.ti_le === null
          ? "—"
          : formatPercent(score.bao_nham.ti_le),
      detail: `${score.bao_nham.dat}/${score.bao_nham.tong} câu đúng bị chặn nhầm`,
      target: `Mục tiêu ≤ ${formatPercent(score.bao_nham.muc_tieu)}`,
      status: metricStatus(score.bao_nham),
    },
    {
      label: "Trích đúng Điều",
      figure:
        score.trich_dung_dieu.ti_le === null
          ? "—"
          : formatPercent(score.trich_dung_dieu.ti_le),
      detail: `${score.trich_dung_dieu.dat}/${score.trich_dung_dieu.tong} câu sai chỉ ra đúng Điều`,
      target: `Mục tiêu ${formatPercent(score.trich_dung_dieu.muc_tieu)}`,
      status: metricStatus(score.trich_dung_dieu),
    },
    {
      label: "Tìm đúng Điều luật",
      figure:
        score.truy_hoi_dung.ti_le === null
          ? "—"
          : formatPercent(score.truy_hoi_dung.ti_le),
      detail: `${score.truy_hoi_dung.dat}/${score.truy_hoi_dung.tong} câu có Điều đúng trong 5 Điều tìm được`,
      target: `Mục tiêu ≥ ${formatPercent(score.truy_hoi_dung.muc_tieu)}`,
      status: metricStatus(score.truy_hoi_dung),
    },
    score.on_dinh
      ? {
          label: "Ổn định 2 lần chạy",
          figure:
            score.on_dinh.ti_le === null
              ? "—"
              : formatPercent(score.on_dinh.ti_le),
          detail: score.on_dinh.khac_nhau.length
            ? `${score.on_dinh.dat}/${score.on_dinh.tong} câu cùng kết luận; khác ở câu ${score.on_dinh.khac_nhau.join(", ")}`
            : `${score.on_dinh.dat}/${score.on_dinh.tong} câu cùng kết luận ở cả 2 lần`,
          target: `Mục tiêu ≥ ${formatPercent(score.on_dinh.muc_tieu)}`,
          status: metricStatus(score.on_dinh),
        }
      : {
          label: "Ổn định 2 lần chạy",
          figure: "—",
          detail: "Cần chạy lại cùng bộ câu lần thứ hai để so kết luận.",
          target: "Mục tiêu ≥ 95%",
          status: <Status tone="muted" icon={Clock} label="Chưa chạy lần 2" />,
        },
    {
      label: "Thời gian cho 20 câu",
      figure: `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(score.thoi_gian.quy_ve_20_cau_s)} s`,
      detail: `Thực đo ${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(score.thoi_gian.tong_s)} s cho ${score.so_cau} câu`,
      target: `Mục tiêu ≤ ${score.thoi_gian.muc_tieu_s} s`,
      status: score.thoi_gian.dat_muc_tieu ? (
        <Status tone="good" label="Đạt" />
      ) : (
        <Status tone="bad" label="Chưa đạt" />
      ),
    },
  ]

  const kinds = Object.entries(score.theo_loai_loi)

  return (
    <PageShell>
      <PageHeader
        eyebrow={`Bộ dev ${score.so_cau} câu đã biết đáp án`}
        title={PAGE.quality}
        description="lexgate tự chấm chính nó: chạy trên những câu đã biết đáp án, rồi so kết luận với đáp án. Con số này cho biết có nên tin cổng kiểm định hay không."
      />

      <Alert role="note">
        <Info aria-hidden />
        <AlertTitle>Đọc số liệu này thế nào</AlertTitle>
        <AlertDescription>
          Bộ dev do AI soạn (đã đối chiếu nguyên văn Bộ luật) nên dễ hơn câu hỏi
          thật. Số cuối cùng sẽ lấy từ bộ test kín 20 câu, chạy mù 2 lần. Tỉ lệ
          ý đúng (faithfulness) ở đây tính từ nhãn của chính bộ kiểm, chưa dùng
          thư viện Ragas.
        </AlertDescription>
      </Alert>

      <section aria-labelledby="targets-title" className="flex flex-col gap-3">
        <SectionLabel id="targets-title">So với mục tiêu MVP</SectionLabel>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((t) => (
            <li key={t.label}>
              <Card size="sm" className="h-full">
                <CardContent className="flex h-full flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-sm text-muted-foreground">{t.label}</h3>
                    {t.status}
                  </div>
                  <p className="text-3xl font-semibold tracking-tight tabular-nums">
                    {t.figure}
                  </p>
                  <div className="mt-auto flex flex-col gap-0.5 text-xs leading-relaxed text-muted-foreground">
                    <span>{t.detail}</span>
                    <span className="font-medium text-foreground">
                      {t.target}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader>
            <CardTitle>Theo loại lỗi</CardTitle>
            <CardDescription>
              Mỗi câu cài sai thuộc một loại lỗi chatbot hay mắc.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <ul className="flex flex-col border-t">
              {kinds.map(([kind, { dat, tong }]) => (
                <li
                  key={kind}
                  className="flex items-center justify-between gap-4 border-b px-4 py-3 last:border-b-0"
                >
                  <span className="font-medium">
                    {ERROR_KIND[kind] ?? kind}
                  </span>
                  <span className="flex items-center gap-4">
                    <span className="font-mono text-sm tabular-nums">
                      {dat}/{tong}
                    </span>
                    {dat === tong ? (
                      <Status tone="good" label="Bắt hết" />
                    ) : (
                      <Status tone="bad" label={`Bỏ sót ${tong - dat}`} />
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle>Chi phí và lỗi</CardTitle>
            <CardDescription>Cả lượt chạy {score.so_cau} câu.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-3 text-sm">
              <dt className="text-muted-foreground">Chi phí</dt>
              <dd className="text-right font-semibold tabular-nums">
                {formatUsd(score.chi_phi_usd)}
              </dd>
              <dt className="text-muted-foreground">Tỉ lệ ý đúng trung bình</dt>
              <dd className="text-right font-semibold tabular-nums">
                {formatScore(score.faithfulness_tb)}
              </dd>
              <dt className="text-muted-foreground">
                Câu cài sai không kiểm được
              </dt>
              <dd className="text-right font-semibold tabular-nums">
                {score.loi.cau_sai}
              </dd>
              <dt className="text-muted-foreground">
                Câu đúng không kiểm được
              </dt>
              <dd className="text-right font-semibold tabular-nums">
                {score.loi.cau_dung}
              </dd>
            </dl>
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="detail-title" className="flex flex-col gap-3">
        <SectionLabel id="detail-title">
          Từng câu ({score.chi_tiet.length} câu)
        </SectionLabel>
        <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-12 pl-4">#</TableHead>
                <TableHead>
                  Đáp án
                  <span className="sm:hidden"> → lexgate</span>
                </TableHead>
                <TableHead className="hidden md:table-cell">Loại lỗi</TableHead>
                <TableHead className="hidden sm:table-cell">
                  lexgate kết luận
                </TableHead>
                <TableHead>Kết quả</TableHead>
                <TableHead className="hidden lg:table-cell">
                  Trích đúng Điều
                </TableHead>
                <TableHead className="hidden pr-4 lg:table-cell">
                  Tìm đúng Điều
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {score.chi_tiet.map((row) => {
                const truth = verdictOf(row.nhan_that)
                const outcome = OUTCOME[row.ket_qua]
                return (
                  <TableRow key={row.id}>
                    <TableCell className="pl-4 font-mono text-xs text-muted-foreground">
                      {row.id}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        {truth ? (
                          <VerdictBadge verdict={truth} />
                        ) : (
                          row.nhan_that
                        )}
                        {/* Narrow screens drop the Kết luận column: show it here. */}
                        <span className="flex items-center gap-1 text-xs text-muted-foreground sm:hidden">
                          ra
                          <VerdictBadge
                            verdict={QUESTION_VERDICT[row.ket_luan]}
                          />
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {row.loai_loi ? (
                        (ERROR_KIND[row.loai_loi] ?? row.loai_loi)
                      ) : (
                        <span className="text-muted-foreground">–</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <VerdictBadge verdict={QUESTION_VERDICT[row.ket_luan]} />
                    </TableCell>
                    <TableCell>
                      {outcome ? (
                        <Status tone={outcome.tone} label={outcome.label} />
                      ) : (
                        row.ket_qua
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {yesNo(row.trich_dung_dieu)}
                    </TableCell>
                    <TableCell className="hidden pr-4 lg:table-cell">
                      {yesNo(row.truy_hoi_dung)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Kết quả: câu cài sai bị chặn là Bắt được, lọt qua là Bỏ sót; câu đúng
          được cho qua là Đúng, bị chặn là Báo nhầm. Câu cài sai ra Sai hoặc
          Không căn cứ đều tính là bắt được.
        </p>
      </section>
    </PageShell>
  )
}
