import { api } from "@/lib/api"
import { readPref } from "@/lib/prefs"

// The history a chart draws, and the one place it is fetched from. In the main
// chunk rather than the chart's, so a request can be on its way while the chart
// itself is still loading.

export type Point = {
  ts: number
  cpu: number
  mem_used: number
  disk_used: number
  net_rx: number
  net_tx: number
}

// `latency` is the bucket's median round trip, null when every probe in it timed
// out. `band` is the range its answers spanned, absent when they spanned nothing.
// `loss` is the percentage that timed out, absent when none did.
export type PingPoint = {
  task_id: number
  ts: number
  latency: number | null
  band?: [number, number]
  loss?: number
}

/** Probe names by id, sent alongside the samples they label. */
export type Probes = Record<string, string>

/**
 * Proportion of the whole window each probe lost, by id, absent for probes that
 * lost nothing. Sent because it cannot be derived here: every bucket's `loss` is
 * already a percentage of that bucket, so the sample counts it was divided by are
 * unavailable. Averaging them would weight a bucket holding one sample equally
 * with one holding twelve, and the window's first and last buckets are partial
 * regardless of what the probe does.
 */
export type Loss = Record<string, number>

export type History = { metrics: Point[]; ping: PingPoint[]; probes: Probes; loss?: Loss }

export type Series = "metrics" | "ping"

// The windows a reader can ask for, on the chart page and in the expanded row
// alike. A week is the widest an anonymous visitor may have: the hub narrows a
// wider request without saying so, and a month labelled as one and drawn as a
// week would read as a quiet week.
export const RANGES = [
  { hours: 1, label: "1 小时" },
  { hours: 6, label: "6 小时" },
  { hours: 24, label: "24 小时" },
  { hours: 168, label: "7 天" },
]

export const inRanges = (hours: number) => RANGES.some((r) => r.hours === hours)

// The expanded row's latency window to begin with: a day, the widest in which
// every ping remains on the chart.
export const LATENCY_HOURS = 24

/** The window the reader last picked in an expanded row, while it is still one of the tabs. */
export function latencyWindow(): number {
  const picked = readPref<number>("latency-hours", LATENCY_HOURS)
  return inRanges(picked) ? picked : LATENCY_HOURS
}

// The page's measure, in CSS pixels: App lays everything out at max-w-7xl (1280px).
const PAGE_PX = 1280

/**
 * How many points to ask for: what the plot can draw, in device pixels, which is
 * the unit the line is drawn in.
 *
 * Bounded by the page's measure rather than the viewport. On a 1920-wide retina
 * screen the viewport is 3840 device pixels across and the plot at most 1400, so
 * the hub would bucket, compute medians for and send nearly three times what is
 * drawn, and the reader would wait for it. Density above two device pixels per
 * CSS pixel is likewise not asked for; a 1.5px line does not show it.
 *
 * Approximate on purpose: the hub only thins further, and the viewport is known
 * before layout, so nothing waits on a measurement. A rotation keeps whatever it
 * fetched with.
 */
function points(): number {
  return Math.round(Math.min(globalThis.innerWidth, PAGE_PX) * Math.min(globalThis.devicePixelRatio || 1, 2))
}

// Windows fetched in the last minute, by node, width and half. A row closed and
// reopened, a range picked and picked back, a chart tab left and returned to
// all draw at once instead of asking the hub again; a minute is short enough
// that the newest bucket is at most one behind. Held as the promise rather than
// the answer, so two callers asking at once -- the expanded row starting the
// request while the chart's chunk loads, then the chart itself -- make one.
const TTL = 60_000
const cache = new Map<string, { at: number; promise: Promise<History> }>()

export function fetchHistory(id: number, hours: number, series: Series): Promise<History> {
  const key = `${id}/${hours}/${series}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL) return hit.promise
  const promise = api<History>(`/nodes/${id}/metrics?hours=${hours}&points=${points()}&series=${series}`)
  cache.set(key, { at: Date.now(), promise })
  // A refusal is not kept: the hub answers a fifth concurrent window with a 503,
  // and the retry must reach it.
  promise.catch(() => {
    if (cache.get(key)?.promise === promise) cache.delete(key)
  })
  return promise
}
