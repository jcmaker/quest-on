"use client";

import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";
import {
  SidebarContent as ShadcnSidebarContent,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from "@/components/ui/sidebar";
import { SidebarFooter } from "@/components/dashboard/SidebarFooter";
import { SidebarFolderTree } from "@/components/instructor/SidebarFolderTree";
import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import { type ComponentType } from "react";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon | ComponentType<{ className?: string }>;
  active: boolean;
}

interface DashboardSidebarProps {
  homeHref: string;
  navItems: NavItem[];
  onItemClick?: () => void;
  userId?: string;
}

export function DashboardSidebar({
  homeHref,
  navItems,
  onItemClick,
  userId,
}: DashboardSidebarProps) {
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";

  return (
    <>
      <SidebarHeader className="p-4 relative">
        <div className="flex items-center gap-2 overflow-hidden">
          <Link href={homeHref} className="flex items-center gap-2 min-w-0">
            <Image
              src="/qstn_logo_svg.svg"
              alt="Quest-On Logo"
              width={32}
              height={32}
              className="w-8 h-8 shrink-0"
              priority
            />
            <span className="text-lg font-bold text-sidebar-foreground whitespace-nowrap transition-all duration-200 group-data-[collapsible=icon]:hidden">
              Quest-On
            </span>
          </Link>
        </div>
        {/* Chevron toggle pinned to sidebar edge */}
        <button
          onClick={toggleSidebar}
          className="absolute -right-3.5 top-1/2 -translate-y-1/2 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-sidebar-border bg-sidebar shadow-sm text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
          aria-label={isCollapsed ? "사이드바 확장" : "사이드바 축소"}
        >
          {isCollapsed ? (
            <ChevronRight className="w-3.5 h-3.5" />
          ) : (
            <ChevronLeft className="w-3.5 h-3.5" />
          )}
        </button>
      </SidebarHeader>

      <ShadcnSidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>MAIN</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="group-data-[collapsible=icon]:items-center">
              {navItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={item.active}
                    tooltip={item.title}
                  >
                    <Link href={item.href} onClick={onItemClick}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {userId && <SidebarFolderTree userId={userId} />}
      </ShadcnSidebarContent>

      <SidebarFooter />
    </>
  );
}
