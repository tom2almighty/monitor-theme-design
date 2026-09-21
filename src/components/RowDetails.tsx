import { lazy, Suspense, type ReactNode } from "react"
import { ChartLine } from "lucide-react"

import { barTone, deployed, Num, OsIcon, SLOT } from "@/components/NodeMarks"
import { Skeleton } from "@/components/ui/skeleton"
import type { Node } from "@/lib/api"
import {
  bytes, cpuName, CYCLES, daysUntil, dayUsage, FOREVER, money, monthUsage, osName, pair, percent, periodStart,
  rate, TRAFFIC_MODES, uptime, virtName,
} from "@/lib/format"
import { Link } from "@/lib/route"
import { cn } from "@/lib/utils"

// From the chart page's chunk, which App warms at start, so the table itself
// carries no recharts.
const Latency = lazy(() => import("@/components/NodeDetail").then((m) => ({ default: m.Latency })))

// Diagonal stripes over the fill: Bootstrap 3's own mark for the part of a bar
// still moving, here the part of the period that is today.
const STRIPES = "bg-[repeating-linear-gradient(-45deg,rgb(255_255_255/0.4)_0_3px,transparent_3px_6px)]"

/**
 * One topic per block, titled and ruled off like a spec sheet, with the block's
 * one piece of standing information at the rule's right end. Flat rather than a
 * card: a shadowed box inside a table row would be furniture, and the rule
 * already says where one topic ends.
 */
function Block({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="min-w-0">
      <h4 className="mb-1 flex items-baseline justify-between gap-3 border-b pb-1 text-xs font-medium text-muted-foreground">
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
 * This period's usage against the plan's quota, with today's share striped at
 * the tip: today is the newest slice of the period, so the stripes show how
 * much of the bar the last day added. Rounded, as the row's bar is not, since
 * this one stands alone rather than in a column of them.
 */
function PeriodMeter({ used, today, limit, title }: { used: number; today: number; limit: number; title: string }) {
  const pct = percent(used, limit)
  // Today cannot exceed the period it is part of; the clamp covers a period that
  // reset since midnight.
  const share = pct > 0 ? (percent(Math.min(today, used), limit) / pct) * 100 : 0
  return (
    <div
      title={title}
      className="relative my-1.5 h-2.5 overflow-hidden rounded-full bg-bar-track shadow-[inset_0_1px_2px_rgb(0_0_0/0.1)]"
    >
      <div
        className={cn("absolute inset-y-0 left-0 rounded-full transition-[width] duration-500", barTone(pct))}
        style={{ width: `${pct}%` }}
      >
        {/* At least a hairline once there is anything to mark: a day that used a
            tenth of a percent is otherwise a stripe narrower than a pixel. */}
        {today > 0 && <div className={cn("absolute inset-y-0 right-0 min-w-0.5", STRIPES)} style={{ width: `${share}%` }} />}
      </div>
    </div>
  )
}

/** The stripes as a swatch beside the line they stand for. */
function StripeSwatch({ pct }: { pct: number }) {
  return (
    <span aria-hidden className={cn("relative mr-1.5 inline-block h-2 w-3.5 overflow-hidden rounded-xs align-[-1px]", barTone(pct))}>
      <span className={cn("absolute inset-0", STRIPES)} />
    </span>
  )
}

/**
 * What a row opens into: four blocks -- the machine, what it is doing, what it
 * has moved, and its term -- and beneath them the last day of round trips, when
 * any probe pings this node.
 */
export function RowDetails({ node }: { node: Node }) {
  if (!deployed(node)) {
    return <p className="px-4 py-3 text-muted-foreground">尚未接入。在后台生成安装命令并执行一次。</p>
  }
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
    <div className="space-y-3 px-4 pt-2 pb-3 text-[13px] leading-6 @max-3xl:px-2 @max-3xl:text-xs @max-3xl:leading-5">
      {/* Two blocks across from a large phone, four on a wide panel. A block is
          read top to bottom, so nothing wraps between columns, and lines a row
          already shows on a wide panel -- system, uptime, expiry, load -- are
          here for the phone, where the row folds them away. */}
      <div className="grid gap-x-6 gap-y-3 @min-[30rem]:grid-cols-2 @6xl:grid-cols-4">
        <Block title="系统" aside={node.agent_version && <span className="tnum font-normal">agent {node.agent_version}</span>}>
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
            readings, and a line of dashes says less than no line. */}
        <Block
          title="资源"
          aside={
            <Link href={`/node/${node.id}`} className="inline-flex items-center gap-1 font-normal text-primary hover:underline">
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
          {m && (
            <>
              <Line label="负载">{m.load.map((n) => n.toFixed(2)).join(" / ")}</Line>
              <Line label="进程">{m.procs} · TCP {m.tcp} · UDP {m.udp}</Line>
              <Line label="网速">
                ↓ <Num ch={SLOT.rate}>{rate(m.net_rx)}</Num> · ↑ <Num ch={SLOT.rate}>{rate(m.net_tx)}</Num>
              </Line>
            </>
          )}
        </Block>

        <Block title="流量" aside={since && <span className="tnum font-normal">{since}起</span>}>
          <Line label="本期">{limit > 0 ? usage(used, limit) : `${bytes(used)} / ${FOREVER}`}</Line>
          {limit > 0 && (
            <PeriodMeter used={used} today={today} limit={limit} title={`本期已用 ${pair(used, limit)}，其中今日 ${bytes(today)}`} />
          )}
          <Line label="今日">
            {limit > 0 && <StripeSwatch pct={percent(used, limit)} />}
            {flow(node.day_rx, node.day_tx)}
          </Line>
          <Line label="累计">{flow(node.total_rx, node.total_tx)}</Line>
          {metering.length > 0 && <Line label="计量">{metering.join(" · ")}</Line>}
        </Block>

        <Block title="账期">
          <Line label="续费">
            {node.price > 0 ? `${money(node.price, node.currency)} / ${CYCLES[node.billing_cycle] ?? node.billing_cycle}` : "免费"}
          </Line>
          <Line label="到期">{node.expires_at || "长期有效"}</Line>
          {days !== null && (
            <Line label="剩余" className={days < 0 ? "text-danger" : days <= 7 ? "text-warn" : undefined}>
              {days < 0 ? `已过期 ${-days} 天` : `${days} 天`}
            </Line>
          )}
        </Block>
      </div>

      {/* Fetched when the row opens, over the window picked in its heading. Draws
          nothing, heading included, for a node no probe pings. */}
      <Suspense fallback={<div className="border-t pt-3"><Skeleton className="h-[280px] @max-3xl:h-[220px]" /></div>}>
        <Latency id={node.id} title="网络延迟" className="h-[280px] @max-3xl:h-[220px]" />
      </Suspense>
    </div>
  )
}
