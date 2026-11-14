"use client"

import { useLayoutEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BookOpen,
  ChartColumnBig,
  Menu,
  MessagesSquare,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react"

import { formatLoadedAt, useResults } from "@/components/app/results-provider"
import { Logo } from "@/components/logo"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { DEMO_RUN } from "@/lib/demo"
import { PAGE, RESULTS_SECTION } from "@/lib/pages"
import { cn } from "@/lib/utils"

interface NavItem {
  href: string
  label: string
  icon?: LucideIcon
  /** Paths lit with this item besides its own. */
  also?: string[]
  /** Sub-paths that belong to another item: /audit/open is not "Từng câu trả lời". */
  exclude?: string[]
}

// Trying the chatbot comes first: it is what the MVP demo opens with.
const NAV: NavItem[] = [
  { href: "/chat", label: PAGE.chat, icon: MessagesSquare },
  { href: "/check", label: PAGE.check, icon: ShieldCheck },
  {
    href: "/dashboard",
    label: RESULTS_SECTION,
    icon: ChartColumnBig,
    also: ["/audit", "/quality"],
  },
  { href: "/law", label: PAGE.law, icon: BookOpen },
]
const RESULTS_NAV = NAV[2]

/** The four pages about a whole run, as tabs at the top of each of them. */
const RESULTS: NavItem[] = [
  { href: "/dashboard", label: PAGE.dashboard },
  { href: "/audit", label: PAGE.audit, exclude: ["/audit/open"] },
  { href: "/quality", label: PAGE.quality },
  { href: "/audit/open", label: PAGE.open },
]

const under = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`)

function isActive(pathname: string, item: NavItem) {
  if (item.exclude?.some((p) => under(pathname, p))) return false
  return [item.href, ...(item.also ?? [])].some((p) => under(pathname, p))
}

/** The easing every moving part of the nav shares: quick out, soft landing. */
const GLIDE = "ease-[cubic-bezier(0.22,1,0.36,1)]"

/**
 * From tablet width up, the pages sit in a small dock floating on the left edge: one
 * icon each, the name slides out beside the icon on hover or keyboard focus, and the
 * filled tile glides to the page you open. The dock lives in the layout, so it stays
 * put between pages and the tile can move.
 */
export function AppDock() {
  const pathname = usePathname()
  const active = NAV.findIndex((item) => isActive(pathname, item))

  return (
    <nav
      aria-label="Các trang"
      className="fixed top-1/2 left-3 z-40 hidden -translate-y-1/2 animate-in flex-col items-center gap-1.5 rounded-2xl bg-card/90 p-1.5 shadow-xl ring-1 shadow-foreground/10 ring-foreground/10 backdrop-blur-md duration-500 fade-in-0 slide-in-from-left-4 motion-reduce:animate-none md:flex"
    >
      <Link
        href="/"
        className="group/dock relative grid size-11 place-items-center rounded-xl bg-hero font-heading text-xl leading-none font-extrabold text-hero-foreground transition-[scale] duration-200 active:scale-95"
      >
        <span aria-hidden>§</span>
        <DockTip>lexgate · trang giới thiệu</DockTip>
      </Link>
      <span aria-hidden className="my-0.5 h-px w-6 bg-border" />
      <div className="relative">
        {active >= 0 && (
          <span
            aria-hidden
            style={{ "--i": active } as React.CSSProperties}
            className={cn(
              "absolute top-0 left-0 size-11 translate-y-[calc(var(--i)*3.125rem)] rounded-xl bg-primary shadow-md shadow-primary/30 transition-[translate] duration-500 motion-reduce:transition-none",
              GLIDE
            )}
          />
        )}
        <ul className="flex flex-col gap-1.5">
          {NAV.map((item, i) => {
            const Icon = item.icon!
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={i === active ? "page" : undefined}
                  className="group/dock relative grid size-11 place-items-center rounded-xl text-muted-foreground transition-[color,background-color,scale] duration-200 hover:bg-muted hover:text-foreground active:scale-95 aria-[current=page]:text-primary-foreground aria-[current=page]:hover:bg-transparent aria-[current=page]:hover:text-primary-foreground"
                >
                  <Icon aria-hidden className="size-5" />
                  <DockTip>{item.label}</DockTip>
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </nav>
  )
}

/**
 * The page's name, pointing at its icon. It is the link's text, so screen readers get
 * the name even while the tip is faded out.
 */
function DockTip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "pointer-events-none absolute top-1/2 left-full z-10 ml-4 -translate-x-2 -translate-y-1/2 rounded-lg bg-hero px-3 py-1.5 font-sans text-sm font-semibold whitespace-nowrap text-hero-foreground opacity-0 shadow-lg ring-1 shadow-foreground/20 ring-hero-border transition-[opacity,translate] duration-200",
        // The hairline keeps the tip readable where it crosses a navy band (/check).
        "before:absolute before:top-1/2 before:-left-1 before:size-2.5 before:-translate-y-1/2 before:rotate-45 before:rounded-[2px] before:border-b before:border-l before:border-hero-border before:bg-hero",
        "group-hover/dock:translate-x-0 group-hover/dock:opacity-100 group-focus-visible/dock:translate-x-0 group-focus-visible/dock:opacity-100 motion-reduce:transition-none",
        GLIDE
      )}
    >
      {children}
    </span>
  )
}

/**
 * Tabs across the top of the four results pages, with the run they show beside them.
 * The filled pill slides to the tab you open; it is measured from the links because the
 * labels are not the same width.
 */
export function ResultsTabs() {
  const pathname = usePathname()
  const navRef = useRef<HTMLElement>(null)
  const pillRef = useRef<HTMLSpanElement>(null)
  const onResults = isActive(pathname, RESULTS_NAV)

  useLayoutEffect(() => {
    const nav = navRef.current
    const pill = pillRef.current
    if (!nav || !pill) return
    const place = () => {
      const link = nav.querySelector<HTMLElement>('[aria-current="page"]')
      pill.hidden = !link
      if (!link) return
      pill.style.width = `${link.offsetWidth}px`
      pill.style.translate = `${link.offsetLeft}px 0`
      if (nav.dataset.ready === undefined) {
        // Land on the first tab without sliding in from the left: flush the position,
        // then switch the slide on (and hand the fill over from the link to the pill).
        void pill.offsetWidth
        nav.dataset.ready = ""
      }
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(nav)
    return () => observer.disconnect()
  }, [pathname, onResults])

  if (!onResults) return null

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 pt-6 sm:px-6 lg:pt-8">
      <nav
        ref={navRef}
        aria-label={RESULTS_SECTION}
        className="group/tabs relative flex max-w-full [scrollbar-width:none] overflow-x-auto rounded-full bg-card p-1 shadow-xs ring-1 ring-foreground/10"
      >
        <span
          ref={pillRef}
          aria-hidden
          hidden
          className={cn(
            "absolute top-1 bottom-1 left-0 rounded-full bg-primary opacity-0 shadow-sm shadow-primary/30 group-data-ready/tabs:opacity-100 group-data-ready/tabs:transition-[translate,width] group-data-ready/tabs:duration-500 motion-reduce:transition-none",
            GLIDE
          )}
        />
        {RESULTS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(pathname, item) ? "page" : undefined}
            className="relative rounded-full px-4 py-1.5 text-sm font-semibold whitespace-nowrap text-muted-foreground transition-colors duration-300 hover:text-foreground aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground group-data-ready/tabs:aria-[current=page]:bg-transparent"
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <RunSource />
    </div>
  )
}

/** Which run the results pages show: the team's demo run or a file opened in this tab. */
function RunSource() {
  const { source } = useResults()
  return (
    <p
      title={source.kind === "file" ? source.name : undefined}
      className="inline-flex max-w-full items-center gap-2 rounded-full bg-card px-3 py-1.5 text-xs text-muted-foreground ring-1 ring-foreground/10"
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-primary" />
      <span className="truncate">
        {source.kind === "demo"
          ? `Lượt demo ${DEMO_RUN.date}`
          : `Tệp ${source.name}`}
      </span>
    </p>
  )
}

/** Below tablet width: a light strip with the logo, the pages open in a sheet. */
export function MobileBar({ lawSource }: { lawSource: string }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const { source } = useResults()
  const close = () => setOpen(false)

  const row =
    "flex items-center gap-3 rounded-xl px-3 py-2.5 font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground"

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-4 border-b bg-background/85 px-4 backdrop-blur-md md:hidden">
      <Logo />
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger render={<Button variant="outline" size="icon-lg" />}>
          <Menu aria-hidden />
          <span className="sr-only">Mở danh sách trang</span>
        </SheetTrigger>
        <SheetContent className="gap-0 overflow-y-auto bg-background">
          <SheetHeader className="border-b">
            <SheetTitle>Các trang</SheetTitle>
          </SheetHeader>
          <nav aria-label="Các trang" className="flex flex-col gap-1 p-3">
            {NAV.map((item) => {
              const Icon = item.icon!
              if (item === RESULTS_NAV) {
                return (
                  <div key={item.href} className="flex flex-col gap-1 py-1">
                    <p className="flex items-center gap-3 px-3 py-2 font-semibold text-foreground">
                      <Icon aria-hidden className="size-5" />
                      {item.label}
                    </p>
                    <ul className="ml-[1.375rem] flex flex-col gap-0.5 border-l pl-3">
                      {RESULTS.map((sub) => (
                        <li key={sub.href}>
                          <Link
                            href={sub.href}
                            onClick={close}
                            aria-current={
                              isActive(pathname, sub) ? "page" : undefined
                            }
                            className={cn(row, "py-2 text-sm")}
                          >
                            {sub.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              }
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={close}
                  aria-current={isActive(pathname, item) ? "page" : undefined}
                  className={row}
                >
                  <Icon aria-hidden className="size-5" />
                  {item.label}
                </Link>
              )
            })}
          </nav>
          <SheetFooter className="mt-auto gap-1.5 border-t text-xs leading-relaxed text-muted-foreground">
            {source.kind === "demo" ? (
              <p>
                Kết quả kiểm định đang xem: lượt chạy thật ngày {DEMO_RUN.date}{" "}
                trên bộ câu mẫu do nhóm soạn, không phải bộ test kín.
              </p>
            ) : (
              <p>
                Kết quả kiểm định đang xem: tệp{" "}
                <span className="font-mono break-all">{source.name}</span>, mở
                lúc {formatLoadedAt(source.loadedAt)}, chỉ trong tab này.
              </p>
            )}
            {lawSource && (
              <p className="font-mono text-[0.7rem]">{lawSource}</p>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </header>
  )
}
