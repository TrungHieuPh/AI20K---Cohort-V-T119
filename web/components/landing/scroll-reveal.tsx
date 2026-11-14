"use client"

import { useEffect } from "react"

/** Gap between blocks that come into view together, and how many of them get one. */
const STAGGER_MS = 90
const MAX_STAGGERED = 4

/**
 * Fades up each landing block marked `data-reveal` the first time it scrolls into
 * view; blocks that arrive together go one after another, in page order. Blocks on
 * screen when the page loads are left as they are.
 *
 * The server renders every block visible. globals.css hides a block only once this
 * script has marked it pending, and never under reduced motion or in print, so a
 * page without the script still shows everything.
 */
export function ScrollReveal() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries
          .filter((entry) => entry.isIntersecting)
          .map((entry) => entry.target as HTMLElement)
          .sort((a, b) =>
            a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING
              ? -1
              : 1
          )
          .forEach((el, i) => {
            el.style.setProperty(
              "--reveal-delay",
              `${Math.min(i, MAX_STAGGERED) * STAGGER_MS}ms`
            )
            el.dataset.revealState = "shown"
            observer.unobserve(el)
          })
      },
      { rootMargin: "0px 0px -10% 0px" }
    )

    const fold = window.innerHeight * 0.9
    const blocks = document.querySelectorAll<HTMLElement>(
      '[data-reveal]:not([data-reveal-state="shown"])'
    )
    for (const el of blocks) {
      const { top, bottom } = el.getBoundingClientRect()
      if (top < fold && bottom > 0) {
        el.dataset.revealState = "shown"
      } else {
        el.dataset.revealState = "pending"
        observer.observe(el)
      }
    }
    return () => observer.disconnect()
  }, [])

  return null
}
