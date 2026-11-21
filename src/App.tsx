import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import { useTranslation } from "react-i18next"
import {
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Languages,
  Menu,
  Palette,
  PanelLeftOpen,
  UserRound,
} from "lucide-react"

import { ArcSidebar } from "@/components/ArcSidebar"
import { ArcThemeEditor, type AppearanceMode } from "@/components/ArcThemeEditor"
import { Dot, Flag } from "@/components/NodeMarks"
import { OverviewDashboard, OverviewSkeleton } from "@/components/OverviewDashboard"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { api, useNodes } from "@/lib/api"
import {
  clampPercent,
  classicShellTokens,
  computeArcLook,
  computeArcTokens,
  DEFAULT_ARC_COLORS,
  DEFAULT_ARC_INTENSITY,
  parseArcColors,
  serializeArcColors,
} from "@/lib/arc-theme"
import { fields, loadConfig, saveConfig } from "@/lib/config"
import { toggleLocale } from "@/lib/i18n"
import { usePref } from "@/lib/prefs"
import { Link, navigate, useNodeRoute } from "@/lib/route"
import { THEMES } from "@/lib/themes"
import { cn } from "@/lib/utils"
// The name, author and repository the footer credits, read from the manifest
// the panel reads, so the two never disagree.
import theme from "../theme.json"

type Me = { authed: boolean; github: boolean; site_name: string; public_page: boolean }

// The chart module is most of the bundle and the list draws no chart. Fetched
// when a node link is hovered or focused, so the overview stays light.
const loadDetail = () => import("@/components/NodeDetail")
const loadMonitor = () => import("@/components/MonitorPage")
const MonitorPage = lazy(() => loadMonitor().then((module) => ({ default: module.MonitorPage })))

const DARK_MEDIA = matchMedia("(prefers-color-scheme: dark)")

/**
 * What the key says, read as the pre-paint script in index.html reads it: one of
 * the two names is a choice, anything else is none.
 */
const savedMode = (): AppearanceMode => {
  const saved = localStorage.getItem("theme")
  return saved === "dark" || saved === "light" ? saved : "system"
}

/**
 * The visitor's own choice, or the system's while there is none. Shares the
 * `theme` key with `/admin/` on the same origin.
 */
function useTheme() {
  const [mode, setMode] = useState(savedMode)
  const system = useSyncExternalStore(
    (notify) => {
      DARK_MEDIA.addEventListener("change", notify)
      return () => DARK_MEDIA.removeEventListener("change", notify)
    },
    () => DARK_MEDIA.matches,
  )
  const dark = mode === "system" ? system : mode === "dark"

  useEffect(() => {
    const sync = (e: StorageEvent) => {
      if (e.key === null || e.key === "theme") setMode(savedMode())
    }
    addEventListener("storage", sync)
    return () => removeEventListener("storage", sync)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark)
  }, [dark])

  return {
    mode,
    dark,
    choose: (next: AppearanceMode) => {
      if (next === "system") localStorage.removeItem("theme")
      else localStorage.setItem("theme", next)
      setMode(next)
    },
  }
}

interface AppearanceValues {
  arcEnabled: boolean
  arcColors: string[]
  arcIntensity: number
  themeId: string
  grainPercent: number
  frostedPercent: number
}

interface VisitorAppearanceOverrides {
  arcEnabled?: boolean
  arcColors?: string[]
  arcIntensity?: number
  themeId?: string
  grainPercent?: number
  frostedPercent?: number
}

const STORAGE_KEYS = {
  arcEnabled: "theme-arc-enabled",
  arcColors: "theme-arc-colors",
  arcIntensity: "theme-arc-intensity",
  themeId: "theme-preset",
  grainPercent: "theme-grain-percent",
  frostedPercent: "theme-frosted-percent",
} as const

function manifestDefault(key: string): unknown {
  return fields.find((f) => f.key === key)?.default
}

