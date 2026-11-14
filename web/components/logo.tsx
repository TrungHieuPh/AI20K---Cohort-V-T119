import Link from "next/link"

import { cn } from "@/lib/utils"

/** The section sign (§) marks lexgate as a legal tool; the square is the gate. */
export function Logo({
  tone = "light",
  className,
}: {
  tone?: "light" | "dark"
  className?: string
}) {
  return (
    <Link
      href="/"
      aria-label="lexgate, về trang giới thiệu"
      className={cn("inline-flex items-center gap-2.5 rounded-md", className)}
    >
      <span
        aria-hidden
        className={cn(
          "grid size-7 place-items-center rounded-md font-heading text-lg leading-none font-extrabold",
          tone === "dark"
            ? "bg-hero-foreground text-hero"
            : "bg-primary text-primary-foreground"
        )}
      >
        §
      </span>
      <span
        className={cn(
          "font-heading text-lg font-extrabold tracking-tight",
          tone === "dark" ? "text-hero-foreground" : "text-foreground"
        )}
      >
        lexgate
      </span>
    </Link>
  )
}
