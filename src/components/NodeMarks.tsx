import type { CSSProperties, ReactNode } from "react"
import {
  siAlmalinux, siAlpinelinux, siArchlinux, siCentos, siDebian, siFedora, siLinux, siOpensuse, siRedhat,
  siRockylinux, siUbuntu, type SimpleIcon,
} from "simple-icons"

import type { Node } from "@/lib/api"
import { cn } from "@/lib/utils"

// The small marks a node is drawn with wherever it appears: the table row, the
// row it expands into, the chart page's picker and its heading. Held apart from
// the table so the expanded row can import them without importing the table
// that renders it.

// Emitted as files and fetched on first use, so a page carries only the flags its
// nodes are in rather than all 271. vite.config.ts keeps the small ones from being
// inlined into the bundle as data URLs.
const FLAGS = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>("/node_modules/flag-icons/flags/4x3/*.svg", {
      query: "?url",
      import: "default",
      eager: true,
    }),
  ).map(([path, url]) => [path.match(/([\w-]+)\.svg$/)![1], url]),
)

/** A node that has reported once knows its shape; one that never connected has nothing to show. */
export function deployed(node: Node) {
  return node.cpu_cores > 0 || node.mem_total > 0
}

/** Online, offline, or never heard from: a dot with a soft halo, with subtle pulse when online. */
export function Dot({ node, className }: { node: Node; className?: string }) {
  const isOnline = node.online
  const isOffline = deployed(node)

  return (
    <span
      title={isOnline ? "在线" : isOffline ? "离线" : "未接入"}
      className={cn(
        "relative inline-flex size-2.5 shrink-0 items-center justify-center align-middle",
        className,
      )}
    >
      {isOnline ? (
        <>
          <span className="absolute inset-0 rounded-full bg-emerald-500 opacity-50 animate-ping" />
          <span className="relative size-full rounded-full bg-emerald-500 shadow-[0_0_0_1.5px_rgba(16,185,129,0.25)]" />
        </>
      ) : (
        <span
          className={cn(
            "size-full rounded-full",
            isOffline
              ? "bg-red-500 shadow-[0_0_0_1.5px_rgba(239,68,68,0.25)]"
              : "bg-muted-foreground/40",
          )}
        />
      )}
    </span>
  )
}

export function Flag({ code, className, showCode = true }: { code: string; className?: string; showCode?: boolean }) {
  if (!code) return <span className="text-muted-foreground">—</span>
  const src = FLAGS[code.toLowerCase()]
  return (
    <span className={cn("inline-flex items-center justify-center gap-1", className)}>
      {src && <img src={src} alt="" className="h-3 w-4 shrink-0 rounded-[2px] object-cover ring-1 ring-foreground/10" />}
      {showCode && <span className="@max-3xl:hidden uppercase font-mono text-[11px] leading-none">{code}</span>}
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
  return pct >= 90 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500"
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

// The widest form each formatter writes, in `ch`, measured with tabular figures.
// M is the widest unit letter, so each is measured in megabytes rather than the
// gigabytes a reading is more often in: `compact` spans "0B" to "1023M", that is
// 2.2 to 5.49; `bytes` reaches 7.19 at "1023 MB"; `rate` 10.09 at "1023.0 MB/s".
// Rounded up, since other UI fonts are a few percent wider than the one these
// were measured in.
export const SLOT = { compact: 5.6, bytes: 7.3, rate: 10.2 }

/**
 * A figure that changes on every push, held in a slot wide enough for the widest
 * form it can take, so a node moving from 19K/s to 8.19K/s leaves the rest of the
 * line where it was. Right-aligned, so the unit keeps its place and the digits
 * grow towards the arrow instead.
 *
 * `ch` is the width of a digit under the tabular figures this selects, so a slot
 * follows whatever size it is drawn at, down to the 10px the table uses on a
 * phone. The width travels as a custom property rather than `min-width` itself,
 * which is what allows a caller to drop the reservation where the column is too
 * narrow to hold it: an inline style would outrank the class that does so.
 */
export function Num({ ch, className, children }: { ch: number; className?: string; children: ReactNode }) {
  return (
    <span
      className={cn("tnum inline-block min-w-(--slot) text-right", className)}
      style={{ "--slot": `${ch}ch` } as CSSProperties}
    >
      {children}
    </span>
  )
}
