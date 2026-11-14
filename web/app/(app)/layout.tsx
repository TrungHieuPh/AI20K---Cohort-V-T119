import { AppDock, MobileBar, ResultsTabs } from "@/components/app/app-nav"
import { ResultsProvider } from "@/components/app/results-provider"
import { getAuditRun, getLawInfo } from "@/lib/data"

// Pages sit on warm paper (data-surface="app" in globals.css). The pages are reached from
// a small dock floating on the left (a light strip with a menu on phones); main keeps
// clear of the dock. The results tabs live here, not in each page, so they stay mounted
// and their pill can slide between pages.
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const [law, demo] = await Promise.all([getLawInfo(), getAuditRun()])
  return (
    <ResultsProvider demo={demo}>
      <a
        href="#content"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Bỏ qua tới nội dung
      </a>
      <div data-surface="app" className="flex flex-1 flex-col bg-background">
        <MobileBar lawSource={law.source} />
        <AppDock />
        <main
          id="content"
          tabIndex={-1}
          className="flex flex-1 flex-col outline-none md:pl-20"
        >
          <ResultsTabs />
          {children}
        </main>
      </div>
    </ResultsProvider>
  )
}
