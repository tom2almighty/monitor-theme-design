import * as React from "react"
import { cn } from "@/lib/utils"

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info"
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      data-slot="badge"
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors focus:outline-hidden",
        variant === "default" && "border-transparent bg-primary text-primary-foreground shadow-xs",
        variant === "secondary" && "border-transparent bg-secondary text-secondary-foreground",
        variant === "destructive" && "border-destructive/25 bg-destructive/15 text-destructive",
        variant === "outline" && "border-border text-foreground",
        variant === "success" && "border-success/25 bg-success/15 text-success",
        variant === "warning" && "border-warning/25 bg-warning/15 text-warning",
        variant === "info" && "border-info/25 bg-info/15 text-info",
        className,
      )}
      {...props}
    />
  )
}

export { Badge }
