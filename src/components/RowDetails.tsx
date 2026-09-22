import { lazy, Suspense, useEffect, useState, type ReactNode } from "react"
import { ChartLine } from "lucide-react"

import { deployed, Meter, OsIcon } from "@/components/NodeMarks"
import { Badge } from "@/components/ui/badge"
import { Segmented } from "@/components/ui/segmented"
import { Skeleton } from "@/components/ui/skeleton"
import type { Node } from "@/lib/api"
import {
  bytes, cpuName, CYCLES, daysUntil, dayUsage, FOREVER, money, monthUsage, osName, pair, percent, periodStart,
  TRAFFIC_MODES, uptime, virtName,
} from "@/lib/format"
import { fetchHistory, latencyWindow } from "@/lib/history"
import { knownPing } from "@/lib/pings"
import { Link } from "@/lib/route"
import { cn } from "@/lib/utils"

// From the chart page's chunk, which App warms at start, so the table itself
// carries no recharts.
const Latency = lazy(() => import("@/components/NodeDetail").then((m) => ({ default: m.Latency })))

const TABS = [
  { value: "latency", label: "网络延迟" },
  { value: "overview", label: "系统概览" },
]

/**
 * One topic per card, on the shaded strip the open row lays down.
 */
function Block({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-lg border border-border/80 bg-card p-3.5 shadow-xs">
      <h4 className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold text-foreground">
        <span>{title}</span>
        {aside}
      </h4>
      <div className="space-y-1">{children}</div>
    </section>
  )
}

/** One fact per line, the label in a fixed column so the values align. */
function Line({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 grid-cols-[3.8rem_minmax(0,1fr)] items-baseline gap-x-2 text-xs leading-5">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("tnum break-words font-medium text-foreground", className)}>{children}</span>
    </div>
  )
}

/**
 * This period's usage against the plan's quota, with today's share lifted a
 * shade at the tip.
 */
function PeriodMeter({ used, today, limit, title }: { used: number; today: number; limit: number; title: string }) {
  const pct = percent(used, limit)
  const share = pct > 0 ? (percent(Math.min(today, used), limit) / pct) * 100 : 0
  return (
    <Meter pct={pct} title={title} className="my-1.5 h-2">
      {today > 0 && <div className="absolute inset-y-0 right-0 min-w-0.5 rounded-r-full bg-background/45" style={{ width: `${share}%` }} />}
    </Meter>
  )
}

