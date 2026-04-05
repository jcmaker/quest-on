"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { type NavItem } from "@/components/layout/dashboard-sidebar";

interface MobileBottomNavProps {
  navItems: NavItem[];
}

export function MobileBottomNav({ navItems }: MobileBottomNavProps) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-background/95 backdrop-blur border-t border-border"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="하단 네비게이션"
    >
      <div className="flex items-stretch h-16">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-1 text-xs font-medium transition-colors",
                item.active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
              aria-current={item.active ? "page" : undefined}
            >
              <Icon
                className={cn(
                  "w-5 h-5",
                  item.active ? "text-primary" : "text-muted-foreground"
                )}
                aria-hidden="true"
              />
              <span>{item.title}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
