import { useCallback, useEffect, useId, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { ArrowDown, ArrowUp, Cpu, HardDrive, MemoryStick, Network } from "lucide-react"
import {
  Area,
  AreaChart,
  Brush,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import {
  CHART_ACTIVE_DOT,
  CHART_AXIS,
  CHART_COLORS,
  CHART_CURSOR,
  CHART_GRID,
  ChartLegend,
  ChartPanel,
  ChartTooltip,
} from "@/components/ChartKit"
import { deployed, Dot, Flag, Meter, OsIcon } from "@/components/NodeMarks"
import { NodeOverview } from "@/components/RowDetails"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Segmented } from "@/components/ui/segmented"
import { Skeleton } from "@/components/ui/skeleton"
import { Toggle } from "@/components/ui/toggle"
import type { Node } from "@/lib/api"
import {
  axisBytes,
  axisTop,
  bytes,
  clockFor,
  compact,
  cpuName,
  despike,
  downsampleSeries,
  ewma,
  FOREVER,
  monthUsage,
  osName,
  pair,
  percent,
  quarters,
  rate,
  timeTicks,
  uptime,
  virtName,
} from "@/lib/format"
import { fetchHistory, inRanges, LATENCY_HOURS, RANGES, type History, type Point, type Series } from "@/lib/history"
import { knownPing, recordPing } from "@/lib/pings"
import { usePref } from "@/lib/prefs"
import { cn } from "@/lib/utils"

const SERIES = {
  dot: false as const,
  strokeLinejoin: "round" as const,
  strokeLinecap: "round" as const,
  isAnimationActive: false,
}
const METRIC_PLOT_POINTS = 160
const METRIC_KEYS = ["cpu", "mem_used", "disk_used", "net_rx", "net_tx"] as const
const Y_WIDTH = 64

type Fetched = { key: string; hours: number; data: History; failed: string }
const EMPTY: History = { metrics: [], ping: [], probes: {} }

function useHistory(id: number, hours: number, series: Series) {
  const { t } = useTranslation()
  const [state, setState] = useState<Fetched | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    const key = `${id}/${series}`
    fetchHistory(id, hours, series)
      .then((data) => { if (active) setState({ key, hours, data, failed: "" }) })
      .catch((e: Error) => {
        if (active) setState({ key, hours, data: EMPTY, failed: e.message || t("common.networkError") })
      })
    return () => { active = false }
  }, [id, hours, series, attempt, t])

  const own = state !== null && state.key === `${id}/${series}` ? state : null
  const fresh = own !== null && own.hours === hours
  let data: History | null = null
  let failed = ""
  if (own) {
    if (fresh) {
      data = own.data
      failed = own.failed
    } else if (!own.failed) {
      data = own.data
    }
  }
  return { data, failed, loading: !fresh, retry: () => setAttempt((n) => n + 1) }
}

function Failed({ message, retry }: { message: string; retry: () => void }) {
  const { t } = useTranslation()
  return (
    <p className="py-8 text-center text-sm text-destructive" role="alert">
      {t("charts.loadFailed", { message })}
      <button onClick={retry} className="ml-2 font-medium underline underline-offset-4 cursor-pointer">
        {t("common.retry")}
      </button>
    </p>
  )
}

function bucketStep(points: { ts: number }[]): number {
  let step = Infinity
  for (let i = 1; i < points.length; i++) step = Math.min(step, points[i].ts - points[i - 1].ts)
  return step
}

function despikeWindow(points: { ts: number }[]): number {
  return Math.min(15, Math.max(3, Math.round(420 / bucketStep(points)) | 1))
}

function ewmaTau(hours: number, points: { ts: number }[]): number {
  return Math.max((hours * 3600) / 144, 3 * bucketStep(points))
}

