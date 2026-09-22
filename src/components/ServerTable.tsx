import { useMemo, useState, type ReactNode } from "react"
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, Search } from "lucide-react"

import { Dot, Flag, Meter, Num, OsIcon, SLOT } from "@/components/NodeMarks"
import { RowDetails } from "@/components/RowDetails"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { Node } from "@/lib/api"
import { bytes, compact, daysUntil, distro, duration, FOREVER, monthUsage, pair, percent } from "@/lib/format"
import { cn } from "@/lib/utils"

/**
 * The figure over its meter, as shadcn's stat tiles set them.
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

type SortField = "name" | "uptime" | "load" | "speed" | "cpu" | "mem" | "disk" | "traffic"
type SortOrder = "asc" | "desc"

function sortNodes(nodes: Node[], field: SortField | null, order: SortOrder): Node[] {
  if (!field) return [...nodes].sort((a, b) => a.sort - b.sort || a.id - b.id)

  return [...nodes].sort((a, b) => {
    let res = 0
    const ma = a.online ? a.metrics : null
    const mb = b.online ? b.metrics : null

    switch (field) {
      case "name":
        res = a.name.localeCompare(b.name, "zh-CN")
        break
      case "uptime":
        res = (ma?.uptime ?? -1) - (mb?.uptime ?? -1)
        break
      case "load":
        res = (ma?.load[0] ?? -1) - (mb?.load[0] ?? -1)
        break
      case "speed": {
        const sa = ma ? ma.net_rx + ma.net_tx : -1
        const sb = mb ? mb.net_rx + mb.net_tx : -1
        res = sa - sb
        break
      }
      case "cpu":
        res = (ma?.cpu ?? -1) - (mb?.cpu ?? -1)
        break
      case "mem": {
        const pa = ma ? ma.mem_used / Math.max(1, ma.mem_total) : -1
        const pb = mb ? mb.mem_used / Math.max(1, mb.mem_total) : -1
        res = pa - pb
        break
      }
      case "disk": {
        const pa = ma ? ma.disk_used / Math.max(1, ma.disk_total) : -1
        const pb = mb ? mb.disk_used / Math.max(1, mb.disk_total) : -1
        res = pa - pb
        break
      }
      case "traffic":
        res = monthUsage(a) - monthUsage(b)
        break
    }

    return order === "desc" ? -res : res
  })
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
        <TableCell className={cn(COL.status, "text-center")}>
          <div className="flex items-center justify-center">
            <Dot node={node} />
          </div>
        </TableCell>
        <TableCell className={cn(COL.name, "text-left font-medium")} title={node.name}>
          <div className="flex items-center gap-1.5 min-w-0">
            <ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground/50 transition-transform duration-200", open && "rotate-90 text-foreground")} />
            <span className="truncate">{node.name}</span>
          </div>
        </TableCell>
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
              <span className="text-emerald-600 dark:text-emerald-400 mr-0.5 font-mono">↓</span>
              <Num ch={SLOT.compact} className="@max-3xl:min-w-0">{compact(m.net_rx)}</Num>
              <span className="mx-1 text-muted-foreground/60">|</span>
              <span className="text-blue-600 dark:text-blue-400 mr-0.5 font-mono">↑</span>
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

function SortableHead({
  col,
  label,
  field,
  sortField,
  sortOrder,
  onSort,
}: {
  col: keyof typeof COL
  label: ReactNode
  field?: SortField
  sortField: SortField | null
  sortOrder: SortOrder
  onSort: (field: SortField) => void
}) {
  const isSorted = field && sortField === field
  return (
    <TableHead
      className={cn(
        "group h-9 px-2 text-center text-xs font-medium text-muted-foreground transition-colors @max-3xl:px-1",
        COL[col],
        col === "name" && "text-left",
        field && "cursor-pointer select-none hover:text-foreground",
      )}
      onClick={field ? () => onSort(field) : undefined}
    >
      <div className={cn("inline-flex items-center gap-1", col === "name" && "justify-start pl-5")}>
        <span>{label}</span>
        {field && (
          <span className="shrink-0 text-muted-foreground/70">
            {isSorted ? (
              sortOrder === "asc" ? <ArrowUp className="size-3 text-primary" /> : <ArrowDown className="size-3 text-primary" />
            ) : (
              <ArrowUpDown className="size-2.5 opacity-0 transition-opacity group-hover:opacity-100" />
            )}
          </span>
        )}
      </div>
    </TableHead>
  )
}

export function ServerTable({ nodes }: { nodes: Node[] }) {
  const [query, setQuery] = useState("")
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc")

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortOrder === "desc") {
        setSortOrder("asc")
      } else {
        setSortField(null)
        setSortOrder("desc")
      }
    } else {
      setSortField(field)
      setSortOrder("desc")
    }
  }

  const online = nodes.filter((n) => n.online && n.metrics)
  const live = (pick: (m: NonNullable<Node["metrics"]>) => number) => online.reduce((total, n) => total + pick(n.metrics!), 0)
  const all = (pick: (n: Node) => number) => nodes.reduce((total, n) => total + pick(n), 0)

  const sortedNodes = useMemo(() => sortNodes(nodes, sortField, sortOrder), [nodes, sortField, sortOrder])
  const q = query.trim().toLowerCase()
  const filteredNodes = useMemo(() => {
    if (!q) return sortedNodes
    return sortedNodes.filter((n) => `${n.name} ${n.country} ${n.os}`.toLowerCase().includes(q))
  }, [sortedNodes, q])

  const heads: [keyof typeof COL, ReactNode, SortField?][] = [
    ["status", "状态"],
    ["name", "名称", "name"],
    ["location", "位置"],
    ["os", "系统"],
    ["uptime", "在线", "uptime"],
    ["expiry", "到期"],
    ["load", "负载", "load"],
    ["speed", "网速 ↓|↑", "speed"],
    ["bar", "CPU", "cpu"],
    ["bar", "内存", "mem"],
    ["bar", "硬盘", "disk"],
    ["traffic", "流量", "traffic"],
  ]

  return (
    <Card className="@container gap-0 overflow-hidden py-0">
      {/* Fleet overview summary chips in header + Search filter */}
      <CardHeader className="border-b border-border/60 py-3 sm:flex-row sm:items-center sm:justify-between max-md:px-3 gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">服务器列表</CardTitle>
            <Badge variant="secondary" className="font-normal text-muted-foreground text-[11px]">
              {filteredNodes.length !== nodes.length ? `${filteredNodes.length} / ${nodes.length}` : `${nodes.length}`} 个节点
            </Badge>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="快速过滤服务器..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-7 w-32 sm:w-44 pl-8 text-xs rounded-md bg-background/50"
            />
          </div>
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
              {heads.map(([col, label, field], i) => (
                <SortableHead
                  key={i}
                  col={col}
                  label={label}
                  field={field}
                  sortField={sortField}
                  sortOrder={sortOrder}
                  onSort={handleSort}
                />
              ))}
            </TableRow>
          </TableHeader>
          <TableBody className="[&_td]:px-2 [&_td]:py-2 @max-3xl:[&_td]:px-1">
            {filteredNodes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={12} className="py-12 text-center text-sm text-muted-foreground">
                  没有匹配的服务器
                </TableCell>
              </TableRow>
            ) : (
              filteredNodes.map((n) => (
                <Row key={n.id} node={n} />
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

/**
 * High-fidelity table skeleton to prevent layout shifts (CLS = 0) during initial load.
 */
export function ServerTableSkeleton() {
  return (
    <Card className="@container gap-0 overflow-hidden py-0">
      <CardHeader className="border-b border-border/60 py-3 sm:flex-row sm:items-center sm:justify-between max-md:px-3 gap-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-24 rounded-md" />
          <Skeleton className="h-5 w-16 rounded-md" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-7 w-28 rounded-md" />
          <Skeleton className="h-7 w-36 rounded-md" />
          <Skeleton className="h-7 w-32 rounded-md" />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border/30">
          <div className="flex h-9 items-center px-4 bg-muted/20">
            <Skeleton className="h-3 w-full" />
          </div>
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex h-11 items-center gap-4 px-4">
              <Skeleton className="size-2.5 rounded-full shrink-0" />
              <Skeleton className="h-4 w-32 shrink-0" />
              <Skeleton className="h-4 w-12 shrink-0" />
              <Skeleton className="h-4 w-20 shrink-0 @max-5xl:hidden" />
              <Skeleton className="h-4 w-16 shrink-0 @max-3xl:hidden" />
              <Skeleton className="h-4 w-16 shrink-0 @max-5xl:hidden" />
              <Skeleton className="h-4 w-12 shrink-0 @max-3xl:hidden" />
              <Skeleton className="h-4 w-24 shrink-0" />
              <Skeleton className="h-2 w-16 shrink-0" />
              <Skeleton className="h-2 w-16 shrink-0" />
              <Skeleton className="h-2 w-16 shrink-0" />
              <Skeleton className="h-2 w-24 shrink-0" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
