import { AppSidebar } from "@/components/app/app-sidebar"
import { AppTopbar } from "@/components/app/app-topbar"
import { ResultsProvider } from "@/components/app/results-provider"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { getAuditRun, getLawInfo } from "@/lib/data"

// App shell: navy sidebar (the landing's colour) beside a light working area.
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
      <SidebarProvider>
        <AppSidebar lawSource={law.source} />
        <SidebarInset>
          <AppTopbar />
          <div
            id="content"
            tabIndex={-1}
            className="flex flex-1 flex-col outline-none"
          >
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </ResultsProvider>
  )
}
