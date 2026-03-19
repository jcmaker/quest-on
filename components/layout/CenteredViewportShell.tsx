import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

const safeAreaPadding: CSSProperties = {
  paddingTop: "max(1.5rem, env(safe-area-inset-top))",
  paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
};

interface CenteredViewportShellProps {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

export function CenteredViewportShell({
  children,
  className,
  contentClassName,
}: CenteredViewportShellProps) {
  return (
    <div
      className={cn(
        "min-h-screen min-h-dvh px-4 py-6 sm:px-6 [@media(min-height:760px)]:grid [@media(min-height:760px)]:place-items-center",
        className
      )}
      style={safeAreaPadding}
    >
      <div className={cn("mx-auto w-full", contentClassName)}>{children}</div>
    </div>
  );
}
