import type { Metadata } from "next"

import { OpenResults } from "@/components/app/open-results"
import { PAGE } from "@/lib/pages"

export const metadata: Metadata = { title: PAGE.open }

export default function OpenResultsPage() {
  return <OpenResults />
}
