import type { CSSProperties, ReactNode } from "react"
import { useTranslation } from "react-i18next"
import {
  siAlmalinux, siAlpinelinux, siArchlinux, siCentos, siDebian, siFedora, siLinux, siOpensuse, siRedhat,
  siRockylinux, siUbuntu, type SimpleIcon,
} from "simple-icons"

import type { Node } from "@/lib/api"
import { cn } from "@/lib/utils"

// The small marks a node is drawn with wherever it appears: the sidebar rows,
// the detail page's heading and the overview tiles.

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

/** Online, offline, or never heard from: a dot with a soft halo, with subtle pulse when online. */
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
          <span className="absolute inset-0 rounded-full bg-success opacity-50 animate-ping motion-reduce:animate-none" />
          <span className="relative size-full rounded-full bg-success ring-2 ring-success/25" />
        </>
      ) : (
        <span
          className={cn(
            "size-full rounded-full",
            isOffline
              ? "bg-destructive ring-2 ring-destructive/25"
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

// Matched against the whole release name, since "Red Hat Enterprise Linux" and
// "Raspbian GNU/Linux" do not lead with one word to key on. The distributions a
// VPS ships with; the rest take the penguin. Each logo costs 1-6 KB of entry
// bundle, the Raspberry Pi alone 12 KB, so the list stays at what hosts offer.
const DISTROS: [string, SimpleIcon][] = [
  ["debian", siDebian], ["raspbian", siDebian], ["ubuntu", siUbuntu], ["alpine", siAlpinelinux],
  ["centos", siCentos], ["rocky", siRockylinux], ["almalinux", siAlmalinux], ["red hat", siRedhat],
  ["fedora", siFedora], ["arch", siArchlinux], ["opensuse", siOpensuse],
]

/**
 * The distribution's logo in its brand colour. Mixed toward white on the dark
 * theme, where AlmaLinux's black and CentOS's navy would otherwise vanish.
 */
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

/**
 * The fill for a percentage: green until 80, amber to 90, red beyond. One ladder
 * for every meter on the page, so a row's CPU and the expanded row's traffic
 * answer "how full" in the same colours.
 */
export function barTone(pct: number): string {
  return pct >= 90 ? "bg-destructive" : pct >= 80 ? "bg-warning" : "bg-success"
}

/**
 * A capsule meter in shadcn's progress shape: a track one step off the surface,
 * the fill in the status colour, the figure written beside it rather than on
 * it. `children` are drawn over the fill, positioned against it.
 */
export function Meter({
  pct, className, title, children,
}: { pct: number | null; className?: string; title?: string; children?: ReactNode }) {
  const v = pct === null ? 0 : Math.min(100, Math.max(0, pct))
  return (
    <div title={title} className={cn("h-1.5 w-full overflow-hidden rounded-full bg-primary/10", className)}>
      <div className={cn("relative h-full rounded-full transition-[width] duration-500", barTone(v))} style={{ width: `${v}%` }}>
        {children}
      </div>
    </div>
  )
}
