import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function FinalCta() {
  return (
    <section aria-labelledby="cta-title">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-8 px-4 py-20 sm:px-6 lg:flex-row lg:items-end lg:justify-between lg:py-24">
        <div data-reveal className="flex max-w-2xl flex-col gap-4">
          <h2
            id="cta-title"
            className="font-heading text-[1.9rem] leading-[1.18] font-bold tracking-tight text-balance sm:text-[2.4rem]"
          >
            Xem chatbot đã sai ở đâu, theo đúng từng Điều luật.
          </h2>
          <p className="text-[1.05rem] leading-relaxed text-pretty text-hero-muted sm:text-lg">
            Mỗi câu trả lời được tách thành từng ý, đặt cạnh Điều khoản và đoạn
            chứng cứ, để người duyệt quyết định có cho chatbot ra thị trường hay
            không.
          </p>
        </div>
        <div data-reveal className="flex flex-wrap gap-3">
          <Link
            href="/audit"
            className={cn(
              buttonVariants({ variant: "inverse", size: "xl" }),
              "font-semibold"
            )}
          >
            Mở kết quả kiểm định
            <ArrowRight data-icon="inline-end" aria-hidden />
          </Link>
          <Link
            href="/dashboard"
            className={cn(
              buttonVariants({ variant: "inverse-outline", size: "xl" }),
              "font-semibold"
            )}
          >
            Bảng tổng quan
          </Link>
        </div>
      </div>
    </section>
  )
}
