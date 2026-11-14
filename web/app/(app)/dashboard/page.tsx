import type { Metadata } from "next"

import { DashboardView } from "@/components/app/dashboard-view"
import { getLawInfo } from "@/lib/data"

export const metadata: Metadata = { title: "Tổng quan" }

// The run shown is the demo, or a results.json opened in this browser tab.
export default async function DashboardPage() {
  const law = await getLawInfo()
  return <DashboardView lawSource={law.source} />
}
