import type { Metadata } from "next"

import { ChatView } from "@/components/app/chat-view"
import { getLawInfo } from "@/lib/data"

export const metadata: Metadata = { title: "Hỏi đáp" }

// Talks to the chat API (api/server.py) through the /api rewrite in next.config.ts.
export default async function ChatPage() {
  const law = await getLawInfo()
  return <ChatView lawSource={law.source} />
}
