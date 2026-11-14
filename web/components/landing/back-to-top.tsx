"use client"

import { useEffect, useRef, useState } from "react"
import { ArrowUp } from "lucide-react"

/**
 * A round button in the bottom corner, once the page has scrolled past about one
 * screen. Its ring fills as the page is read. It goes back to the top (smoothly,
 * unless reduced motion turns the page's smooth scrolling off) and hands keyboard
 * focus to the header, so Tab carries on from the top too. While hidden it is inert.
 */
export function BackToTop() {
  const [visible, setVisible] = useState(false)
  const ring = useRef<SVGCircleElement>(null)

  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      const el = document.scrollingElement ?? document.documentElement
      const room = el.scrollHeight - window.innerHeight
      const progress = room > 0 ? Math.min(1, window.scrollY / room) : 0
      ring.current?.setAttribute("stroke-dashoffset", String(1 - progress))
      setVisible(window.scrollY > window.innerHeight * 0.9)
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener("scroll", schedule, { passive: true })
    window.addEventListener("resize", schedule)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("scroll", schedule)
      window.removeEventListener("resize", schedule)
    }
  }, [])

  function toTop() {
    // Drop the section hash, so a reload stays at the top.
    if (window.location.hash) {
      history.replaceState(
        history.state,
        "",
        window.location.pathname + window.location.search
      )
    }
    window.scrollTo({ top: 0 })
    document
      .querySelector<HTMLElement>("header a")
      ?.focus({ preventScroll: true })
  }

  return (
    <button
      type="button"
      onClick={toTop}
      inert={!visible}
      data-visible={visible || undefined}
      className="group fixed right-4 bottom-4 z-30 grid size-12 translate-y-3 scale-90 cursor-pointer place-items-center rounded-full bg-hero-raised/90 text-hero-foreground opacity-0 shadow-lg ring-1 shadow-black/40 ring-hero-border backdrop-blur-md transition-[opacity,translate,scale,background-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] outline-none hover:bg-hero-raised focus-visible:ring-3 focus-visible:ring-ring data-visible:translate-y-0 data-visible:scale-100 data-visible:opacity-100 motion-reduce:transition-none sm:right-6 sm:bottom-6"
    >
      <svg
        aria-hidden
        viewBox="0 0 48 48"
        className="pointer-events-none absolute inset-0 size-full -rotate-90"
      >
        <circle
          ref={ring}
          cx="24"
          cy="24"
          r="22.5"
          pathLength={1}
          strokeDasharray="1"
          strokeDashoffset="1"
          className="fill-none stroke-hero-accent [stroke-width:2] [stroke-linecap:round]"
        />
      </svg>
      <ArrowUp
        aria-hidden
        className="size-5 transition-transform duration-200 group-hover:-translate-y-0.5 motion-reduce:transition-none"
      />
      <span className="sr-only">Lên đầu trang</span>
    </button>
  )
}
