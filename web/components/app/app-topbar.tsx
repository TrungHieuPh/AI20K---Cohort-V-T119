"use client"

import { Fragment } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { useResults } from "@/components/app/results-provider"
import { Badge } from "@/components/ui/badge"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { PAGE } from "@/lib/pages"

type Crumb = { label: string; href?: string }

function crumbsFor(pathname: string): Crumb[] {
  const [section, id] = pathname.split("/").filter(Boolean)
  switch (section) {
    case "chat":
      return [{ label: PAGE.chat }]
    case "check":
      return [{ label: PAGE.check }]
    case "dashboard":
      return [{ label: PAGE.dashboard }]
    case "audit":
      if (!id) return [{ label: PAGE.audit }]
      if (id === "open") return [{ label: PAGE.open }]
      return [
        { label: PAGE.audit, href: "/audit" },
        { label: `Câu #${decodeURIComponent(id)}` },
      ]
    case "quality":
      return [{ label: PAGE.quality }]
    case "law":
      if (!id) return [{ label: PAGE.law }]
      return [
        { label: PAGE.law, href: "/law" },
        { label: `Điều ${decodeURIComponent(id)}` },
      ]
    default:
      return []
  }
}

/** Pages showing the active run, where the topbar names its source. */
const RUN_SECTIONS = new Set(["dashboard", "audit"])

export function AppTopbar() {
  const pathname = usePathname()
  const crumbs = crumbsFor(pathname)
  const { source } = useResults()
  const showsRun = RUN_SECTIONS.has(
    pathname.split("/").filter(Boolean)[0] ?? ""
  )

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur-sm sm:px-6">
      <SidebarTrigger className="-ml-1.5" />
      <Separator orientation="vertical" className="my-4 mr-1" />
      <Breadcrumb className="min-w-0">
        <BreadcrumbList className="flex-nowrap">
          {crumbs.map((crumb, i) => (
            <Fragment key={crumb.label}>
              {/* Parent crumbs drop on phones; the sidebar is one tap away. */}
              {i > 0 && <BreadcrumbSeparator className="hidden sm:flex" />}
              <BreadcrumbItem
                className={crumb.href ? "hidden sm:inline-flex" : "min-w-0"}
              >
                {crumb.href ? (
                  <BreadcrumbLink render={<Link href={crumb.href} />}>
                    {crumb.label}
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage className="truncate">
                    {crumb.label}
                  </BreadcrumbPage>
                )}
              </BreadcrumbItem>
            </Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
      {showsRun && (
        <Badge
          variant="outline"
          title={source.kind === "file" ? source.name : undefined}
          className="ml-auto max-w-40 shrink-0 text-muted-foreground sm:max-w-64"
        >
          <span className="truncate">
            {source.kind === "demo" ? "Lượt demo" : `Tệp: ${source.name}`}
          </span>
        </Badge>
      )}
    </header>
  )
}