function timeAxis(rows: { ts: number }[], hours: number, locale: string, from = 0, to = rows.length - 1) {
  return {
    dataKey: "ts",
    type: "number" as const,
    domain: ["dataMin", "dataMax"] as const,
    ticks: rows.length ? timeTicks(rows[from].ts, rows[to].ts) : undefined,
    tickFormatter: clockFor(hours, locale),
    minTickGap: hours > 24 ? 72 : 44,
    ...CHART_AXIS,
  }
}

/**
 * Full-width probe latency panel with Smokeping jitter bands, despike/EWMA filters,
 * enriched per-probe pills (latest/avg ms + loss%), and Arc-styled Brush zoom.
 */
export function Latency({
  id, hours: fixed, title, className, onKnown,
}: {
  id: number
  hours?: number
  title?: string
  className?: string
  onKnown?: (has: boolean) => void
}) {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage ?? i18n.language
  const [picked, setPicked] = usePref<number>("latency-hours", LATENCY_HOURS)
  const hours = fixed ?? (inRanges(picked) ? picked : LATENCY_HOURS)
  const { data, failed, loading, retry } = useHistory(id, hours, "ping")
  const [hiddenProbes, setHiddenProbes] = useState<number[]>([])
  const [despiked, setDespiked] = usePref<boolean>("despike", false)
  const [smoothed, setSmoothed] = usePref<boolean>("ewma", false)
  const [zoom, setZoom] = useState<{ of: History; range: [number, number] } | null>(null)

  const rangeOptions = useMemo(
    () => RANGES.map((r) => ({ value: r.hours, label: t(`charts.ranges.${String(r.hours) as "1" | "6" | "24" | "168"}`) })),
    [t],
  )

  const pingSeries = useMemo(
    () =>
      [...new Set((data?.ping ?? []).map((p) => p.task_id))]
        .map((taskId) => {
          const points = (data?.ping ?? []).filter((p) => p.task_id === taskId)
          const loss = data?.loss?.[taskId] ?? 0
          const valid = points.map((p) => p.latency).filter((v): v is number => v !== null)
          const avg = valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null
          const latest = valid.length > 0 ? valid[valid.length - 1] : null
          return {
            id: taskId,
            name: data?.probes?.[taskId] ?? t("charts.probeFallback", { id: taskId }),
            points,
            loss,
            avg,
            latest,
          }
        })
        .filter((s) => s.points.length > 0),
    [data, t],
  )

  const shownProbes = useMemo(
    () => pingSeries.filter((s) => !hiddenProbes.includes(s.id)),
    [pingSeries, hiddenProbes],
  )
  const color = (taskId: number) => CHART_COLORS[pingSeries.findIndex((p) => p.id === taskId) % CHART_COLORS.length]

  const pingRows = useMemo(() => {
    const rows = new Map<
      number,
      { ts: number } & Record<string, number | [number, number] | null>
    >()
    for (const s of pingSeries) {
      const windowSize = despikeWindow(s.points)
      const raw = s.points.map((p) => p.latency)
      const line = despike(raw, windowSize)
      const times = s.points.map((p) => p.ts)
      const tau = ewmaTau(hours, s.points)
      const averaged = ewma(raw, times, tau)
      const both = ewma(line, times, tau)
      const lo = despike(s.points.map((p) => p.band?.[0] ?? p.latency), windowSize)
      const hi = despike(s.points.map((p) => p.band?.[1] ?? p.latency), windowSize)
      s.points.forEach((p, i) => {
        const row = rows.get(p.ts) ?? { ts: p.ts * 1_000 }
        row[`t${s.id}`] = p.latency
        row[`s${s.id}`] = line[i]
        row[`e${s.id}`] = averaged[i]
        row[`f${s.id}`] = both[i]
        row[`l${s.id}`] = p.loss ?? 0
        row[`b${s.id}`] = p.band ?? (p.latency === null ? null : [p.latency, p.latency])
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
  useEffect(() => {
    if (!data || loading) return
    onKnown?.(failed ? true : recordPing(id, has, hours))
  }, [data, loading, failed, id, has, hours, onKnown])

  if (!data) return <Card className="p-4 sm:p-5"><Skeleton className={cn("w-full rounded-lg", className)} /></Card>
  if (failed) return <Card className="p-4 sm:p-5"><Failed message={failed} retry={retry} /></Card>
  if (!has && knownPing(id) !== true) return null

  const last = pingRows.length - 1
  const [from, to] = zoom?.of === data ? zoom.range.map((i) => Math.min(i, last)) : [0, last]
  const visiblePingCount = Math.max(0, to - from + 1)
  const pingStrokeWidth = visiblePingCount > 420 ? 1.15 : visiblePingCount > 200 ? 1.35 : 1.65
  const drawn = (taskId: number) => `${despiked ? (smoothed ? "f" : "s") : smoothed ? "e" : "t"}${taskId}`

  return (
    <ChartPanel
      title={title ?? t("charts.latencyTitle")}
      aside={
        <div className="flex flex-wrap items-center gap-1.5">
          {fixed === undefined && (
            <Segmented
              value={hours}
              onChange={setPicked}
              options={rangeOptions}
              label={t("charts.rangeLabel")}
              className="scrollbar-none h-7 max-w-full overflow-x-auto max-sm:[&>button]:px-2"
            />
          )}
          <Toggle
            pressed={despiked}
            onPressedChange={setDespiked}
            title={t("charts.despikeTitle")}
          >
            {t("charts.despike")}
          </Toggle>
          <Toggle
            pressed={smoothed}
            onPressedChange={setSmoothed}
            title={t("charts.smoothTitle")}
          >
            {t("charts.smooth")}
          </Toggle>
        </div>
      }
      toolbar={
        has ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {pingSeries.map((s) => {
              const shown = !hiddenProbes.includes(s.id)
              const probeColor = color(s.id)
              const lossText = s.loss > 0 && s.loss < 0.1 ? "<0.1" : s.loss.toFixed(1)
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() =>
                    setHiddenProbes((h) => (shown ? [...h, s.id] : h.filter((item) => item !== s.id)))
                  }
                  aria-pressed={shown}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer",
                    shown
                      ? "border-border bg-muted/50 text-foreground hover:bg-muted"
                      : "border-dashed border-border/60 bg-transparent text-muted-foreground opacity-45 hover:opacity-75",
                  )}
                >
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: probeColor }}
                    aria-hidden="true"
                  />
                  <span className="font-medium">{s.name}</span>
                  {s.avg !== null && (
                    <span className="tnum font-semibold text-foreground">
                      {Math.round(s.avg)}ms
                    </span>
                  )}
                  <span
                    className={cn(
                      "tnum text-[11px]",
                      s.loss >= 5
                        ? "font-semibold text-destructive"
                        : s.loss > 0
                          ? "font-medium text-warning"
                          : "text-muted-foreground",
                    )}
                  >
                    {lossText}%
                  </span>
                </button>
              )
            })}
          </div>
        ) : null
      }
    >
      {!has ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t("charts.noPing")}</p>
      ) : (
        <div className={cn("w-full min-w-0 text-muted-foreground transition-opacity", className, loading && "opacity-50")}>
          {shownProbes.length === 0 ? (
            <p className="py-8 text-center text-sm">{t("charts.noProbeSelected")}</p>
          ) : (
            <ResponsiveContainer debounce={140}>
              <ComposedChart data={pingRows} margin={{ top: 6, right: 8, left: -6, bottom: 0 }}>
                <CartesianGrid {...CHART_GRID} />
                <XAxis {...timeAxis(pingRows, hours, lang, from, to)} />
                <YAxis unit="ms" width={54} domain={["auto", "auto"]} {...CHART_AXIS} />
                <Tooltip
                  cursor={CHART_CURSOR}
                  content={
                    <ChartTooltip
                      labelFormatter={(ts) => new Date(Number(ts)).toLocaleString(lang)}
                      valueFormatter={(v) => `${Math.round(Number(v))} ms`}
                      subFormatter={(entry) => {
                        const loss = Number(entry.payload?.[`l${String(entry.dataKey).slice(1)}`] ?? 0)
                        return loss > 0 ? `· ${t("charts.loss", { loss })}` : null
                      }}
                    />
                  }
                />
                {shownProbes.length === 1 &&
                  shownProbes.map((s) => (
                    <Area
                      key={`band${s.id}`}
                      dataKey={`${despiked ? "c" : "b"}${s.id}`}
                      stroke="none"
                      fill={color(s.id)}
                      fillOpacity={0.14}
                      isAnimationActive={false}
                      tooltipType="none"
                      legendType="none"
                      connectNulls
                    />
                  ))}
                {smoothed && shownProbes.length === 1 &&
                  shownProbes.map((s) => (
                    <Line
                      key={`raw${s.id}`}
                      dataKey={`${despiked ? "s" : "t"}${s.id}`}
                      stroke={color(s.id)}
                      strokeOpacity={0.32}
                      strokeWidth={1}
                      dot={false}
                      isAnimationActive={false}
                      tooltipType="none"
                      legendType="none"
                      connectNulls
                    />
                  ))}
                {shownProbes.map((s) => {
                  const stroke = color(s.id)
                  return (
                    <Line
                      key={s.id}
                      dataKey={drawn(s.id)}
                      name={s.name}
                      stroke={stroke}
                      strokeWidth={pingStrokeWidth}
                      {...SERIES}
                      activeDot={{ ...CHART_ACTIVE_DOT, fill: stroke }}
                      connectNulls
                    />
                  )
                })}
                <Brush
                  dataKey="ts"
                  height={20}
                  travellerWidth={8}
                  tickFormatter={clockFor(hours, lang)}
                  fill="var(--color-muted)"
                  stroke="var(--color-border)"
                  onChange={(r) => setZoom({ of: data, range: [r.startIndex ?? 0, r.endIndex ?? last] })}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      )}
    </ChartPanel>
  )
}

