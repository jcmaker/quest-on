import * as React from "react"
import { motion } from "motion/react"

import { cn } from "@/lib/utils"

interface ShineProps extends React.ComponentProps<"div"> {
  asChild?: boolean
  color?: string
  opacity?: number
  delay?: number
  duration?: number
  loop?: boolean
  loopDelay?: number
  deg?: number
  enable?: boolean
  enableOnHover?: boolean
  enableOnTap?: boolean
}

function Shine({
  className,
  children,
  color = "currentColor",
  opacity = 0.3,
  delay = 0,
  duration = 1200,
  loop = false,
  loopDelay = 0,
  deg = -15,
  enable = true,
  enableOnHover = false,
  enableOnTap = false,
  onMouseEnter,
  onMouseLeave,
  onMouseDown,
  onMouseUp,
  onTouchStart,
  onTouchEnd,
  asChild,
  ...props
}: ShineProps) {
  const [isHovered, setIsHovered] = React.useState(false)
  const [isPressed, setIsPressed] = React.useState(false)
  const [animationKey, setAnimationKey] = React.useState(0)

  void asChild

  const shouldPlay =
    enable &&
    (!enableOnHover && !enableOnTap
      ? true
      : (enableOnHover && isHovered) || (enableOnTap && isPressed))

  React.useEffect(() => {
    if (shouldPlay) {
      setAnimationKey((prev) => prev + 1)
    }
  }, [shouldPlay, delay, duration, loop, loopDelay, deg, opacity, color])

  return (
    <div
      className={cn("relative inline-flex", className)}
      onMouseEnter={(event) => {
        setIsHovered(true)
        onMouseEnter?.(event)
      }}
      onMouseLeave={(event) => {
        setIsHovered(false)
        setIsPressed(false)
        onMouseLeave?.(event)
      }}
      onMouseDown={(event) => {
        setIsPressed(true)
        onMouseDown?.(event)
      }}
      onMouseUp={(event) => {
        setIsPressed(false)
        onMouseUp?.(event)
      }}
      onTouchStart={(event) => {
        setIsPressed(true)
        onTouchStart?.(event)
      }}
      onTouchEnd={(event) => {
        setIsPressed(false)
        onTouchEnd?.(event)
      }}
      {...props}
    >
      {children}
      {shouldPlay && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-[inherit]"
        >
          <motion.span
            key={animationKey}
            className="absolute -inset-y-2 -left-1/3 w-1/3"
            style={{
              background: `linear-gradient(90deg, transparent 0%, ${color} 50%, transparent 100%)`,
              opacity,
              transform: `skewX(${deg}deg)`,
            }}
            initial={{ x: "-180%" }}
            animate={{ x: "520%" }}
            transition={{
              duration: duration / 1000,
              delay: delay / 1000,
              ease: "linear",
              repeat: loop ? Infinity : 0,
              repeatDelay: loopDelay / 1000,
            }}
          />
        </span>
      )}
    </div>
  )
}

export { Shine }
