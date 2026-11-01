import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Check, ChevronDown, ChevronLeft, ChevronRight, MapPin, Search, SlidersHorizontal, X } from "lucide-react"

import { Dot, Flag } from "@/components/NodeMarks"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Toggle } from "@/components/ui/toggle"
import type { Node } from "@/lib/api"
import { osFamily, type NodeFilters } from "@/lib/filters"
import { Link, navigate } from "@/lib/route"
import { cn } from "@/lib/utils"

type TriggerProps = {
  onClick: () => void
  "aria-expanded": boolean
  "aria-haspopup": "dialog"
}

/** A button and the panel it opens, closed by an outside click or Escape. */
function Popover({
  label, trigger, children, align = "left", className, panelClassName,
}: {
  label: string
  trigger: (props: TriggerProps) => ReactNode
  children: (close: () => void) => ReactNode
  align?: "left" | "right"
  className?: string
  panelClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as globalThis.Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("pointerdown", onPointer)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onPointer)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  return (
    <div ref={ref} className={cn("relative", className)}>
      {trigger({
        onClick: () => setOpen((value) => !value),
        "aria-expanded": open,
        "aria-haspopup": "dialog",
      })}
      {open && (
        <div
          role="dialog"
          aria-label={label}
          className={cn(
            "absolute top-full z-50 mt-1.5 max-w-[calc(100vw-2rem)] rounded-lg border border-border/80 bg-popover p-1.5 text-popover-foreground shadow-xl backdrop-blur-md",
            align === "left" ? "left-0" : "right-0",
            panelClassName,
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

function Chip({
  active, onClick, count, children,
}: { active: boolean; onClick: () => void; count?: number; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        active
          ? "bg-primary font-medium text-primary-foreground shadow-2xs"
          : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
      {count !== undefined && (
        <span className={cn("tnum text-xs", active ? "opacity-80" : "text-muted-foreground/70")}>{count}</span>
      )}
    </button>
  )
}

function MenuRow({
  active, onClick, count, children,
}: { active: boolean; onClick: () => void; count?: number; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent",
        active && "bg-accent font-medium text-foreground",
      )}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {count !== undefined && <span className="tnum shrink-0 text-xs text-muted-foreground">{count}</span>}
      {active && <Check className="size-3.5 shrink-0 text-primary" />}
    </button>
  )
}

function ActiveChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-md border border-border/80 bg-card pr-1 pl-2 text-xs text-foreground shadow-2xs">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`移除筛选 ${label}`}
        className="inline-flex size-4 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 outline-none"
      >
        <X className="size-3" />
      </button>
    </span>
  )
}

/** The node the chart below draws, and the way to another one. */
function NodeSelect({ nodes, selected }: { nodes: Node[]; selected: Node }) {
  return (
    <Popover
      label="选择节点"
      className="min-w-0 flex-1 sm:flex-none"
      panelClassName="w-72"
      trigger={(props) => (
        <button
          type="button"
          {...props}
          className="inline-flex h-9 w-full min-w-0 items-center gap-2 rounded-md border border-input bg-transparent px-2.5 text-left text-sm shadow-xs transition-colors outline-none hover:bg-accent/50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:w-64 dark:bg-input/30"
        >
          <Dot node={selected} className="size-2" />
          <span className="min-w-0 flex-1 truncate font-medium">{selected.name}</span>
          {selected.group && (
            <Badge variant="secondary" className="max-w-24 shrink-0 truncate px-1.5 py-0 text-xs font-normal">
              {selected.group}
            </Badge>
          )}
          {selected.country && <Flag code={selected.country} showCode={false} className="shrink-0" />}
          <ChevronDown className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", props["aria-expanded"] && "rotate-180")} />
        </button>
      )}
    >
      {(close) => (
        <>
          <p className="px-2 py-1 text-xs text-muted-foreground">筛选结果中的 {nodes.length} 个节点</p>
          <div role="group" aria-label="节点列表" className="max-h-72 overflow-y-auto">
            {nodes.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">没有匹配的节点</p>
            ) : (
              nodes.map((node) => (
                <Link
                  key={node.id}
                  href={`/node/${node.id}`}
                  onClick={close}
                  aria-current={node.id === selected.id ? "page" : undefined}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-foreground/80 transition-colors hover:bg-accent hover:text-foreground aria-[current=page]:bg-accent aria-[current=page]:font-medium aria-[current=page]:text-foreground"
                >
                  <Dot node={node} className="size-2" />
                  <span className="min-w-0 flex-1 truncate">{node.name}</span>
                  {node.group && (
                    <span className="max-w-24 shrink-0 truncate rounded bg-muted/60 px-1.5 py-0.5 text-xs text-muted-foreground">
                      {node.group}
                    </span>
                  )}
                  {node.country && <Flag code={node.country} showCode={false} className="shrink-0" />}
                </Link>
              ))
            )}
          </div>
        </>
      )}
    </Popover>
  )
}

/**
 * The conditions that do not earn a permanent row: countries and distributions.
 * Both lists are ordered by how many nodes they hold, so the common ones are at
 * the top of a panel that scrolls rather than extends the page.
 */
function MoreFilters({
  nodes, filters, onChange,
}: { nodes: Node[]; filters: NodeFilters; onChange: (patch: Partial<NodeFilters>) => void }) {
  const countries = useMemo(() => {
    const counts = new Map<string, number>()
    for (const node of nodes) {
      const code = node.country ?? ""
      counts.set(code, (counts.get(code) ?? 0) + 1)
    }
    return [...counts].map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code))
  }, [nodes])

  const systems = useMemo(() => {
    const counts = new Map<string, number>()
    for (const node of nodes) {
      const family = osFamily(node.os)
      counts.set(family, (counts.get(family) ?? 0) + 1)
    }
    return [...counts].map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-CN"))
  }, [nodes])

  const active = (filters.country !== null ? 1 : 0) + (filters.os !== null ? 1 : 0)

  return (
    <Popover
      label="更多筛选"
      align="right"
      panelClassName="w-72 p-2"
      trigger={(props) => (
        <Button variant="outline" size="sm" className="h-7 gap-1.5 px-2 text-xs" {...props}>
          <SlidersHorizontal className="size-3.5" />
          更多筛选
          {active > 0 && (
            <span className="tnum inline-flex size-4 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
              {active}
            </span>
          )}
        </Button>
      )}
    >
      {() => (
        <div className="space-y-2">
          <section>
            <p className="px-1 pb-1 text-xs font-medium text-muted-foreground">地区</p>
            <div role="radiogroup" aria-label="按地区筛选" className="max-h-40 overflow-y-auto">
              <MenuRow active={filters.country === null} onClick={() => onChange({ country: null })}>
                全部地区
              </MenuRow>
              {countries.map((country) => (
                <MenuRow
                  key={country.code || "unknown"}
                  active={filters.country === country.code}
                  count={country.count}
                  onClick={() => onChange({ country: country.code })}
                >
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    {country.code ? (
                      <Flag code={country.code} showCode={false} />
                    ) : (
                      <MapPin className="size-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate">{country.code || "未知地区"}</span>
                  </span>
                </MenuRow>
              ))}
            </div>
          </section>

          <section className="border-t border-border/60 pt-2">
            <p className="px-1 pb-1 text-xs font-medium text-muted-foreground">系统</p>
            <div role="radiogroup" aria-label="按系统筛选" className="max-h-40 overflow-y-auto">
              <MenuRow active={filters.os === null} onClick={() => onChange({ os: null })}>
                全部系统
              </MenuRow>
              {systems.map((system) => (
                <MenuRow
                  key={system.name}
                  active={filters.os === system.name}
                  count={system.count}
                  onClick={() => onChange({ os: system.name })}
                >
                  {system.name}
                </MenuRow>
              ))}
            </div>
          </section>
        </div>
      )}
    </Popover>
  )
}

const MAX_GROUPS = 6

export function NodeFilterBar({
  allNodes, filtered, selected, filters, onChange, onReset,
}: {
  allNodes: Node[]
  filtered: Node[]
  selected: Node
  filters: NodeFilters
  onChange: (patch: Partial<NodeFilters>) => void
  onReset: () => void
}) {
  const groups = useMemo(() => {
    const counts = new Map<string, number>()
    for (const node of allNodes) {
      const name = node.group ?? ""
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1)
    }
    return [...counts].map(([name, count]) => ({ name, count }))
  }, [allNodes])

  const ungrouped = useMemo(() => allNodes.filter((node) => !(node.group ?? "")).length, [allNodes])

  // The first few in node order stay on the row; the rest, and a selected group
  // that would otherwise be hidden, are reached through the menu.
  const shownGroups = groups.slice(0, MAX_GROUPS)
  if (filters.group && !shownGroups.some((group) => group.name === filters.group)) {
    const picked = groups.find((group) => group.name === filters.group)
    if (picked) shownGroups.push(picked)
  }
  const hiddenGroups = groups.filter((group) => !shownGroups.some((shown) => shown.name === group.name))

  const index = filtered.findIndex((node) => node.id === selected.id)
  const previous = index > 0 ? filtered[index - 1] : null
  const next = index >= 0 && index < filtered.length - 1 ? filtered[index + 1] : null

  const moreActive = (filters.country !== null ? 1 : 0) + (filters.os !== null ? 1 : 0)

  return (
    // Lifted above the chart card: both are backdrop-blurred stacking contexts,
    // and the panel would otherwise be painted under the card below it.
    <Card className="relative z-20 min-w-0 gap-0 py-0">
      <div className="flex min-w-0 flex-col gap-3 p-3 sm:p-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <NodeSelect nodes={filtered} selected={selected} />

          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="上一个节点"
              title={previous ? `上一个：${previous.name}` : "已经是第一个节点"}
              disabled={!previous}
              onClick={() => previous && navigate(`/node/${previous.id}`)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="下一个节点"
              title={next ? `下一个：${next.name}` : "已经是最后一个节点"}
              disabled={!next}
              onClick={() => next && navigate(`/node/${next.id}`)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>

          <span className="tnum hidden shrink-0 text-xs text-muted-foreground sm:inline">
            {filtered.length} / {allNodes.length} 个节点
          </span>

          <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
            <div className="relative min-w-0 flex-1 sm:w-52 sm:flex-none">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={filters.query}
                onChange={(event) => onChange({ query: event.target.value })}
                placeholder="搜索节点、分组、地区…"
                aria-label="搜索节点"
                className="h-8 pl-8 text-xs"
              />
            </div>
            <Toggle
              pressed={filters.online}
              onPressedChange={(online) => onChange({ online })}
              title="只显示当前在线的节点"
              className="h-8"
            >
              仅在线
            </Toggle>
            <MoreFilters nodes={allNodes} filters={filters} onChange={onChange} />
          </div>
        </div>

        {groups.length > 0 && (
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-xs text-muted-foreground">分组</span>
            <div
              role="radiogroup"
              aria-label="按分组筛选"
              className="scrollbar-none flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto"
            >
              <Chip active={filters.group === null} onClick={() => onChange({ group: null })} count={allNodes.length}>
                全部
              </Chip>
              {shownGroups.map((group) => (
                <Chip
                  key={group.name}
                  active={filters.group === group.name}
                  onClick={() => onChange({ group: group.name })}
                  count={group.count}
                >
                  {group.name}
                </Chip>
              ))}
              {ungrouped > 0 && (
                <Chip active={filters.group === ""} onClick={() => onChange({ group: "" })} count={ungrouped}>
                  未分组
                </Chip>
              )}
            </div>
            {hiddenGroups.length > 0 && (
              <Popover
                label="更多分组"
                align="right"
                panelClassName="max-h-64 w-52 overflow-y-auto"
                trigger={(props) => (
                  <Button variant="outline" size="sm" className="h-7 shrink-0 gap-1 px-2 text-xs" {...props}>
                    更多分组
                    <ChevronDown className="size-3" />
                  </Button>
                )}
              >
                {(close) => (
                  <div role="radiogroup" aria-label="更多分组">
                    {hiddenGroups.map((group) => (
                      <MenuRow
                        key={group.name}
                        active={filters.group === group.name}
                        count={group.count}
                        onClick={() => {
                          onChange({ group: group.name })
                          close()
                        }}
                      >
                        {group.name}
                      </MenuRow>
                    ))}
                  </div>
                )}
              </Popover>
            )}
          </div>
        )}

        {moreActive > 0 && (
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">已筛选</span>
            {filters.country !== null && (
              <ActiveChip label={`地区 ${filters.country || "未知"}`} onRemove={() => onChange({ country: null })} />
            )}
            {filters.os !== null && (
              <ActiveChip label={`系统 ${filters.os}`} onRemove={() => onChange({ os: null })} />
            )}
            <button
              type="button"
              onClick={onReset}
              className="text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 outline-none"
            >
              清除全部筛选
            </button>
          </div>
        )}

      </div>
    </Card>
  )
}
