import { useMemo, useState } from "react"
import {
  Activity,
  ChevronRight,
  Folder,
  FolderOpen,
  LayoutGrid,
  Monitor,
  Moon,
  PanelLeftClose,
  Search,
  Sun,
  UserRound,
  X,
} from "lucide-react"

import { ArcThemeEditor, type ArcThemeEditorProps, type AppearanceMode } from "@/components/ArcThemeEditor"
import { Dot, Flag } from "@/components/NodeMarks"
import type { Node } from "@/lib/api"
import { filterNodes } from "@/lib/filters"
import { compact } from "@/lib/format"
import { Link } from "@/lib/route"
import { cn } from "@/lib/utils"

interface ArcSidebarProps {
  site: string
  nodes: Node[]
  activeNodeId: number | null
  onCollapse: () => void
  onNavigate?: () => void
  isMobileDrawer?: boolean
  prefetchDetail: () => void
  authed: boolean
  mode: AppearanceMode
  onModeChange: (next: AppearanceMode) => void
  themeEditorProps: Omit<ArcThemeEditorProps, "placement">
}

interface SidebarFolder {
  key: string
  label: string
  nodes: Node[]
}

const MODE_CYCLE: Record<AppearanceMode, { next: AppearanceMode; label: string }> = {
  system: { next: "light", label: "当前：跟随系统（点击切至浅色）" },
  light: { next: "dark", label: "当前：浅色（点击切至深色）" },
  dark: { next: "system", label: "当前：深色（点击切至跟随系统）" },
}

function NodeRow({
  node,
  active,
  onNavigate,
  prefetchDetail,
}: {
  node: Node
  active: boolean
  onNavigate?: () => void
  prefetchDetail: () => void
}) {
  const m = node.online ? node.metrics : null
  const statusText = node.online ? (m ? `${Math.round(m.cpu)}%` : "…") : "离线"

  return (
    <Link
      href={`/node/${node.id}`}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      onPointerEnter={prefetchDetail}
      onFocus={prefetchDetail}
      title={`${node.name}${node.country ? ` · ${node.country.toUpperCase()}` : ""}`}
      className={cn(
        "group flex h-8 min-w-0 items-center gap-2 rounded-lg px-2 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "bg-(--arc-chrome-glass) font-medium text-(--arc-chrome-fg) shadow-2xs"
          : "text-(--arc-chrome-fg)/85 hover:bg-(--arc-chrome-hover) hover:text-(--arc-chrome-fg)",
      )}
    >
      <Dot node={node} className="size-2" />
      {node.country ? <Flag code={node.country} showCode={false} className="shrink-0" /> : null}
      <span className="min-w-0 flex-1 truncate">{node.name}</span>
      <span
        className={cn(
          "tnum shrink-0 font-mono text-[11px]",
          node.online ? "text-(--arc-chrome-muted)" : "text-red-500/80 dark:text-red-400/85",
        )}
      >
        {statusText}
      </span>
    </Link>
  )
}

/**
 * Native Arc-style left chrome sidebar:
 * search bar, quick favorite tiles, collapsible group folders in hub order,
 * single-line node tabs, and bottom theme/appearance/admin toolbar.
 */
