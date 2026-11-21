import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  Activity,
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Cpu,
  HardDrive,
  LayoutGrid,
  MemoryStick,
  Search,
  Table2,
} from "lucide-react"

import { Dot, Flag, Meter, OsIcon } from "@/components/NodeMarks"
import type { LiveBandwidthSample } from "@/components/OverviewCharts"
import { ServerTable } from "@/components/ServerTable"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Segmented } from "@/components/ui/segmented"
import { Skeleton } from "@/components/ui/skeleton"
import type { Node } from "@/lib/api"
import {
  bytes,
  compact,
  daysUntil,
  distro,
  duration,
  FOREVER,
  monthUsage,
  pair,
  percent,
} from "@/lib/format"
import { usePref } from "@/lib/prefs"
import { Link } from "@/lib/route"
import { cn } from "@/lib/utils"

const OverviewCharts = lazy(() =>
  import("@/components/OverviewCharts").then((m) => ({ default: m.OverviewCharts })),
)

const MAX_LIVE_SAMPLES = 30

function KpiTile({
  label,
  value,
  sub,
  icon: Icon,
  iconClass,
  meter,
}: {
  label: string
  value: React.ReactNode
  sub: React.ReactNode
  icon: React.ComponentType<{ className?: string }>
  iconClass?: string
  meter?: number | null
}) {
  return (
    <Card className="min-w-0 justify-between gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-medium text-muted-foreground">{label}</span>
        <Icon className={cn("size-4 shrink-0 text-muted-foreground", iconClass)} />
      </div>
      <div className="space-y-2">
        <div className="tnum truncate text-2xl font-semibold tracking-[-0.03em] leading-none text-foreground">
          {value}
        </div>
        {meter !== undefined && <Meter pct={meter} className="h-1.5" />}
        <div className="tnum truncate text-xs text-muted-foreground">{sub}</div>
      </div>
    </Card>
  )
}

