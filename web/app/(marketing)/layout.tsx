import { BackToTop } from "@/components/landing/back-to-top"
import { LandingFooter } from "@/components/landing/landing-footer"
import { LandingHeader } from "@/components/landing/landing-header"
import { getLawInfo } from "@/lib/data"

/**
 * The landing is one navy surface from header to footer, with one faint grid running
 * under all of it: sections are separated by space alone, never by a rule (it would
 * run beside a grid line and read as a stray double stripe) or a change of background.
 * Only the text of the law sits on light paper. Focus rings switch to the
 * light accent, since the default navy ring would vanish here.
 */
export default async function MarketingLayout({ children }: LayoutProps<"/">) {
  const law = await getLawInfo()
  return (
    <div
      data-surface="hero"
      className="flex flex-1 flex-col bg-hero bg-grid text-hero-foreground [--ring:var(--hero-accent)] selection:bg-hero-accent selection:text-hero"
    >
      <LandingHeader />
      <main className="flex flex-1 flex-col">{children}</main>
      <LandingFooter lawSource={law.source} />
      <BackToTop />
    </div>
  )
}
