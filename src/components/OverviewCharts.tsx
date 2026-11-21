import { useMemo } from "react"
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

import { Flag } from "@/components/NodeMarks"
import { Card } from "@/components/ui/card"
import type { Node } from "@/lib/api"
import { axisBytes, axisTop, bytes, clockFor, monthUsage, percent, quarters, rate } from "@/lib/format"
import { navigate } from "@/lib/route"

export interface LiveBandwidthSample {
  ts: number
  rx: number
  tx: number
}

const AXIS = { stroke: "currentColor", fontSize: 11, tickLine: false, axisLine: false }

const CHART_PALETTE = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
]

const TIP = {
  fontSize: 12,
  padding: "8px 12px",
  background: "var(--color-popover)",
  color: "var(--color-popover-foreground)",
  border: "1px solid var(--color-border)",
  borderRadius: "calc(var(--radius) - 2px)",
  boxShadow: "0 8px 24px rgb(0 0 0 / 0.14)",
}

function ChartCard({
  title,
  description,
  aside,
  className,
  children,
}: {
  title: string
  description?: string
  aside?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <Card className={`min-w-0 gap-3 p-4 sm:p-5 ${className ?? ""}`}>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <h3 className="truncate text-sm font-semibold tracking-[-0.01em] text-foreground">{title}</h3>
          {description && <p className="truncate text-xs text-muted-foreground">{description}</p>}
        </div>
        {aside}
      </div>
      {children}
    </Card>
  )
}

function shortLabel(name: string, max = 11): string {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name
}

