import { useState, type ReactNode } from "react"

import { barTone, Dot, Flag, Num, OsIcon, SLOT } from "@/components/NodeMarks"
import { RowDetails } from "@/components/RowDetails"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { Node } from "@/lib/api"
import { bytes, compact, daysUntil, distro, duration, FOREVER, monthUsage, pair, percent } from "@/lib/format"
import { cn } from "@/lib/utils"

/**
 * The label sits over both halves of the bar in the text colour, which is why the
 * fills are light in the light theme and dark in the dark one.
 */
function Bar({ pct, label }: { pct: number | null; label?: string }) {
  const v = pct === null ? 0 : Math.min(100, Math.max(0, pct))
  return (
    <div className="relative h-5 overflow-hidden rounded bg-bar-track shadow-[inset_0_1px_2px_rgb(0_0_0/0.1)] @max-3xl:h-4">
      <div className={cn("h-full rounded-l-[3px] transition-[width] duration-500", barTone(v))} style={{ width: `${v}%` }} />
      <span className="tnum absolute inset-y-0 left-1.5 flex items-center text-[10px] leading-none text-bar-text @max-3xl:left-0.5 @max-3xl:text-[8px]">
        {label ?? (pct === null ? "—" : `${v.toFixed(1)}%`)}
      </span>
    </div>
  )
}

function Expiry({ node }: { node: Node }) {
  const days = daysUntil(node.expires_at)
  if (days === null) return <span className="text-muted-foreground" title="永不到期">{FOREVER}</span>
  if (days < 0) return <span className="text-danger">已过期</span>
  return <span className={cn(days <= 7 && "text-warn")}>{days} 天</span>
}

/**
 * Column widths and what folds away, applied to the header and every cell alike.
 * The panel is the container, so the table follows its own width rather than the
 * viewport's. Below 768px it switches to a fixed layout that fits a phone without
 * sideways scrolling, keeping the columns that change every push.
 */
const COL = {
  status: "w-14 @max-3xl:w-[6%]",
  name: "max-w-60 min-w-32 truncate @max-3xl:w-[14%] @max-3xl:max-w-none @max-3xl:min-w-0 @max-sm:w-[17%]",
  location: "w-20 @max-3xl:w-[7%] @max-sm:hidden",
  os: "min-w-24 @max-6xl:hidden",
  uptime: "min-w-18 @max-3xl:hidden",
  expiry: "min-w-18 @max-6xl:hidden",
  load: "w-16 @max-3xl:hidden",
  speed: "min-w-30 @max-3xl:w-[21%] @max-3xl:min-w-0",
  bar: "w-[7.5%] min-w-22 @max-3xl:w-[10%] @max-3xl:min-w-0 @max-sm:w-[11%]",
  traffic: "w-[7.5%] min-w-22 @max-3xl:w-[22%] @max-3xl:min-w-0 @max-sm:w-[23%]",
}

