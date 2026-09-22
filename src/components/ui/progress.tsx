import * as React from "react"
import { cn } from "@/lib/utils"

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number | null
  max?: number
  indicatorClassName?: string
}

function Progress({
  className,
  value,
  max = 100,
  indicatorClassName,
  children,
  ...props
}: ProgressProps) {
  const pct = value === null || value === undefined ? 0 : Math.min(100, Math.max(0, (value / max) * 100))

  return (
    <div
      data-slot="progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value ?? undefined}
      className={cn("relative h-1.5 w-full overflow-hidden rounded-full bg-primary/10", className)}
      {...props}
    >
      <div
        data-slot="progress-indicator"
        className={cn("h-full rounded-full transition-[width] duration-500", indicatorClassName ?? "bg-primary")}
        style={{ width: `${pct}%` }}
      >
        {children}
      </div>
    </div>
  )
}

export { Progress }