function readManifestDefaults(): AppearanceValues {
  const rawPreset = manifestDefault("theme_preset")
  const themeId = typeof rawPreset === "string" && THEMES.some((t) => t.id === rawPreset) ? rawPreset : "claude"
  return {
    arcEnabled: manifestDefault("arc_enabled") !== false,
    arcColors: parseArcColors(manifestDefault("arc_colors"), DEFAULT_ARC_COLORS),
    arcIntensity: clampPercent(Number(manifestDefault("arc_intensity")), DEFAULT_ARC_INTENSITY),
    themeId,
    grainPercent: clampPercent(Number(manifestDefault("grain_percent")), 18),
    frostedPercent: clampPercent(Number(manifestDefault("frosted_percent")), 0),
  }
}

function readVisitorOverrides(): VisitorAppearanceOverrides {
  const out: VisitorAppearanceOverrides = {}
  try {
    const arcEnabled = localStorage.getItem(STORAGE_KEYS.arcEnabled)
    if (arcEnabled === "true") out.arcEnabled = true
    else if (arcEnabled === "false") out.arcEnabled = false

    const arcColors = localStorage.getItem(STORAGE_KEYS.arcColors)
    if (arcColors !== null) out.arcColors = parseArcColors(arcColors, DEFAULT_ARC_COLORS)

    const arcIntensity = localStorage.getItem(STORAGE_KEYS.arcIntensity)
    if (arcIntensity !== null) {
      const n = Number(arcIntensity)
      if (Number.isFinite(n) && n >= 0 && n <= 100) out.arcIntensity = Math.round(n)
    }

    const preset = localStorage.getItem(STORAGE_KEYS.themeId)
    if (preset && THEMES.some((t) => t.id === preset)) out.themeId = preset

    const grain = localStorage.getItem(STORAGE_KEYS.grainPercent)
    if (grain !== null) {
      const n = Number(grain)
      if (Number.isFinite(n) && n >= 0 && n <= 100) out.grainPercent = Math.round(n)
    } else {
      const legacy = localStorage.getItem("theme-grain")
      if (legacy === "off") out.grainPercent = 0
      else if (legacy === "subtle") out.grainPercent = 10
      else if (legacy === "film") out.grainPercent = 35
    }

    const frosted = localStorage.getItem(STORAGE_KEYS.frostedPercent)
    if (frosted !== null) {
      const n = Number(frosted)
      if (Number.isFinite(n) && n >= 0 && n <= 100) out.frostedPercent = Math.round(n)
    }
  } catch {
    // Storage disabled: fall back to site defaults.
  }
  return out
}

function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage full or disabled: setting still holds for this session.
  }
}

function clearVisitorStorage() {
  try {
    for (const key of Object.values(STORAGE_KEYS)) {
      localStorage.removeItem(key)
    }
    localStorage.removeItem("theme-grain")
  } catch {
    // Ignore storage errors.
  }
}

/**
 * Manages appearance settings following monitor's priority order:
 * theme.json defaults < hub site config < visitor localStorage overrides.
 */