/** The four cards: the machine, what it is doing, what it has moved, and its term. */
function Overview({ node }: { node: Node }) {
  const m = node.online ? node.metrics : null
  const away = node.last_seen ? Date.now() / 1000 - node.last_seen : 0
  const days = daysUntil(node.expires_at)
  const used = monthUsage(node)
  const today = dayUsage(node)
  const limit = node.traffic_limit
  const since = periodStart(node.month_start)
  const usage = (used: number, total: number) => `${pair(used, total)}（${percent(used, total).toFixed(1)}%）`
  const flow = (rx: number, tx: number) => `↓ ${bytes(rx)} · ↑ ${bytes(tx)}`
  const metering = [
    node.traffic_reset_day > 0 && `每月 ${node.traffic_reset_day} 日重置`,
    limit > 0 && (TRAFFIC_MODES[node.traffic_mode] ?? node.traffic_mode),
  ].filter(Boolean)

  return (
    <div className="grid gap-3 @min-[30rem]:grid-cols-2 @6xl:grid-cols-4">
      <Block
        title="系统信息"
        aside={
          node.agent_version && (
            <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal text-muted-foreground">
              v{node.agent_version}
            </Badge>
          )
        }
      >
        <Line label="系统">
          <span className="inline-flex max-w-full items-center gap-1.5 align-middle">
            <OsIcon os={node.os} />
            <span className="min-w-0 truncate">{osName(node.os) || "—"}</span>
          </span>
        </Line>
        {node.kernel && <Line label="内核">{node.kernel}</Line>}
        <Line label="架构">{[node.arch, virtName(node.virt)].filter(Boolean).join(" · ") || "—"}</Line>
        <Line label="CPU">{node.cpu_name ? `${cpuName(node.cpu_name)} × ${node.cpu_cores}` : `${node.cpu_cores} 核`}</Line>
        <Line label={node.online ? "在线" : "离线"}>
          {node.online ? (m ? uptime(m.uptime) : "等待上报") : away >= 60 ? uptime(away) : "刚刚"}
        </Line>
      </Block>

      <Block
        title="资源监控"
        aside={
          <Link href={`/node/${node.id}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
            <ChartLine className="size-3" />
            历史图表
          </Link>
        }
      >
        {m && <Line label="CPU">{m.cpu.toFixed(1)}%</Line>}
        <Line label="内存">{m ? usage(m.mem_used, m.mem_total) : bytes(node.mem_total)}</Line>
        <Line label="交换">{node.swap_total > 0 ? (m ? usage(m.swap_used, m.swap_total) : bytes(node.swap_total)) : "未启用"}</Line>
        <Line label="硬盘">{m ? usage(m.disk_used, m.disk_total) : bytes(node.disk_total)}</Line>
        {m && <Line label="负载">{m.load.map((n) => n.toFixed(2)).join(" / ")}</Line>}
      </Block>

      <Block
        title="流量统计"
        aside={
          since && (
            <span className="tnum text-[11px] text-muted-foreground">
              {since}起
            </span>
          )
        }
      >
        <Line label="本期">{limit > 0 ? usage(used, limit) : `${bytes(used)} / ${FOREVER}`}</Line>
        {limit > 0 && (
          <PeriodMeter used={used} today={today} limit={limit} title={`本期已用 ${pair(used, limit)}，其中今日 ${bytes(today)}`} />
        )}
        <Line label="今日">{flow(node.day_rx, node.day_tx)}</Line>
        <Line label="累计">{flow(node.total_rx, node.total_tx)}</Line>
        {metering.length > 0 && <Line label="计量">{metering.join(" · ")}</Line>}
      </Block>

      <Block title="账期信息">
        <Line label="续费">
          {node.price > 0 ? `${money(node.price, node.currency)} / ${CYCLES[node.billing_cycle] ?? node.billing_cycle}` : "免费"}
        </Line>
        <Line label="到期">{node.expires_at || "长期有效"}</Line>
        {days !== null && (
          <Line label="剩余">
            {days < 0 ? (
              <Badge variant="destructive" className="px-1.5 py-0 text-[10px]">已过期 {-days} 天</Badge>
            ) : days <= 7 ? (
              <Badge variant="warning" className="px-1.5 py-0 text-[10px]">剩余 {days} 天</Badge>
            ) : (
              `${days} 天`
            )}
          </Line>
        )}
      </Block>
    </div>
  )
}

/**
 * What a row opens into: two tabs, the round trips to the node first and the
 * four cards of what it is behind them.
 */
export function RowDetails({ node }: { node: Node }) {
  const [learned, setLearned] = useState<boolean | null>(null)
  const has = learned ?? knownPing(node.id)
  const [tab, setTab] = useState<string | null>(null)
  const shown = has === true ? tab ?? "latency" : "overview"
  const ready = deployed(node)

  useEffect(() => {
    if (ready) void fetchHistory(node.id, latencyWindow(), "ping")
  }, [node.id, ready])

  if (!ready) {
    return <p className="px-4 py-4 text-sm text-muted-foreground">尚未接入。在后台生成安装命令并执行一次。</p>
  }

  return (
    <div className="space-y-3.5 px-4 py-3.5 text-xs @max-3xl:px-2">
      {has === true && (
        <div className="flex items-center">
          <Segmented value={shown} onChange={setTab} options={TABS} label="详情视图" />
        </div>
      )}

      {has === undefined && <Skeleton className="h-[320px] rounded-lg" />}

      <div hidden={shown !== "latency"}>
        <Suspense fallback={has === true ? <Skeleton className="h-[320px] rounded-lg" /> : null}>
          <Latency id={node.id} card className="h-[280px] @max-3xl:h-[220px]" onKnown={setLearned} />
        </Suspense>
      </div>

      <div hidden={shown !== "overview" || has === undefined}>
        <Overview node={node} />
      </div>
    </div>
  )
}