function Row({ node, index }: { node: Node; index: number }) {
  const [open, setOpen] = useState(false)
  const m = node.online ? node.metrics : null
  const traffic = monthUsage(node)
  // Parity from the node rather than :nth-child, so an opened detail row takes its
  // node's shade instead of shifting every row beneath it.
  const shade = index % 2 ? "bg-muted" : ""
  const toggle = () => setOpen((o) => !o)

  return (
    <>
      <TableRow
        aria-expanded={open}
        tabIndex={0}
        onClick={toggle}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), toggle())}
        className={cn("cursor-pointer border-0 hover:bg-accent", shade)}
      >
        <TableCell className={COL.status}><Dot node={node} className="mx-auto block @max-3xl:size-2.5" /></TableCell>
        <TableCell className={COL.name} title={node.name}>{node.name}</TableCell>
        <TableCell className={COL.location}><Flag code={node.country} /></TableCell>
        <TableCell className={COL.os}>
          <span className="inline-flex items-center justify-center gap-1.5">
            <OsIcon os={node.os} />
            {distro(node.os) || "—"}
          </span>
        </TableCell>
        <TableCell className={COL.uptime}>{m ? duration(m.uptime) : "—"}</TableCell>
        <TableCell className={COL.expiry}><Expiry node={node} /></TableCell>
        <TableCell className={COL.load}>{m ? m.load[0].toFixed(2) : "—"}</TableCell>
        {/* No reservation on a phone: the column is 21% of the panel, 60px at
            320px, against the 70px two slots and their separator need, and the
            overflow disappears under the bar beside it. */}
        <TableCell className={COL.speed}>
          {m ? (
            <>
              <Num ch={SLOT.compact} className="@max-3xl:min-w-0">{compact(m.net_rx)}</Num> |{" "}
              <Num ch={SLOT.compact} className="@max-3xl:min-w-0">{compact(m.net_tx)}</Num>
            </>
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
        <TableRow className={cn("border-0 hover:bg-transparent", shade)}>
          <TableCell colSpan={12} className="border-t-0! p-0! text-left whitespace-normal">
            <RowDetails node={node} />
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

/** One figure of the fleet: the label in the quiet ink, the figure in the page's. */
function Stat({ label, title, children }: { label: string; title: string; children: ReactNode }) {
  return (
    <span className="whitespace-nowrap" title={title}>
      <span className="text-muted-foreground">{label}</span> <span className="text-foreground">{children}</span>
    </span>
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
    <section className="@container rounded-md border bg-card p-5 text-card-foreground shadow-sm max-md:p-2">
      {/* The fleet in four figures, each a label and a value rather than one
          string of dots: what is up, what it is moving now, what it has moved
          this period, and what it has moved ever. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1 pb-3 max-md:pb-2">
        <h2 className="text-lg font-semibold max-md:text-sm">服务器</h2>
        <div className="tnum flex flex-wrap gap-x-4 gap-y-0.5 text-xs max-md:gap-x-2.5 max-md:text-[10px]">
          <Stat label="在线" title="在线节点数 / 节点总数">
            {/* The online count is reserved for as many digits as the total has,
                since it cannot exceed it. */}
            <Num ch={String(nodes.length).length}>{nodes.filter((n) => n.online).length}</Num> / {nodes.length}
          </Stat>
          <Stat label="网速" title="在线节点此刻的下行与上行之和">
            ↓ <Num ch={SLOT.compact}>{compact(live((m) => m.net_rx))}</Num>/s{" "}
            ↑ <Num ch={SLOT.compact}>{compact(live((m) => m.net_tx))}</Num>/s
          </Stat>
          <Stat label="本月" title="所有节点本期的下载与上传之和">
            ↓ <Num ch={SLOT.bytes}>{bytes(all((n) => n.month_rx))}</Num>{" "}
            ↑ <Num ch={SLOT.bytes}>{bytes(all((n) => n.month_tx))}</Num>
          </Stat>
          <Stat label="累计" title="所有节点自接入以来的下载与上传之和">
            ↓ <Num ch={SLOT.bytes}>{bytes(all((n) => n.total_rx))}</Num>{" "}
            ↑ <Num ch={SLOT.bytes}>{bytes(all((n) => n.total_tx))}</Num>
          </Stat>
        </div>
      </div>
      <Table className="text-center text-sm @max-3xl:table-fixed @max-3xl:text-[10px]">
        <TableHeader>
          <TableRow className="border-0 hover:bg-transparent">
            {heads.map(([col, label], i) => (
              <TableHead key={i} className={cn("h-8 border-t px-1.5 text-center font-semibold @max-3xl:px-0.5", COL[col])}>
                {label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        {/* Rules between rows rather than under them, as the header row starts. */}
        <TableBody className="[&_td]:h-[29px] [&_td]:border-t [&_td]:px-1.5 [&_td]:py-1 @max-3xl:[&_td]:px-0.5">
          {nodes.map((n, i) => (
            <Row key={n.id} node={n} index={i} />
          ))}
        </TableBody>
      </Table>
    </section>
  )
}
