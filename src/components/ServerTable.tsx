import { useState, type ReactNode } from "react"

import { Dot, Flag, Meter, Num, OsIcon, SLOT } from "@/components/NodeMarks"
import { RowDetails } from "@/components/RowDetails"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { Node } from "@/lib/api"
import { bytes, compact, daysUntil, distro, duration, FOREVER, monthUsage, pair, percent } from "@/lib/format"
import { cn } from "@/lib/utils"

/**
 * The figure over its meter, as shadcn's stat tiles set them: the text carries
 * the value and the capsule the fullness.
 */
function Bar({ pct, label }: { pct: number | null; label?: string }) {
  const v = pct === null ? 0 : Math.min(100, Math.max(0, pct))
  return (
    <div className="flex flex-col gap-1">
      <span className="tnum text-[11px] leading-none text-muted-foreground @max-3xl:text-[9px]">
        {label ?? (pct === null ? "—" : `${v.toFixed(1)}%`)}
      </span>
      <Meter pct={pct} />
    </div>
  )
}

function Expiry({ node }: { node: Node }) {
  const days = daysUntil(node.expires_at)
  if (days === null) return <span className="text-muted-foreground" title="永不到期">{FOREVER}</span>
  if (days < 0) return <Badge variant="destructive" className="px-1.5 py-0 text-[10px] font-normal">已过期</Badge>
  if (days <= 7) return <Badge variant="warning" className="px-1.5 py-0 text-[10px] font-normal">{days} 天</Badge>
  return <span className="text-foreground">{days} 天</span>
}

/**
 * Column widths and responsive folding.
 * On wide screens (max-w-7xl), all 12 columns are comfortably displayed.
 * On smaller screens, secondary columns gracefully hide.
 */
const COL = {
  status: "w-12 text-center @max-3xl:w-[6%]",
  name: "min-w-28 max-w-56 truncate text-left font-medium @max-3xl:w-[16%] @max-3xl:max-w-none @max-3xl:min-w-0 @max-sm:w-[18%]",
  location: "w-16 text-center @max-3xl:w-[7%] @max-sm:hidden",
  os: "w-28 text-center @max-5xl:hidden",
  uptime: "w-20 text-center @max-3xl:hidden",
  expiry: "w-20 text-center @max-5xl:hidden",
  load: "w-16 text-center @max-3xl:hidden",
  speed: "min-w-28 text-center @max-3xl:w-[21%] @max-3xl:min-w-0",
  bar: "w-20 min-w-16 text-center @max-3xl:w-[10%] @max-3xl:min-w-0 @max-sm:w-[11%]",
  traffic: "w-28 min-w-22 text-center @max-3xl:w-[22%] @max-3xl:min-w-0 @max-sm:w-[23%]",
}

