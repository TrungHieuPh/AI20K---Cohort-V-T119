import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { Logo } from "@/components/logo"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const SECTIONS = [
  { href: "#walkthrough", label: "Thao tác" },
  { href: "#problem", label: "Vấn đề" },
  { href: "#how-it-works", label: "Cách hoạt động" },
  { href: "#demo", label: "Kết quả demo" },
]

export function LandingHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-hero-border bg-hero/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-10 px-4 sm:px-6">
        <Logo tone="dark" />
        <nav
          aria-label="Các phần của trang"
          className="hidden items-center gap-7 text-sm font-medium md:flex"
        >
          {SECTIONS.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              className="rounded-sm text-hero-muted transition-colors hover:text-hero-foreground"
            >
              {label}
            </a>
          ))}
        </nav>
        <Link
          href="/dashboard"
          className={cn(
            buttonVariants({ variant: "inverse" }),
            "ml-auto font-semibold"
          )}
        >
          Vào ứng dụng
          <ArrowRight data-icon="inline-end" aria-hidden />
        </Link>
      </div>
    </header>
  )
}
