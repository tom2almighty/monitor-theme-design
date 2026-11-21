import type { ReactNode } from "react"

import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

/** Dynamic Arc-derived categorical palette mapped from CSS theme tokens. */
export const CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
] as const

export const CHART_AXIS = {
  stroke: "currentColor",
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const

export const CHART_GRID = {
  stroke: "var(--color-border)",
  strokeDasharray: "3 3",
  vertical: false,
} as const

export const CHART_CURSOR = {
  stroke: "var(--color-border)",
  strokeWidth: 1,
  strokeDasharray: "3 3",
} as const

export const CHART_ACTIVE_DOT = {
  r: 4,
  stroke: "var(--color-card)",
  strokeWidth: 2,
} as const

export interface ChartLegendItem {
  label: string
  color: string
  value?: ReactNode
}

/** Compact inline chart legend with rounded swatch indicators and optional live readouts. */
export function ChartLegend({
  items,
  className,
}: {
  items: ChartLegendItem[]
  className?: string
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-xs", className)}>
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5 text-muted-foreground">
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: item.color }}
            aria-hidden="true"
          />
          <span>{item.label}</span>
          {item.value !== undefined && (
            <span className="tnum font-semibold text-foreground">{item.value}</span>
          )}
        </span>
      ))}
    </div>
  )
}

/** Unified Arc surface card for all overview and node-detail charts. */
export function ChartPanel({
  title,
  description,
  aside,
  toolbar,
  className,
  children,
}: {
  title: ReactNode
  description?: ReactNode
  aside?: ReactNode
  toolbar?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <Card className={cn("min-w-0 gap-3.5 p-4 sm:p-5", className)}>
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 space-y-0.5">
          <h3 className="truncate text-sm font-semibold tracking-[-0.015em] text-foreground">{title}</h3>
          {description && (
            <p className="truncate text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        {aside && <div className="shrink-0">{aside}</div>}
      </div>
      {toolbar}
      {children}
    </Card>
  )
}

export interface TooltipEntry {
  name?: string | number
  value?: unknown
  color?: string
  dataKey?: string | number
  payload?: Record<string, unknown>
}

export interface ChartTooltipProps {
  active?: boolean
  payload?: TooltipEntry[]
  label?: unknown
  labelFormatter?: (label: unknown, payload: TooltipEntry[]) => ReactNode
  valueFormatter?: (value: unknown, entry: TooltipEntry) => ReactNode
  subFormatter?: (entry: TooltipEntry) => ReactNode
  footer?: (payload: TooltipEntry[]) => ReactNode
}

/**
 * Unified glassmorphic tooltip for Recharts charts:
 * aligned tabular figures, colored swatch dots, and Arc popover chrome.
 */
export function ChartTooltip({
  active,
  payload,
  label,
  labelFormatter,
  valueFormatter,
  subFormatter,
  footer,
}: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null

  const validEntries = payload.filter((entry) => entry.value !== null && entry.value !== undefined)
  if (validEntries.length === 0) return null

  const header = labelFormatter ? labelFormatter(label, validEntries) : String(label ?? "")
  const footerNode = footer ? footer(validEntries) : null

  return (
    <div className="min-w-38 max-w-68 rounded-xl border border-border bg-popover/95 px-3 py-2.5 text-xs text-popover-foreground shadow-lg backdrop-blur-md">
      {header && (
        <div className="mb-2 truncate border-b border-border/70 pb-1.5 font-medium text-foreground">
          {header}
        </div>
      )}
      <div className="space-y-1.5">
        {validEntries.map((entry, idx) => {
          const swatch =
            entry.color ||
            (typeof entry.payload?.fill === "string" ? entry.payload.fill : undefined) ||
            CHART_COLORS[idx % CHART_COLORS.length]
          const formatted = valueFormatter ? valueFormatter(entry.value, entry) : String(entry.value)
          const sub = subFormatter ? subFormatter(entry) : null
          return (
            <div key={`${String(entry.dataKey ?? entry.name ?? idx)}-${idx}`} className="flex items-center justify-between gap-4">
              <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: swatch }}
                  aria-hidden="true"
                />
                <span className="truncate">{String(entry.name ?? entry.dataKey ?? "")}</span>
              </span>
              <span className="tnum shrink-0 text-right font-semibold text-foreground">
                {formatted}
                {sub && <span className="ml-1 font-normal text-muted-foreground">{sub}</span>}
              </span>
            </div>
          )
        })}
      </div>
      {footerNode && (
        <div className="mt-2 border-t border-border/70 pt-1.5 text-[11px] text-muted-foreground">
          {footerNode}
        </div>
      )}
    </div>
  )
}