function useAppearanceSettings(dark: boolean) {
  const [siteDefaults, setSiteDefaults] = useState<AppearanceValues>(readManifestDefaults)
  const [overrides, setOverrides] = useState<VisitorAppearanceOverrides>(readVisitorOverrides)

  const effective = useMemo<AppearanceValues>(() => ({
    arcEnabled: overrides.arcEnabled ?? siteDefaults.arcEnabled,
    arcColors: overrides.arcColors ?? siteDefaults.arcColors,
    arcIntensity: overrides.arcIntensity ?? siteDefaults.arcIntensity,
    themeId: overrides.themeId ?? siteDefaults.themeId,
    grainPercent: overrides.grainPercent ?? siteDefaults.grainPercent,
    frostedPercent: overrides.frostedPercent ?? siteDefaults.frostedPercent,
  }), [overrides, siteDefaults])

  const activePreset = useMemo(
    () => THEMES.find((t) => t.id === effective.themeId) ?? THEMES[0],
    [effective.themeId],
  )

  const arcLook = useMemo(
    () => (effective.arcEnabled ? computeArcLook(effective.arcColors, effective.arcIntensity, dark) : null),
    [effective.arcEnabled, effective.arcColors, effective.arcIntensity, dark],
  )

  useLayoutEffect(() => {
    const vars = effective.arcEnabled
      ? computeArcTokens(effective.arcColors, effective.arcIntensity, dark)
      : classicShellTokens(dark ? activePreset.dark : activePreset.light, dark)
    const root = document.documentElement
    for (const [key, val] of Object.entries(vars)) {
      root.style.setProperty(`--${key}`, String(val))
    }
  }, [effective.arcEnabled, effective.arcColors, effective.arcIntensity, activePreset, dark])

  useLayoutEffect(() => {
    const stageAlpha = Math.max(0.24, 1 - (effective.frostedPercent * 0.76) / 100)
    const cardAlpha = Math.max(0.45, 1 - (effective.frostedPercent * 0.55) / 100)
    const root = document.documentElement
    root.style.setProperty("--stage-opacity", String(stageAlpha))
    root.style.setProperty("--card-opacity", String(cardAlpha))
  }, [effective.frostedPercent])

  const applyHubConfig = useCallback((cfg: Record<string, unknown>) => {
    setSiteDefaults((prev) => ({
      arcEnabled: typeof cfg.arc_enabled === "boolean" ? cfg.arc_enabled : prev.arcEnabled,
      arcColors: typeof cfg.arc_colors === "string" ? parseArcColors(cfg.arc_colors, prev.arcColors) : prev.arcColors,
      arcIntensity: typeof cfg.arc_intensity === "number" ? clampPercent(cfg.arc_intensity, prev.arcIntensity) : prev.arcIntensity,
      themeId: typeof cfg.theme_preset === "string" && THEMES.some((t) => t.id === cfg.theme_preset) ? cfg.theme_preset : prev.themeId,
      grainPercent: typeof cfg.grain_percent === "number" ? clampPercent(cfg.grain_percent, prev.grainPercent) : prev.grainPercent,
      frostedPercent: typeof cfg.frosted_percent === "number" ? clampPercent(cfg.frosted_percent, prev.frostedPercent) : prev.frostedPercent,
    }))
  }, [])

  const setArcEnabled = useCallback((next: boolean) => {
    writeStorage(STORAGE_KEYS.arcEnabled, String(next))
    setOverrides((prev) => ({ ...prev, arcEnabled: next }))
  }, [])

  const setArcColors = useCallback((next: string[]) => {
    const normalized = parseArcColors(next, DEFAULT_ARC_COLORS)
    writeStorage(STORAGE_KEYS.arcColors, serializeArcColors(normalized))
    setOverrides((prev) => ({ ...prev, arcColors: normalized }))
  }, [])

  const setArcIntensity = useCallback((next: number) => {
    const clamped = clampPercent(next, DEFAULT_ARC_INTENSITY)
    writeStorage(STORAGE_KEYS.arcIntensity, String(clamped))
    setOverrides((prev) => ({ ...prev, arcIntensity: clamped }))
  }, [])

  const setThemeId = useCallback((next: string) => {
    if (!THEMES.some((t) => t.id === next)) return
    writeStorage(STORAGE_KEYS.themeId, next)
    setOverrides((prev) => ({ ...prev, themeId: next }))
  }, [])

  const setGrainPercent = useCallback((next: number) => {
    const clamped = clampPercent(next, 18)
    writeStorage(STORAGE_KEYS.grainPercent, String(clamped))
    setOverrides((prev) => ({ ...prev, grainPercent: clamped }))
  }, [])

  const setFrostedPercent = useCallback((next: number) => {
    const clamped = clampPercent(next, 0)
    writeStorage(STORAGE_KEYS.frostedPercent, String(clamped))
    setOverrides((prev) => ({ ...prev, frostedPercent: clamped }))
  }, [])

  const resetToSiteDefaults = useCallback(() => {
    clearVisitorStorage()
    setOverrides({})
  }, [])

  const saveAsSiteDefault = useCallback(async () => {
    await saveConfig({
      arc_enabled: effective.arcEnabled,
      arc_colors: serializeArcColors(effective.arcColors),
      arc_intensity: effective.arcIntensity,
      theme_preset: effective.themeId,
      grain_percent: effective.grainPercent,
      frosted_percent: effective.frostedPercent,
    })
    setSiteDefaults(effective)
    clearVisitorStorage()
    setOverrides({})
  }, [effective])

  const hasLocalOverrides = Object.values(overrides).some((v) => v !== undefined)

  return {
    effective,
    arcLook,
    hasLocalOverrides,
    applyHubConfig,
    setArcEnabled,
    setArcColors,
    setArcIntensity,
    setThemeId,
    setGrainPercent,
    setFrostedPercent,
    resetToSiteDefaults,
    saveAsSiteDefault,
  }
}

