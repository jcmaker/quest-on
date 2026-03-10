"use client";

import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

export function MainContentWrapper({ children }: { children: React.ReactNode }) {
  const { open, isMobile, openMobile } = useSidebar();
  const isOpen = isMobile ? openMobile : open;

  return (
    <div
      className={cn(
        "flex-1 min-h-0 overflow-hidden transition-all duration-75 ease-out",
        !isOpen && "flex items-center justify-center"
      )}
    >
      <div className="h-full w-full">{children}</div>
    </div>
  );
}
