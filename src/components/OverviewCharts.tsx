import { useId, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
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
import { barTone, Flag } from "@/components/NodeMarks"
import { Segmented } from "@/components/ui/segmented"
import type { Node } from "@/lib/api"
import { axisBytes, axisTop, bytes, compact, monthUsage, percent, quarters, rate } from "@/lib/format"
import { navigate } from "@/lib/route"
import { cn } from "@/lib/utils"

export interface LiveBandwidthSample {
  ts: number
  rx: number
  tx: number
}

type ResourceMode = "both" | "cpu" | "mem"

function shortLabel(name: string, max = 11): string {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name
}

/**
 * Four Arc-harmonized fleet telemetry panels on `/`:
 * 1. Live node resource comparison (CPU / Memory toggleable bar chart, click to open node)
 * 2. Live rolling cluster bandwidth area chart with live header readouts
 * 3. Billing-period traffic leaders with interactive quota bars
 * 4. Regional footprint donut with centered KPI and interactive highlight sync
 */
export function OverviewCharts({
  nodes,
  bandwidthHistory,
}: {
  nodes: Node[]
  bandwidthHistory: LiveBandwidthSample[]
}) {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage ?? i18n.language
  const gradPrefix = useId().replace(/:/g, "")
  const [resourceMode, setResourceMode] = useState<ResourceMode>("both")
  const [hoveredRegion, setHoveredRegion] = useState<string | null>(null)

  const resourceModeOptions = useMemo(
    () => [
      { value: "both" as const, label: t("overview.charts.modeBoth") },
      { value: "cpu" as const, label: t("charts.tabs.cpu") },
      { value: "mem" as const, label: t("charts.tabs.mem") },
    ],
    [t],
  )

  const resourceRows = useMemo(() => {
    return nodes
      .filter((n): n is Node & { metrics: NonNullable<Node["metrics"]> } => n.online && n.metrics !== null)
      .map((n) => {
        const cpu = Number(n.metrics.cpu.toFixed(1))
        const mem = Number(percent(n.metrics.mem_used, n.metrics.mem_total).toFixed(1))
        return {
          id: n.id,
          name: n.name,
          country: n.country,
          shortName: shortLabel(n.name, 10),
          cpu,
          mem,
          load: n.metrics.load[0],
          score: resourceMode === "cpu" ? cpu : resourceMode === "mem" ? mem : cpu + mem,
        }
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
  }, [nodes, resourceMode])

  // Ensure initial frame draws a clean horizontal baseline before the second 2s snapshot arrives.
  const chartBandwidth = useMemo(() => {
    if (bandwidthHistory.length >= 2) return bandwidthHistory
    if (bandwidthHistory.length === 1) {
      const s = bandwidthHistory[0]
      return [{ ts: s.ts - 2000, rx: s.rx, tx: s.tx }, s]
    }
    return []
  }, [bandwidthHistory])

  const latestBw = bandwidthHistory[bandwidthHistory.length - 1]

  const bandwidthTop = useMemo(() => {
    const peak = chartBandwidth.reduce((hi, s) => Math.max(hi, s.rx, s.tx), 0)
    return axisTop(peak, 1024, 1024)
  }, [chartBandwidth])

  const trafficRows = useMemo(() => {
    const list = nodes
      .map((n) => {
        const used = monthUsage(n)
        return {
          id: n.id,
          name: n.name,
          country: n.country,
          online: n.online,
          used,
          limit: n.traffic_limit,
          quotaPct: n.traffic_limit > 0 ? percent(used, n.traffic_limit) : null,
        }
      })
      .filter((r) => r.used > 0)
      .sort((a, b) => b.used - a.used)
      .slice(0, 6)
    const maxUsed = list[0]?.used ?? 1
    return list.map((row) => ({
      ...row,
      relativePct: Math.max(4, Math.min(100, (row.used / maxUsed) * 100)),
    }))
  }, [nodes])

  const regionRows = useMemo(() => {
    const map = new Map<string, { code: string; total: number; online: number }>()
    for (const n of nodes) {
      const code = (n.country ?? "").trim().toUpperCase()
      const cur = map.get(code) ?? { code, total: 0, online: 0 }
      cur.total += 1
      if (n.online) cur.online += 1
      map.set(code, cur)
    }
    return [...map.values()].sort((a, b) => b.total - a.total || a.code.localeCompare(b.code))
  }, [nodes])

  const pieRows = useMemo(() => {
    if (regionRows.length <= 5) return regionRows
    const top = regionRows.slice(0, 4)
    const rest = regionRows.slice(4).reduce(
      (acc, cur) => ({ code: "OTHER", total: acc.total + cur.total, online: acc.online + cur.online }),
      { code: "OTHER", total: 0, online: 0 },
    )
    return [...top, rest]
  }, [regionRows])

  const totalNodes = nodes.length
  const liveTimeFormatter = useMemo(
    () => new Intl.DateTimeFormat(lang, { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    [lang],
  )

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      {/* 1. Live Node Resource Comparison */}
      <ChartPanel
        title={t("overview.charts.resourceTitle")}
        description={t("overview.charts.resourceDesc", { count: Math.max(resourceRows.length, 1) })}
        aside={
          <div className="flex items-center gap-2.5">
            <ChartLegend
              className="hidden sm:flex"
              items={[
                ...(resourceMode !== "mem" ? [{ label: t("charts.tabs.cpu"), color: CHART_COLORS[0] }] : []),
                ...(resourceMode !== "cpu" ? [{ label: t("charts.tabs.mem"), color: CHART_COLORS[1] }] : []),
              ]}
            />
            <Segmented
              value={resourceMode}
              onChange={setResourceMode}
              options={resourceModeOptions}
              label={t("overview.charts.resourceTitle")}
              className="h-7 [&>button]:px-2"
            />
          </div>
        }
        className="lg:col-span-7"
      >
        <div className="h-52 w-full min-w-0 text-muted-foreground">
          {resourceRows.length === 0 ? (
            <div className="grid h-full place-items-center text-xs text-muted-foreground">
              {t("overview.charts.noOnlineNodes")}
            </div>
          ) : (
            <ResponsiveContainer debounce={140}>
              <BarChart
                data={resourceRows}
                barGap={4}
                barCategoryGap="24%"
                margin={{ top: 6, right: 6, left: -8, bottom: 0 }}
              >
                <CartesianGrid {...CHART_GRID} />
                <XAxis dataKey="shortName" {...CHART_AXIS} />
                <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} unit="%" width={44} {...CHART_AXIS} />
                <Tooltip
                  cursor={{ fill: "var(--color-muted)", opacity: 0.5, radius: 6 }}
                  content={
                    <ChartTooltip
                      labelFormatter={(_, payload) => {
                        const row = payload[0]?.payload as { name?: string; country?: string } | undefined
                        if (!row?.name) return ""
                        return (
                          <span className="inline-flex items-center gap-1.5">
                            {row.country && <Flag code={row.country} />}
                            <span className="truncate">{row.name}</span>
                          </span>
                        )
                      }}
                      valueFormatter={(val) => `${Number(val).toFixed(1)}%`}
                      footer={(payload) => {
                        const load = payload[0]?.payload?.load
                        return (
                          <span className="flex items-center justify-between gap-2">
                            {typeof load === "number" && (
                              <span className="tnum">
                                {t("details.resources.load")} {load.toFixed(2)}
                              </span>
                            )}
                            <span>{t("overview.charts.clickToInspect")}</span>
                          </span>
                        )
                      }}
                    />
                  }
                />
                {resourceMode !== "mem" && (
                  <Bar
                    dataKey="cpu"
                    name={t("charts.tabs.cpu")}
                    fill={CHART_COLORS[0]}
                    radius={[5, 5, 0, 0]}
                    maxBarSize={22}
                    isAnimationActive={false}
                    className="cursor-pointer"
                    onClick={(entry) => {
                      const id = (entry as unknown as { id?: number })?.id
                      if (typeof id === "number") navigate(`/node/${id}`)
                    }}
                  />
                )}
                {resourceMode !== "cpu" && (
                  <Bar
                    dataKey="mem"
                    name={t("charts.tabs.mem")}
                    fill={CHART_COLORS[1]}
                    radius={[5, 5, 0, 0]}
                    maxBarSize={22}
                    isAnimationActive={false}
                    className="cursor-pointer"
                    onClick={(entry) => {
                      const id = (entry as unknown as { id?: number })?.id
                      if (typeof id === "number") navigate(`/node/${id}`)
                    }}
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </ChartPanel>

      {/* 2. Live Cluster Bandwidth Trend */}
      <ChartPanel
        title={t("overview.charts.liveBandwidthTitle")}
        description={t("overview.charts.liveBandwidthDesc", { seconds: 60 })}
        aside={
          <ChartLegend
            items={[
              {
                label: t("charts.downlink"),
                color: CHART_COLORS[1],
                value: latestBw ? `${compact(latestBw.rx)}/s` : undefined,
              },
              {
                label: t("charts.uplink"),
                color: CHART_COLORS[2],
                value: latestBw ? `${compact(latestBw.tx)}/s` : undefined,
              },
            ]}
          />
        }
        className="lg:col-span-5"
      >
        <div className="h-52 w-full min-w-0 text-muted-foreground">
          {chartBandwidth.length === 0 ? (
            <div className="grid h-full place-items-center text-xs text-muted-foreground">
              {t("overview.charts.collectingSamples")}
            </div>
          ) : (
            <ResponsiveContainer debounce={140}>
              <AreaChart data={chartBandwidth} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={`${gradPrefix}-rx`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART_COLORS[1]} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={CHART_COLORS[1]} stopOpacity={0.01} />
                  </linearGradient>
                  <linearGradient id={`${gradPrefix}-tx`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART_COLORS[2]} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={CHART_COLORS[2]} stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...CHART_GRID} />
                <XAxis
                  dataKey="ts"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={(v) => liveTimeFormatter.format(Number(v))}
                  minTickGap={52}
                  {...CHART_AXIS}
                />
                <YAxis
                  domain={[0, bandwidthTop]}
                  ticks={quarters(bandwidthTop)}
                  tickFormatter={axisBytes}
                  unit="/s"
                  width={72}
                  {...CHART_AXIS}
                />
                <Tooltip
                  cursor={CHART_CURSOR}
                  content={
                    <ChartTooltip
                      labelFormatter={(ts) => new Date(Number(ts)).toLocaleTimeString(lang)}
                      valueFormatter={(v) => rate(Number(v))}
                    />
                  }
                />
                <Area
                  type="monotone"
                  dataKey="rx"
                  name={t("charts.downlink")}
                  stroke={CHART_COLORS[1]}
                  fill={`url(#${gradPrefix}-rx)`}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ ...CHART_ACTIVE_DOT, fill: CHART_COLORS[1] }}
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="tx"
                  name={t("charts.uplink")}
                  stroke={CHART_COLORS[2]}
                  fill={`url(#${gradPrefix}-tx)`}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ ...CHART_ACTIVE_DOT, fill: CHART_COLORS[2] }}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </ChartPanel>

      {/* 3. Billing-Period Traffic Leaders (Interactive Ranked Bars) */}
      <ChartPanel
        title={t("overview.charts.trafficTopTitle")}
        description={t("overview.charts.trafficTopDesc", { count: Math.max(trafficRows.length, 1) })}
        className="lg:col-span-7"
      >
        <div className="min-h-52">
          {trafficRows.length === 0 ? (
            <div className="grid h-52 place-items-center text-xs text-muted-foreground">
              {t("overview.charts.noTrafficData")}
            </div>
          ) : (
            <div className="space-y-1">
              {trafficRows.map((row, idx) => {
                const fillPct = row.quotaPct !== null ? Math.max(2, row.quotaPct) : row.relativePct
                const statusClass = row.quotaPct !== null ? barTone(row.quotaPct, "usage") : ""
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => navigate(`/node/${row.id}`)}
                    className="group flex w-full min-w-0 flex-col gap-1 rounded-lg px-2 py-1 text-left transition-colors hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring outline-none cursor-pointer"
                  >
                    <div className="flex min-w-0 items-center justify-between gap-2 text-xs">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="tnum w-4 shrink-0 text-[11px] font-medium text-muted-foreground">
                          {idx + 1}
                        </span>
                        {row.country && <Flag code={row.country} className="shrink-0" />}
                        <span className="min-w-0 truncate font-medium text-foreground group-hover:text-primary transition-colors">
                          {row.name}
                        </span>
                      </div>

                      <div className="tnum flex shrink-0 items-baseline gap-1.5 text-xs">
                        <span className="font-semibold text-foreground">{bytes(row.used)}</span>
                        {row.limit > 0 && (
                          <span className="text-muted-foreground">
                            / {bytes(row.limit)} ({row.quotaPct?.toFixed(0)}%)
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/8">
                      <div
                        className={cn("h-full rounded-full transition-[width] duration-500", statusClass)}
                        style={{
                          width: `${fillPct}%`,
                          backgroundColor: statusClass ? undefined : CHART_COLORS[0],
                        }}
                      />
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </ChartPanel>

      {/* 4. Regional Footprint Donut + Synchronized Breakdown */}
      <ChartPanel
        title={t("overview.charts.regionTitle")}
        description={t("overview.charts.regionDesc")}
        className="lg:col-span-5"
      >
        <div className="grid min-h-52 grid-cols-1 items-center gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <div className="relative mx-auto h-40 w-40 shrink-0">
            <ResponsiveContainer debounce={140}>
              <PieChart>
                <Pie
                  data={pieRows}
                  dataKey="total"
                  nameKey="code"
                  cx="50%"
                  cy="50%"
                  innerRadius="62%"
                  outerRadius="90%"
                  paddingAngle={2.5}
                  stroke="var(--color-card)"
                  strokeWidth={2}
                  isAnimationActive={false}
                  onMouseEnter={(_, idx) => setHoveredRegion(pieRows[idx]?.code ?? null)}
                  onMouseLeave={() => setHoveredRegion(null)}
                >
                  {pieRows.map((entry, idx) => {
                    const dimmed = hoveredRegion !== null && hoveredRegion !== entry.code
                    return (
                      <Cell
                        key={entry.code || `unk-${idx}`}
                        fill={CHART_COLORS[idx % CHART_COLORS.length]}
                        fillOpacity={dimmed ? 0.3 : 1}
                        className="transition-opacity duration-150"
                      />
                    )
                  })}
                </Pie>
                <Tooltip
                  content={
                    <ChartTooltip
                      labelFormatter={(_, payload) => {
                        const code = String(payload[0]?.payload?.code ?? "")
                        if (code === "OTHER") return t("overview.charts.otherRegions")
                        return code ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Flag code={code} />
                            <span>{code}</span>
                          </span>
                        ) : (
                          t("overview.charts.unknownRegion")
                        )
                      }}
                      valueFormatter={(v, entry) => {
                        const online = Number(entry.payload?.online ?? 0)
                        return `${online}/${Number(v)} ${t("status.online")}`
                      }}
                    />
                  }
                />
              </PieChart>
            </ResponsiveContainer>

            {/* Centered Donut KPI */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="tnum text-xl font-semibold tracking-tight leading-none text-foreground">
                {regionRows.length}
              </span>
              <span className="mt-1 text-[11px] text-muted-foreground">
                {t("overview.charts.regionsUnit")}
              </span>
            </div>
          </div>

          <div className="scrollbar-none max-h-48 space-y-1.5 overflow-y-auto pr-1">
            {regionRows.slice(0, 8).map((region, idx) => {
              const color = CHART_COLORS[idx % CHART_COLORS.length]
              const share = totalNodes > 0 ? Math.round((region.total / totalNodes) * 100) : 0
              const active = hoveredRegion === region.code
              return (
                <div
                  key={region.code || "unknown"}
                  onMouseEnter={() => setHoveredRegion(region.code)}
                  onMouseLeave={() => setHoveredRegion(null)}
                  className={cn(
                    "rounded-lg px-2 py-1 text-xs transition-colors",
                    active ? "bg-muted/80" : "hover:bg-muted/50",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: color }}
                        aria-hidden="true"
                      />
                      {region.code ? <Flag code={region.code} className="shrink-0" /> : null}
                      <span className="truncate font-medium text-foreground">
                        {region.code || t("overview.charts.unknownRegion")}
                      </span>
                    </div>
                    <span className="tnum shrink-0 text-muted-foreground">
                      <span className="font-semibold text-foreground">{region.online}</span>/{region.total}
                      <span className="ml-1.5 text-[11px] opacity-75">{share}%</span>
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </ChartPanel>
    </div>
  )
}
