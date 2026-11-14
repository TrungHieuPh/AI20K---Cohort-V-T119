import Link from "next/link"
import { ArrowRight, Play } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import type { LawInfo } from "@/lib/data"
import { cn } from "@/lib/utils"
import { formatClock, WALKTHROUGH } from "@/lib/walkthrough"

export function Hero({
  law,
  children,
}: {
  law: LawInfo
  children: React.ReactNode
}) {
  // Stack as recorded in mock_results.json's _ghi_chu.
  const facts = [
    { term: "Văn bản", value: `${law.articles} Điều · Bộ luật Lao động` },
    { term: "Truy hồi", value: "bge-m3 + Qdrant" },
    { term: "Judge", value: "gpt-4.1-mini" },
  ]

  return (
    <section className="relative isolate overflow-hidden">
      <div aria-hidden className="absolute inset-0 -z-10 bg-grid" />
      <div
        aria-hidden
        className="absolute -top-48 right-[-15%] -z-10 size-[44rem] rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklch,var(--primary)_70%,transparent),transparent)]"
      />

      <div className="mx-auto grid w-full max-w-6xl gap-14 px-4 pt-14 pb-20 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-14 lg:pt-20 lg:pb-24">
        <div className="flex animate-in flex-col items-start gap-7 duration-700 fade-in slide-in-from-bottom-3 motion-reduce:animate-none">
          <p className="inline-flex items-center gap-2 rounded-full border border-hero-border bg-hero-raised/70 px-3 py-1 font-mono text-xs text-hero-accent">
            <span
              aria-hidden
              className="size-1.5 rounded-full bg-hero-accent"
            />
            AIP-04 · Cổng kiểm định cho chatbot pháp lý
          </p>

          <h1 className="font-heading text-[2.4rem] leading-[1.14] font-extrabold tracking-tight text-balance sm:text-5xl sm:leading-[1.12] lg:text-[3.35rem]">
            Kiểm định chatbot pháp lý{" "}
            <span className="text-hero-accent">trước khi</span> ra thị trường.
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
              <span className="font-mono text-xs font-normal text-hero-muted">
                {formatClock(WALKTHROUGH.duration)}
              </span>
            </a>
          </div>

          <dl className="grid w-full max-w-xl grid-cols-1 gap-4 border-t border-hero-border pt-6 sm:grid-cols-3 sm:gap-6">
            {facts.map(({ term, value }) => (
              <div key={term} className="flex flex-col gap-1">
                <dt className="font-mono text-[0.7rem] tracking-[0.12em] text-hero-muted uppercase">
                  {term}
                </dt>
                <dd className="text-sm font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="animate-in delay-150 duration-700 fill-mode-backwards fade-in slide-in-from-bottom-4 motion-reduce:animate-none">
          {children}
        </div>
      </div>
    </section>
  )
}
