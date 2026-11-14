import type { Metadata } from "next"

import { CheckView } from "@/components/app/check-view"
import { getAuditRun, getLawInfo } from "@/lib/data"
import { PAGE } from "@/lib/pages"

export const metadata: Metadata = { title: PAGE.check }

// Audits one pasted answer through POST /api/audit (the /api rewrite in next.config.ts).
// The samples are the demo run's questions, only to fill the form.
export default async function CheckPage() {
  const [law, run] = await Promise.all([getLawInfo(), getAuditRun()])
  const samples = run.questions
    .filter((q) => q.cau_hoi.trim() && q.cau_tra_loi.trim())
    .map((q) => ({ cau_hoi: q.cau_hoi, cau_tra_loi: q.cau_tra_loi }))
  return <CheckView samples={samples} lawSource={law.source} />
}
