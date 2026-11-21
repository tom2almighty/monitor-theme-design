import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  Activity,
  ChevronRight,
  Folder,
  FolderOpen,
  Languages,
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
import { toggleLocale } from "@/lib/i18n"
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

const NEXT_MODE: Record<AppearanceMode, AppearanceMode> = {
  system: "light",
  light: "dark",
  dark: "system",
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
  const { t } = useTranslation()
  const m = node.online ? node.metrics : null
  const statusText = node.online ? (m ? `${Math.round(m.cpu)}%` : "…") : t("status.offline")

  return (
    <Link
      href={`/node/${node.id}`}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      onPointerEnter={prefetchDetail}
      onFocus={prefetchDetail}
      title={`${node.name}${node.country ? ` · ${node.country.toUpperCase()}` : ""}`}
      className={cn(
        "group flex h-8 min-w-0 items-center gap-2 rounded-lg px-2 text-xs leading-5 tracking-[-0.005em] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "bg-(--arc-chrome-glass) font-medium text-(--arc-chrome-fg) shadow-2xs"
          : "font-normal text-(--arc-chrome-fg)/88 hover:bg-(--arc-chrome-hover) hover:text-(--arc-chrome-fg)",
      )}
    >
      <Dot node={node} className="size-2" />
      {node.country ? <Flag code={node.country} showCode={false} className="shrink-0" /> : null}
      <span className="min-w-0 flex-1 truncate">{node.name}</span>
      <span
        className={cn(
          "tnum shrink-0 text-xs font-normal",
          node.online ? "text-(--arc-chrome-muted)" : "text-destructive/90",
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
 * single-line node tabs, and bottom theme/language/appearance/admin toolbar.
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
  const { t } = useTranslation()
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
      list.push({ key: "ungrouped", label: t("common.ungrouped"), nodes: ungrouped })
    }
    return { hasGroups: true, folders: list }
  }, [nodes, filtered, t])

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
  const modeTitle =
    mode === "dark"
      ? t("appearance.cycleDark")
      : mode === "light"
        ? t("appearance.cycleLight")
        : t("appearance.cycleSystem")

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
          aria-label={isMobileDrawer ? t("sidebar.close") : t("sidebar.collapse")}
          title={isMobileDrawer ? t("sidebar.close") : t("sidebar.collapseShortcut")}
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
            placeholder={t("sidebar.searchPlaceholder")}
            aria-label={t("sidebar.searchLabel")}
            className="h-8 w-full rounded-lg bg-(--arc-chrome-field) pr-7 pl-8 text-xs text-(--arc-chrome-fg) placeholder:text-(--arc-chrome-muted) outline-none transition-colors focus-visible:bg-(--arc-chrome-glass) focus-visible:ring-2 focus-visible:ring-ring"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label={t("sidebar.clearSearch")}
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
            <span className="tnum text-xs font-medium text-(--arc-chrome-muted)">{nodes.length}</span>
          </div>
          <span className="truncate text-xs font-medium tracking-[-0.01em]">{t("sidebar.overview")}</span>
        </Link>

        <button
          type="button"
          onClick={() => setOnlineOnly((v) => !v)}
          aria-pressed={onlineOnly}
          title={onlineOnly ? t("sidebar.onlineFilterOnTitle") : t("sidebar.onlineFilterOffTitle")}
          className={cn(
            "flex flex-col justify-between gap-1 rounded-xl border border-transparent px-2.5 py-2 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer",
            onlineOnly
              ? "border-(--arc-chrome-border) bg-(--arc-chrome-glass) shadow-2xs"
              : "bg-(--arc-chrome-field) hover:bg-(--arc-chrome-hover)",
          )}
        >
          <div className="flex items-center justify-between gap-1">
            <Activity className="size-3.5 text-success" />
            <span className="tnum text-xs font-medium text-(--arc-chrome-muted)">
              {onlineCount}/{nodes.length}
            </span>
          </div>
          <span className="tnum truncate text-xs font-medium tracking-[-0.01em] text-(--arc-chrome-fg)/90">
            {onlineOnly ? t("sidebar.onlineOnly") : `↓ ${compact(totalSpeed.rx)}/s`}
          </span>
        </button>
      </div>

      {/* Hairline separator */}
      <div className="mx-3 h-px shrink-0 bg-(--arc-chrome-border)" aria-hidden="true" />

      {/* Scrollable node list / collapsible group folders */}
      <nav aria-label={t("sidebar.serverListNav")} className="scrollbar-none min-h-0 flex-1 overflow-y-auto px-2 py-2 space-y-1">
        {nodes.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-(--arc-chrome-muted)">{t("common.noNodesShort")}</p>
        ) : filtered.length === 0 ? (
          <div className="space-y-2 px-2 py-6 text-center text-xs text-(--arc-chrome-muted)">
            <p>{t("sidebar.noMatches")}</p>
            <button
              type="button"
              onClick={() => { setQuery(""); setOnlineOnly(false) }}
              className="rounded-md bg-(--arc-chrome-field) px-2.5 py-1 text-xs font-medium text-(--arc-chrome-fg) transition-colors hover:bg-(--arc-chrome-glass) cursor-pointer"
            >
              {t("common.clearFilter")}
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
                  className="flex h-7.5 w-full min-w-0 items-center gap-1.5 rounded-lg px-2 text-left text-xs font-medium tracking-[-0.01em] text-(--arc-chrome-muted) transition-colors hover:bg-(--arc-chrome-hover) hover:text-(--arc-chrome-fg) outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
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
                  <span className="tnum shrink-0 text-xs font-normal text-(--arc-chrome-muted)/85">
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
            onClick={toggleLocale}
            aria-label={t("common.switchLanguage")}
            title={t("common.switchLanguage")}
            className="inline-flex size-8 items-center justify-center rounded-lg text-(--arc-chrome-muted) transition-colors hover:bg-(--arc-chrome-hover) hover:text-(--arc-chrome-fg) focus-visible:ring-2 focus-visible:ring-ring outline-none cursor-pointer"
          >
            <Languages className="size-3.5" />
          </button>

          <button
            type="button"
            onClick={() => onModeChange(NEXT_MODE[mode])}
            aria-label={modeTitle}
            title={modeTitle}
            className="inline-flex size-8 items-center justify-center rounded-lg text-(--arc-chrome-muted) transition-colors hover:bg-(--arc-chrome-hover) hover:text-(--arc-chrome-fg) focus-visible:ring-2 focus-visible:ring-ring outline-none cursor-pointer"
          >
            <ModeIcon className="size-3.5" />
          </button>

          <a
            href="/admin/"
            title={authed ? t("common.admin") : t("common.login")}
            aria-label={authed ? t("common.admin") : t("common.login")}
            className="inline-flex size-8 items-center justify-center rounded-lg text-(--arc-chrome-muted) transition-colors hover:bg-(--arc-chrome-hover) hover:text-(--arc-chrome-fg) focus-visible:ring-2 focus-visible:ring-ring outline-none"
          >
            <UserRound className="size-3.5" />
          </a>
        </div>
      </div>
    </div>
  )
}
