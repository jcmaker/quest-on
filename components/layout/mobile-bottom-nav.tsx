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
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="하단 네비게이션"
    >
      <div className="flex h-[70px] items-stretch">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                item.active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
              aria-current={item.active ? "page" : undefined}
            >
              <span
                className={cn(
                  "absolute left-1/2 top-0 h-1 w-9 -translate-x-1/2 rounded-full bg-transparent",
                  item.active && "bg-primary"
                )}
              />
              <Icon
                className={cn(
                  "h-5 w-5",
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