/** Back-to-top button supporting both desktop inner-stage scroll and mobile window scroll. */
function BackToTop({ containerRef }: { containerRef: React.RefObject<HTMLDivElement | null> }) {
  const { t } = useTranslation()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const el = containerRef.current
    const sync = () => {
      const stageTop = el?.scrollTop ?? 0
      setScrolled(stageTop > 220 || scrollY > 220)
    }
    addEventListener("scroll", sync, { passive: true })
    el?.addEventListener("scroll", sync, { passive: true })
    return () => {
      removeEventListener("scroll", sync)
      el?.removeEventListener("scroll", sync)
    }
  }, [containerRef])

  if (!scrolled) return null
  return (
    <Button
      variant="outline"
      size="icon"
      className="fixed right-6 bottom-6 z-30 rounded-full bg-popover/90 shadow-md backdrop-blur-md max-md:right-4 max-md:bottom-4"
      title={t("common.backToTop")}
      aria-label={t("common.backToTop")}
      onClick={() => {
        containerRef.current?.scrollTo({ top: 0, behavior: "smooth" })
        scrollTo({ top: 0, behavior: "smooth" })
      }}
    >
      <ArrowUp className="size-4" />
    </Button>
  )
}

export default function App() {
  const { t } = useTranslation()
  const { mode, dark, choose } = useTheme()
  const {
    effective,
    arcLook,
    hasLocalOverrides,
    applyHubConfig,
    setArcEnabled,
    setArcColors,
    setArcIntensity,
    setThemeId,
    setGrainPercent,
    setFrostedPercent,
    resetToSiteDefaults,
    saveAsSiteDefault,
  } = useAppearanceSettings(dark)
  const [sidebarCollapsed, setSidebarCollapsed] = usePref<boolean>("arc-sidebar-collapsed", false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [config, setConfig] = useState<Record<string, unknown> | null>(null)
  const [me, setMe] = useState<Me | null>(null)
  const [meError, setMeError] = useState("")
  const { nodes, error, closed } = useNodes()
  const open = useNodeRoute()
  const stageRef = useRef<HTMLDivElement>(null)

  const loadMe = useCallback(() => {
    return api<Me>("/me")
      .then((next) => { setMe(next); setMeError("") })
      .catch((e: Error) => setMeError(e.message || t("common.networkError")))
  }, [t])

  const prefetchDetail = useCallback(() => {
    void loadMonitor()
    void loadDetail()
  }, [])

  useEffect(() => {
    loadMe()
    loadConfig().then((cfg) => {
      setConfig(cfg)
      applyHubConfig(cfg)
    }).catch(() => {})
  }, [loadMe, applyHubConfig])

  useEffect(() => {
    if (closed) void loadMe()
  }, [closed, loadMe])

  useEffect(() => {
    if (me && !me.public_page && !me.authed) location.href = "/admin/"
  }, [me])

  // Native Arc shortcut: Cmd+\ or Ctrl+\ toggles the left sidebar on desktop.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault()
        setSidebarCollapsed(!sidebarCollapsed)
      } else if (e.key === "Escape" && mobileMenuOpen) {
        setMobileMenuOpen(false)
      }
    }
    addEventListener("keydown", onKey)
    return () => removeEventListener("keydown", onKey)
  }, [sidebarCollapsed, setSidebarCollapsed, mobileMenuOpen])

  // Scroll the right stage back to top when switching servers.
  useEffect(() => {
    stageRef.current?.scrollTo({ top: 0 })
  }, [open])

  const sorted = useMemo(
    () => [...(nodes ?? [])].sort((a, b) => a.sort - b.sort || a.id - b.id),
    [nodes],
  )
  const selectedIndex = open !== null ? sorted.findIndex((n) => n.id === open) : -1
  const selected = selectedIndex >= 0 ? sorted[selectedIndex] : undefined
  const previousNode = selectedIndex > 0 ? sorted[selectedIndex - 1] : null
  const nextNode = selectedIndex >= 0 && selectedIndex < sorted.length - 1 ? sorted[selectedIndex + 1] : null
  const onlineCount = useMemo(() => sorted.filter((n) => n.online).length, [sorted])

  const site = me?.site_name || "Monitor"
  const notice = typeof config?.notice === "string" ? config.notice.trim() : ""

  useEffect(() => {
    document.title = [selected?.name, site].filter(Boolean).join(" · ")
  }, [selected?.name, site])

  if (!me) return (
    <div className="grid min-h-svh place-items-center p-6 text-sm text-muted-foreground">
      {meError ? (
        <div className="space-y-3 text-center">
          <p role="alert">{t("common.loadFailed", { message: meError })}</p>
          <Button onClick={loadMe}>{t("common.retry")}</Button>
        </div>
      ) : (
        t("common.loading")
      )}
    </div>
  )

  if (!me.public_page && !me.authed) return null

  const themeEditorProps = {
    mode,
    dark,
    onModeChange: choose,
    arcEnabled: effective.arcEnabled,
    onArcEnabledChange: setArcEnabled,
    arcColors: effective.arcColors,
    onArcColorsChange: setArcColors,
    arcIntensity: effective.arcIntensity,
    onArcIntensityChange: setArcIntensity,
    themeId: effective.themeId,
    onThemeChange: setThemeId,
    grainPercent: effective.grainPercent,
    onGrainChange: setGrainPercent,
    frostedPercent: effective.frostedPercent,
    onFrostedChange: setFrostedPercent,
    hasLocalOverrides,
    onResetDefaults: resetToSiteDefaults,
    authed: me.authed,
    onSaveSiteDefault: saveAsSiteDefault,
  }

  return (
    <div className="relative min-h-dvh bg-background lg:h-dvh lg:overflow-hidden">
      {/* Native Arc multi-point gradient shell canvas */}
      {arcLook && (
        <div
          className="pointer-events-none fixed inset-0 z-0 transition-[background-color] duration-300 motion-reduce:transition-none"
          style={{
            backgroundColor: arcLook.backgroundColor,
            backgroundImage: arcLook.backgroundImage,
          }}
          aria-hidden="true"
        />
      )}

      {/* Arc-style tactile film grain overlay on the gradient chrome only:
          it sits under the shell so the right paper stage stays clean. */}
      {effective.grainPercent > 0 && (
        <div
          className={cn(
            "pointer-events-none fixed inset-0 z-0 select-none transition-opacity duration-200 motion-reduce:transition-none",
            dark ? "bg-noise-dark" : "bg-noise-light",
          )}
          style={{
            opacity: Math.min(0.24, (effective.grainPercent / 100) * (dark ? 0.2 : 0.22)),
          }}
          aria-hidden="true"
        />
      )}

      {/* Arc Window Shell: inset gradient frame around collapsible sidebar + floating right stage */}
      <div className="relative z-10 flex min-h-dvh flex-col p-2 sm:p-2.5 lg:h-full lg:flex-row lg:gap-2 lg:overflow-hidden">
        {/* Desktop left Arc sidebar */}
        {!sidebarCollapsed && (
          <aside className="hidden lg:flex lg:h-full lg:w-62 lg:shrink-0 lg:flex-col">
            <ArcSidebar
              site={site}
              nodes={sorted}
              activeNodeId={open}
              onCollapse={() => setSidebarCollapsed(true)}
              prefetchDetail={prefetchDetail}
              authed={me.authed}
              mode={mode}
              onModeChange={choose}
              themeEditorProps={themeEditorProps}
            />
          </aside>
        )}

        {/* Mobile slide-over Arc drawer */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-40 flex lg:hidden">
            <div
              className="fixed inset-0 bg-black/35 backdrop-blur-xs"
              onClick={() => setMobileMenuOpen(false)}
              aria-hidden="true"
            />
            <aside
              role="dialog"
              aria-label={t("sidebar.title")}
              className="relative z-10 flex h-full w-[min(18rem,84vw)] flex-col overflow-hidden border-r border-(--arc-chrome-border) bg-background shadow-2xl"
              style={
                arcLook
                  ? { backgroundColor: arcLook.backgroundColor, backgroundImage: arcLook.backgroundImage }
                  : undefined
              }
            >
              <ArcSidebar
                site={site}
                nodes={sorted}
                activeNodeId={open}
                onCollapse={() => setMobileMenuOpen(false)}
                onNavigate={() => setMobileMenuOpen(false)}
                isMobileDrawer
                prefetchDetail={prefetchDetail}
                authed={me.authed}
                mode={mode}
                onModeChange={choose}
                themeEditorProps={themeEditorProps}
              />
            </aside>
          </div>
        )}

        {/* Right floating Arc Stage Paper Card */}
        <div
          ref={stageRef}
          data-slot="arc-stage"
          className={cn(
            "relative flex min-h-[calc(100dvh-1rem)] min-w-0 flex-1 flex-col rounded-2xl border border-border/70 text-foreground shadow-lg lg:h-full lg:min-h-0 lg:overflow-y-auto",
            effective.frostedPercent > 0 && "backdrop-blur-md",
          )}
          style={{
            backgroundColor: "color-mix(in oklch, var(--stage) calc(var(--stage-opacity, 1) * 100%), transparent)",
          }}
        >
          {/* Slim sticky Stage Top Bar: shares the stage surface so the bar and
              the content below it read as one sheet. */}
          <header
            className="sticky top-0 z-30 flex h-12 shrink-0 items-center justify-between gap-2 rounded-t-2xl border-b border-border/50 px-3 backdrop-blur-md sm:px-5"
            style={{
              backgroundColor: "color-mix(in oklch, var(--stage) calc(var(--stage-opacity, 1) * 100%), transparent)",
            }}
          >
            <div className="flex min-w-0 items-center gap-2">
              {/* Mobile drawer button */}
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setMobileMenuOpen(true)}
                aria-label={t("sidebar.open")}
                title={t("sidebar.openShort")}
                className="shrink-0 lg:hidden cursor-pointer"
              >
                <Menu className="size-4" />
              </Button>

              {/* Desktop expand button when sidebar is collapsed */}
              {sidebarCollapsed && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setSidebarCollapsed(false)}
                  aria-label={t("sidebar.expand")}
                  title={t("sidebar.expandShortcut")}
                  className="hidden shrink-0 lg:inline-flex cursor-pointer"
                >
                  <PanelLeftOpen className="size-4" />
                </Button>
              )}

              {/* Breadcrumb / active context */}
              {open === null ? (
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-semibold">{site}</span>
                  <span className="hidden text-muted-foreground sm:inline">/</span>
                  <span className="hidden text-xs text-muted-foreground sm:inline">{t("sidebar.overview")}</span>
                  {nodes && (
                    <span className="tnum inline-flex shrink-0 items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      {t("status.onlineSummary", { online: onlineCount, total: sorted.length })}
                    </span>
                  )}
                </div>
              ) : selected ? (
                <div className="flex min-w-0 items-center gap-1.5 text-sm">
                  <Link
                    href="/"
                    className="shrink-0 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {t("sidebar.overview")}
                  </Link>
                  <span className="shrink-0 text-muted-foreground/60">/</span>
                  {selected.group && (
                    <>
                      <span className="hidden max-w-28 shrink-0 truncate text-xs text-muted-foreground sm:inline">
                        {selected.group}
                      </span>
                      <span className="hidden shrink-0 text-muted-foreground/60 sm:inline">/</span>
                    </>
                  )}
                  <Dot node={selected} className="size-2 shrink-0" />
                  {selected.country && <Flag code={selected.country} className="shrink-0" />}
                  <span className="min-w-0 truncate font-semibold">{selected.name}</span>
                </div>
              ) : (
                <div className="flex min-w-0 items-center gap-1.5 text-sm">
                  <Link href="/" className="text-xs text-muted-foreground hover:text-foreground">
                    {t("sidebar.overview")}
                  </Link>
                  <span className="text-muted-foreground/60">/</span>
                  <span className="truncate font-medium">{t("common.nodeNotFound")}</span>
                </div>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {/* Prev / Next node buttons on detail view */}
              {selected && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon-sm"
                    disabled={!previousNode}
                    aria-label={t("sidebar.prevNode")}
                    title={previousNode ? t("sidebar.prevNodeTitle", { name: previousNode.name }) : t("sidebar.firstNodeTitle")}
                    onClick={() => previousNode && navigate(`/node/${previousNode.id}`)}
                    className="cursor-pointer"
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    disabled={!nextNode}
                    aria-label={t("sidebar.nextNode")}
                    title={nextNode ? t("sidebar.nextNodeTitle", { name: nextNode.name }) : t("sidebar.lastNodeTitle")}
                    onClick={() => nextNode && navigate(`/node/${nextNode.id}`)}
                    className="cursor-pointer"
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              )}

              {/* Quick language, theme & admin actions on mobile or when desktop sidebar is collapsed */}
              <div className={cn("flex items-center gap-1", !sidebarCollapsed && "lg:hidden")}>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleLocale}
                  aria-label={t("common.switchLanguage")}
                  title={t("common.switchLanguage")}
                  className="size-8 rounded-md text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <Languages className="size-3.5" />
                </Button>
                <ArcThemeEditor {...themeEditorProps} placement="topbar" />
                <a
                  href="/admin/"
                  title={me.authed ? t("common.admin") : t("common.login")}
                  aria-label={me.authed ? t("common.admin") : t("common.login")}
                  className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <UserRound className="size-4" />
                </a>
              </div>
            </div>
          </header>

          {/* Main stage content */}
          <main className="mx-auto w-full max-w-6xl min-w-0 flex-1 space-y-5 px-3.5 py-4 sm:px-6 sm:py-5">
            {notice ? (
              <div className="flex items-start gap-2.5 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm text-foreground">
                <span className="shrink-0 font-semibold text-primary">{t("common.notice")}</span>
                <div className="min-w-0 flex-1 whitespace-pre-wrap">{notice}</div>
              </div>
            ) : null}

            {error && (
              <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {error}
              </p>
            )}

            {!nodes ? (
              <OverviewSkeleton />
            ) : open === null ? (
              sorted.length === 0 ? (
                <Card className="py-16 text-center text-sm text-muted-foreground">{t("common.noNodes")}</Card>
              ) : (
                <OverviewDashboard nodes={sorted} />
              )
            ) : selected ? (
              <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
                <MonitorPage selected={selected} />
              </Suspense>
            ) : (
              <Card className="py-16 text-center text-sm text-muted-foreground">
                {t("common.nodeNotFoundMessage")}{" "}
                <Link href="/" className="font-medium text-foreground hover:underline">
                  {t("common.backToOverview")}
                </Link>
              </Card>
            )}
          </main>

          {/* Compact footer inside stage bottom */}
          <footer className="mt-auto border-t border-border/50 px-4 py-4 sm:px-6">
            <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
              <span>
                {site} · {t("common.poweredBy")}{" "}
                <a href="https://github.com/monitor-probe/monitor" target="_blank" rel="noreferrer" className="font-medium hover:text-foreground">
                  monitor
                </a>
              </span>
              <a href={theme.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-foreground">
                <Palette className="size-3.5" />
                {t("common.themeCredit", { name: theme.name, author: theme.author })}
              </a>
            </div>
          </footer>
        </div>
      </div>

      <BackToTop containerRef={stageRef} />
    </div>
  )
}
