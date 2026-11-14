import type { Metadata } from "next"

import { OpenResults } from "@/components/app/open-results"

export const metadata: Metadata = { title: "Mở kết quả" }

export default function OpenResultsPage() {
  return <OpenResults />
}
