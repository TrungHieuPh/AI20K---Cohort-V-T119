import { Logo } from "@/components/logo"

export function LandingFooter({ lawSource }: { lawSource: string }) {
  return (
    <footer className="border-hero-border">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 text-sm sm:px-6 md:flex-row md:items-start md:justify-between">
        <div className="flex max-w-md flex-col gap-3">
          <Logo tone="dark" />
          <p className="leading-relaxed text-hero-muted">
            Zero One Team · Đề tài AIP-04: AI Agent RAG Platform tự đánh giá và
            tối ưu chất lượng truy hồi.
          </p>
        </div>
        <dl className="flex flex-col gap-3 text-hero-muted md:max-w-sm md:text-right">
          <div>
            <dt className="text-xs font-bold tracking-[0.08em] uppercase">
              Dữ liệu luật
            </dt>
            <dd className="mt-1 text-hero-foreground">{lawSource}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold tracking-[0.08em] uppercase">
              Kết quả demo
            </dt>
            <dd className="mt-1 text-hero-foreground">
              Câu mẫu do nhóm soạn, không phải bộ test kín.
            </dd>
          </div>
        </dl>
      </div>
    </footer>
  )
}
