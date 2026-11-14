import type { Metadata } from "next"

import { DashboardView } from "@/components/app/dashboard-view"
import { getLawInfo } from "@/lib/data"
import { PAGE } from "@/lib/pages"

export const metadata: Metadata = { title: PAGE.dashboard }

// The run shown is the demo, or a results.json opened in this browser tab.
export default async function DashboardPage() {
  const law = await getLawInfo()
  return <DashboardView lawSource={law.source} />
}
