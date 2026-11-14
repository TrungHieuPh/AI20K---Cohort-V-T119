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
          <p className="font-mono text-xs tracking-[0.12em] text-muted-foreground uppercase">
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

/** Small uppercase heading for a block inside a page. */
export function SectionLabel({
  className,
  ...props
}: React.ComponentProps<"h2">) {
  return (
    <h2
      className={cn(
        "font-mono text-xs tracking-[0.12em] text-muted-foreground uppercase",
        className
      )}
      {...props}
    />
  )
}