function LiveStatCard({
  label,
  value,
  sub,
  icon: Icon,
  accentColor,
  bar,
}: {
  label: string
  value: React.ReactNode
  sub: React.ReactNode
  icon: React.ComponentType<{ className?: string }>
  accentColor: string
  bar: React.ReactNode
}) {
  return (
    <Card className="min-w-0 justify-between gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <span
            className="size-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: accentColor }}
            aria-hidden="true"
          />
          <span className="truncate">{label}</span>
        </span>
        <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-muted/80 text-muted-foreground">
          <Icon className="size-3.5" />
        </span>
      </div>
      <div className="space-y-2.5">
        <div className="tnum truncate text-2xl font-semibold tracking-[-0.03em] leading-none text-foreground">
          {value}
        </div>
        {bar}
        <div className="tnum truncate text-xs text-muted-foreground">{sub}</div>
      </div>
    </Card>
  )
}

/**
 * Single-server telemetry studio (`/node/{id}`):
 * 1. Compact identity header + global time-window selector
 * 2. 4 aligned live telemetry cards anchored to chart colors
 * 3. Full-width latency probe panel
 * 4. Unified 2x2 historical area charts (CPU, Memory, Network, Disk)
 * 5. Non-redundant hardware, runtime, traffic & billing specifications
 */
