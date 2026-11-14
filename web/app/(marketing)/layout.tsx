import { LandingFooter } from "@/components/landing/landing-footer"
import { LandingHeader } from "@/components/landing/landing-header"
import { getLawInfo } from "@/lib/data"

/**
 * The landing is one navy surface from header to footer: sections are separated by a
 * hairline, never by a change of background. Focus rings switch to the light accent,
 * since the default navy ring would vanish here.
 */
export default async function MarketingLayout({ children }: LayoutProps<"/">) {
  const law = await getLawInfo()
  return (
    <div
      data-surface="hero"
      className="flex flex-1 flex-col bg-hero text-hero-foreground [--ring:var(--hero-accent)] selection:bg-hero-accent selection:text-hero"
    >
      <LandingHeader />
      <main className="flex flex-1 flex-col">{children}</main>
      <LandingFooter lawSource={law.source} />
    </div>
  )
}
