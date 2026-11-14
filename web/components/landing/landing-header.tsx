"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowRight, Menu, MessagesSquare, X } from "lucide-react"

import { Logo } from "@/components/logo"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

const SECTIONS = [
  { id: "walkthrough", label: "Thao tác" },
  { id: "problem", label: "Vấn đề" },
  { id: "how-it-works", label: "Cách hoạt động" },
  { id: "demo", label: "Kết quả demo" },
]
const SECTION_IDS = SECTIONS.map((s) => s.id)

/**
 * Clear over the page grid at the top; once the page scrolls, a blurred navy band
 * with a hairline. The link of the section being read is lit. On phones the
 * sections open in a sheet.
 */
export function LandingHeader() {
  const scrolled = useScrolled()
  const active = useActiveSection(SECTION_IDS)

  return (
    <header
      data-scrolled={scrolled || undefined}
      className="sticky top-0 z-40 border-b border-transparent transition-[background-color,border-color] duration-200 data-scrolled:border-hero-border data-scrolled:bg-hero/80 data-scrolled:backdrop-blur-md"
    >
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-4 sm:px-6 md:gap-8">
        <Logo tone="dark" />
        <nav
          aria-label="Các phần của trang"
          className="hidden items-center gap-1 md:flex"
        >
          {SECTIONS.map(({ id, label }) => (
            <a
              key={id}
              href={`#${id}`}
              aria-current={active === id ? "true" : undefined}
              className="relative rounded-md px-3 py-2 text-sm font-semibold text-hero-muted transition-colors after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:origin-left after:scale-x-0 after:rounded-full after:bg-hero-accent after:transition-transform hover:text-hero-foreground aria-[current=true]:text-hero-foreground aria-[current=true]:after:scale-x-100 motion-reduce:after:transition-none"
            >
              {label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/chat"
            className={cn(
              buttonVariants({ variant: "inverse", size: "lg" }),
              "group/cta animate-gleam px-3.5 font-semibold"
            )}
          >
            <MessagesSquare data-icon="inline-start" aria-hidden />
            Hỏi lexgate
            {/* Phones need the room for the menu button. */}
            <ArrowRight
              data-icon="inline-end"
              aria-hidden
              className="transition-transform duration-200 group-hover/cta:translate-x-0.5 motion-reduce:transition-none max-sm:hidden"
            />
          </Link>
          <SectionsSheet active={active} />
        </div>
      </div>
    </header>
  )
}

/** Phones only: the four sections, large enough to tap, and the way into the chat. */
function SectionsSheet({ active }: { active: string | null }) {
  const [open, setOpen] = useState(false)
  // Jump after the sheet has closed: while it is open the page cannot scroll.
  const pending = useRef<string | null>(null)

  function jumpTo(id: string) {
    pending.current = id
    setOpen(false)
  }

  function afterClose(isOpen: boolean) {
    const id = pending.current
    if (isOpen || !id) return
    pending.current = null
    requestAnimationFrame(() => {
      if (window.location.hash === `#${id}`) {
        document.getElementById(id)?.scrollIntoView()
      } else {
        window.location.hash = id
      }
    })
  }

  return (
    <Sheet open={open} onOpenChange={setOpen} onOpenChangeComplete={afterClose}>
      <SheetTrigger
        render={
          <Button
            variant="inverse-outline"
            size="icon-lg"
            className="md:hidden"
          />
        }
      >
        <Menu aria-hidden />
        <span className="sr-only">Mở danh sách các phần</span>
      </SheetTrigger>
      <SheetContent
        showCloseButton={false}
        className="gap-0 border-hero-border bg-hero text-hero-foreground [--ring:var(--hero-accent)]"
      >
        <div className="flex h-16 items-center justify-between border-b border-hero-border px-4">
          <SheetTitle className="font-sans text-xs font-bold tracking-[0.08em] text-hero-muted uppercase">
            Các phần của trang
          </SheetTitle>
          <SheetClose
            render={<Button variant="inverse-outline" size="icon-lg" />}
          >
            <X aria-hidden />
            <span className="sr-only">Đóng</span>
          </SheetClose>
        </div>
        <nav aria-label="Các phần của trang" className="flex flex-col px-4">
          {SECTIONS.map(({ id, label }) => (
            <a
              key={id}
              href={`#${id}`}
              aria-current={active === id ? "true" : undefined}
              onClick={(event) => {
                event.preventDefault()
                jumpTo(id)
              }}
              className="flex items-center justify-between border-b border-hero-border py-4 font-heading text-xl font-bold text-hero-muted transition-colors hover:text-hero-foreground aria-[current=true]:text-hero-foreground"
            >
              {label}
              {active === id && (
                <span
                  aria-hidden
                  className="size-2 rounded-full bg-hero-accent"
                />
              )}
            </a>
          ))}
        </nav>
        <SheetFooter className="p-4">
          <Link
            href="/chat"
            className={cn(
              buttonVariants({ variant: "inverse", size: "xl" }),
              "w-full font-semibold"
            )}
          >
            <MessagesSquare data-icon="inline-start" aria-hidden />
            Hỏi lexgate
            <ArrowRight data-icon="inline-end" aria-hidden />
          </Link>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

/** True once the page has left the top. */
function useScrolled() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 4)
    update()
    window.addEventListener("scroll", update, { passive: true })
    return () => window.removeEventListener("scroll", update)
  }, [])
  return scrolled
}

/**
 * The section crossing a thin band just above the middle of the viewport. The
 * sections are stacked, so at most one crosses it; above the first (the hero) and
 * below the last (the closing call) none does.
 */
function useActiveSection(ids: string[]) {
  const [active, setActive] = useState<string | null>(null)
  useEffect(() => {
    const crossing = new Map<string, boolean>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          crossing.set(entry.target.id, entry.isIntersecting)
        }
        setActive(ids.find((id) => crossing.get(id)) ?? null)
      },
      { rootMargin: "-40% 0px -59% 0px" }
    )
    for (const id of ids) {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [ids])
  return active
}
