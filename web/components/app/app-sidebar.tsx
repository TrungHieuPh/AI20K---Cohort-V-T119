"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BookOpen,
  FolderOpen,
  Gauge,
  LayoutDashboard,
  ListChecks,
  MessagesSquare,
  type LucideIcon,
} from "lucide-react"

import { formatLoadedAt, useResults } from "@/components/app/results-provider"
import { DEMO_RUN } from "@/lib/demo"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"

interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  /** Sub-paths that belong to another item: /audit/open is not "Kiểm định". */
  exclude?: string[]
}

const NAV: { label: string; items: NavItem[] }[] = [
  {
    label: "Kiểm định",
    items: [
      { href: "/dashboard", label: "Tổng quan", icon: LayoutDashboard },
      {
        href: "/audit",
        label: "Kiểm định",
        icon: ListChecks,
        exclude: ["/audit/open"],
      },
      { href: "/audit/open", label: "Mở kết quả", icon: FolderOpen },
      { href: "/quality", label: "Chất lượng", icon: Gauge },
    ],
  },
  {
    label: "Thử trực tiếp",
    items: [{ href: "/chat", label: "Hỏi đáp", icon: MessagesSquare }],
  },
  {
    label: "Tra cứu",
    items: [{ href: "/law", label: "Văn bản luật", icon: BookOpen }],
  },
]

const under = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`)

function isActive(pathname: string, item: NavItem) {
  if (item.exclude?.some((p) => under(pathname, p))) return false
  return under(pathname, item.href)
}

export function AppSidebar({ lawSource }: { lawSource: string }) {
  const pathname = usePathname()
  const { source } = useResults()
  const { isMobile, setOpenMobile } = useSidebar()
  // On phones the sidebar is a sheet: close it once a page is picked.
  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false)
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="py-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              tooltip="lexgate · Trang giới thiệu"
              render={<Link href="/" onClick={closeOnMobile} />}
            >
              <span
                aria-hidden
                className="grid size-8 shrink-0 place-items-center rounded-md bg-hero-foreground font-heading text-lg leading-none font-extrabold text-hero"
              >
                §
              </span>
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="font-heading text-base font-extrabold tracking-tight text-sidebar-accent-foreground">
                  lexgate
                </span>
                <span className="truncate text-xs">
                  Kiểm định chatbot pháp lý
                </span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {NAV.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const active = isActive(pathname, item)
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        isActive={active}
                        aria-current={active ? "page" : undefined}
                        tooltip={item.label}
                        render={
                          <Link href={item.href} onClick={closeOnMobile} />
                        }
                      >
                        <item.icon aria-hidden />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="group-data-[collapsible=icon]:hidden">
        <div className="flex flex-col gap-1.5 rounded-lg border border-sidebar-border p-3 text-xs leading-relaxed">
          {source.kind === "demo" ? (
            <>
              <p className="font-medium text-sidebar-accent-foreground">
                Dữ liệu demo
              </p>
              <p>
                Kết quả thật của pipeline ngày {DEMO_RUN.date} trên bộ câu mẫu
                do nhóm soạn, không phải bộ test kín.
              </p>
            </>
          ) : (
            <>
              <p className="font-medium text-sidebar-accent-foreground">
                Đang xem tệp
              </p>
              <p className="font-mono break-all">{source.name}</p>
              <p>
                Mở lúc {formatLoadedAt(source.loadedAt)}, chỉ trong tab này.
              </p>
            </>
          )}
          <p className="font-mono text-[0.7rem]">{lawSource}</p>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