export function NodeDetail({ node }: { node: Node }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage ?? i18n.language
  const gradPrefix = useId().replace(/:/g, "")
  const [hours, setHours] = usePref<number>("detail-hours", 6)
  const safeHours = inRanges(hours) ? hours : 6
  const [learned, setLearned] = useState<{ id: number; has: boolean } | null>(null)
  const known = learned !== null && learned.id === node.id ? learned.has : knownPing(node.id)
  const learn = useCallback((has: boolean) => setLearned({ id: node.id, has }), [node.id])

  const { data, failed, loading, retry } = useHistory(node.id, safeHours, "metrics")

  const rangeOptions = useMemo(
    () => RANGES.map((r) => ({ value: r.hours, label: t(`charts.ranges.${String(r.hours) as "1" | "6" | "24" | "168"}`) })),
    [t],
  )

  const m = node.online ? node.metrics : null
  const away = node.last_seen ? Date.now() / 1000 - node.last_seen : 0
  const usedTraffic = monthUsage(node)

  const metricRows = useMemo(
    () => (data?.metrics ?? []).map((row) => ({ ...row, ts: row.ts * 1_000 })),
    [data],
  )

  // Downsample dense multi-hour/multi-day series for crisp, non-overlapping strokes
  // while keeping 1h raw and computing peaks/averages from the full raw data.
  const plotMetrics = useMemo(
    () => downsampleSeries(metricRows, METRIC_PLOT_POINTS, METRIC_KEYS),
    [metricRows],
  )
  const metricStrokeWidth = safeHours <= 1 ? 1.75 : safeHours <= 6 ? 1.5 : 1.35

  const summary = useMemo(() => {
    const max = (pick: (row: Point) => number) =>
      metricRows.reduce((hi, row) => Math.max(hi, pick(row)), 0)
    const cpuPeak = max((row) => row.cpu)
    const cpuAvg =
      metricRows.length > 0
        ? metricRows.reduce((sum, row) => sum + row.cpu, 0) / metricRows.length
        : 0
    const rxPeak = max((row) => row.net_rx)
    const txPeak = max((row) => row.net_tx)
    return {
      cpuPeak,
      cpuAvg,
      rxPeak,
      txPeak,
      cpuTop: axisTop(cpuPeak, 4, 10, 100),
      rateTop: axisTop(Math.max(rxPeak, txPeak), 1024, 1024),
    }
  }, [metricRows])

  const label = (ts: unknown) => new Date(Number(ts)).toLocaleString(lang)

  const cpuPct = m ? m.cpu : null
  const memPct = m ? percent(m.mem_used, m.mem_total) : null
  const diskPct = m ? percent(m.disk_used, m.disk_total) : null
  const netQuotaPct = node.traffic_limit > 0 ? percent(usedTraffic, node.traffic_limit) : null

  return (
    <div className="@container min-w-0 space-y-5">
      {/* 1. Identity Header + Global Time Window Selector */}
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Dot node={node} className="size-2.5" />
            {node.country && <Flag code={node.country} className="text-base" />}
            <h1 className="min-w-0 truncate text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              {node.name}
            </h1>
            <Badge variant={node.online ? "success" : deployed(node) ? "destructive" : "secondary"}>
              {node.online
                ? `${t("status.online")}${m ? ` · ${uptime(m.uptime, lang)}` : ""}`
                : deployed(node)
                  ? `${t("status.offline")}${away >= 60 ? ` · ${uptime(away, lang)}` : ""}`
                  : t("status.unconnected")}
            </Badge>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <OsIcon os={node.os} className="size-3.5" />
              <span>{osName(node.os) || "—"}</span>
            </span>
            {(node.arch || virtName(node.virt)) && (
              <>
                <span className="opacity-45">·</span>
                <span>{[node.arch, virtName(node.virt)].filter(Boolean).join(" / ")}</span>
              </>
            )}
            {node.group && (
              <>
                <span className="opacity-45">·</span>
                <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-normal">
                  {node.group}
                </Badge>
              </>
            )}
            {node.agent_version && (
              <Badge variant="outline" className="px-1.5 py-0 font-mono text-[10px] font-normal text-muted-foreground">
                v{node.agent_version}
              </Badge>
            )}
          </div>
        </div>

        <Segmented
          value={safeHours}
          onChange={setHours}
          options={rangeOptions}
          label={t("charts.rangeLabel")}
          className="scrollbar-none max-w-full shrink-0 overflow-x-auto"
        />
      </div>

      {node.remark && (
        <Card className="p-3.5 text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap wrap-break-word">
          {node.remark}
        </Card>
      )}

      {/* 2. Four Aligned Live Metric Cards */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <LiveStatCard
          label={t("details.resources.cpu")}
          value={cpuPct !== null ? `${cpuPct.toFixed(1)}%` : "—"}
          sub={
            m
              ? `${node.cpu_cores}C · ${t("details.resources.load")} ${m.load.map((v) => v.toFixed(2)).join(" / ")}`
              : node.cpu_name
                ? `${cpuName(node.cpu_name)} × ${node.cpu_cores}`
                : t("details.system.cores", { count: node.cpu_cores })
          }
          icon={Cpu}
          accentColor={CHART_COLORS[0]}
          bar={<Meter pct={cpuPct} color={CHART_COLORS[0]} className="h-1.5" />}
        />

        <LiveStatCard
          label={t("details.resources.mem")}
          value={memPct !== null ? `${memPct.toFixed(1)}%` : "—"}
          sub={m ? pair(m.mem_used, m.mem_total) : bytes(node.mem_total)}
          icon={MemoryStick}
          accentColor={CHART_COLORS[1]}
          bar={<Meter pct={memPct} color={CHART_COLORS[1]} className="h-1.5" />}
        />

        <LiveStatCard
          label={t("details.resources.disk")}
          value={diskPct !== null ? `${diskPct.toFixed(1)}%` : "—"}
          sub={m ? pair(m.disk_used, m.disk_total) : bytes(node.disk_total)}
          icon={HardDrive}
          accentColor={CHART_COLORS[4]}
          bar={<Meter pct={diskPct} color={CHART_COLORS[4]} className="h-1.5" />}
        />

        <LiveStatCard
          label={t("charts.netTitle")}
          value={
            m ? (
              <span className="inline-flex items-baseline gap-2.5 text-lg font-semibold leading-none sm:text-xl">
                <span className="inline-flex items-center gap-0.5">
                  <ArrowDown className="size-3.5 shrink-0" style={{ color: CHART_COLORS[1] }} />
                  {compact(m.net_rx)}/s
                </span>
                <span className="inline-flex items-center gap-0.5">
                  <ArrowUp className="size-3.5 shrink-0" style={{ color: CHART_COLORS[2] }} />
                  {compact(m.net_tx)}/s
                </span>
              </span>
            ) : (
              "—"
            )
          }
          sub={`${t("details.traffic.period")} ${compact(usedTraffic)} / ${node.traffic_limit > 0 ? compact(node.traffic_limit) : FOREVER}`}
          icon={Network}
          accentColor={CHART_COLORS[2]}
          bar={
            netQuotaPct !== null ? (
              <Meter pct={netQuotaPct} color={CHART_COLORS[2]} className="h-1.5" />
            ) : (
              <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-foreground/8">
                {m && m.net_rx + m.net_tx > 0 && (
                  <>
                    <div
                      className="h-full transition-[width] duration-500"
                      style={{
                        width: `${Math.max(8, Math.min(92, (m.net_rx / (m.net_rx + m.net_tx)) * 100))}%`,
                        backgroundColor: CHART_COLORS[1],
                      }}
                    />
                    <div
                      className="h-full flex-1 transition-[width] duration-500"
                      style={{ backgroundColor: CHART_COLORS[2] }}
                    />
                  </>
                )}
              </div>
            )
          }
        />
      </div>

      {/* 3. Full-Width Latency Intelligence Panel */}
      {known !== false && (
        <Latency
          id={node.id}
          hours={safeHours}
          title={t("charts.latencyTitle")}
          className="h-68"
          onKnown={learn}
        />
      )}

      {/* 4. Unified 2x2 Historical Area Telemetry Grid */}
      {!data ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-72 rounded-xl" />
          ))}
        </div>
      ) : failed ? (
        <Card className="p-4">
          <Failed message={failed} retry={retry} />
        </Card>
      ) : data.metrics.length === 0 ? (
        <Card className="py-12 text-center text-sm text-muted-foreground">{t("charts.noHistory")}</Card>
      ) : (
        <div className={cn("grid grid-cols-1 gap-4 transition-opacity xl:grid-cols-2", loading && "opacity-50")}>
          {/* CPU History */}
          <ChartPanel
            title={t("charts.cpuTitle")}
            aside={
              <div className="tnum flex items-center gap-2.5 text-xs text-muted-foreground">
                <span>{t("charts.avg", { value: `${summary.cpuAvg.toFixed(1)}%` })}</span>
                <span className="font-medium text-foreground">
                  {t("charts.cpuPeak", { peak: summary.cpuPeak.toFixed(1) })}
                </span>
              </div>
            }
          >
            <div className="h-56 w-full min-w-0 text-muted-foreground">
              <ResponsiveContainer debounce={140}>
                <AreaChart data={plotMetrics} margin={{ top: 6, right: 6, left: -8, bottom: 0 }}>
                  <defs>
                    <linearGradient id={`${gradPrefix}-cpu`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS[0]} stopOpacity={0.22} />
                      <stop offset="100%" stopColor={CHART_COLORS[0]} stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis {...timeAxis(plotMetrics, safeHours, lang)} />
                  <YAxis domain={[0, summary.cpuTop]} ticks={quarters(summary.cpuTop)} unit="%" width={48} {...CHART_AXIS} />
                  <Tooltip
                    cursor={CHART_CURSOR}
                    content={
                      <ChartTooltip
                        labelFormatter={label}
                        valueFormatter={(v) => `${Number(v).toFixed(1)}%`}
                      />
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="cpu"
                    name={t("charts.tabs.cpu")}
                    stroke={CHART_COLORS[0]}
                    strokeWidth={metricStrokeWidth}
                    fill={`url(#${gradPrefix}-cpu)`}
                    activeDot={{ ...CHART_ACTIVE_DOT, fill: CHART_COLORS[0] }}
                    {...SERIES}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </ChartPanel>

          {/* Memory History */}
          <ChartPanel
            title={t("charts.memTitle")}
            aside={
              <span className="tnum text-xs text-muted-foreground">
                {m ? `${pair(m.mem_used, m.mem_total)} (${memPct?.toFixed(1)}%)` : bytes(node.mem_total)}
              </span>
            }
          >
            <div className="h-56 w-full min-w-0 text-muted-foreground">
              <ResponsiveContainer debounce={140}>
                <AreaChart data={plotMetrics} margin={{ top: 6, right: 6, left: -4, bottom: 0 }}>
                  <defs>
                    <linearGradient id={`${gradPrefix}-mem`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS[1]} stopOpacity={0.22} />
                      <stop offset="100%" stopColor={CHART_COLORS[1]} stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis {...timeAxis(plotMetrics, safeHours, lang)} />
                  <YAxis domain={[0, node.mem_total]} ticks={quarters(node.mem_total)} tickFormatter={axisBytes} width={Y_WIDTH} {...CHART_AXIS} />
                  <Tooltip
                    cursor={CHART_CURSOR}
                    content={
                      <ChartTooltip
                        labelFormatter={label}
                        valueFormatter={(v) => bytes(Number(v))}
                        subFormatter={(entry) =>
                          node.mem_total > 0 ? `(${percent(Number(entry.value), node.mem_total).toFixed(1)}%)` : null
                        }
                      />
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="mem_used"
                    name={t("charts.tabs.mem")}
                    stroke={CHART_COLORS[1]}
                    strokeWidth={metricStrokeWidth}
                    fill={`url(#${gradPrefix}-mem)`}
                    activeDot={{ ...CHART_ACTIVE_DOT, fill: CHART_COLORS[1] }}
                    {...SERIES}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </ChartPanel>

          {/* Network Throughput History (Dual Gradient AreaChart) */}
          <ChartPanel
            title={t("charts.netTitle")}
            aside={
              <ChartLegend
                items={[
                  { label: t("charts.downlink"), color: CHART_COLORS[1], value: rate(summary.rxPeak) },
                  { label: t("charts.uplink"), color: CHART_COLORS[2], value: rate(summary.txPeak) },
                ]}
              />
            }
          >
            <div className="h-56 w-full min-w-0 text-muted-foreground">
              <ResponsiveContainer debounce={140}>
                <AreaChart data={plotMetrics} margin={{ top: 6, right: 6, left: -4, bottom: 0 }}>
                  <defs>
                    <linearGradient id={`${gradPrefix}-net-rx`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS[1]} stopOpacity={0.20} />
                      <stop offset="100%" stopColor={CHART_COLORS[1]} stopOpacity={0.01} />
                    </linearGradient>
                    <linearGradient id={`${gradPrefix}-net-tx`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS[2]} stopOpacity={0.16} />
                      <stop offset="100%" stopColor={CHART_COLORS[2]} stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis {...timeAxis(plotMetrics, safeHours, lang)} />
                  <YAxis domain={[0, summary.rateTop]} ticks={quarters(summary.rateTop)} tickFormatter={axisBytes} unit="/s" width={Y_WIDTH} {...CHART_AXIS} />
                  <Tooltip
                    cursor={CHART_CURSOR}
                    content={
                      <ChartTooltip
                        labelFormatter={label}
                        valueFormatter={(v) => rate(Number(v))}
                      />
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="net_rx"
                    name={t("charts.downlink")}
                    stroke={CHART_COLORS[1]}
                    strokeWidth={metricStrokeWidth}
                    fill={`url(#${gradPrefix}-net-rx)`}
                    activeDot={{ ...CHART_ACTIVE_DOT, fill: CHART_COLORS[1] }}
                    {...SERIES}
                  />
                  <Area
                    type="monotone"
                    dataKey="net_tx"
                    name={t("charts.uplink")}
                    stroke={CHART_COLORS[2]}
                    strokeWidth={metricStrokeWidth}
                    fill={`url(#${gradPrefix}-net-tx)`}
                    activeDot={{ ...CHART_ACTIVE_DOT, fill: CHART_COLORS[2] }}
                    {...SERIES}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </ChartPanel>

          {/* Disk History */}
          <ChartPanel
            title={t("charts.diskTitle")}
            aside={
              <span className="tnum text-xs text-muted-foreground">
                {m ? `${pair(m.disk_used, m.disk_total)} (${diskPct?.toFixed(1)}%)` : bytes(node.disk_total)}
              </span>
            }
          >
            <div className="h-56 w-full min-w-0 text-muted-foreground">
              <ResponsiveContainer debounce={140}>
                <AreaChart data={plotMetrics} margin={{ top: 6, right: 6, left: -4, bottom: 0 }}>
                  <defs>
                    <linearGradient id={`${gradPrefix}-disk`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS[4]} stopOpacity={0.22} />
                      <stop offset="100%" stopColor={CHART_COLORS[4]} stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis {...timeAxis(plotMetrics, safeHours, lang)} />
                  <YAxis domain={[0, node.disk_total]} ticks={quarters(node.disk_total)} tickFormatter={axisBytes} width={Y_WIDTH} {...CHART_AXIS} />
                  <Tooltip
                    cursor={CHART_CURSOR}
                    content={
                      <ChartTooltip
                        labelFormatter={label}
                        valueFormatter={(v) => bytes(Number(v))}
                        subFormatter={(entry) =>
                          node.disk_total > 0 ? `(${percent(Number(entry.value), node.disk_total).toFixed(1)}%)` : null
                        }
                      />
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="disk_used"
                    name={t("charts.tabs.disk")}
                    stroke={CHART_COLORS[4]}
                    strokeWidth={metricStrokeWidth}
                    fill={`url(#${gradPrefix}-disk)`}
                    activeDot={{ ...CHART_ACTIVE_DOT, fill: CHART_COLORS[4] }}
                    {...SERIES}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </ChartPanel>
        </div>
      )}

      {/* 5. Detailed Hardware, Runtime & Billing Specifications */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-[-0.015em] text-foreground">
          {t("charts.specsSectionTitle")}
        </h2>
        <NodeOverview node={node} />
      </section>
    </div>
  )
}
