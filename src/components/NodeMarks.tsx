import type { CSSProperties, ReactNode } from "react"
import { useTranslation } from "react-i18next"
import {
  siAlmalinux, siAlpinelinux, siArchlinux, siCentos, siDebian, siFedora, siLinux, siOpensuse, siRedhat,
  siRockylinux, siUbuntu, type SimpleIcon,
} from "simple-icons"

import type { Node } from "@/lib/api"
import { cn } from "@/lib/utils"

// Regional indicator conversion: turns any two-letter ISO-3166-1 alpha-2 code
// (such as "US", "HK", "JP", "EU") into its Unicode flag emoji.
const COUNTRY_CODE_RE = /^[A-Z]{2}$/

export function countryEmoji(code: string): string {
  const upper = code.trim().toUpperCase()
  if (!COUNTRY_CODE_RE.test(upper)) return ""
  return String.fromCodePoint(upper.charCodeAt(0) + 127397, upper.charCodeAt(1) + 127397)
}

/** A node that has reported once knows its shape; one that never connected has nothing to show. */
export function deployed(node: Node) {
  return node.cpu_cores > 0 || node.mem_total > 0
}

/** Online, offline, or never heard from: a dot with a soft halo, pulsing subtly when online. */
export function Dot({ node, className }: { node: Node; className?: string }) {
  const { t } = useTranslation()
  const isOnline = node.online
  const isOffline = deployed(node)

  return (
    <span
      title={isOnline ? t("status.online") : isOffline ? t("status.offline") : t("status.unconnected")}
      className={cn(
        "relative inline-flex size-2.5 shrink-0 items-center justify-center align-middle",
        className,
      )}
    >
      {isOnline ? (
        <>
          <span className="absolute inset-0 rounded-full bg-success opacity-45 animate-ping motion-reduce:animate-none" />
          <span className="relative size-full rounded-full bg-success ring-2 ring-success/20" />
        </>
      ) : (
        <span
          className={cn(
            "size-full rounded-full",
            isOffline
              ? "bg-destructive ring-2 ring-destructive/20"
              : "bg-muted-foreground/40",
          )}
        />
      )}
    </span>
  )
}

export function Flag({ code, className }: { code: string; className?: string }) {
  if (!code) return <span className="text-muted-foreground">—</span>
  const emoji = countryEmoji(code)
  return (
    <span className={cn("inline-flex items-center justify-center gap-1", className)}>
      {emoji && (
        <span className="flag-emoji shrink-0 text-sm leading-none" aria-hidden="true">
          {emoji}
        </span>
      )}
    </span>
  )
}

const DISTROS: [string, SimpleIcon][] = [
  ["debian", siDebian], ["raspbian", siDebian], ["ubuntu", siUbuntu], ["alpine", siAlpinelinux],
  ["centos", siCentos], ["rocky", siRockylinux], ["almalinux", siAlmalinux], ["red hat", siRedhat],
  ["fedora", siFedora], ["arch", siArchlinux], ["opensuse", siOpensuse],
]

/** Distribution logo in its brand colour, lifted toward white on dark surfaces. */
export function OsIcon({ os, className }: { os: string; className?: string }) {
  if (!os) return null
  const name = os.toLowerCase()
  const icon = DISTROS.find(([key]) => name.includes(key))?.[1] ?? siLinux
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      style={{ "--brand": `#${icon.hex}` } as CSSProperties}
      className={cn("size-3.5 shrink-0 fill-(--brand) dark:fill-[color-mix(in_oklab,var(--brand)_60%,white)]", className)}
    >
      <path d={icon.path} />
    </svg>
  )
}

export type MeterTone = "usage" | "health"

/**
 * Semantic fill class for a percentage bar.
 * - `usage`: theme/accent below 80%, warning 80–90%, destructive >= 90%.
 * - `health`: success >= 90%, warning 60–89%, destructive < 60%.
 */
export function barTone(pct: number, tone: MeterTone = "usage"): string {
  if (tone === "health") {
    return pct >= 90 ? "bg-success" : pct >= 60 ? "bg-warning" : "bg-destructive"
  }
  return pct >= 90 ? "bg-destructive" : pct >= 80 ? "bg-warning" : ""
}

/**
 * Capsule progress meter harmonized with Arc's palette.
 * Normal usage bars adopt `color` (defaulting to `--color-chart-1`) and escalate
 * to warning/destructive only under high pressure; health bars invert the scale.
 */
export function Meter({
  pct,
  tone = "usage",
  color = "var(--color-chart-1)",
  className,
  title,
  children,
}: {
  pct: number | null
  tone?: MeterTone
  color?: string
  className?: string
  title?: string
  children?: ReactNode
}) {
  const v = pct === null ? 0 : Math.min(100, Math.max(0, pct))
  const statusClass = barTone(v, tone)
  return (
    <div title={title} className={cn("h-1.5 w-full overflow-hidden rounded-full bg-foreground/8", className)}>
      <div
        className={cn("relative h-full rounded-full transition-[width,background-color] duration-500", statusClass)}
        style={{
          width: `${v}%`,
          backgroundColor: statusClass ? undefined : color,
        }}
      >
        {children}
      </div>
    </div>
  )
}
