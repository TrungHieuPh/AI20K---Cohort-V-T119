import { cn } from "@/lib/utils"

/** A section's eyebrow ("Vấn đề"), title and lead. */
export function SectionHeading({
  id,
  eyebrow,
  title,
  lead,
  className,
}: {
  /** Put on the h2, for aria-labelledby on the section. */
  id?: string
  eyebrow: React.ReactNode
  title: string
  lead?: React.ReactNode
  className?: string
}) {
  return (
    <div data-reveal className={cn("flex max-w-3xl flex-col gap-4", className)}>
      <p className="text-sm font-bold tracking-[0.08em] text-hero-accent uppercase">
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
