import { cn } from "@/lib/utils"

/**
 * The part of a chatbot answer the judge flagged, with a wavy red underline like a
 * proofreader's mark. Pass `tone="dark"` on the navy page, where the light-theme red
 * would not show. A phrase that is not in the text leaves the text unmarked.
 */
export function WrongPhrase({
  text,
  phrase,
  tone = "light",
}: {
  text: string
  phrase: string
  tone?: "light" | "dark"
}) {
  const at = phrase ? text.indexOf(phrase) : -1
  if (at < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, at)}
      <span
        className={cn(
          "[box-decoration-break:clone] underline decoration-wavy decoration-[1.5px] underline-offset-[5px]",
          tone === "dark"
            ? "bg-hero-wrong/12 decoration-hero-wrong"
            : "bg-verdict-wrong-soft decoration-verdict-wrong"
        )}
      >
        {text.slice(at, at + phrase.length)}
      </span>
      {text.slice(at + phrase.length)}
    </>
  )
}
