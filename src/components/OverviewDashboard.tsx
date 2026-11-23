import { lazy, memo, Suspense, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Activity, ArrowDown, ArrowUp, Cpu, MemoryStick, Network } from "lucide-react"

import { Meter, type MeterTone } from "@/components/NodeMarks"
import type { LiveBandwidthSample } from "@/components/OverviewCharts"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { Node } from "@/lib/api"
import { bytes, compact, monthUsage, pair, percent } from "@/lib/format"
import { cn } from "@/lib/utils"

const OverviewCharts = lazy(() =>
  import("@/components/OverviewCharts").then((m) => ({ default: m.OverviewCharts })),
)

const MAX_LIVE_SAMPLES = 30

function KpiTile({
  label,
  value,
  badge,
  sub,
  icon: Icon,
  accentColor,
  bar,
}: {
  label: string
  value: React.ReactNode
  badge?: React.ReactNode
  sub: React.ReactNode
  icon: React.ComponentType<{ className?: string }>
  accentColor?: string
  bar: React.ReactNode
}) {
  return (
    <Card className="min-w-0 justify-between gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
          {accentColor && (
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: accentColor }}
              aria-hidden="true"
            />
          )}
          <span className="truncate">{label}</span>
        </span>
        <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-muted/80 text-muted-foreground">
          <Icon className="size-3.5" />
        </span>
      </div>

      <div className="space-y-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <div className="tnum min-w-0 truncate text-2xl font-semibold tracking-[-0.03em] leading-none text-foreground">
            {value}
          </div>
          {badge}
        </div>
        {bar}
        <div className="tnum truncate text-xs text-muted-foreground">{sub}</div>
      </div>
    </Card>
  )
}

function MeterBar({ pct, tone, color }: { pct: number | null; tone?: MeterTone; color?: string }) {
  return <Meter pct={pct} tone={tone} color={color} className="h-1.5" />
}

/** Dual-channel split bar visualizing downlink vs uplink share in the throughput KPI tile. */
function TrafficSplitBar({ rx, tx }: { rx: number; tx: number }) {
  const total = rx + tx
  const rxPct = total > 0 ? Math.max(8, Math.min(92, (rx / total) * 100)) : 50
  const txPct = total > 0 ? 100 - rxPct : 0
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-foreground/8">
      {total > 0 && (
        <>
          <div
            className="h-full transition-[width] duration-500"
            style={{ width: `${rxPct}%`, backgroundColor: "var(--color-chart-2)" }}
          />
          <div
            className="h-full transition-[width] duration-500"
            style={{ width: `${txPct}%`, backgroundColor: "var(--color-chart-3)" }}
          />
        </>
      )}
    </div>
  )
}

/**
 * Fleet Telemetry Overview (`/`):
 * compact group filter & live pulse strip + 4 aligned KPI tiles + 4 Arc-styled charts.
 */
