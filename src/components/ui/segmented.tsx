import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * The shape of shadcn/ui's tab list: a muted trough with the chosen position
 * raised on the page colour. Exported as classes as well as a component, so the
 * header's page links -- anchors, since a middle click should still open a tab
 * -- can wear the same shape as the radio groups below.
 */
export const SEGMENT = {
  list: "inline-flex h-8 w-fit items-center justify-center rounded-lg bg-muted p-[3px] text-muted-foreground",
  item: "inline-flex h-full items-center justify-center gap-1.5 rounded-md border border-transparent px-2.5 text-xs font-medium whitespace-nowrap transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&_svg]:size-4 [&_svg]:shrink-0",
  on: "bg-background text-foreground shadow-sm dark:border-input dark:bg-input/30",
  off: "hover:text-foreground",
}

export type SegmentedOption<T> = {
  value: T
  label: ReactNode
  /** Spoken and hovered name, required when the label is an icon. */
  title?: string
}

/**
 * One of a few positions. Used for the theme's three modes and a chart's
 * window, so it is a radio group rather than a tab list -- nothing here
 * switches a panel. The arrow keys move along it as they do in one, and only
 * the chosen position takes a tab stop.
 */
export function Segmented<T extends string | number>({
  value, onChange, options, label, className,
}: {
  value: T
  onChange: (value: T) => void
  options: SegmentedOption<T>[]
  label: string
  className?: string
}) {
  const at = options.findIndex((o) => o.value === value)
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(SEGMENT.list, className)}
      onKeyDown={(e) => {
        const by = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0
        if (!by) return
        e.preventDefault()
        const next = (at + by + options.length) % options.length
        onChange(options[next].value)
        ;(e.currentTarget.children[next] as HTMLElement).focus()
      }}
    >
      {options.map((o, i) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={i === at}
          aria-label={o.title}
          title={o.title}
          tabIndex={i === at ? 0 : -1}
          onClick={() => onChange(o.value)}
          className={cn(SEGMENT.item, i === at ? SEGMENT.on : SEGMENT.off)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
