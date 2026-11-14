import { cn } from "@/lib/utils"

/** Width, gutters and vertical rhythm shared by every page of the app. */
export function PageShell({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:py-10",
        className
      )}
      {...props}
    />
  )
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  eyebrow?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  /** Extra rows under the description, e.g. a verdict and metrics. */
  children?: React.ReactNode
}) {
  return (
    <header className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
      <div className="flex min-w-0 flex-col gap-2.5">
        {eyebrow && (
          <p className="text-sm font-semibold text-muted-foreground">
            {eyebrow}
          </p>
        )}
        <h1 className="max-w-3xl font-heading text-3xl leading-tight font-bold tracking-tight text-balance sm:text-[2.1rem]">
          {title}
        </h1>
        {description && (
          <p className="max-w-2xl leading-relaxed text-pretty text-muted-foreground">
            {description}
          </p>
        )}
        {children}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>
      )}
    </header>
  )
}

/**
 * A page's opening on the landing's navy grid, right under the bar: what the page is
 * for in large type, then `children` (a short list, key numbers) and, on wide screens,
 * `aside` beside it (a form, a verdict).
 */
export function PageHero({
  eyebrow,
  title,
  description,
  aside,
  children,
}: {
  eyebrow?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  aside?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className="bg-hero bg-grid text-hero-foreground [--ring:var(--hero-accent)] md:-ml-20 md:pl-20">
      <div
        className={cn(
          "mx-auto grid w-full max-w-6xl items-start gap-8 px-4 pt-10 pb-12 sm:px-6 lg:gap-12 lg:pt-14 lg:pb-16",
          aside && "lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"
        )}
      >
        <header className="flex min-w-0 flex-col gap-4">
          {eyebrow && <Eyebrow tone="dark">{eyebrow}</Eyebrow>}
          <h1 className="font-heading text-[2.25rem] leading-[1.08] font-extrabold tracking-tight text-balance sm:text-5xl">
            {title}
          </h1>
          {description && (
            <p className="max-w-xl text-[1.05rem] leading-relaxed text-pretty text-hero-muted">
              {description}
            </p>
          )}
          {children}
        </header>
        {aside}
      </div>
    </div>
  )
}

/** The landing's "§ …" section label: on paper in primary, on navy in the light accent. */
export function Eyebrow({
  tone = "light",
  className,
  ...props
}: React.ComponentProps<"p"> & { tone?: "light" | "dark" }) {
  return (
    <p
      className={cn(
        "text-sm font-bold tracking-[0.08em] uppercase",
        tone === "dark" ? "text-hero-accent" : "text-primary",
        className
      )}
      {...props}
    />
  )
}

/** Small heading for a block inside a page, written as a plain sentence. */
export function SectionLabel({
  className,
  ...props
}: React.ComponentProps<"h2">) {
  return (
    <h2
      className={cn(
        "font-heading text-base font-bold text-foreground",
        className
      )}
      {...props}
    />
  )
}
