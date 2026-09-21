import { useEffect, useMemo, useState, type ReactNode } from "react"
import {
  Area, AreaChart, Brush, CartesianGrid, ComposedChart, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts"

import { deployed, Dot, Flag } from "@/components/NodeMarks"
import { Skeleton } from "@/components/ui/skeleton"
import { api, type Node } from "@/lib/api"
import {
  axisBytes, axisTop, bytes, clockFor, despike, ewma, quarters, rate, timeTicks, uptime,
} from "@/lib/format"
import { usePref } from "@/lib/prefs"
import { cn } from "@/lib/utils"

type Point = {
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
type PingPoint = {
  task_id: number
  ts: number
  latency: number | null
  band?: [number, number]
  loss?: number
}
/** Probe names by id, sent alongside the samples they label. */
type Probes = Record<string, string>
/**
 * Proportion of the whole window each probe lost, by id, absent for probes that
 * lost nothing. Sent because it cannot be derived here: every bucket's `loss` is
 * already a percentage of that bucket, so the sample counts it was divided by are
 * unavailable. Averaging them would weight a bucket holding one sample equally
 * with one holding twelve, and the window's first and last buckets are partial
 * regardless of what the probe does.
 */
type Loss = Record<string, number>

// The windows a reader can ask for, on the chart page and in the expanded row
// alike. A week is the widest an anonymous visitor may have: the hub narrows a
// wider request without saying so, and a month labelled as one and drawn as a
// week would read as a quiet week.
const RANGES = [
  { hours: 1, label: "1 小时" },
  { hours: 6, label: "6 小时" },
  { hours: 24, label: "24 小时" },
  { hours: 168, label: "7 天" },
]

// The expanded row's latency window to begin with: a day, the widest in which
// every ping remains on the chart.
const LATENCY_HOURS = 24

const AXIS = { stroke: "currentColor", fontSize: 11, tickLine: false, axisLine: false }

// No grow-in animation: it would spend 1.5 s drawing a line across the panel on
// every range change, on a page meant to be read at a glance, and on the latency
// chart across seven hundred points per probe.
const SERIES = { dot: false as const, strokeWidth: 1.5, isAnimationActive: false }

// One width for every stacked panel's value axis. Sized to their own labels --
// 40px under "100%", 68px under "172 MB" -- the four plot areas would be offset by
// 28px, placing a CPU spike and the network spike that caused it at different x.
const Y_WIDTH = 68

// Hue alone separates the probes. A dash pattern would not: once every ping in a
// day is on the chart its period is shorter than the jitter, and dotted and dashed
// lines both read as texture.
const PALETTE = [1, 2, 3, 4, 5].map((i) => `var(--color-chart-${i})`)

// recharts paints its tooltip white unless told otherwise, which is a white box
// on the dark theme.
const TIP = {
  fontSize: 12,
  background: "var(--color-popover)",
  color: "var(--color-popover-foreground)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius)",
}

function Panel({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-medium text-muted-foreground">{title}</h4>
      <div className="h-40 w-full text-muted-foreground">{children}</div>
    </div>
  )
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
      }`}
    >
      {children}
    </button>
  )
}

/**
 * A switch that stays where it was put, in the tabs' colours so that on and off
 * read at a glance; the probe chips fade instead, since theirs is a question of
 * visibility rather than of a filter being applied.
 */
function Toggle({ on, onClick, title, children }: { on: boolean; onClick: () => void; title: string; children: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      title={title}
      className={`rounded-md border px-2 py-1 text-xs transition-colors ${
        on ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
      }`}
    >
      {children}
    </button>
  )
}

type History = { metrics: Point[]; ping: PingPoint[]; probes: Probes; loss?: Loss }

/**
 * One window of history.
 *
 * A refused request is kept apart from an empty window. The hub builds at most
 * four windows at once, since each holds the connection the agents report
 * through, and answers a fifth with a 503; drawn as an empty chart, that answer
 * would misdirect the reader, so callers show it with a retry.
 */
function useHistory(id: number, hours: number, series: "metrics" | "ping") {
  const [data, setData] = useState<History | null>(null)
  const [failed, setFailed] = useState("")
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    // The charts must not continue drawing the old window while the new one is in
    // flight.
    // oxlint-disable-next-line react/set-state-in-effect
    setData(null)
    // oxlint-disable-next-line react/set-state-in-effect
    setFailed("")
    // What this screen can resolve, in device pixels, which is the unit the line
    // is drawn in: a 1280-wide retina panel has 2560 of them for a day of minutes.
    // Read here rather than from a ref, since the hub only thins further, an
    // approximate figure suffices, and the viewport is known before layout. A
    // rotation keeps whatever it fetched with.
    //
    // Only the half on screen is requested; the other accounted for a third to two
    // thirds of every response and was never drawn.
    const points = Math.round(globalThis.innerWidth * (globalThis.devicePixelRatio || 1))
    api<History>(`/nodes/${id}/metrics?hours=${hours}&points=${points}&series=${series}`)
      .then((next) => { if (active) setData(next) })
      .catch((e: Error) => {
        // `|| "..."` as in App.tsx: HTTP/2 dropped statusText, so a bodiless
        // failure from a proxy arrives as the empty string and renders as no
        // error.
        if (active) { setFailed(e.message || "网络错误"); setData({ metrics: [], ping: [], probes: {} }) }
      })
    return () => { active = false }
  }, [id, hours, series, attempt])

  return { data, failed, retry: () => setAttempt((n) => n + 1) }
}

function Failed({ message, retry }: { message: string; retry: () => void }) {
  return (
    <p className="py-8 text-center text-sm text-destructive" role="alert">
      读取历史数据失败：{message}
      <button onClick={retry} className="ml-2 text-primary hover:underline">重试</button>
    </p>
  )
}

/**
 * The bucket interval of one probe's series, in seconds: the smallest gap
 * between its samples. A longer gap is the node being offline.
 */
function bucketStep(points: { ts: number }[]): number {
  let step = Infinity
  for (let i = 1; i < points.length; i++) step = Math.min(step, points[i].ts - points[i - 1].ts)
  return step
}

/**
 * How many samples of a probe's own series make up seven minutes of neighbours.
 *
 * The window the filter judges against has to be a duration, not a count: the
 * hub buckets a window to the `points` asked for above, so the same day arrives
 * as one-minute buckets on a desktop and two-minute ones on a phone, and a fixed
 * count would clip a five-minute stall on the first while keeping it on the
 * second. Odd, so the window has a middle, and bounded so a sparse probe still
 * has neighbours and a dense one does not pay for a wide sort.
 */
function despikeWindow(points: { ts: number }[]): number {
  return Math.min(15, Math.max(3, Math.round(420 / bucketStep(points)) | 1))
}

/**
 * The average's time constant, in the seconds the samples are stamped in: a
 * 144th of the window, ten minutes on a day. Long enough to settle a line that
 * jitters from bucket to bucket, short enough that an hour's slowdown still
 * reads as an hour. Floored at three buckets, since on a short window a 144th
 * is less than one bucket and the average would follow the line exactly.
 */
function ewmaTau(hours: number, points: { ts: number }[]): number {
  return Math.max((hours * 3600) / 144, 3 * bucketStep(points))
}

// A real time axis rather than the category axis recharts defaults to: on a
// category axis ticks are selected by index, so a period the agent was offline for
// collapses to nothing.
function timeAxis(rows: { ts: number }[], hours: number, from = 0, to = rows.length - 1) {
  return {
    dataKey: "ts",
    type: "number" as const,
    domain: ["dataMin", "dataMax"] as const,
    // Explicit, or recharts places them at 05:14 and 10:22. Any that still collide
    // are dropped by `minTickGap`.
    ticks: rows.length ? timeTicks(rows[from].ts, rows[to].ts) : undefined,
    tickFormatter: clockFor(hours),
    minTickGap: hours > 24 ? 72 : 40,
    ...AXIS,
  }
}

// Whether a node has shown a probe in any window this session. Two things hang
// on it. The placeholder for the next open is drawn the height of what will
// replace it -- none for a section about to render nothing, a chart's for one
// about to render a chart -- rather than every row opening 280px tall and half
// of them snapping shut. And a node that has shown a probe keeps its section
// through an empty window, or picking a short one would take the tabs away
// with the chart. A node not yet opened takes the answer of the last one, since
// a hub either has ping tasks or has not.
const pinged = new Map<number, boolean>()
let lastPinged = true

/**
 * Every probe's round trip to one node, as the chart page and the table's
 * expanded row both draw it: a heading, the window and the two filters on one
 * line, the legend on the next, sized to its chips, and the plot with its brush
 * below at the height `className` gives it. The window is the caller's when it
 * passes `hours`, as the chart page does with the one its own tabs pick, and
 * otherwise the reader's, picked here and kept across rows and visits.
 *
 * Renders nothing at all for a node no probe pings, heading included: a section
 * that says only that it is empty costs the height of one that is not.
 */
export function Latency({
  id, hours: fixed, title, className,
}: { id: number; hours?: number; title?: ReactNode; className?: string }) {
  // The reader's window, when the caller sets none. Read back only if it is one
  // of the tabs, so a value stored by another build lands on the default rather
  // than on no tab.
  const [picked, setPicked] = usePref<number>("latency-hours", LATENCY_HOURS)
  const hours = fixed ?? (RANGES.some((r) => r.hours === picked) ? picked : LATENCY_HOURS)
  const { data, failed, retry } = useHistory(id, hours, "ping")
  // Probes switched off. Hiding a slow one is what makes the fast ones readable,
  // as the axis rescales to what remains.
  const [hiddenProbes, setHiddenProbes] = useState<number[]>([])
  // Spikes pulled back to their neighbourhood. Off by default, since it is the
  // raw round trips that answer whether the node stalled at 03:00; on, a single
  // 2 s bucket stops setting the axis for the day around it.
  const [despiked, setDespiked] = usePref<boolean>("despike", false)
  // The exponentially weighted average in place of the line: the level a jittery
  // route sits at, rather than the jitter. Off by default for the same reason.
  const [smoothed, setSmoothed] = usePref<boolean>("ewma", false)
  // Where the brush has been dragged, so the axis reticks for the visible span.
  // Tagged with the window it was dragged on, so a new window starts unzoomed
  // without an effect to clear it.
  const [zoom, setZoom] = useState<{ of: History; range: [number, number] } | null>(null)

  // One series per probe that reported, labelled from the names the samples
  // arrived with. Memoised, as are the two below: the parent re-renders every few
  // seconds as live metrics arrive, and rebuilding the chart's data array on those
  // renders would reset the brush.
  const pingSeries = useMemo(
    () =>
      [...new Set((data?.ping ?? []).map((p) => p.task_id))]
        .map((id) => {
          // Timeouts are retained: dropping them would draw a probe losing half
          // its packets as an unbroken line, and one that never answered not at
          // all.
          const points = (data?.ping ?? []).filter((p) => p.task_id === id)
          // Taken from the hub rather than summed from the buckets above, each of
          // which is already a percentage of its own bucket, so averaging them
          // would report one lost round in thirteen as 50%.
          const loss = data?.loss?.[id] ?? 0
          return { id, name: data?.probes?.[id] ?? `探测 ${id}`, points, loss }
        })
        .filter((s) => s.points.length > 0),
    [data],
  )

  const shownProbes = useMemo(
    () => pingSeries.filter((s) => !hiddenProbes.includes(s.id)),
    [pingSeries, hiddenProbes],
  )
  // Keyed on the full list, so a line keeps its colour when others are hidden.
  const color = (id: number) => PALETTE[pingSeries.findIndex((p) => p.id === id) % PALETTE.length]

  // The hub stamps every sample with its bucket rather than the second the probe
  // finished, so probes reporting at the bucket's rate share rows instead of each
  // contributing its own: a day of four probes is 717 rows rather than 2,868. A
  // slower probe leaves gaps in its own column, which is what `connectNulls`
  // addresses.
  //
  // Every probe, and every version of every sample, are held here whether or not
  // they are on screen: recharts resets the brush when the data array changes
  // identity, and re-reads a controlled selection only when the index props
  // change, which they do not. Hiding a probe, clipping the spikes or averaging
  // the line therefore selects a `dataKey` rather than rebuilding the array.
  const pingRows = useMemo(() => {
    const rows = new Map<
      number,
      { ts: number } & Record<string, number | [number, number] | null>
    >()
    for (const s of pingSeries) {
      const windowSize = despikeWindow(s.points)
      const raw = s.points.map((p) => p.latency)
      const line = despike(raw, windowSize)
      // Averaged after clipping as well as before it: with both on, a 2 s bucket
      // must not lift the average for the ten minutes after it, which is the
      // spike the reader turned clipping on to be rid of.
      const times = s.points.map((p) => p.ts)
      const tau = ewmaTau(hours, s.points)
      const averaged = ewma(raw, times, tau)
      const both = ewma(line, times, tau)
      // The band spans the same outliers as the line, and with one probe on
      // screen it is what the axis is fitted to, so it is clipped alongside it
      // rather than left to pull the axis back open.
      const lo = despike(s.points.map((p) => p.band?.[0] ?? p.latency), windowSize)
      const hi = despike(s.points.map((p) => p.band?.[1] ?? p.latency), windowSize)
      s.points.forEach((p, i) => {
        const row = rows.get(p.ts) ?? { ts: p.ts * 1_000 }
        row[`t${s.id}`] = p.latency
        row[`s${s.id}`] = line[i]
        row[`e${s.id}`] = averaged[i]
        row[`f${s.id}`] = both[i]
        row[`l${s.id}`] = p.loss ?? 0
        // A bucket with a single answer carries no band and spans only that answer. Left null, `connectNulls`
        // would bridge the hours between the few buckets that have one: 9 of
        // 1,438 in a day, the widest gap 268 minutes, drawn as one large wedge.
        row[`b${s.id}`] = p.band ?? (p.latency === null ? null : [p.latency, p.latency])
        // Taken as the span of three filtered series rather than a pair: the two
        // edges are filtered independently, so a bucket that answered slightly
        // faster than usual can trip the low edge alone and come back above the
        // high one -- [180, 178] against a line of 176, drawn backwards with the
        // line outside it.
        const [low, high] = [lo[i], hi[i]]
        row[`c${s.id}`] =
          low === null || high === null
            ? null
            : [Math.min(low, high, line[i] ?? low), Math.max(low, high, line[i] ?? high)]
        rows.set(p.ts, row)
      })
    }
    return [...rows.values()].sort((a, b) => a.ts - b.ts)
  }, [pingSeries, hours])

  const has = pingSeries.length > 0
  // Read before the effect below records this window, so it says what was known
  // going in: a node whose first window is empty is one no probe pings.
  const known = has || pinged.get(id) === true
  useEffect(() => {
    if (data && !failed) {
      pinged.set(id, known)
      lastPinged = known
    }
  }, [data, failed, id, known])

  if (!data) {
    return (pinged.get(id) ?? lastPinged) ? (
      <div className="border-t pt-3"><Skeleton className={cn("w-full", className)} /></div>
    ) : null
  }
  if (failed) return <div className="border-t pt-3"><Failed message={failed} retry={retry} /></div>
  if (!known) return null
  const last = pingRows.length - 1
  const [from, to] = zoom?.of === data ? zoom.range.map((i) => Math.min(i, last)) : [0, last]
  // The line drawn for a probe: its round trips, or those clipped, averaged, or
  // both.
  const drawn = (id: number) => `${despiked ? (smoothed ? "f" : "s") : smoothed ? "e" : "t"}${id}`

  return (
    <section className="space-y-2 border-t pt-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {title && <h4 className="text-xs font-medium text-muted-foreground">{title}</h4>}
        {fixed === undefined && (
          <div className="flex flex-wrap gap-0.5">
            {RANGES.map((r) => (
              <Tab key={r.hours} active={hours === r.hours} onClick={() => setPicked(r.hours)}>
                {r.label}
              </Tab>
            ))}
          </div>
        )}
        <div className="ml-auto flex gap-1">
          <Toggle
            on={despiked}
            onClick={() => setDespiked(!despiked)}
            title="把孤立的异常值换成邻近若干桶的中位数，持续的变化保持原样"
          >
            削峰
          </Toggle>
          <Toggle
            on={smoothed}
            onClick={() => setSmoothed(!smoothed)}
            title="指数加权移动平均（EWMA）：抹平逐桶的抖动，只看线路稳定在什么水平；单条探测时原始曲线淡淡地垫在下面"
          >
            平滑
          </Toggle>
        </div>
      </div>

      {has && (
        <div className="flex flex-wrap items-center gap-1.5">
          {pingSeries.map((s) => {
            const shown = !hiddenProbes.includes(s.id)
            return (
              <button
                key={s.id}
                onClick={() =>
                  setHiddenProbes((h) => (shown ? [...h, s.id] : h.filter((id) => id !== s.id)))
                }
                aria-pressed={shown}
                className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-opacity ${
                  shown ? "" : "opacity-40"
                }`}
              >
                {/* The swatch carries the same colour as the line. */}
                <svg width="14" height="6" className="shrink-0" aria-hidden>
                  <line x1="0" y1="3" x2="14" y2="3" stroke={color(s.id)} strokeWidth="2" />
                </svg>
                {s.name}
                {/* Always shown, since the line is only what answered and a probe
                    dropping half its packets draws like a healthy one. Anything
                    under a tenth is written as such rather than rounded to 0.0. */}
                <span className="tabular-nums opacity-60">
                  {s.loss > 0 && s.loss < 0.1 ? "<0.1" : s.loss.toFixed(1)}%
                </span>
              </button>
            )
          })}
        </div>
      )}

      {!has ? (
        <p className="py-6 text-center text-sm text-muted-foreground">这段时间没有延迟数据</p>
      ) : (
        <div className={cn("w-full text-muted-foreground", className)}>
          {shownProbes.length === 0 ? (
            <p className="py-8 text-center text-sm">没有选中任何探测</p>
          ) : (
            <ResponsiveContainer>
              <ComposedChart data={pingRows}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis {...timeAxis(pingRows, hours, from, to)} />
                {/* Not anchored at zero: these lines live in a narrow band far from
                    it, and zero flattens every wobble. */}
                <YAxis unit="ms" width={52} domain={["auto", "auto"]} {...AXIS} />
                <Tooltip
                  labelFormatter={(ts) => new Date(Number(ts)).toLocaleString("zh-CN")}
                  // The line is drawn from what answered, so without this a bucket
                  // that lost most of its packets reads as normal. `dataKey` is
                  // `t7`; the loss sits at `l7`.
                  //
                  // Rounded because a clipped sample carries the median of an even
                  // window, which falls between two of the whole milliseconds the
                  // hub stores, and an averaged one anything at all.
                  formatter={(v, name, item) => {
                    const loss = Number(item?.payload?.[`l${String(item.dataKey).slice(1)}`] ?? 0)
                    return [`${Math.round(Number(v))} ms${loss > 0 ? ` · 丢 ${loss}%` : ""}`, name]
                  }}
                  contentStyle={TIP}
                />
                {/* Behind the line, the range that bucket's answers spanned --
                    Smokeping's "smoke". At the day window a bucket moves 63 ms at
                    the 90th percentile against the 25 ms the trend moves, so a line
                    alone draws the smaller of the two.

                    Only with one probe on screen: rendered for four, the bands
                    overlap into a fog and their extremes drag the axis from 165-385
                    out to 140-420. */}
                {shownProbes.length === 1 &&
                  shownProbes.map((s) => (
                    <Area
                      key={`band${s.id}`}
                      dataKey={`${despiked ? "c" : "b"}${s.id}`}
                      stroke="none"
                      fill={color(s.id)}
                      fillOpacity={0.16}
                      isAnimationActive={false}
                      tooltipType="none"
                      legendType="none"
                      connectNulls
                    />
                  ))}
                {/* Under the average, faint, the line it was taken from: the
                    average is the trend, and this is what the trend is made of.
                    One probe only, as with the band. */}
                {smoothed && shownProbes.length === 1 &&
                  shownProbes.map((s) => (
                    <Line
                      key={`raw${s.id}`}
                      dataKey={`${despiked ? "s" : "t"}${s.id}`}
                      stroke={color(s.id)}
                      strokeOpacity={0.35}
                      strokeWidth={1}
                      dot={false}
                      isAnimationActive={false}
                      tooltipType="none"
                      legendType="none"
                      connectNulls
                    />
                  ))}
                {shownProbes.map((s) => (
                  <Line
                    key={s.id}
                    dataKey={drawn(s.id)}
                    name={s.name}
                    stroke={color(s.id)}
                    {...SERIES}
                    connectNulls
                  />
                ))}
                {/* Drag either handle to zoom into a stretch of the trend. */}
                <Brush
                  dataKey="ts"
                  height={22}
                  travellerWidth={8}
                  tickFormatter={clockFor(hours)}
                  // A prop rather than a class: recharts writes fill="#fff" onto the
                  // rect itself, which a class cannot override.
                  fill="var(--color-muted)"
                  stroke="var(--color-muted-foreground)"
                  onChange={(r) => setZoom({ of: data, range: [r.startIndex ?? 0, r.endIndex ?? last] })}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      )}
    </section>
  )
}