export function ArcSidebar({
  site,
  nodes,
  activeNodeId,
  onCollapse,
  onNavigate,
  isMobileDrawer = false,
  prefetchDetail,
  authed,
  mode,
  onModeChange,
  themeEditorProps,
}: ArcSidebarProps) {
  const [query, setQuery] = useState("")
  const [onlineOnly, setOnlineOnly] = useState(false)
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() => new Set())

  const onlineCount = useMemo(() => nodes.filter((n) => n.online).length, [nodes])
  const totalSpeed = useMemo(() => {
    let rx = 0
    let tx = 0
    for (const n of nodes) {
      if (n.online && n.metrics) {
        rx += n.metrics.net_rx
        tx += n.metrics.net_tx
      }
    }
    return { rx, tx }
  }, [nodes])

  const filtered = useMemo(
    () => filterNodes(nodes, { query, group: null, country: null, os: null, online: onlineOnly }),
    [nodes, query, onlineOnly],
  )

  // Group folders follow first-appearance node order, never alphabetical.
  const { hasGroups, folders } = useMemo(() => {
    const anyGroup = nodes.some((n) => Boolean(n.group))
    if (!anyGroup) return { hasGroups: false, folders: [] as SidebarFolder[] }

    const order: string[] = []
    const map = new Map<string, Node[]>()
    const ungrouped: Node[] = []

    for (const node of filtered) {
      const g = node.group ?? ""
      if (!g) {
        ungrouped.push(node)
        continue
      }
      if (!map.has(g)) {
        order.push(g)
        map.set(g, [])
      }
      map.get(g)!.push(node)
    }

    const list: SidebarFolder[] = order.map((name) => ({
      key: `g:${name}`,
      label: name,
      nodes: map.get(name)!,
    }))
    if (ungrouped.length > 0) {
      list.push({ key: "ungrouped", label: "未分组", nodes: ungrouped })
    }
    return { hasGroups: true, folders: list }
  }, [nodes, filtered])

  const toggleFolder = (key: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const isSearching = query.trim().length > 0 || onlineOnly
  const ModeIcon = mode === "dark" ? Moon : mode === "light" ? Sun : Monitor

  return (
    <div className="flex h-full min-h-0 w-full flex-col text-(--arc-chrome-fg) select-none">
      {/* Top workspace title row */}
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 px-2.5 pt-1">
        <Link
          href="/"
          onClick={onNavigate}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-(--arc-chrome-hover) outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <img src="/favicon.svg" alt="" className="size-4.5 shrink-0" />
          <span className="min-w-0 truncate text-sm font-semibold tracking-tight">{site}</span>
        </Link>

        <button
          type="button"
          onClick={onCollapse}
          aria-label={isMobileDrawer ? "关闭侧边栏" : "收起侧边栏"}
          title={isMobileDrawer ? "关闭侧边栏" : "收起侧边栏 (Ctrl+\\)"}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-(--arc-chrome-muted) transition-colors hover:bg-(--arc-chrome-hover) hover:text-(--arc-chrome-fg) focus-visible:ring-2 focus-visible:ring-ring outline-none cursor-pointer"
        >
          {isMobileDrawer ? <X className="size-4" /> : <PanelLeftClose className="size-4" />}
        </button>
      </div>

      {/* Arc address-bar style search capsule */}
      <div className="shrink-0 px-2.5 pt-1.5 pb-2">
        <div className="relative flex items-center">
          <Search className="pointer-events-none absolute left-2.5 size-3.5 text-(--arc-chrome-muted)" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索节点、分组、地区…"
            aria-label="搜索节点"
            className="h-8 w-full rounded-lg bg-(--arc-chrome-field) pr-7 pl-8 text-xs text-(--arc-chrome-fg) placeholder:text-(--arc-chrome-muted) outline-none transition-colors focus-visible:bg-(--arc-chrome-glass) focus-visible:ring-2 focus-visible:ring-ring"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="清空搜索"
              className="absolute right-1.5 inline-flex size-5 items-center justify-center rounded-md text-(--arc-chrome-muted) hover:bg-(--arc-chrome-hover) hover:text-(--arc-chrome-fg) cursor-pointer"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
      </div>

      {/* Arc Favorites 2-column quick tiles */}
      <div className="grid shrink-0 grid-cols-2 gap-1.5 px-2.5 pb-2.5">
        <Link
          href="/"
          onClick={onNavigate}
          aria-current={activeNodeId === null ? "page" : undefined}
          className={cn(
            "flex flex-col justify-between gap-1 rounded-xl border border-transparent px-2.5 py-2 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
            activeNodeId === null
              ? "border-(--arc-chrome-border) bg-(--arc-chrome-glass) shadow-2xs"
              : "bg-(--arc-chrome-field) hover:bg-(--arc-chrome-hover)",
          )}
        >
          <div className="flex items-center justify-between">
            <LayoutGrid className="size-3.5 text-primary" />
            <span className="tnum font-mono text-[11px] text-(--arc-chrome-muted)">{nodes.length}</span>
          </div>
          <span className="truncate text-xs font-medium">全部概览</span>
        </Link>

        <button
          type="button"
          onClick={() => setOnlineOnly((v) => !v)}
          aria-pressed={onlineOnly}
          title={onlineOnly ? "当前仅显示在线节点，点击显示全部" : "点击仅筛选在线节点"}
          className={cn(
            "flex flex-col justify-between gap-1 rounded-xl border border-transparent px-2.5 py-2 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer",
            onlineOnly
              ? "border-(--arc-chrome-border) bg-(--arc-chrome-glass) shadow-2xs"
              : "bg-(--arc-chrome-field) hover:bg-(--arc-chrome-hover)",
          )}
        >
          <div className="flex items-center justify-between gap-1">
            <Activity className="size-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="tnum font-mono text-[11px] text-(--arc-chrome-muted)">
              {onlineCount}/{nodes.length}
            </span>
          </div>
          <span className="tnum truncate font-mono text-[11px] text-(--arc-chrome-fg)/90">
            {onlineOnly ? "仅看在线" : `↓${compact(totalSpeed.rx)}`}
          </span>
        </button>
      </div>

      {/* Hairline separator */}
      <div className="mx-3 h-px shrink-0 bg-(--arc-chrome-border)" aria-hidden="true" />

      {/* Scrollable node list / collapsible group folders */}
      <nav aria-label="服务器列表" className="scrollbar-none min-h-0 flex-1 overflow-y-auto px-2 py-2 space-y-1">
        {nodes.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-(--arc-chrome-muted)">暂无节点</p>
        ) : filtered.length === 0 ? (
          <div className="space-y-2 px-2 py-6 text-center text-xs text-(--arc-chrome-muted)">
            <p>没有匹配的节点</p>
            <button
              type="button"
              onClick={() => { setQuery(""); setOnlineOnly(false) }}
              className="rounded-md bg-(--arc-chrome-field) px-2.5 py-1 text-xs font-medium text-(--arc-chrome-fg) transition-colors hover:bg-(--arc-chrome-glass) cursor-pointer"
            >
              清除筛选
            </button>
          </div>
        ) : !hasGroups ? (
          <div className="space-y-0.5">
            {filtered.map((node) => (
              <NodeRow
                key={node.id}
                node={node}
                active={activeNodeId === node.id}
                onNavigate={onNavigate}
                prefetchDetail={prefetchDetail}
              />
            ))}
          </div>
        ) : (
          folders.map((folder) => {
            const isOpen = isSearching || !collapsedFolders.has(folder.key)
            const folderOnline = folder.nodes.filter((n) => n.online).length
            return (
              <div key={folder.key} className="space-y-0.5">
                <button
                  type="button"
                  onClick={() => toggleFolder(folder.key)}
                  aria-expanded={isOpen}
                  className="flex h-7.5 w-full min-w-0 items-center gap-1.5 rounded-lg px-2 text-left text-xs font-medium text-(--arc-chrome-fg)/90 transition-colors hover:bg-(--arc-chrome-hover) outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
                >
                  <ChevronRight
                    className={cn(
                      "size-3 shrink-0 text-(--arc-chrome-muted) transition-transform duration-150 motion-reduce:transition-none",
                      isOpen && "rotate-90",
                    )}
                  />
                  {isOpen ? (
                    <FolderOpen className="size-3.5 shrink-0 text-primary" />
                  ) : (
                    <Folder className="size-3.5 shrink-0 text-(--arc-chrome-muted)" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{folder.label}</span>
                  <span className="tnum shrink-0 font-mono text-[10px] text-(--arc-chrome-muted)">
                    {folderOnline}/{folder.nodes.length}
                  </span>
                </button>

                {isOpen && (
                  <div className="space-y-0.5 pl-3">
                    {folder.nodes.map((node) => (
                      <NodeRow
                        key={node.id}
                        node={node}
                        active={activeNodeId === node.id}
                        onNavigate={onNavigate}
                        prefetchDetail={prefetchDetail}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })
        )}
      </nav>

      {/* Bottom Arc chrome toolbar */}
      <div className="flex shrink-0 items-center justify-between gap-1 border-t border-(--arc-chrome-border) px-2.5 py-2">
        <ArcThemeEditor {...themeEditorProps} placement="sidebar" />

        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => onModeChange(MODE_CYCLE[mode].next)}
            aria-label={MODE_CYCLE[mode].label}
            title={MODE_CYCLE[mode].label}
            className="inline-flex size-8 items-center justify-center rounded-lg text-(--arc-chrome-muted) transition-colors hover:bg-(--arc-chrome-hover) hover:text-(--arc-chrome-fg) focus-visible:ring-2 focus-visible:ring-ring outline-none cursor-pointer"
          >
            <ModeIcon className="size-3.5" />
          </button>

          <a
            href="/admin/"
            title={authed ? "后台管理" : "站长登录"}
            aria-label={authed ? "后台管理" : "站长登录"}
            className="inline-flex size-8 items-center justify-center rounded-lg text-(--arc-chrome-muted) transition-colors hover:bg-(--arc-chrome-hover) hover:text-(--arc-chrome-fg) focus-visible:ring-2 focus-visible:ring-ring outline-none"
          >
            <UserRound className="size-3.5" />
          </a>
        </div>
      </div>
    </div>
  )
}
