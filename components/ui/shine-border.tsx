"use client";

import { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ShineBorderProps {
  borderRadius?: number;
  borderWidth?: number;
  duration?: number;
  color?: string | string[];
  className?: string;
  children: ReactNode;
}

export function ShineBorder({
  borderRadius = 8,
  borderWidth = 1,
  duration = 14,
  color = "#000000",
  className,
  children,
}: ShineBorderProps) {
  return (
    <div
      style={
        {
          "--border-radius": `${borderRadius}px`,
          "--border-width": `${borderWidth}px`,
          "--duration": `${duration}s`,
          "--mask-linear-gradient":
            "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          "--background-radial-gradient": `radial-gradient(transparent, transparent, ${Array.isArray(color) ? color.join(",") : color}, transparent, transparent)`,
        } as CSSProperties
      }
      className={cn(
        "relative inline-flex",
        "before:absolute before:inset-0 before:h-full before:w-full",
        "before:rounded-[--border-radius] before:p-[--border-width]",
        "before:content-[''] before:will-change-[background-position]",
        "before:[-webkit-mask-composite:xor] before:[mask-composite:exclude]",
        "before:[background-image:var(--background-radial-gradient)]",
        "before:[background-size:300%_300%]",
        "before:[mask:var(--mask-linear-gradient)]",
        "before:animate-[shine-pulse_var(--duration)_infinite_linear]",
        className,
      )}
    >
      {children}
    </div>
  );
}
