import type { Metadata } from "next"
import { JetBrains_Mono, Nunito, Nunito_Sans } from "next/font/google"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

// All three faces ship the Vietnamese subset (stacked diacritics such as "ệ", "ở").
// Nunito Sans: body text, UI and the text of the law. Variable, so any weight works.
const fontSans = Nunito_Sans({
  subsets: ["latin", "vietnamese"],
  variable: "--font-sans",
})

// Nunito: headings, titles and the logo mark.
const fontHeading = Nunito({
  subsets: ["latin", "vietnamese"],
  variable: "--font-nunito",
})

// Ids, metrics and labels: the "infrastructure" voice.
const fontMono = JetBrains_Mono({
  subsets: ["latin", "vietnamese"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  title: {
    default: "lexgate · Kiểm định chatbot pháp lý",
    template: "%s · lexgate",
  },
  description:
    "Kiểm định câu trả lời của chatbot pháp lý theo Bộ luật Lao động trước khi đưa tới người dùng.",
}

// Each route group brings its own chrome: (marketing) the landing header, (app) the app shell.
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="vi"
      suppressHydrationWarning
      className={cn(
        "font-sans antialiased",
        fontSans.variable,
        fontHeading.variable,
        fontMono.variable
      )}
    >
      <body className="flex min-h-svh flex-col">
        {/* Light only until the dark palette is designed; drop forcedTheme to enable it. */}
        <ThemeProvider forcedTheme="light">
          <TooltipProvider>{children}</TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