/**
 * Four live fleet telemetry charts rendered on the `/` Arc Overview Dashboard:
 * 1. Top nodes CPU vs Memory bar chart (click any bar to open node detail)
 * 2. Live rolling cluster bandwidth area chart (accumulated from WebSocket pushes)
 * 3. Billing-period traffic leaders horizontal bar chart
 * 4. Regional footprint donut + country breakdown
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

  const resourceRows = useMemo(() => {
    return nodes
      .filter((n): n is Node & { metrics: NonNullable<Node["metrics"]> } => n.online && n.metrics !== null)
      .map((n) => {
        const cpu = Number(n.metrics.cpu.toFixed(1))
        const mem = Number(percent(n.metrics.mem_used, n.metrics.mem_total).toFixed(1))
        return {
          id: n.id,
          name: n.name,
          shortName: shortLabel(n.name, 10),
          cpu,
          mem,
          score: cpu + mem,
        }
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
  }, [nodes])

  const bandwidthTop = useMemo(() => {
    const peak = bandwidthHistory.reduce((hi, s) => Math.max(hi, s.rx, s.tx), 0)
    return axisTop(peak, 1024, 1024)
  }, [bandwidthHistory])

  const trafficRows = useMemo(() => {
    return nodes
      .map((n) => {
        const used = monthUsage(n)
        return {
          id: n.id,
          name: n.name,
          shortName: shortLabel(n.name, 12),
          used,
          limit: n.traffic_limit,
        }
      })
      .filter((r) => r.used > 0)
      .sort((a, b) => b.used - a.used)
      .slice(0, 6)
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

  const timeFormatter = useMemo(() => clockFor(1, lang), [lang])

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      {/* 1. Live Resource Load (CPU vs Memory across top nodes) */}
      <ChartCard
        title={t("overview.charts.resourceTitle")}
        description={t("overview.charts.resourceDesc", { count: Math.max(resourceRows.length, 1) })}
        aside={
          <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-chart-1" />
              {t("charts.tabs.cpu")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-chart-4" />
              {t("charts.tabs.mem")}
            </span>
          </div>
        }
        className="lg:col-span-7"
      >
        <div className="h-56 w-full min-w-0 text-muted-foreground">
          {resourceRows.length === 0 ? (
            <div className="grid h-full place-items-center text-xs text-muted-foreground">
              {t("overview.charts.noOnlineNodes")}
            </div>
          ) : (
            <ResponsiveContainer>
              <BarChart data={resourceRows} barGap={4} barCategoryGap="24%">
                <CartesianGrid className="stroke-border/70" vertical={false} />
                <XAxis dataKey="shortName" {...AXIS} />
                <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} unit="%" width={40} {...AXIS} />
                <Tooltip
                  cursor={{ fill: "var(--color-muted)", opacity: 0.45 }}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.name ?? ""}
                  formatter={(val, name) => [`${Number(val).toFixed(1)}%`, name]}
                  contentStyle={TIP}
                />
                <Bar
                  dataKey="cpu"
                  name={t("charts.tabs.cpu")}
                  fill="var(--color-chart-1)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={20}
                  isAnimationActive={false}
                  className="cursor-pointer"
                  onClick={(entry) => {
                    const id = (entry as unknown as { id?: number })?.id
                    if (typeof id === "number") navigate(`/node/${id}`)
                  }}
                />
                <Bar
                  dataKey="mem"
                  name={t("charts.tabs.mem")}
                  fill="var(--color-chart-4)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={20}
                  isAnimationActive={false}
                  className="cursor-pointer"
                  onClick={(entry) => {
                    const id = (entry as unknown as { id?: number })?.id
                    if (typeof id === "number") navigate(`/node/${id}`)
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </ChartCard>

      {/* 2. Live Cluster Bandwidth Trend */}
      <ChartCard
        title={t("overview.charts.liveBandwidthTitle")}
        description={t("overview.charts.liveBandwidthDesc", { seconds: 60 })}
        aside={
          <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-chart-2" />
              {t("charts.downlink")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-chart-3" />
              {t("charts.uplink")}
            </span>
          </div>
        }
        className="lg:col-span-5"
      >
        <div className="h-56 w-full min-w-0 text-muted-foreground">
          {bandwidthHistory.length === 0 ? (
            <div className="grid h-full place-items-center text-xs text-muted-foreground">
              {t("overview.charts.collectingSamples")}
            </div>
          ) : (
            <ResponsiveContainer>
              <AreaChart data={bandwidthHistory}>
                <defs>
                  <linearGradient id="overviewRxFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-chart-2)" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="var(--color-chart-2)" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="overviewTxFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-chart-3)" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="var(--color-chart-3)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid className="stroke-border/70" vertical={false} />
                <XAxis
                  dataKey="ts"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={(v) => timeFormatter(Number(v))}
                  minTickGap={48}
                  {...AXIS}
                />
                <YAxis
                  domain={[0, bandwidthTop]}
                  ticks={quarters(bandwidthTop)}
                  tickFormatter={axisBytes}
                  unit="/s"
                  width={62}
                  {...AXIS}
                />
                <Tooltip
                  labelFormatter={(ts) => new Date(Number(ts)).toLocaleTimeString(lang)}
                  formatter={(v, name) => [rate(Number(v)), name]}
                  contentStyle={TIP}
                />
                <Area
                  type="monotone"
                  dataKey="rx"
                  name={t("charts.downlink")}
                  stroke="var(--color-chart-2)"
                  fill="url(#overviewRxFill)"
                  strokeWidth={1.75}
                  dot={false}
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="tx"
                  name={t("charts.uplink")}
                  stroke="var(--color-chart-3)"
                  fill="url(#overviewTxFill)"
                  strokeWidth={1.75}
                  dot={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </ChartCard>

      {/* 3. Period Traffic Leaders (Horizontal BarChart) */}
      <ChartCard
        title={t("overview.charts.trafficTopTitle")}
        description={t("overview.charts.trafficTopDesc", { count: Math.max(trafficRows.length, 1) })}
        className="lg:col-span-7"
      >
        <div className="h-52 w-full min-w-0 text-muted-foreground">
          {trafficRows.length === 0 ? (
            <div className="grid h-full place-items-center text-xs text-muted-foreground">
              {t("overview.charts.noTrafficData")}
            </div>
          ) : (
            <ResponsiveContainer>
              <BarChart data={trafficRows} layout="vertical" margin={{ left: 4, right: 16 }}>
                <CartesianGrid className="stroke-border/70" horizontal={false} />
                <XAxis type="number" tickFormatter={axisBytes} {...AXIS} />
                <YAxis type="category" dataKey="shortName" width={92} {...AXIS} />
                <Tooltip
                  cursor={{ fill: "var(--color-muted)", opacity: 0.45 }}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.name ?? ""}
                  formatter={(v, _, item) => {
                    const limit = Number(item?.payload?.limit ?? 0)
                    const used = Number(v)
                    return [
                      limit > 0
                        ? `${bytes(used)} / ${bytes(limit)} (${percent(used, limit).toFixed(1)}%)`
                        : bytes(used),
                      t("table.cols.traffic"),
                    ]
                  }}
                  contentStyle={TIP}
                />
                <Bar
                  dataKey="used"
                  fill="var(--color-chart-1)"
                  radius={[0, 6, 6, 0]}
                  barSize={16}
                  isAnimationActive={false}
                  className="cursor-pointer"
                  onClick={(entry) => {
                    const id = (entry as unknown as { id?: number })?.id
                    if (typeof id === "number") navigate(`/node/${id}`)
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </ChartCard>

      {/* 4. Regional Footprint Donut + Breakdown */}
      <ChartCard
        title={t("overview.charts.regionTitle")}
        description={t("overview.charts.regionDesc")}
        className="lg:col-span-5"
      >
        <div className="grid h-52 grid-cols-1 items-center gap-3 sm:grid-cols-[9.5rem_minmax(0,1fr)]">
          <div className="h-36 w-full min-w-0 sm:h-44">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={pieRows}
                  dataKey="total"
                  nameKey="code"
                  cx="50%"
                  cy="50%"
                  innerRadius="56%"
                  outerRadius="86%"
                  paddingAngle={2}
                  stroke="var(--color-card)"
                  strokeWidth={2}
                  isAnimationActive={false}
                >
                  {pieRows.map((entry, idx) => (
                    <Cell key={entry.code || `unk-${idx}`} fill={CHART_PALETTE[idx % CHART_PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v, name) => [
                    t("overview.charts.nodesUnit", { count: Number(v) }),
                    name === "OTHER" ? "Other" : name ? String(name) : t("overview.charts.unknownRegion"),
                  ]}
                  contentStyle={TIP}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="scrollbar-none max-h-44 space-y-1.5 overflow-y-auto pr-1">
            {regionRows.slice(0, 8).map((region, idx) => (
              <div key={region.code || "unknown"} className="flex items-center justify-between gap-2 text-xs">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: CHART_PALETTE[idx % CHART_PALETTE.length] }}
                  />
                  {region.code ? (
                    <Flag code={region.code} showCode={false} className="shrink-0" />
                  ) : null}
                  <span className="truncate font-medium text-foreground">
                    {region.code || t("overview.charts.unknownRegion")}
                  </span>
                </div>
                <span className="tnum shrink-0 text-muted-foreground">
                  <span className="font-medium text-foreground">{region.online}</span>/{region.total}
                </span>
              </div>
            ))}
          </div>
        </div>
      </ChartCard>
    </div>
  )
}
