"use client";

import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Menu, XIcon } from "lucide-react";
import {
  SidebarContent as ShadcnSidebarContent,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { SidebarFooter } from "@/components/dashboard/SidebarFooter";
import { type LucideIcon } from "lucide-react";
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
  showToggle?: boolean;
}

export function DashboardSidebar({
  homeHref,
  navItems,
  onItemClick,
  showToggle = false,
}: DashboardSidebarProps) {
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";

  return (
    <>
      <SidebarHeader className={cn(
        "border-b border-sidebar-border flex items-center",
        showToggle ? "p-2 sm:p-3" : "p-4 sm:p-5"
      )}>
        {showToggle && isCollapsed ? (
          <div className="w-full flex items-center justify-center">
            <Menu
              className="w-5 h-5 shrink-0 cursor-pointer"
              aria-hidden="true"
              onClick={toggleSidebar}
            />
            <span className="sr-only">사이드바 열기</span>
          </div>
        ) : showToggle ? (
          <div className="w-full flex items-center justify-between px-3 sm:px-4">
            <Link href={homeHref} className="flex items-center flex-shrink-0">
              <Image
                src="/qstn_logo_svg.svg"
                alt="Quest-On Logo"
                width={30}
                height={30}
                className="w-8 h-8 shrink-0"
                priority
              />
              <span className="text-lg font-bold ml-2">Quest-On</span>
            </Link>
            <button
              type="button"
              onClick={toggleSidebar}
              className="rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="사이드바 닫기"
            >
              <XIcon className="w-5 h-5" />
              <span className="sr-only">사이드바 닫기</span>
            </button>
          </div>
        ) : (
          <Link
            href={homeHref}
            className={cn(
              "flex items-center",
              isCollapsed ? "justify-center" : "justify-start"
            )}
          >
            <Image
              src="/qstn_logo_svg.svg"
              alt="Quest-On Logo"
              width={40}
              height={40}
              className="w-10 h-10 shrink-0"
              priority
            />
            {!isCollapsed && (
              <span className="text-xl font-bold text-sidebar-foreground ml-2">
                Quest-On
              </span>
            )}
          </Link>
        )}
      </SidebarHeader>

      <ShadcnSidebarContent>
        <nav
          className="flex-1 p-3 sm:p-4 space-y-1 overflow-y-auto"
          aria-label="주요 네비게이션"
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onItemClick}
                className={cn(
                  "flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-sidebar group-data-[collapsible=icon]:justify-center",
                  item.active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
                aria-current={item.active ? "page" : undefined}
                title={isCollapsed ? item.title : undefined}
              >
                <Icon className="w-5 h-5 shrink-0" aria-hidden="true" />
                {!isCollapsed && <span>{item.title}</span>}
              </Link>
            );
          })}
        </nav>
      </ShadcnSidebarContent>

      <SidebarFooter />
    </>
  );
}
