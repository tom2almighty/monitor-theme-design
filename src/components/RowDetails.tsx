import { lazy, Suspense, useEffect, useState, type ReactNode } from "react"
import { ChartLine } from "lucide-react"

import { deployed, Meter, OsIcon } from "@/components/NodeMarks"
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
 * One topic per card, on the shaded strip the open row lays down: the card is
 * what says where one topic ends, and its heading what the topic is, with the
 * one piece of standing information at the heading's right end. The cards in a
 * row stretch to one height, so the strip reads as a row of tiles rather than
 * a stack of lists.
 */
function Block({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-lg border bg-card px-3 py-2.5 shadow-xs">
      <h4 className="mb-1.5 flex items-baseline justify-between gap-3 text-xs font-medium text-muted-foreground">
        <span>{title}</span>
        {aside}
      </h4>
      {children}
    </section>
  )
}

/** One fact per line, the label in a fixed column so the values align. */
function Line({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 grid-cols-[3em_minmax(0,1fr)] gap-x-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("tnum break-words", className)}>{children}</span>
    </div>
  )
}

/**
 * This period's usage against the plan's quota, with today's share lifted a
 * shade at the tip: today is the newest slice of the period, so the lighter
 * end is how much of the bar the last day added. The title says how much.
 */
function PeriodMeter({ used, today, limit, title }: { used: number; today: number; limit: number; title: string }) {
  const pct = percent(used, limit)
  // Today cannot exceed the period it is part of; the clamp covers a period that
  // reset since midnight.
  const share = pct > 0 ? (percent(Math.min(today, used), limit) / pct) * 100 : 0
  return (
    <Meter pct={pct} title={title} className="my-1.5 h-2">
      {/* At least a hairline once there is anything to mark: a day that used a
          tenth of a percent is otherwise a tip narrower than a pixel. */}
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
  // How the quota is counted matters only while there is one.
  const metering = [
    node.traffic_reset_day > 0 && `每月 ${node.traffic_reset_day} 日重置`,
    limit > 0 && (TRAFFIC_MODES[node.traffic_mode] ?? node.traffic_mode),
  ].filter(Boolean)

  return (
    // Two cards across from a large phone, four on a wide panel. A card is read
    // top to bottom, so nothing wraps between columns, and the lines a row
    // already shows on a wide panel -- system, uptime, expiry, load -- are here
    // for the phone, where the row folds them away.
    <div className="grid gap-3 @min-[30rem]:grid-cols-2 @6xl:grid-cols-4">
      <Block title="系统" aside={node.agent_version && <span className="tnum">agent {node.agent_version}</span>}>
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

      {/* Only what is known: an offline node keeps its sizes and loses its
          readings, and a line of dashes says less than no line. The rate and
          the counts stay in the row and the chart page. */}
      <Block
        title="资源"
        aside={
          <Link href={`/node/${node.id}`} className="inline-flex items-center gap-1 text-foreground hover:underline">
            <ChartLine className="size-3" />
            历史图表
          </Link>
        }
      >
        {m && <Line label="CPU">{m.cpu.toFixed(1)}%</Line>}
        <Line label="内存">{m ? usage(m.mem_used, m.mem_total) : bytes(node.mem_total)}</Line>
        <Line label="交换">
          {node.swap_total > 0 ? (m ? usage(m.swap_used, m.swap_total) : bytes(node.swap_total)) : "未启用"}
        </Line>
        <Line label="硬盘">{m ? usage(m.disk_used, m.disk_total) : bytes(node.disk_total)}</Line>
        {m && <Line label="负载">{m.load.map((n) => n.toFixed(2)).join(" / ")}</Line>}
      </Block>

      <Block title="流量" aside={since && <span className="tnum">{since}起</span>}>
        <Line label="本期">{limit > 0 ? usage(used, limit) : `${bytes(used)} / ${FOREVER}`}</Line>
        {limit > 0 && (
          <PeriodMeter used={used} today={today} limit={limit} title={`本期已用 ${pair(used, limit)}，其中今日 ${bytes(today)}`} />
        )}
        <Line label="今日">{flow(node.day_rx, node.day_tx)}</Line>
        <Line label="累计">{flow(node.total_rx, node.total_tx)}</Line>
        {metering.length > 0 && <Line label="计量">{metering.join(" · ")}</Line>}
      </Block>

      <Block title="账期">
        <Line label="续费">
          {node.price > 0 ? `${money(node.price, node.currency)} / ${CYCLES[node.billing_cycle] ?? node.billing_cycle}` : "免费"}
        </Line>
        <Line label="到期">{node.expires_at || "长期有效"}</Line>
        {days !== null && (
          <Line
            label="剩余"
            className={days < 0 ? "text-red-600 dark:text-red-400" : days <= 7 ? "text-amber-600 dark:text-amber-400" : undefined}
          >
            {days < 0 ? `已过期 ${-days} 天` : `${days} 天`}
          </Line>
        )}
      </Block>
    </div>
  )
}

/**
 * What a row opens into: two tabs, the round trips to the node first and the
 * four cards of what it is behind them, for a node a probe pings; the cards
 * alone, with no tabs, for one none does. Which it is comes from what earlier
 * windows recorded, and until any has, from the window fetched as the row
 * opens -- shown as a placeholder meanwhile rather than as either tab, since
 * the cards would be swapped out under the reader a moment later, and a
 * latency tab would be promised to a node that may have none.
 */
export function RowDetails({ node }: { node: Node }) {
  const [learned, setLearned] = useState<boolean | null>(null)
  const has = learned ?? knownPing(node.id)
  // The reader's pick, kept apart from the default, so a latency tab that
  // appears once the window arrives is the one on screen unless they chose.
  const [tab, setTab] = useState<string | null>(null)
  const shown = has === true ? tab ?? "latency" : "overview"
  const ready = deployed(node)

  // The window's request starts as the row opens, alongside the chart's chunk
  // when that is still on its way, rather than after it; the chart then finds
  // the same request in the cache.
  useEffect(() => {
    if (ready) void fetchHistory(node.id, latencyWindow(), "ping")
  }, [node.id, ready])

  if (!ready) {
    return <p className="px-4 py-3 text-sm text-muted-foreground">尚未接入。在后台生成安装命令并执行一次。</p>
  }

  return (
    <div className="space-y-3 px-4 py-3 text-[13px] leading-6 @max-3xl:px-2 @max-3xl:text-xs @max-3xl:leading-5">
      {has === true && <Segmented value={shown} onChange={setTab} options={TABS} label="详情" />}

      {has === undefined && <Skeleton className="h-[340px] rounded-lg" />}

      {/* Mounted whichever tab is up, hidden rather than unmounted: the chart
          is what answers whether the node has a probe, on every open, so a
          node found to have none is asked again next time; and it keeps its
          zoom and its hidden probes across a switch to the cards and back. */}
      <div hidden={shown !== "latency"}>
        <Suspense fallback={has === true ? <Skeleton className="h-[340px] rounded-lg" /> : null}>
          <Latency id={node.id} card className="h-[280px] @max-3xl:h-[220px]" onKnown={setLearned} />
        </Suspense>
      </div>
      <div hidden={shown !== "overview" || has === undefined}>
        <Overview node={node} />
      </div>
    </div>
  )
}
