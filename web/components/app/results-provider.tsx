"use client"

import { createContext, useContext, useSyncExternalStore } from "react"

import { DEMO_RUN } from "@/lib/demo"
import { parseResults, type AuditRun, type ParseResult } from "@/lib/results"

/**
 * Which run the audit screens show: the demo run from the server, or a results.json the
 * user opened. The opened file never leaves the browser; it is kept in sessionStorage so
 * it survives navigation and reloads, and goes away with the tab.
 */

const STORAGE_KEY = "lexgate.results.v1"

export type ResultsSource =
  | { kind: "demo" }
  | { kind: "file"; name: string; loadedAt: string; persisted: boolean }

export interface ActiveResults {
  run: AuditRun
  source: ResultsSource
}

interface OpenedFile {
  name: string
  /** ISO timestamp. */
  loadedAt: string
  run: AuditRun
  /** false when sessionStorage refused the file: it lasts until the page reloads. */
  persisted: boolean
}

interface StoredFile {
  name: string
  loadedAt: string
  text: string
}

// undefined: sessionStorage not read yet.
let opened: OpenedFile | null | undefined
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function notify() {
  for (const listener of listeners) listener()
}

function getSnapshot(): OpenedFile | null {
  if (opened === undefined) opened = restore()
  return opened
}

function getServerSnapshot(): OpenedFile | null {
  return null
}

function restore(): OpenedFile | null {
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY)
    if (!stored) return null
    const file = JSON.parse(stored) as StoredFile
    const parsed = parseResults(JSON.parse(file.text))
    if (!parsed.ok) return null
    return {
      name: file.name,
      loadedAt: file.loadedAt,
      run: parsed.run,
      persisted: true,
    }
  } catch {
    return null
  }
}

/** Reads and checks a results.json. Nothing is kept until `openResults` is called. */
export async function readResultsFile(
  file: File
): Promise<ParseResult & { text?: string }> {
  let text: string
  try {
    text = await file.text()
  } catch {
    return { ok: false, error: "Không đọc được tệp này." }
  }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: "Tệp không phải JSON hợp lệ." }
  }
  return { ...parseResults(raw), text }
}

/** Makes an already checked file the active run on every screen. */
export function openResults(name: string, text: string, run: AuditRun) {
  const loadedAt = new Date().toISOString()
  let persisted = true
  try {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ name, loadedAt, text } satisfies StoredFile)
    )
  } catch {
    persisted = false
  }
  opened = { name, loadedAt, run, persisted }
  notify()
}

/** Back to the demo run. */
export function closeResults() {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing stored, or storage blocked: either way the file is gone after this.
  }
  opened = null
  notify()
}

const DemoRunContext = createContext<AuditRun | null>(null)

export function ResultsProvider({
  demo,
  children,
}: {
  demo: AuditRun
  children: React.ReactNode
}) {
  return <DemoRunContext value={demo}>{children}</DemoRunContext>
}

export function useResults(): ActiveResults {
  const demo = useContext(DemoRunContext)
  const file = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  if (!demo) throw new Error("useResults phải nằm trong ResultsProvider")
  if (!file) return { run: demo, source: { kind: "demo" } }
  return {
    run: file.run,
    source: {
      kind: "file",
      name: file.name,
      loadedAt: file.loadedAt,
      persisted: file.persisted,
    },
  }
}

function subscribeNever() {
  return () => {}
}

/**
 * false on the server and during hydration, true after. Until then the active run is
 * always the demo, so a page can wait before deciding a question does not exist.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false
  )
}

const timeFormat = new Intl.DateTimeFormat("vi-VN", {
  hour: "2-digit",
  minute: "2-digit",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
})

/** "14:32 14/11/2026" */
export function formatLoadedAt(iso: string): string {
  return timeFormat.format(new Date(iso))
}

/** Eyebrow naming the run on screen: "Lượt kiểm định demo · 14/11/2026" or the file. */
export function sourceLabel(source: ResultsSource): string {
  return source.kind === "demo"
    ? `Lượt kiểm định demo · ${DEMO_RUN.date}`
    : `Tệp ${source.name}`
}
