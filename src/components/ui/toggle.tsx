import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

/**
 * A switch that stays where it was put: shadcn/ui's outline toggle, filled in
 * the primary colour when on so that on and off read at a glance. The kit's own
 * accent fill is one step off the card it sits on, too little for a filter a
 * reader has to know is applied.
 */
export function Toggle({
  pressed, onPressedChange, className, ...props
}: Omit<ComponentProps<"button">, "onClick"> & { pressed: boolean; onPressedChange: (pressed: boolean) => void }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      data-state={pressed ? "on" : "off"}
      onClick={() => onPressedChange(!pressed)}
      className={cn(
        "inline-flex h-7 items-center justify-center gap-1.5 rounded-md border border-input bg-transparent px-2 text-xs font-medium whitespace-nowrap transition-[color,box-shadow] outline-none hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary/90",
        className,
      )}
      {...props}
    />
  )
}
