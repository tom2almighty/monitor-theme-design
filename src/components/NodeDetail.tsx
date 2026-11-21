import { useCallback, useEffect, useId, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { ArrowDown, ArrowUp, Cpu, HardDrive, MemoryStick, Network } from "lucide-react"
import {
  Area, AreaChart, Brush, CartesianGrid, ComposedChart, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts"

import { deployed, Dot, Flag, Meter, OsIcon } from "@/components/NodeMarks"
import { NodeOverview } from "@/components/RowDetails"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Segmented } from "@/components/ui/segmented"
import { Skeleton } from "@/components/ui/skeleton"
import { Toggle } from "@/components/ui/toggle"
import type { Node } from "@/lib/api"
import {
  axisBytes, axisTop, bytes, clockFor, compact, cpuName, despike, ewma, FOREVER, monthUsage, osName, pair,
  percent, quarters, rate, timeTicks, uptime, virtName,
} from "@/lib/format"
import { fetchHistory, inRanges, LATENCY_HOURS, RANGES, type History, type Point, type Series } from "@/lib/history"
import { knownPing, recordPing } from "@/lib/pings"
import { usePref } from "@/lib/prefs"
import { cn } from "@/lib/utils"

const AXIS = { stroke: "currentColor", fontSize: 11, tickLine: false, axisLine: false }

const SERIES = { dot: false as const, strokeWidth: 1.75, isAnimationActive: false }

const Y_WIDTH = 64

const PALETTE = [1, 2, 3, 4, 5].map((i) => `var(--color-chart-${i})`)

const TIP = {
  fontSize: 12,
  padding: "8px 12px",
  background: "var(--color-popover)",
  color: "var(--color-popover-foreground)",
  border: "1px solid var(--color-border)",
  borderRadius: "calc(var(--radius) - 2px)",
  boxShadow: "0 8px 24px rgb(0 0 0 / 0.14)",
}

function Panel({
  title,
  aside,
  heightClass = "h-56",
  children,
}: {
  title: React.ReactNode
  aside?: React.ReactNode
  heightClass?: string
  children: React.ReactNode
}) {
  return (
    <Card className="min-w-0 gap-3 p-4 sm:p-5">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold tracking-[-0.01em] text-foreground">{title}</h3>
        {aside && <div className="tnum text-xs text-muted-foreground">{aside}</div>}
      </div>
      <div className={cn("w-full min-w-0 text-muted-foreground", heightClass)}>{children}</div>
    </Card>
  )
}

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
    ...AXIS,
  }
}

/**
 * Full-width probe latency chart with Smokeping bands, despike/EWMA filters,
 * per-probe loss toggles, and interactive Brush zoom.
 */