export const OverviewDashboard = memo(function OverviewDashboard({ nodes }: { nodes: Node[] }) {
  const { t } = useTranslation()
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)
  const [bwSeries, setBwSeries] = useState<{ scope: string | null; samples: LiveBandwidthSample[] }>({
    scope: null,
    samples: [],
  })

  // Groups strictly follow first-appearance node order.
  const groups = useMemo(
    () => [...new Set(nodes.map((n) => n.group ?? "").filter(Boolean))],
    [nodes],
  )
  const hasUngrouped = useMemo(
    () => groups.length > 0 && nodes.some((n) => !(n.group ?? "")),
    [groups, nodes],
  )

  const scopedNodes = useMemo(() => {
    if (selectedGroup === null) return nodes
    if (selectedGroup === "") return nodes.filter((n) => !(n.group ?? ""))
    return nodes.filter((n) => n.group === selectedGroup)
  }, [nodes, selectedGroup])

  const reporting = useMemo(
    () => scopedNodes.filter((n): n is Node & { metrics: NonNullable<Node["metrics"]> } => n.online && n.metrics !== null),
    [scopedNodes],
  )

  const stats = useMemo(() => {
    const totalCount = scopedNodes.length
    const onlineCount = scopedNodes.filter((n) => n.online).length
    const onlineRate = totalCount > 0 ? Math.round((onlineCount / totalCount) * 100) : 0
    const avgCpu =
      reporting.length > 0
        ? reporting.reduce((sum, n) => sum + n.metrics.cpu, 0) / reporting.length
        : 0
    const totalCores = scopedNodes.reduce((sum, n) => sum + n.cpu_cores, 0)
    const memUsed = reporting.reduce((sum, n) => sum + n.metrics.mem_used, 0)
    const memTotal = reporting.reduce((sum, n) => sum + n.metrics.mem_total, 0)
    const memPct = percent(memUsed, memTotal)
    const netRx = reporting.reduce((sum, n) => sum + n.metrics.net_rx, 0)
    const netTx = reporting.reduce((sum, n) => sum + n.metrics.net_tx, 0)
    const periodTraffic = scopedNodes.reduce((sum, n) => sum + monthUsage(n), 0)
    return {
      totalCount,
      onlineCount,
      onlineRate,
      avgCpu,
      totalCores,
      memUsed,
      memTotal,
      memPct,
      netRx,
      netTx,
      periodTraffic,
    }
  }, [scopedNodes, reporting])

  const latestRef = useRef({ scope: selectedGroup, rx: stats.netRx, tx: stats.netTx })
  useEffect(() => {
    latestRef.current = { scope: selectedGroup, rx: stats.netRx, tx: stats.netTx }
  }, [selectedGroup, stats.netRx, stats.netTx])

  // Sample aggregate cluster throughput every 2s into a rolling 60s ring buffer.
  useEffect(() => {
    const push = () => {
      const { scope, rx, tx } = latestRef.current
      const sample: LiveBandwidthSample = { ts: Date.now(), rx, tx }
      setBwSeries((prev) => ({
        scope,
        samples: [...(prev.scope === scope ? prev.samples : []).slice(-(MAX_LIVE_SAMPLES - 1)), sample],
      }))
    }
    const timer = setInterval(push, 2000)
    return () => clearInterval(timer)
  }, [])

  const liveBandwidth = useMemo<LiveBandwidthSample[]>(() => {
    const existing = bwSeries.scope === selectedGroup ? bwSeries.samples : []
    if (existing.length > 0) return existing
    return [{ ts: Date.now(), rx: stats.netRx, tx: stats.netTx }]
  }, [bwSeries, selectedGroup, stats.netRx, stats.netTx])

  return (
    <div className="min-w-0 space-y-4">
      {/* Compact Workspace Bar: group filter tabs + live telemetry status */}
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2.5">
        {groups.length > 0 ? (
          <div
            role="tablist"
            aria-label={t("overview.groupFilterLabel")}
            className="scrollbar-none flex min-w-0 max-w-full items-center gap-1.5 overflow-x-auto pb-0.5"
          >
            <button
              type="button"
              role="tab"
              aria-selected={selectedGroup === null}
              onClick={() => setSelectedGroup(null)}
              className={cn(
                "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer",
                selectedGroup === null
                  ? "bg-primary text-primary-foreground shadow-2xs"
                  : "bg-card/80 text-muted-foreground border border-border/70 hover:bg-card hover:text-foreground",
              )}
            >
              {t("common.all")}
              <span className={cn("tnum ml-1.5", selectedGroup === null ? "opacity-80" : "opacity-65")}>
                {nodes.length}
              </span>
            </button>
            {groups.map((g) => {
              const count = nodes.filter((n) => n.group === g).length
              const active = selectedGroup === g
              return (
                <button
                  key={g}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSelectedGroup(g)}
                  className={cn(
                    "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer",
                    active
                      ? "bg-primary text-primary-foreground shadow-2xs"
                      : "bg-card/80 text-muted-foreground border border-border/70 hover:bg-card hover:text-foreground",
                  )}
                >
                  {g}
                  <span className={cn("tnum ml-1.5", active ? "opacity-80" : "opacity-65")}>
                    {count}
                  </span>
                </button>
              )
            })}
            {hasUngrouped && (
              <button
                type="button"
                role="tab"
                aria-selected={selectedGroup === ""}
                onClick={() => setSelectedGroup("")}
                className={cn(
                  "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer",
                  selectedGroup === ""
                    ? "bg-primary text-primary-foreground shadow-2xs"
                    : "bg-card/80 text-muted-foreground border border-border/70 hover:bg-card hover:text-foreground",
                )}
              >
                {t("common.ungrouped")}
                <span className={cn("tnum ml-1.5", selectedGroup === "" ? "opacity-80" : "opacity-65")}>
                  {nodes.filter((n) => !(n.group ?? "")).length}
                </span>
              </button>
            )}
          </div>
        ) : (
          <h1 className="text-base font-semibold tracking-[-0.02em] text-foreground">
            {t("overview.title")}
          </h1>
        )}

        <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/80 px-2.5 py-1 font-medium text-foreground">
            <span className="relative flex size-2">
              <span className="absolute inset-0 rounded-full bg-success opacity-55 animate-ping motion-reduce:animate-none" />
              <span className="relative size-2 rounded-full bg-success" />
            </span>
            <span>{t("overview.livePulse")}</span>
          </span>
        </div>
      </div>

      {/* 4 Aligned Telemetry KPI Tiles */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          label={t("overview.kpi.fleetHealth")}
          value={
            <>
              {stats.onlineCount}
              <span className="text-base font-normal text-muted-foreground"> / {stats.totalCount}</span>
            </>
          }
          badge={
            <span
              className={cn(
                "tnum shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
                stats.onlineRate >= 90
                  ? "bg-success/12 text-success"
                  : stats.onlineRate >= 60
                    ? "bg-warning/12 text-warning"
                    : "bg-destructive/12 text-destructive",
              )}
            >
              {stats.onlineRate}%
            </span>
          }
          sub={t("overview.kpi.reportingCount", { count: reporting.length })}
          icon={Activity}
          accentColor="var(--color-success)"
          bar={<MeterBar pct={stats.onlineRate} tone="health" />}
        />

        <KpiTile
          label={t("overview.kpi.avgCpu")}
          value={reporting.length > 0 ? `${stats.avgCpu.toFixed(1)}%` : "—"}
          sub={t("overview.kpi.totalCores", { cores: stats.totalCores })}
          icon={Cpu}
          accentColor="var(--color-chart-1)"
          bar={<MeterBar pct={reporting.length > 0 ? stats.avgCpu : null} color="var(--color-chart-1)" />}
        />

        <KpiTile
          label={t("overview.kpi.memory")}
          value={stats.memTotal > 0 ? `${stats.memPct.toFixed(1)}%` : "—"}
          sub={stats.memTotal > 0 ? pair(stats.memUsed, stats.memTotal) : t("overview.kpi.memPercent", { pct: 0 })}
          icon={MemoryStick}
          accentColor="var(--color-chart-2)"
          bar={<MeterBar pct={stats.memTotal > 0 ? stats.memPct : null} color="var(--color-chart-2)" />}
        />

        <KpiTile
          label={t("overview.kpi.throughput")}
          value={
            <span className="inline-flex items-baseline gap-2.5 text-lg font-semibold leading-none sm:text-xl">
              <span className="inline-flex items-center gap-0.5">
                <ArrowDown className="size-3.5 shrink-0" style={{ color: "var(--color-chart-2)" }} />
                {compact(stats.netRx)}/s
              </span>
              <span className="inline-flex items-center gap-0.5">
                <ArrowUp className="size-3.5 shrink-0" style={{ color: "var(--color-chart-3)" }} />
                {compact(stats.netTx)}/s
              </span>
            </span>
          }
          sub={t("overview.kpi.periodTotal", { total: bytes(stats.periodTraffic) })}
          icon={Network}
          accentColor="var(--color-chart-3)"
          bar={<TrafficSplitBar rx={stats.netRx} tx={stats.netTx} />}
        />
      </div>

      {/* 4 Live Recharts & Ranked Telemetry Panels */}
      <Suspense fallback={<ChartsSkeleton />}>
        <OverviewCharts nodes={scopedNodes} bandwidthHistory={liveBandwidth} />
      </Suspense>
    </div>
  )
})

function ChartsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <Skeleton className="h-76 rounded-xl lg:col-span-7" />
      <Skeleton className="h-76 rounded-xl lg:col-span-5" />
      <Skeleton className="h-68 rounded-xl lg:col-span-7" />
      <Skeleton className="h-68 rounded-xl lg:col-span-5" />
    </div>
  )
}

export function OverviewSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-8 w-56 rounded-lg" />
        <Skeleton className="h-7 w-24 rounded-full" />
      </div>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-30 rounded-xl" />
        ))}
      </div>
      <ChartsSkeleton />
    </div>
  )
}
