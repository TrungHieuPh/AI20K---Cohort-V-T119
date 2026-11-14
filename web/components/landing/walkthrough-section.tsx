"use client"

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { LockKeyhole, Pause, Play } from "lucide-react"

import { SectionHeading } from "@/components/landing/section-heading"
import { cn } from "@/lib/utils"
import { formatClock, WALKTHROUGH } from "@/lib/walkthrough"

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)"

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

function useReducedMotion() {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false
  )
}

const { chapters, duration } = WALKTHROUGH

/**
 * The screen recording, framed as a browser window, with its four chapters below as a
 * segmented progress bar. It plays muted while on screen and pauses off screen; with
 * reduced motion it waits for the play button. Once the viewer pauses it, scrolling
 * never restarts it (WCAG 2.2.2).
 */
export function WalkthroughSection() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const pausedByViewer = useRef(false)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const reducedMotion = useReducedMotion()

  // Play while at least half of the video is on screen, unless the viewer said no.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) video.pause()
        else if (!reducedMotion && !pausedByViewer.current)
          video.play().catch(() => {})
      },
      { threshold: 0.5 }
    )
    observer.observe(video)
    return () => observer.disconnect()
  }, [reducedMotion])

  // timeupdate fires only a few times a second: follow frames for a smooth bar.
  useEffect(() => {
    if (!playing) return
    let frame = requestAnimationFrame(function tick() {
      setTime(videoRef.current?.currentTime ?? 0)
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [playing])

  let active = 0
  chapters.forEach((c, i) => {
    if (c.start <= time + 0.05) active = i
  })
  const current = chapters[active]

  function play() {
    pausedByViewer.current = false
    videoRef.current?.play().catch(() => {})
  }

  function toggle() {
    const video = videoRef.current
    if (!video) return
    if (video.paused) play()
    else {
      pausedByViewer.current = true
      video.pause()
    }
  }

  function seek(start: number) {
    const video = videoRef.current
    if (!video) return
    video.currentTime = start
    setTime(start)
    play()
  }

  return (
    <section
      id="walkthrough"
      aria-labelledby="walkthrough-title"
      className="scroll-mt-16 border-t border-hero-border"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between lg:gap-12">
          <SectionHeading
            id="walkthrough-title"
            eyebrow={<>Xem thao tác · {formatClock(duration)}</>}
            title="Từ bảng tổng quan tới đúng khoản luật làm bằng chứng."
          />
          <p className="max-w-sm leading-relaxed text-pretty text-hero-muted lg:pb-1.5">
            Quay liền một mạch trên ứng dụng, với lượt kiểm định demo. Bấm một
            bước bên dưới để tua tới đó.
          </p>
        </div>

        <figure className="mt-10 flex flex-col gap-6">
          <div className="overflow-hidden rounded-xl border border-hero-border bg-hero-raised shadow-2xl shadow-black/40">
            <div className="flex items-center gap-3 border-b border-hero-border px-3 py-2 sm:px-4">
              <button
                type="button"
                onClick={toggle}
                aria-label={playing ? "Tạm dừng video" : "Phát video"}
                className="grid size-8 shrink-0 place-items-center rounded-md text-hero-foreground transition-colors outline-none hover:bg-hero focus-visible:ring-2 focus-visible:ring-ring"
              >
                {playing ? (
                  <Pause aria-hidden className="size-4" />
                ) : (
                  <Play aria-hidden className="size-4" />
                )}
              </button>
              <p className="flex min-w-0 flex-1 items-center gap-2 rounded-md bg-hero px-3 py-1.5 font-mono text-xs text-hero-muted">
                <LockKeyhole aria-hidden className="size-3 shrink-0" />
                <span className="truncate">
                  localhost:3000
                  <span className="text-hero-foreground">{current.route}</span>
                </span>
              </p>
              <p
                aria-hidden
                className="hidden shrink-0 font-mono text-xs text-hero-muted tabular-nums sm:block"
              >
                {formatClock(time)} / {formatClock(duration)}
              </p>
            </div>

            <div className="relative">
              <video
                ref={videoRef}
                muted
                loop
                playsInline
                preload="metadata"
                poster={WALKTHROUGH.poster}
                width={WALKTHROUGH.width}
                height={WALKTHROUGH.height}
                aria-label="Video thao tác trên ứng dụng lexgate, không có tiếng. Các bước được liệt kê bên dưới."
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
                onClick={toggle}
                className="block aspect-[16/10] h-auto w-full cursor-pointer bg-hero"
              >
                {WALKTHROUGH.sources.map((s) => (
                  <source key={s.src} src={s.src} type={s.type} />
                ))}
              </video>
              {!playing && (
                <button
                  type="button"
                  onClick={play}
                  className="absolute inset-0 m-auto flex size-fit items-center gap-2.5 rounded-full bg-hero-foreground px-5 py-3 font-semibold text-hero shadow-xl shadow-black/30 transition-transform outline-none hover:scale-[1.03] focus-visible:ring-4 focus-visible:ring-ring/60 motion-reduce:transition-none"
                >
                  <Play aria-hidden className="size-4 fill-current" />
                  Phát video · {formatClock(duration)}
                </button>
              )}
            </div>
          </div>

          <figcaption className="sr-only">
            Video không có tiếng, gồm {chapters.length} bước:{" "}
            {chapters.map((c) => `${c.label}: ${c.detail}`).join(" ")}
          </figcaption>

          <ol className="grid grid-cols-2 gap-x-5 gap-y-6 lg:grid-cols-4">
            {chapters.map((chapter, i) => {
              const end = chapters[i + 1]?.start ?? duration
              const progress =
                i < active
                  ? 1
                  : i > active
                    ? 0
                    : Math.min(
                        1,
                        (time - chapter.start) / (end - chapter.start)
                      )
              return (
                <li key={chapter.label}>
                  <button
                    type="button"
                    onClick={() => seek(chapter.start)}
                    aria-current={i === active ? "step" : undefined}
                    className="group flex w-full flex-col gap-3 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-hero"
                  >
                    <span
                      aria-hidden
                      className="block h-1 w-full overflow-hidden rounded-full bg-hero-border"
                    >
                      <span
                        className="block h-full origin-left rounded-full bg-hero-accent"
                        style={{ transform: `scaleX(${progress})` }}
                      />
                    </span>
                    <span className="flex items-baseline gap-2.5">
                      <span className="font-mono text-xs text-hero-muted tabular-nums">
                        <span className="sr-only">Tua tới </span>
                        {formatClock(chapter.start)}
                      </span>
                      <span
                        className={cn(
                          "font-heading text-[1.05rem] font-bold transition-colors",
                          i === active
                            ? "text-hero-foreground"
                            : "text-hero-muted group-hover:text-hero-foreground"
                        )}
                      >
                        {chapter.label}
                      </span>
                    </span>
                    <span className="text-sm leading-snug text-pretty text-hero-muted">
                      {chapter.detail}
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        </figure>
      </div>
    </section>
  )
}
