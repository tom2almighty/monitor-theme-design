import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react"
import { ArrowUp, ChartLine, House, Monitor, Moon, Palette, Sun, UserRound, type LucideIcon } from "lucide-react"

import { ArcThemeEditor, type AppearanceMode } from "@/components/ArcThemeEditor"
import { ServerTable, ServerTableSkeleton } from "@/components/ServerTable"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { SEGMENT, Segmented } from "@/components/ui/segmented"
import { Skeleton } from "@/components/ui/skeleton"
import { api, useNodes } from "@/lib/api"
import {
  clampPercent,
  computeArcLook,
  computeArcTokens,
  DEFAULT_ARC_COLORS,
  DEFAULT_ARC_INTENSITY,
  parseArcColors,
  serializeArcColors,
} from "@/lib/arc-theme"
import { fields, loadConfig, saveConfig } from "@/lib/config"
import { Link, useNodeRoute } from "@/lib/route"
import { THEMES } from "@/lib/themes"
import { cn } from "@/lib/utils"
// The name, author and repository the footer credits, read from the manifest
// the panel reads, so the two never disagree.
import theme from "../theme.json"

type Me = { authed: boolean; github: boolean; site_name: string; public_page: boolean }

// The chart module is most of the bundle and the list draws no chart. Fetched
// when the monitor tab is hovered or focused, so the status page does not
// download it while a reader may never open a chart.
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
 * The visitor's own choice, or the system's while there is none. Only the switch
 * writes the choice down, and "system" is written as no key at all: persisting
 * the system's answer would pin it, leaving a visitor who never touched the
 * switch in whichever mode their system happened to be in that day. The panel at
 * `/admin/` shares this key on one origin and reads it the same way, so it has
 * to hold to the same rule -- one app writing on load pins the others.
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

  // Another tab, or the panel open in one, changed the key: follow it, so two
  // tabs of one site do not disagree.
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

// The three positions, the system's between the two appearances it picks from.
const MODES = [
  { value: "light" as const, label: <Sun className="size-3.5" />, title: "浅色" },
  { value: "system" as const, label: <Monitor className="size-3.5" />, title: "跟随系统" },
  { value: "dark" as const, label: <Moon className="size-3.5" />, title: "深色" },
]

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
    frostedPercent: clampPercent(Number(manifestDefault("frosted_percent")), 28),
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

  // Apply semantic CSS tokens and frosted card opacity synchronously before paint.
  useLayoutEffect(() => {
    const vars = effective.arcEnabled
      ? computeArcTokens(effective.arcColors, effective.arcIntensity, dark)
      : dark
        ? activePreset.dark
        : activePreset.light
    const root = document.documentElement
    for (const [key, val] of Object.entries(vars)) {
      root.style.setProperty(`--${key}`, String(val))
    }
  }, [effective.arcEnabled, effective.arcColors, effective.arcIntensity, activePreset, dark])

  useLayoutEffect(() => {
    const cardAlpha = Math.max(0.08, 1 - (effective.frostedPercent * 0.92) / 100)
    document.documentElement.style.setProperty("--card-opacity", String(cardAlpha))
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
    const clamped = clampPercent(next, 28)
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

/** Back to the top of a long list, once it has been scrolled past. */
function BackToTop() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const sync = () => setScrolled(scrollY > 200)
    addEventListener("scroll", sync, { passive: true })
    return () => removeEventListener("scroll", sync)
  }, [])
  if (!scrolled) return null
  return (
    <Button
      variant="outline"
      size="icon"
      className="fixed right-6 bottom-6 z-30 rounded-full shadow-md max-md:right-4 max-md:bottom-4"
      title="回到顶部"
      aria-label="回到顶部"
      onClick={() => scrollTo({ top: 0, behavior: "smooth" })}
    >
      <ArrowUp className="size-4" />
    </Button>
  )
}

/**
 * One page of the two, in the segmented shape the theme switch beside it wears.
 */
function NavTab({
  href, active, icon: Icon, prefetch, children,
}: { href: string; active: boolean; icon: LucideIcon; prefetch?: () => void; children: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      title={children}
      onPointerEnter={prefetch}
      onFocus={prefetch}
      className={cn(SEGMENT.item, "text-xs max-sm:px-2", active ? SEGMENT.on : SEGMENT.off)}
    >
      <Icon className="size-3.5" />
      <span className="max-sm:sr-only">{children}</span>
    </Link>
  )
}

// Unified layout measure across header, main, and footer: 1280px (max-w-7xl)
const CONTAINER_CLASS = "mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8"

