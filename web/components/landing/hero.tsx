import Link from "next/link"
import { ArrowRight, Play } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import type { LawInfo } from "@/lib/data"
import { cn } from "@/lib/utils"
import { formatClock, WALKTHROUGH } from "@/lib/walkthrough"

/**
 * The page grid shows through: the hero has no background of its own. The proof card
 * is taller than a screen, so the copy is top-aligned and sticks beside it while the
 * card scrolls past; centred, it would push the headline and buttons below the fold.
 */
export function Hero({
  law,
  children,
}: {
  law: LawInfo
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="mx-auto grid w-full max-w-6xl gap-14 px-4 pt-14 pb-20 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:items-start lg:gap-14 lg:pt-20 lg:pb-24">
        <div className="flex animate-in flex-col items-start gap-7 duration-700 fade-in slide-in-from-bottom-3 motion-reduce:animate-none lg:sticky lg:top-24">
          <p className="inline-flex items-center gap-2.5 rounded-full border border-hero-border bg-hero-raised py-1 pr-4 pl-1 text-sm font-semibold">
            <span className="shrink-0 rounded-full bg-hero-accent px-2.5 py-0.5 text-xs font-extrabold tracking-wide whitespace-nowrap text-hero">
              AIP-04
            </span>
            Cổng kiểm định cho chatbot pháp lý
          </p>

          <h1 className="font-heading text-[2.4rem] leading-[1.14] font-extrabold tracking-tight text-balance sm:text-5xl sm:leading-[1.12] lg:text-[3.35rem]">
            Kiểm định chatbot pháp lý{" "}
            <span className="whitespace-nowrap text-hero-accent">
              trước khi
            </span>{" "}
            ra thị trường.
          </h1>

          <p className="max-w-xl text-[1.05rem] leading-relaxed text-pretty text-hero-muted sm:text-lg">
            lexgate tách câu trả lời của chatbot thành từng ý, tìm đúng Điều
            khoản trong Bộ luật Lao động và chấm từng ý là Đúng, Trái luật hay
            Không có căn cứ. Câu sai luật bị chặn lại, kèm trích dẫn để người
            duyệt kiểm tra.
          </p>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/audit"
              className={cn(
                buttonVariants({ variant: "inverse", size: "xl" }),
                "font-semibold"
              )}
            >
              Xem kết quả kiểm định
              <ArrowRight data-icon="inline-end" aria-hidden />
            </Link>
            <a
              href="#walkthrough"
              className={cn(
                buttonVariants({ variant: "inverse-outline", size: "xl" }),
                "font-semibold"
              )}
            >
              <Play data-icon="inline-start" aria-hidden />
              Xem thao tác
              <span className="text-sm font-medium text-hero-muted tabular-nums">
                {formatClock(WALKTHROUGH.duration)}
              </span>
            </a>
          </div>

          <dl className="flex w-full max-w-xl flex-wrap items-baseline gap-x-3 gap-y-1 border-hero-border pt-6 text-sm">
            <dt className="text-xs font-bold tracking-[0.08em] text-hero-muted uppercase">
              Văn bản
            </dt>
            <dd>
              <span className="font-semibold">{law.articles} Điều</span>
              <span className="text-hero-muted"> · {law.source}</span>
            </dd>
          </dl>
        </div>

        <div className="animate-in delay-150 duration-700 fill-mode-backwards fade-in slide-in-from-bottom-4 motion-reduce:animate-none">
          {children}
        </div>
      </div>
    </section>
  )
}