function Row({ node }: { node: Node }) {
  const [open, setOpen] = useState(false)
  const m = node.online ? node.metrics : null
  const traffic = monthUsage(node)
  const toggle = () => setOpen((o) => !o)

  return (
    <>
      <TableRow
        aria-expanded={open}
        tabIndex={0}
        onClick={toggle}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), toggle())}
        className={cn(
          "cursor-pointer transition-colors hover:bg-muted/40",
          open && "border-b-0 bg-muted/25 hover:bg-muted/30",
        )}
      >
        <TableCell className={COL.status}><Dot node={node} className="mx-auto block" /></TableCell>
        <TableCell className={cn(COL.name, "text-left font-medium")} title={node.name}>{node.name}</TableCell>
        <TableCell className={COL.location}><Flag code={node.country} /></TableCell>
        <TableCell className={COL.os}>
          <span className="inline-flex items-center justify-center gap-1.5">
            <OsIcon os={node.os} />
            <span className="truncate">{distro(node.os) || "—"}</span>
          </span>
        </TableCell>
        <TableCell className={cn(COL.uptime, "tnum")}>{m ? duration(m.uptime) : "—"}</TableCell>
        <TableCell className={cn(COL.expiry, "tnum")}><Expiry node={node} /></TableCell>
        <TableCell className={cn(COL.load, "tnum")}>{m ? m.load[0].toFixed(2) : "—"}</TableCell>
        <TableCell className={COL.speed}>
          {m ? (
            <div className="inline-flex items-center justify-center text-xs">
              <span className="text-emerald-600 dark:text-emerald-400 mr-0.5">↓</span>
              <Num ch={SLOT.compact} className="@max-3xl:min-w-0">{compact(m.net_rx)}</Num>
              <span className="mx-1 text-muted-foreground/60">|</span>
              <span className="text-blue-600 dark:text-blue-400 mr-0.5">↑</span>
              <Num ch={SLOT.compact} className="@max-3xl:min-w-0">{compact(m.net_tx)}</Num>
            </div>
          ) : (
            "— | —"
          )}
        </TableCell>
        <TableCell className={COL.bar}><Bar pct={m ? m.cpu : null} /></TableCell>
        <TableCell className={COL.bar}><Bar pct={m ? percent(m.mem_used, m.mem_total) : null} /></TableCell>
        <TableCell className={COL.bar}><Bar pct={m ? percent(m.disk_used, m.disk_total) : null} /></TableCell>
        <TableCell
          className={COL.traffic}
          title={`本期已用 ${node.traffic_limit > 0 ? `${pair(traffic, node.traffic_limit)}（${((traffic / node.traffic_limit) * 100).toFixed(1)}%）` : `${bytes(traffic)} · 无流量配额`}`}
        >
          <Bar
            pct={node.traffic_limit > 0 ? percent(traffic, node.traffic_limit) : null}
            label={`${compact(traffic)} / ${node.traffic_limit > 0 ? compact(node.traffic_limit) : FOREVER}`}
          />
        </TableCell>
      </TableRow>
      {open && (
        <TableRow className="border-b bg-muted/25 hover:bg-muted/25">
          <TableCell colSpan={12} className="p-0! text-left whitespace-normal">
            <RowDetails node={node} />
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

export function ServerTable({ nodes }: { nodes: Node[] }) {
  const online = nodes.filter((n) => n.online && n.metrics)
  const live = (pick: (m: NonNullable<Node["metrics"]>) => number) => online.reduce((total, n) => total + pick(n.metrics!), 0)
  const all = (pick: (n: Node) => number) => nodes.reduce((total, n) => total + pick(n), 0)
  const heads: [keyof typeof COL, ReactNode][] = [
    ["status", "状态"], ["name", "名称"], ["location", "位置"], ["os", "系统"], ["uptime", "在线"],
    ["expiry", "到期"], ["load", "负载"], ["speed", "网速 ↓|↑"],
    ["bar", "CPU"], ["bar", "内存"], ["bar", "硬盘"], ["traffic", "流量"],
  ]

  return (
    <Card className="@container gap-0 overflow-hidden py-0">
      {/* Fleet overview summary chips in header */}
      <CardHeader className="border-b border-border/60 py-3.5 sm:flex-row sm:items-center sm:justify-between max-md:px-3">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">服务器列表</CardTitle>
          <Badge variant="secondary" className="font-normal text-muted-foreground text-[11px]">
            {nodes.length} 个节点
          </Badge>
        </div>
        <div className="tnum flex flex-wrap items-center gap-2 text-xs">
          <div
            className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-muted/40 px-2.5 py-1"
            title="在线节点数 / 节点总数"
          >
            <span className="size-2 rounded-full bg-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,0.2)]" />
            <span className="text-muted-foreground">在线</span>
            <span className="font-semibold text-foreground">
              <Num ch={String(nodes.length).length}>{nodes.filter((n) => n.online).length}</Num> / {nodes.length}
            </span>
          </div>

          <div
            className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-muted/40 px-2.5 py-1"
            title="在线节点此刻的下行与上行之和"
          >
            <span className="text-muted-foreground">网速</span>
            <span className="font-semibold text-foreground">
              <span className="text-emerald-600 dark:text-emerald-400">↓</span>{" "}
              <Num ch={SLOT.compact}>{compact(live((m) => m.net_rx))}</Num>/s{" "}
              <span className="text-blue-600 dark:text-blue-400">↑</span>{" "}
              <Num ch={SLOT.compact}>{compact(live((m) => m.net_tx))}</Num>/s
            </span>
          </div>

          <div
            className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-muted/40 px-2.5 py-1"
            title="所有节点本期的下载与上传之和"
          >
            <span className="text-muted-foreground">本月</span>
            <span className="font-semibold text-foreground">
              ↓ <Num ch={SLOT.bytes}>{bytes(all((n) => n.month_rx))}</Num>{" "}
              ↑ <Num ch={SLOT.bytes}>{bytes(all((n) => n.month_tx))}</Num>
            </span>
          </div>

          <div
            className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-muted/40 px-2.5 py-1 max-sm:hidden"
            title="所有节点自接入以来的下载与上传之和"
          >
            <span className="text-muted-foreground">累计</span>
            <span className="font-semibold text-foreground">
              ↓ <Num ch={SLOT.bytes}>{bytes(all((n) => n.total_rx))}</Num>{" "}
              ↑ <Num ch={SLOT.bytes}>{bytes(all((n) => n.total_tx))}</Num>
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <Table className="text-center text-sm @max-3xl:table-fixed @max-3xl:text-[10px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent bg-muted/20">
              {heads.map(([col, label], i) => (
                <TableHead
                  key={i}
                  className={cn("h-9 px-2 text-center text-xs font-medium text-muted-foreground @max-3xl:px-1", COL[col], col === "name" && "text-left")}
                >
                  {label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody className="[&_td]:px-2 [&_td]:py-2 @max-3xl:[&_td]:px-1">
            {nodes.map((n) => (
              <Row key={n.id} node={n} />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