export default function App() {
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
  const [config, setConfig] = useState<Record<string, unknown> | null>(null)
  const [me, setMe] = useState<Me | null>(null)
  const [meError, setMeError] = useState("")
  const { nodes, error, closed } = useNodes()
  const open = useNodeRoute()

  const loadMe = useCallback(() => {
    return api<Me>("/me")
      .then((next) => { setMe(next); setMeError("") })
      .catch((e: Error) => setMeError(e.message || "网络错误"))
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

  const sorted = [...(nodes ?? [])].sort((a, b) => a.sort - b.sort || a.id - b.id)
  const selected = sorted.find((n) => n.id === open)
  const site = me?.site_name || "Monitor"
  const notice = typeof config?.notice === "string" ? config.notice.trim() : ""

  useEffect(() => {
    document.title = [selected?.name, site].filter(Boolean).join(" · ")
  }, [selected?.name, site])

  if (!me) return (
    <div className="grid min-h-svh place-items-center p-6 text-sm text-muted-foreground">
      {meError ? (
        <div className="space-y-3 text-center">
          <p role="alert">加载失败：{meError}</p>
          <Button onClick={loadMe}>重试</Button>
        </div>
      ) : (
        "加载中…"
      )}
    </div>
  )

  if (!me.public_page && !me.authed) return null

  return (
    <div className="relative flex min-h-svh flex-col bg-background">
      {/* Native Arc multi-point gradient canvas */}
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

      {/* Arc-style tactile film grain overlay */}
      {effective.grainPercent > 0 && (
        <div
          className={cn(
            "pointer-events-none fixed inset-0 z-50 select-none transition-opacity duration-200 motion-reduce:transition-none",
            dark ? "bg-noise-dark" : "bg-noise-light",
          )}
          style={{
            opacity: Math.min(0.24, (effective.grainPercent / 100) * (dark ? 0.2 : 0.22)),
          }}
          aria-hidden="true"
        />
      )}

      <div className="relative z-10 flex min-h-svh flex-col">
        {/* Standard full-width sticky navigation bar aligned with page measure */}
        <header
          className={cn(
            "sticky top-0 z-40 w-full border-b border-border/60 backdrop-blur-md",
            effective.arcEnabled
              ? "bg-card/75 supports-[backdrop-filter]:bg-card/60"
              : "bg-background/80 supports-[backdrop-filter]:bg-background/60",
          )}
        >
          <div className={cn(CONTAINER_CLASS, "flex h-14 min-w-0 items-center justify-between gap-4 max-sm:gap-2")}>
            <div className="flex min-w-0 items-center gap-6 max-sm:gap-3">
              <Link href="/" className="flex min-w-0 shrink items-center gap-2.5 font-semibold tracking-tight text-foreground transition-colors hover:opacity-90">
                <img src="/favicon.svg" alt="" className="size-5 shrink-0" />
                <span className="min-w-0 truncate text-base font-bold">{site}</span>
              </Link>
              <nav aria-label="页面" className={cn(SEGMENT.list, "shrink-0")}>
                <NavTab href="/" active={open === null} icon={House}>首页</NavTab>
                {sorted.length > 0 && (
                  <NavTab
                    href={`/node/${open ?? sorted[0].id}`}
                    active={open !== null}
                    icon={ChartLine}
                    prefetch={() => {
                      void loadMonitor()
                      void loadDetail()
                    }}
                  >
                    监控
                  </NavTab>
                )}
              </nav>
            </div>

            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              <Segmented
                value={mode}
                onChange={choose}
                options={MODES}
                label="外观"
                className="max-sm:[&>button]:px-2"
              />
              <ArcThemeEditor
                mode={mode}
                dark={dark}
                onModeChange={choose}
                arcEnabled={effective.arcEnabled}
                onArcEnabledChange={setArcEnabled}
                arcColors={effective.arcColors}
                onArcColorsChange={setArcColors}
                arcIntensity={effective.arcIntensity}
                onArcIntensityChange={setArcIntensity}
                themeId={effective.themeId}
                onThemeChange={setThemeId}
                grainPercent={effective.grainPercent}
                onGrainChange={setGrainPercent}
                frostedPercent={effective.frostedPercent}
                onFrostedChange={setFrostedPercent}
                hasLocalOverrides={hasLocalOverrides}
                onResetDefaults={resetToSiteDefaults}
                authed={me.authed}
                onSaveSiteDefault={saveAsSiteDefault}
              />
              <a
                href="/admin/"
                title={me.authed ? "后台" : "登录"}
                className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <UserRound className="size-4" />
                <span className="sr-only">{me.authed ? "后台" : "登录"}</span>
              </a>
            </div>
          </div>
        </header>

        {/* Main body with unified container width */}
        <main className={cn(CONTAINER_CLASS, "min-w-0 flex-1 space-y-6 py-6 max-md:py-4")}>
          {notice ? (
            <div className="flex items-start gap-2.5 rounded-lg border border-primary/25 bg-card/80 px-4 py-3 text-sm text-foreground shadow-2xs backdrop-blur-md">
              <span className="shrink-0 font-semibold text-primary">公告</span>
              <div className="min-w-0 flex-1 whitespace-pre-wrap">{notice}</div>
            </div>
          ) : null}

          {error && (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-card/85 px-4 py-3 text-sm text-destructive backdrop-blur-md">
              {error}
            </p>
          )}

          {!nodes ? (
            <ServerTableSkeleton />
          ) : open === null ? (
            sorted.length === 0 ? (
              <Card className="py-16 text-center text-sm text-muted-foreground">还没有节点</Card>
            ) : (
              <ServerTable nodes={sorted} />
            )
          ) : selected ? (
            <Suspense fallback={<Skeleton className="h-96 w-full" />}>
              <MonitorPage nodes={sorted} selected={selected} />
            </Suspense>
          ) : (
            <Card className="py-16 text-center text-sm text-muted-foreground">
              节点不存在或未公开。<Link href="/" className="font-medium text-foreground hover:underline">返回列表</Link>
            </Card>
          )}
        </main>

        {/* Footer with matching measure */}
        <footer
          className={cn(
            "border-t border-border/50",
            effective.arcEnabled ? "bg-card/45 backdrop-blur-xs" : "bg-background/50",
          )}
        >
          <div className={cn(CONTAINER_CLASS, "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-5 text-xs text-muted-foreground")}>
            <span>
              {site} · Powered by{" "}
              <a href="https://github.com/monitor-probe/monitor" target="_blank" rel="noreferrer" className="font-medium hover:text-foreground">
                monitor
              </a>
            </span>
            <a href={theme.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-foreground">
              <Palette className="size-3.5" />
              主题 {theme.name} · {theme.author}
            </a>
          </div>
        </footer>
      </div>

      <BackToTop />
    </div>
  )
}
