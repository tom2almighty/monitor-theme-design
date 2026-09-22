import * as React from "react"
import { cn } from "@/lib/utils"

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline" | "success" | "warning"
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      data-slot="badge"
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors focus:outline-hidden",
        variant === "default" && "border-transparent bg-primary text-primary-foreground shadow-xs",
        variant === "secondary" && "border-transparent bg-secondary text-secondary-foreground",
        variant === "destructive" && "border-destructive/20 bg-destructive/15 text-destructive",
        variant === "outline" && "border-border text-foreground",
        variant === "success" && "border-emerald-500/20 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
        variant === "warning" && "border-amber-500/20 bg-amber-500/15 text-amber-600 dark:text-amber-400",
        className,
      )}
      {...props}
    />
  )
}

export { Badge }

