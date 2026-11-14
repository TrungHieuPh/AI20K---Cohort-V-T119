import type { Metadata } from "next"

import { AuditView } from "@/components/app/audit-view"

export const metadata: Metadata = { title: "Kiểm định" }

// The run shown is the demo, or a results.json opened in this browser tab.
export default function AuditPage() {
  return <AuditView />
}