export function Latency({
  id, hours: fixed, card, title, className, onKnown,
}: {
  id: number
  hours?: number
  card?: boolean
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
          return { id: taskId, name: data?.probes?.[taskId] ?? t("charts.probeFallback", { id: taskId }), points, loss }
        })
        .filter((s) => s.points.length > 0),
    [data, t],
  )

  const shownProbes = useMemo(
    () => pingSeries.filter((s) => !hiddenProbes.includes(s.id)),
    [pingSeries, hiddenProbes],
  )
  const color = (taskId: number) => PALETTE[pingSeries.findIndex((p) => p.id === taskId) % PALETTE.length]

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

  const frame = card ? "rounded-xl border border-border/80 bg-card p-4 sm:p-5 shadow-xs" : ""
  if (!data) return <div className={frame}><Skeleton className={cn("w-full", className)} /></div>
  if (failed) return <div className={frame}><Failed message={failed} retry={retry} /></div>
  if (!has && knownPing(id) !== true) return null
  const last = pingRows.length - 1
  const [from, to] = zoom?.of === data ? zoom.range.map((i) => Math.min(i, last)) : [0, last]
  const drawn = (taskId: number) => `${despiked ? (smoothed ? "f" : "s") : smoothed ? "e" : "t"}${taskId}`

  return (
    <section className={cn("min-w-0 space-y-3", frame)}>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        {title && <h3 className="text-sm font-semibold tracking-[-0.01em] text-foreground">{title}</h3>}
        {fixed === undefined && (
          <Segmented
            value={hours}
            onChange={setPicked}
            options={rangeOptions}
            label={t("charts.rangeLabel")}
            className="scrollbar-none h-7 max-w-full overflow-x-auto max-sm:[&>button]:px-2"
          />
        )}
        <div className="ml-auto flex gap-1.5">
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
      </div>

      {has && (
        <div className="flex flex-wrap items-center gap-1.5">
          {pingSeries.map((s) => {
            const shown = !hiddenProbes.includes(s.id)
            return (
              <button
                key={s.id}
                type="button"
                onClick={() =>
                  setHiddenProbes((h) => (shown ? [...h, s.id] : h.filter((item) => item !== s.id)))
                }
                aria-pressed={shown}
                className={cn(
                  "inline-flex h-6 items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-all hover:bg-muted cursor-pointer",
                  !shown ? "border-dashed border-border/60 opacity-40" : "border-border/80 bg-card shadow-2xs",
                )}
              >
                <svg width="14" height="6" className="shrink-0" aria-hidden>
                  <line x1="0" y1="3" x2="14" y2="3" stroke={color(s.id)} strokeWidth="2" />
                </svg>
                {s.name}
                <span className="tnum font-normal text-muted-foreground">
                  {s.loss > 0 && s.loss < 0.1 ? "<0.1" : s.loss.toFixed(1)}%
                </span>
              </button>
            )
          })}
        </div>
      )}

      {!has ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t("charts.noPing")}</p>
      ) : (
        <div className={cn("w-full min-w-0 text-muted-foreground transition-opacity", className, loading && "opacity-50")}>
          {shownProbes.length === 0 ? (
            <p className="py-8 text-center text-sm">{t("charts.noProbeSelected")}</p>
          ) : (
            <ResponsiveContainer>
              <ComposedChart data={pingRows}>
                <CartesianGrid className="stroke-border/70" vertical={false} />
                <XAxis {...timeAxis(pingRows, hours, lang, from, to)} />
                <YAxis unit="ms" width={52} domain={["auto", "auto"]} {...AXIS} />
                <Tooltip
                  labelFormatter={(ts) => new Date(Number(ts)).toLocaleString(lang)}
                  formatter={(v, name, item) => {
                    const loss = Number(item?.payload?.[`l${String(item.dataKey).slice(1)}`] ?? 0)
                    return [`${Math.round(Number(v))} ms${loss > 0 ? ` · ${t("charts.loss", { loss })}` : ""}`, name]
                  }}
                  contentStyle={TIP}
                />
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
                <Brush
                  dataKey="ts"
                  height={22}
                  travellerWidth={8}
                  tickFormatter={clockFor(hours, lang)}
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

function LiveStatCard({
  label,
  value,
  sub,
  icon: Icon,
  meter,
}: {
  label: string
  value: React.ReactNode
  sub: React.ReactNode
  icon: React.ComponentType<{ className?: string }>
  meter?: number | null
}) {
  return (
    <Card className="min-w-0 justify-between gap-2.5 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      </div>
      <div className="space-y-1.5">
        <div className="tnum truncate text-xl font-semibold tracking-[-0.025em] text-foreground">{value}</div>
        {meter !== undefined && <Meter pct={meter} className="h-1.5" />}
        <div className="tnum truncate text-xs text-muted-foreground">{sub}</div>
      </div>
    </Card>
  )
}

/**
 * Reorganized Arc Server Detail Studio (`/node/{id}`):
 * 1. Unified hero header with global time-range selector
 * 2. 4 live metric tiles (CPU / Memory / Disk / Live Network & Traffic)
 * 3. Full-width latency probe panel
 * 4. Simultaneous 2x2 historical telemetry grid (CPU, Memory, Network, Disk)
 * 5. Structured hardware & billing specification grid
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

  const tops = useMemo(() => {
    const max = (pick: (row: Point) => number) =>
      metricRows.reduce((hi, row) => Math.max(hi, pick(row)), 0)
    const cpuPeak = max((row) => row.cpu)
    return {
      cpuPeak,
      cpu: axisTop(cpuPeak, 4, 10, 100),
      rate: axisTop(max((row) => Math.max(row.net_rx, row.net_tx)), 1024, 1024),
    }
  }, [metricRows])

  const label = (ts: unknown) => new Date(Number(ts)).toLocaleString(lang)

  const cpuPct = m ? m.cpu : null
  const memPct = m ? percent(m.mem_used, m.mem_total) : null
  const diskPct = m ? percent(m.disk_used, m.disk_total) : null

  return (
    <div className="@container min-w-0 space-y-5">
      {/* 1. Unified Hero Header + Global Time Window Switch */}
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Dot node={node} className="size-2.5" />
            {node.country && <Flag code={node.country} className="text-base" />}
            <h1 className="min-w-0 truncate text-xl font-semibold tracking-[-0.025em] text-foreground sm:text-2xl">
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

          <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
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
        <p className="min-w-0 rounded-xl border border-border/80 bg-muted/40 px-4 py-2.5 text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap wrap-break-word">
          {node.remark}
        </p>
      )}

      {/* 2. Four Live Metric Hero Cards */}
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
          meter={cpuPct}
        />

        <LiveStatCard
          label={t("details.resources.mem")}
          value={memPct !== null ? `${memPct.toFixed(1)}%` : "—"}
          sub={m ? pair(m.mem_used, m.mem_total) : bytes(node.mem_total)}
          icon={MemoryStick}
          meter={memPct}
        />

        <LiveStatCard
          label={t("details.resources.disk")}
          value={diskPct !== null ? `${diskPct.toFixed(1)}%` : "—"}
          sub={m ? pair(m.disk_used, m.disk_total) : bytes(node.disk_total)}
          icon={HardDrive}
          meter={diskPct}
        />

        <LiveStatCard
          label={t("charts.netTitle")}
          value={
            m ? (
              <span className="inline-flex flex-wrap items-center gap-x-2.5 text-base font-semibold">
                <span className="inline-flex items-center gap-0.5">
                  <ArrowDown className="size-3.5 text-success" />
                  {compact(m.net_rx)}/s
                </span>
                <span className="inline-flex items-center gap-0.5">
                  <ArrowUp className="size-3.5 text-info" />
                  {compact(m.net_tx)}/s
                </span>
              </span>
            ) : (
              "—"
            )
          }
          sub={`${t("details.traffic.period")} ${compact(usedTraffic)} / ${node.traffic_limit > 0 ? compact(node.traffic_limit) : FOREVER}`}
          icon={Network}
          meter={node.traffic_limit > 0 ? percent(usedTraffic, node.traffic_limit) : undefined}
        />
      </div>

      {/* 3. Full-Width Latency Intelligence Panel (automatically hidden when no probes exist) */}
      {known !== false && (
        <Latency
          id={node.id}
          hours={safeHours}
          card
          title={t("charts.latencyTitle")}
          className="h-68"
          onKnown={learn}
        />
      )}

      {/* 4. Simultaneous 2x2 Historical Telemetry Grid */}
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
          <Panel
            title={t("charts.cpuTitle")}
            aside={
              <span className="inline-flex items-center gap-2">
                {cpuPct !== null && <span className="font-medium text-foreground">{cpuPct.toFixed(1)}%</span>}
                <span>{t("charts.cpuPeak", { peak: tops.cpuPeak.toFixed(1) })}</span>
              </span>
            }
          >
            <ResponsiveContainer>
              <AreaChart data={metricRows}>
                <defs>
                  <linearGradient id={`${gradPrefix}-cpu`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid className="stroke-border/70" vertical={false} />
                <XAxis {...timeAxis(metricRows, safeHours, lang)} />
                <YAxis domain={[0, tops.cpu]} ticks={quarters(tops.cpu)} unit="%" width={48} {...AXIS} />
                <Tooltip labelFormatter={label} formatter={(v) => [`${Number(v).toFixed(1)}%`, t("charts.tabs.cpu")]} contentStyle={TIP} />
                <Area dataKey="cpu" stroke="var(--color-chart-1)" fill={`url(#${gradPrefix}-cpu)`} {...SERIES} />
              </AreaChart>
            </ResponsiveContainer>
          </Panel>

          {/* Memory History */}
          <Panel
            title={t("charts.memTitle")}
            aside={m ? pair(m.mem_used, m.mem_total) : bytes(node.mem_total)}
          >
            <ResponsiveContainer>
              <AreaChart data={metricRows}>
                <defs>
                  <linearGradient id={`${gradPrefix}-mem`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-chart-4)" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="var(--color-chart-4)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid className="stroke-border/70" vertical={false} />
                <XAxis {...timeAxis(metricRows, safeHours, lang)} />
                <YAxis domain={[0, node.mem_total]} ticks={quarters(node.mem_total)} tickFormatter={axisBytes} width={Y_WIDTH} {...AXIS} />
                <Tooltip labelFormatter={label} formatter={(v) => bytes(Number(v))} contentStyle={TIP} />
                <Area dataKey="mem_used" name={t("charts.tabs.mem")} stroke="var(--color-chart-4)" fill={`url(#${gradPrefix}-mem)`} {...SERIES} />
              </AreaChart>
            </ResponsiveContainer>
          </Panel>

          {/* Network Throughput History */}
          <Panel
            title={t("charts.netTitle")}
            aside={
              <span className="inline-flex items-center gap-3">
                <span className="inline-flex items-center gap-1 text-foreground">
                  <span className="size-2 rounded-full bg-chart-2" />
                  {t("charts.downlink")}
                </span>
                <span className="inline-flex items-center gap-1 text-foreground">
                  <span className="size-2 rounded-full bg-chart-3" />
                  {t("charts.uplink")}
                </span>
              </span>
            }
          >
            <ResponsiveContainer>
              <LineChart data={metricRows}>
                <CartesianGrid className="stroke-border/70" vertical={false} />
                <XAxis {...timeAxis(metricRows, safeHours, lang)} />
                <YAxis domain={[0, tops.rate]} ticks={quarters(tops.rate)} tickFormatter={axisBytes} unit="/s" width={Y_WIDTH} {...AXIS} />
                <Tooltip labelFormatter={label} formatter={(v) => rate(Number(v))} contentStyle={TIP} />
                <Line dataKey="net_rx" name={t("charts.downlink")} stroke="var(--color-chart-2)" {...SERIES} />
                <Line dataKey="net_tx" name={t("charts.uplink")} stroke="var(--color-chart-3)" {...SERIES} />
              </LineChart>
            </ResponsiveContainer>
          </Panel>

          {/* Disk History */}
          <Panel
            title={t("charts.diskTitle")}
            aside={m ? pair(m.disk_used, m.disk_total) : bytes(node.disk_total)}
          >
            <ResponsiveContainer>
              <AreaChart data={metricRows}>
                <defs>
                  <linearGradient id={`${gradPrefix}-disk`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-chart-5)" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="var(--color-chart-5)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid className="stroke-border/70" vertical={false} />
                <XAxis {...timeAxis(metricRows, safeHours, lang)} />
                <YAxis domain={[0, node.disk_total]} ticks={quarters(node.disk_total)} tickFormatter={axisBytes} width={Y_WIDTH} {...AXIS} />
                <Tooltip labelFormatter={label} formatter={(v) => bytes(Number(v))} contentStyle={TIP} />
                <Area dataKey="disk_used" name={t("charts.tabs.disk")} stroke="var(--color-chart-5)" fill={`url(#${gradPrefix}-disk)`} {...SERIES} />
              </AreaChart>
            </ResponsiveContainer>
          </Panel>
        </div>
      )}

      {/* 5. Detailed Hardware & Billing Specifications */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-[-0.01em] text-foreground">
          {t("charts.specsSectionTitle")}
        </h2>
        <NodeOverview node={node} />
      </section>
    </div>
  )
}