export function NodeDetail({ node }: { node: Node }) {
  const [hours, setHours] = useState(6)
  const { data, failed, retry } = useHistory(node.id, hours, "metrics")

  const m = node.metrics
  const away = node.last_seen ? Date.now() / 1000 - node.last_seen : 0

  // The hub answers in seconds; the time axis requires milliseconds.
  const metricRows = useMemo(
    () => (data?.metrics ?? []).map((m) => ({ ...m, ts: m.ts * 1_000 })),
    [data],
  )

  // Axis tops for the two panels with no capacity to measure against. CPU and a
  // transfer rate do not express fullness: against a fixed 0-100, a machine
  // sitting at 0.4% draws as a line along the panel's floor. Memory and disk keep
  // their totals as tops, where fullness is the entire question.
  const tops = useMemo(() => {
    const max = (pick: (m: Point) => number) =>
      metricRows.reduce((hi, m) => Math.max(hi, pick(m)), 0)
    return {
      // A floor of 4%, or a machine that never exceeds 0.4% would get an axis of
      // 0-0.4 and render every scheduler blip as a peak. Capped at 100.
      cpu: axisTop(max((m) => m.cpu), 4, 10, 100),
      // Base 1024, so the steps are round in the unit `axisBytes` prints.
      rate: axisTop(max((m) => Math.max(m.net_rx, m.net_tx)), 1024, 1024),
    }
  }, [metricRows])

  return (
    <div className="space-y-4">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <Dot node={node} />
        <h2 className="truncate text-lg font-semibold">{node.name}</h2>
        <Flag code={node.country} className="text-sm" />
        <span className="tnum text-xs text-muted-foreground">
          {node.online ? `在线 ${m ? uptime(m.uptime) : ""}` : deployed(node) ? `离线 ${away >= 60 ? uptime(away) : ""}` : "未接入"}
        </span>
        {node.agent_version && <span className="text-xs text-muted-foreground">agent {node.agent_version}</span>}
      </div>

      {node.remark && (
        <p className="rounded-md bg-muted px-3 py-2 text-sm whitespace-pre-wrap">{node.remark}</p>
      )}

      <div className="flex flex-wrap gap-1 border-t pt-4">
        {RANGES.map((r) => (
          <Tab key={r.hours} active={hours === r.hours} onClick={() => setHours(r.hours)}>
            {r.label}
          </Tab>
        ))}
      </div>

      {!data ? (
        <Skeleton className="h-40 w-full" />
      ) : failed ? (
        <Failed message={failed} retry={retry} />
      ) : data.metrics.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">这段时间没有历史数据</p>
      ) : (
        <div className="space-y-5">
          <Panel title="CPU">
            <ResponsiveContainer>
              <AreaChart data={metricRows}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis {...timeAxis(metricRows, hours)} />
                <YAxis domain={[0, tops.cpu]} ticks={quarters(tops.cpu)} unit="%" width={Y_WIDTH} {...AXIS} />
                <Tooltip
                  labelFormatter={(ts) => new Date(Number(ts)).toLocaleString("zh-CN")}
                  formatter={(v) => [`${Number(v).toFixed(1)}%`, "CPU"]}
                  contentStyle={TIP}
                />
                <Area dataKey="cpu" stroke="var(--color-chart-1)" fill="var(--color-chart-1)" fillOpacity={0.15} {...SERIES} />
              </AreaChart>
            </ResponsiveContainer>
          </Panel>

          {/* The axis top is the machine's memory, so the line's height is the
              fraction in use whatever range is picked. Tracking the window's
              own maximum, which is what an area chart does by default, puts
              127 MB of a 457 MB box at the top of the panel. The size is in the
              title because the axis top is claiming it. */}
          <Panel title={`内存 · ${bytes(node.mem_total)}`}>
            <ResponsiveContainer>
              <AreaChart data={metricRows}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis {...timeAxis(metricRows, hours)} />
                <YAxis domain={[0, node.mem_total]} ticks={quarters(node.mem_total)} tickFormatter={axisBytes} width={Y_WIDTH} {...AXIS} />
                <Tooltip
                  labelFormatter={(ts) => new Date(Number(ts)).toLocaleString("zh-CN")}
                  formatter={(v) => bytes(Number(v))}
                  contentStyle={TIP}
                />
                <Area dataKey="mem_used" name="内存" stroke="var(--color-chart-4)" fill="var(--color-chart-4)" fillOpacity={0.15} {...SERIES} />
              </AreaChart>
            </ResponsiveContainer>
          </Panel>

          {/* A rate has no total to be a fraction of, so this one climbs the
              ladder like CPU rather than pinning to a capacity. */}
          <Panel
            title={
              <>
                网络速率
                <span className="ml-3 text-chart-2">● 下行</span>
                <span className="ml-2 text-chart-3">● 上行</span>
              </>
            }
          >
            <ResponsiveContainer>
              <LineChart data={metricRows}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis {...timeAxis(metricRows, hours)} />
                <YAxis domain={[0, tops.rate]} ticks={quarters(tops.rate)} tickFormatter={axisBytes} unit="/s" width={Y_WIDTH} {...AXIS} />
                <Tooltip
                  labelFormatter={(ts) => new Date(Number(ts)).toLocaleString("zh-CN")}
                  formatter={(v) => rate(Number(v))}
                  contentStyle={TIP}
                />
                <Line dataKey="net_rx" name="下行" stroke="var(--color-chart-2)" {...SERIES} />
                <Line dataKey="net_tx" name="上行" stroke="var(--color-chart-3)" {...SERIES} />
              </LineChart>
            </ResponsiveContainer>
          </Panel>

          {/* The disk it is filling, for the same reason as memory: a node
              using 2.7% of its disk draws along the top of the panel when the
              axis tracks the window's own maximum. */}
          <Panel title={`硬盘 · ${bytes(node.disk_total)}`}>
            <ResponsiveContainer>
              <AreaChart data={metricRows}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis {...timeAxis(metricRows, hours)} />
                <YAxis domain={[0, node.disk_total]} ticks={quarters(node.disk_total)} tickFormatter={axisBytes} width={Y_WIDTH} {...AXIS} />
                <Tooltip
                  labelFormatter={(ts) => new Date(Number(ts)).toLocaleString("zh-CN")}
                  formatter={(v) => bytes(Number(v))}
                  contentStyle={TIP}
                />
                <Area dataKey="disk_used" name="硬盘" stroke="var(--color-chart-5)" fill="var(--color-chart-5)" fillOpacity={0.15} {...SERIES} />
              </AreaChart>
            </ResponsiveContainer>
          </Panel>
        </div>
      )}

      {/* The round trips for the window the tabs above pick, so the page that
          has the node's history has all of it; the hub thins a month to what
          the screen can show. Nothing for a node no probe pings. */}
      <Latency id={node.id} hours={hours} title="网络延迟" className="h-56" />
    </div>
  )
}
