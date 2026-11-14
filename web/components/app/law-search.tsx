"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { LoaderCircle, Search } from "lucide-react"

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"

const DELAY_MS = 250

function lawHref(query: string) {
  return query ? `/law?q=${encodeURIComponent(query)}` : "/law"
}

/**
 * Search box for /law. Typing updates `?q=` after a short pause, so the server does the
 * search and the URL can be shared. Enter searches at once; without JavaScript the form
 * still works as a plain GET.
 */
export function LawSearch({ query }: { query: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [value, setValue] = useState(query)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Queries this box asked for that the URL has not reached yet. When `query` changes to
  // one of them it is our own navigation landing, and the box keeps what the user is
  // typing; any other change came from outside (a link to /law), so the box follows it.
  const [inFlight, setInFlight] = useState<string[]>([])
  const [shown, setShown] = useState(query)
  if (query !== shown) {
    setShown(query)
    const at = inFlight.indexOf(query)
    if (at === -1) {
      setValue(query)
      setInFlight([])
    } else {
      setInFlight(inFlight.slice(at + 1))
    }
  }

  useEffect(() => () => clearTimeout(timer.current), [])

  function search(text: string) {
    clearTimeout(timer.current)
    const q = text.trim()
    if (q === (inFlight.at(-1) ?? query)) return
    setInFlight((list) => [...list, q])
    startTransition(() => router.replace(lawHref(q), { scroll: false }))
  }

  return (
    <form
      role="search"
      action="/law"
      onSubmit={(event) => {
        event.preventDefault()
        search(value)
      }}
      className="w-full max-w-2xl"
    >
      <label htmlFor="law-search" className="sr-only">
        Tìm trong Bộ luật Lao động
      </label>
      <InputGroup className="h-11 bg-card">
        <InputGroupAddon>
          <Search aria-hidden />
        </InputGroupAddon>
        <InputGroupInput
          id="law-search"
          name="q"
          type="search"
          value={value}
          onChange={(event) => {
            const text = event.target.value
            setValue(text)
            clearTimeout(timer.current)
            timer.current = setTimeout(() => search(text), DELAY_MS)
          }}
          placeholder="Số Điều hoặc từ khóa, ví dụ: làm thêm giờ"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          className="text-base"
        />
        {pending && (
          <InputGroupAddon align="inline-end">
            <LoaderCircle
              aria-hidden
              className="animate-spin motion-reduce:animate-none"
            />
          </InputGroupAddon>
        )}
      </InputGroup>
    </form>
  )
}