function NodeBentoCard({
  node,
  prefetchDetail,
}: {
  node: Node
  prefetchDetail: () => void
}) {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage ?? i18n.language
  const m = node.online ? node.metrics : null
  const cpuPct = m ? m.cpu : null
  const memPct = m ? percent(m.mem_used, m.mem_total) : null
  const diskPct = m ? percent(m.disk_used, m.disk_total) : null
  const used = monthUsage(node)
  const days = node.expires_in !== undefined ? node.expires_in : daysUntil(node.expires_at)

  return (
    <Link
      href={`/node/${node.id}`}
      onPointerEnter={prefetchDetail}
      onFocus={prefetchDetail}
      className="group block min-w-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Card className="h-full min-w-0 gap-3.5 p-4 transition-colors group-hover:border-primary/45 group-hover:bg-accent/20">
        {/* Header: status dot, flag, name, subtle meta badges */}
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex min-w-0 items-center gap-2">
              <Dot node={node} className="size-2" />
              {node.country ? <Flag code={node.country} showCode={false} className="shrink-0" /> : null}
              <h3 className="min-w-0 truncate text-sm font-semibold tracking-[-0.01em] text-foreground transition-colors group-hover:text-primary">
                {node.name}
              </h3>
            </div>
            <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              <OsIcon os={node.os} className="size-3" />
              <span className="truncate">{distro(node.os) || "—"}</span>
              {node.cpu_cores > 0 && (
                <>
                  <span className="opacity-50">·</span>
                  <span className="tnum shrink-0">{node.cpu_cores}C</span>
                </>
              )}
              {node.mem_total > 0 && (
                <>
                  <span className="opacity-50">/</span>
                  <span className="tnum shrink-0">{compact(node.mem_total)}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {days !== null && days < 0 && (
              <Badge variant="destructive" className="px-1.5 py-0 text-[10px]">
                {t("table.expiry.expired")}
              </Badge>
            )}
            {days !== null && days >= 0 && days <= 7 && (
              <Badge variant="warning" className="px-1.5 py-0 text-[10px]">
                {t("table.expiry.days", { days })}
              </Badge>
            )}
            <ArrowUpRight className="size-3.5 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary motion-reduce:transition-none" />
          </div>
        </div>

        {/* 3-column live resource meters */}
        <div className="grid grid-cols-3 gap-2.5">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{t("charts.tabs.cpu")}</span>
              <span className="tnum font-medium text-foreground">
                {cpuPct !== null ? `${cpuPct.toFixed(0)}%` : "—"}
              </span>
            </div>
            <Meter pct={cpuPct} />
          </div>

          <div className="min-w-0 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{t("charts.tabs.mem")}</span>
              <span className="tnum font-medium text-foreground">
                {memPct !== null ? `${memPct.toFixed(0)}%` : "—"}
              </span>
            </div>
            <Meter pct={memPct} />
          </div>

          <div className="min-w-0 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{t("charts.tabs.disk")}</span>
              <span className="tnum font-medium text-foreground">
                {diskPct !== null ? `${diskPct.toFixed(0)}%` : "—"}
              </span>
            </div>
            <Meter pct={diskPct} />
          </div>
        </div>

        {/* Footer: live speed + uptime & period traffic */}
        <div className="flex min-w-0 items-center justify-between gap-2 border-t border-border/50 pt-2.5 text-xs text-muted-foreground">
          <div className="tnum flex min-w-0 items-center gap-2">
            {m ? (
              <>
                <span className="inline-flex items-center gap-0.5 text-foreground">
                  <ArrowDown className="size-3 shrink-0 text-success" />
                  {compact(m.net_rx)}/s
                </span>
                <span className="inline-flex items-center gap-0.5 text-foreground">
                  <ArrowUp className="size-3 shrink-0 text-info" />
                  {compact(m.net_tx)}/s
                </span>
              </>
            ) : (
              <span>{node.online ? t("status.waitingReport") : t("status.offline")}</span>
            )}
          </div>

          <div className="tnum flex shrink-0 items-center gap-2">
            {m && (
              <span className="hidden sm:inline">{duration(m.uptime, lang)}</span>
            )}
            <span className="truncate font-medium text-foreground/85">
              {compact(used)} / {node.traffic_limit > 0 ? compact(node.traffic_limit) : FOREVER}
            </span>
          </div>
        </div>
      </Card>
    </Link>
  )
}

/**
 * Redesigned Arc Fleet Telemetry Overview (`/`):
 * group filter bar + 4 KPI hero tiles + 4 live Recharts analytics panels
 * + Arc Bento node cards with optional compact table toggle.
 */
export function OverviewDashboard({
  nodes,
  prefetchDetail,
}: {
  nodes: Node[]
  prefetchDetail: () => void
}) {
  const { t } = useTranslation()
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [viewMode, setViewMode] = usePref<string>("overview-view", "cards")
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

  const filteredNodes = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return scopedNodes
    return scopedNodes.filter((n) => `${n.name} ${n.country} ${n.os} ${n.group ?? ""}`.toLowerCase().includes(q))
  }, [scopedNodes, query])

  const viewOptions = useMemo(
    () => [
      { value: "cards", label: <LayoutGrid className="size-3.5" />, title: t("overview.viewCards") },
      { value: "table", label: <Table2 className="size-3.5" />, title: t("overview.viewTable") },
    ],
    [t],
  )

  return (
    <div className="min-w-0 space-y-5">
      {/* Hero heading + Group filter strip */}
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2.5">
              <h1 className="truncate text-xl font-semibold tracking-[-0.025em] text-foreground sm:text-2xl">
                {t("overview.title")}
              </h1>
              <Badge variant="success" className="gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium">
                <span className="size-1.5 rounded-full bg-success" />
                {t("overview.livePulse")}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground sm:text-sm">{t("overview.subtitle")}</p>
          </div>
        </div>

        {groups.length > 0 && (
          <div className="scrollbar-none flex items-center gap-1.5 overflow-x-auto pb-0.5">
            <button
              type="button"
              onClick={() => setSelectedGroup(null)}
              className={cn(
                "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer",
                selectedGroup === null
                  ? "bg-primary text-primary-foreground shadow-2xs"
                  : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {t("common.all")} ({nodes.length})
            </button>
            {groups.map((g) => {
              const count = nodes.filter((n) => n.group === g).length
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => setSelectedGroup(g)}
                  className={cn(
                    "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer",
                    selectedGroup === g
                      ? "bg-primary text-primary-foreground shadow-2xs"
                      : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {g} ({count})
                </button>
              )
            })}
            {hasUngrouped && (
              <button
                type="button"
                onClick={() => setSelectedGroup("")}
                className={cn(
                  "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer",
                  selectedGroup === ""
                    ? "bg-primary text-primary-foreground shadow-2xs"
                    : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {t("common.ungrouped")} ({nodes.filter((n) => !(n.group ?? "")).length})
              </button>
            )}
          </div>
        )}
      </div>

      {/* 4 Hero Telemetry KPI Tiles */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          label={t("overview.kpi.fleetHealth")}
          value={
            <>
              {stats.onlineCount}
              <span className="text-base font-normal text-muted-foreground"> / {stats.totalCount}</span>
            </>
          }
          sub={t("overview.kpi.onlineRate", { rate: stats.onlineRate })}
          icon={Activity}
          iconClass="text-success"
          meter={stats.onlineRate}
        />

        <KpiTile
          label={t("overview.kpi.avgCpu")}
          value={reporting.length > 0 ? `${stats.avgCpu.toFixed(1)}%` : "—"}
          sub={t("overview.kpi.totalCores", { cores: stats.totalCores })}
          icon={Cpu}
          iconClass="text-primary"
          meter={reporting.length > 0 ? stats.avgCpu : null}
        />

        <KpiTile
          label={t("overview.kpi.memory")}
          value={stats.memTotal > 0 ? `${stats.memPct.toFixed(1)}%` : "—"}
          sub={stats.memTotal > 0 ? pair(stats.memUsed, stats.memTotal) : t("overview.kpi.memPercent", { pct: 0 })}
          icon={MemoryStick}
          iconClass="text-info"
          meter={stats.memTotal > 0 ? stats.memPct : null}
        />

        <KpiTile
          label={t("overview.kpi.throughput")}
          value={
            <span className="inline-flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-lg sm:text-xl">
              <span className="inline-flex items-center gap-1">
                <ArrowDown className="size-4 text-success" />
                {compact(stats.netRx)}/s
              </span>
              <span className="inline-flex items-center gap-1">
                <ArrowUp className="size-4 text-info" />
                {compact(stats.netTx)}/s
              </span>
            </span>
          }
          sub={t("overview.kpi.periodTotal", { total: bytes(stats.periodTraffic) })}
          icon={HardDrive}
        />
      </div>

      {/* 4 Live Recharts Telemetry Panels */}
      <Suspense fallback={<ChartsSkeleton />}>
        <OverviewCharts nodes={scopedNodes} bandwidthHistory={liveBandwidth} />
      </Suspense>

      {/* Node Directory: Arc Bento Cards (default) or Compact Table */}
      <section className="space-y-3.5">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold tracking-[-0.01em] text-foreground">
              {t("overview.directory.title")}
            </h2>
            <Badge variant="secondary" className="tnum font-normal">
              {filteredNodes.length !== scopedNodes.length
                ? `${filteredNodes.length} / ${scopedNodes.length}`
                : scopedNodes.length}
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            {viewMode === "cards" && (
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("table.searchPlaceholder")}
                  aria-label={t("table.searchPlaceholder")}
                  className="h-8 w-40 rounded-lg bg-card pl-8 text-xs sm:w-52"
                />
              </div>
            )}
            <Segmented
              value={viewMode === "table" ? "table" : "cards"}
              onChange={setViewMode}
              options={viewOptions}
              label={t("overview.viewModeLabel")}
            />
          </div>
        </div>

        {viewMode === "table" ? (
          <ServerTable nodes={scopedNodes} />
        ) : filteredNodes.length === 0 ? (
          <Card className="py-14 text-center text-sm text-muted-foreground">{t("table.empty")}</Card>
        ) : (
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3">
            {filteredNodes.map((node) => (
              <NodeBentoCard key={node.id} node={node} prefetchDetail={prefetchDetail} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function ChartsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <Skeleton className="h-72 rounded-xl lg:col-span-7" />
      <Skeleton className="h-72 rounded-xl lg:col-span-5" />
      <Skeleton className="h-64 rounded-xl lg:col-span-7" />
      <Skeleton className="h-64 rounded-xl lg:col-span-5" />
    </div>
  )
}

export function OverviewSkeleton() {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-7 w-44 rounded-lg" />
        <Skeleton className="h-4 w-72 max-w-full rounded-md" />
      </div>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <ChartsSkeleton />
      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-40 rounded-xl" />
        ))}
      </div>
    </div>
  )
}
