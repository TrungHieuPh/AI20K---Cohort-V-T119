import { cn } from "@/lib/utils"

/**
 * "§ 1 · Vấn đề" eyebrow, title and lead, numbered like the sections of a statute.
 * Without `index` the eyebrow stands alone (the walkthrough, which is not a section).
 */
export function SectionHeading({
  id,
  index,
  eyebrow,
  title,
  lead,
  className,
}: {
  /** Put on the h2, for aria-labelledby on the section. */
  id?: string
  index?: number
  eyebrow: React.ReactNode
  title: string
  lead?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex max-w-3xl flex-col gap-4", className)}>
      <p className="font-mono text-xs font-medium tracking-[0.14em] text-hero-accent uppercase">
        {index !== undefined && <>§ {index} · </>}
        {eyebrow}
      </p>
      <h2
        id={id}
        className="font-heading text-[1.9rem] leading-[1.18] font-bold tracking-tight text-balance sm:text-[2.4rem]"
      >
        {title}
      </h2>
      {lead ? (
        <p className="max-w-2xl text-[1.05rem] leading-relaxed text-pretty text-hero-muted sm:text-lg">
          {lead}
        </p>
      ) : null}
    </div>
  )
}
