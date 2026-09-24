import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { ArrowUp, ChartLine, House, Monitor, Moon, Palette, Sparkles, Sun, UserRound, type LucideIcon } from "lucide-react"

import { NodePicker } from "@/components/NodePicker"
import { ServerTable, ServerTableSkeleton } from "@/components/ServerTable"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { SEGMENT, Segmented } from "@/components/ui/segmented"
import { Skeleton } from "@/components/ui/skeleton"
import { api, useNodes } from "@/lib/api"
import { Link, useNodeRoute } from "@/lib/route"
import { THEMES } from "@/lib/themes"
import { loadConfig, saveConfig } from "@/lib/config"
import { cn } from "@/lib/utils"
// The name, author and repository the footer credits, read from the manifest
// the panel reads, so the two never disagree.
import theme from "../theme.json"

type Me = { authed: boolean; github: boolean; site_name: string; public_page: boolean }

// Split out because recharts is most of the bundle and the list draws no chart.
// Warmed as soon as the app starts, so the first chart opened does not wait on it.
const loadDetail = () => import("@/components/NodeDetail").then((m) => ({ default: m.NodeDetail }))
const NodeDetail = lazy(loadDetail)

const DARK_MEDIA = matchMedia("(prefers-color-scheme: dark)")

type Mode = "light" | "dark" | "system"

/**
 * What the key says, read as the pre-paint script in index.html reads it: one of
 * the two names is a choice, anything else is none.
 */
const savedMode = (): Mode => {
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
    choose: (next: Mode) => {
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

/**
 * Hook to manage dynamic tweakcn theme presets at runtime.
 */
function useThemePreset(dark: boolean) {
  const [themeId, setThemeId] = useState<string>(() => {
    const saved = localStorage.getItem("theme-preset")
    return THEMES.some((t) => t.id === saved) ? saved! : "claude"
  })

  const activeTheme = useMemo(() => THEMES.find((t) => t.id === themeId) ?? THEMES[0], [themeId])

  useEffect(() => {
    const vars = dark ? activeTheme.dark : activeTheme.light
    const root = document.documentElement
    for (const [key, val] of Object.entries(vars)) {
      root.style.setProperty(`--${key}`, String(val))
    }
    localStorage.setItem("theme-preset", themeId)
  }, [activeTheme, dark, themeId])

  return { themeId, setThemeId, activeTheme }
}

/**
 * Hook to manage Zen Browser dual-parameter texture settings:
 * 1. Grain (Perlin noise intensity, 0-100%)
 * 2. Frosted Blur / Opacity (Container acrylic translucency, 0-100%)
 */
function useTextureSettings() {
  const [grainPercent, setGrainPercent] = useState<number>(() => {
    const saved = localStorage.getItem("theme-grain-percent")
    if (saved !== null) {
      const num = Number(saved)
      if (!Number.isNaN(num) && num >= 0 && num <= 100) return num
    }
    const legacy = localStorage.getItem("theme-grain")
    if (legacy === "off") return 0
    if (legacy === "subtle") return 10
    if (legacy === "film") return 35
    return 16
  })

  const [frostedPercent, setFrostedPercent] = useState<number>(() => {
    const saved = localStorage.getItem("theme-frosted-percent")
    if (saved !== null) {
      const num = Number(saved)
      if (!Number.isNaN(num) && num >= 0 && num <= 100) return num
    }
    return 20 // Default 20% frosted translucency
  })

  useEffect(() => {
    const root = document.documentElement
    // Scale card opacity smoothly from 1.0 (0% frosted) down to 0.08 (100% frosted)
    const cardAlpha = Math.max(0.08, 1 - (frostedPercent * 0.92) / 100)
    root.style.setProperty("--card-opacity", String(cardAlpha))
    localStorage.setItem("theme-frosted-percent", String(frostedPercent))
  }, [frostedPercent])

  useEffect(() => {
    localStorage.setItem("theme-grain-percent", String(grainPercent))
  }, [grainPercent])

  return {
    grainPercent,
    setGrainPercent,
    frostedPercent,
    setFrostedPercent,
  }
}

/**
 * Zen Browser-style theme & dual-parameter texture control popover.
 */
function ThemeSettingsControl({
  themeId,
  onThemeChange,
  grainPercent,
  onGrainChange,
  frostedPercent,
  onFrostedChange,
  authed,
}: {
  themeId: string
  onThemeChange: (id: string) => void
  grainPercent: number
  onGrainChange: (val: number) => void
  frostedPercent: number
  onFrostedChange: (val: number) => void
  authed?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const handleSaveDefault = async () => {
    setSaving(true)
    setSaveStatus(null)
    try {
      await saveConfig({
        theme_preset: themeId,
        grain_percent: grainPercent,
        frosted_percent: frostedPercent,
      })
      setSaveStatus("已设为全站默认")
      setTimeout(() => setSaveStatus(null), 2500)
    } catch (e: unknown) {
      setSaveStatus(e instanceof Error ? e.message : "保存失败")
      setTimeout(() => setSaveStatus(null), 3000)
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("pointerdown", handleClick)
    return () => document.removeEventListener("pointerdown", handleClick)
  }, [open])

  return (
    <div className="relative" ref={menuRef}>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(!open)}
        className={cn(
          "size-8 rounded-md transition-colors",
          open ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
        )}
        title="主题配色与质感设置"
      >
        <Sparkles className="size-3.5 text-primary" />
        <span className="sr-only">主题与质感设置</span>
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 w-72 rounded-xl border border-border/80 bg-popover p-3.5 text-popover-foreground shadow-xl backdrop-blur-md space-y-3.5">
          {/* Section 1: 主题配色 (tweakcn presets) */}
          <div>
            <div className="flex items-center justify-between pb-1.5 border-b border-border/60">
              <span className="text-xs font-semibold">主题配色 (tweakcn)</span>
              <span className="text-[10px] text-muted-foreground">实时换肤</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {THEMES.map((t) => {
                const active = themeId === t.id
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onThemeChange(t.id)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition-all text-left cursor-pointer",
                      active
                        ? "border-primary bg-primary/10 text-foreground font-semibold shadow-2xs"
                        : "border-border/60 hover:bg-muted text-muted-foreground hover:text-foreground",
                    )}
                    title={t.desc}
                  >
                    <span
                      className="size-3 rounded-full shrink-0 border border-black/10 dark:border-white/20 shadow-xs"
                      style={{ backgroundColor: t.accentColor }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium leading-tight">{t.name}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Section 2: 参数 1 - 噪点强度 (Grain 0-100%) */}
          <div className="pt-1 border-t border-border/50 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold">噪点强度 (Zen Grain)</span>
              <span className="font-mono text-xs font-bold text-primary">{grainPercent}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={grainPercent}
              onChange={(e) => onGrainChange(Number(e.target.value))}
              className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary focus:outline-hidden"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
              <span>0% 无</span>
              <span>20% 推荐</span>
              <span>50% 明显</span>
              <span>100% 极强</span>
            </div>
          </div>

          {/* Section 3: 参数 2 - 磨砂透光度 (Frosted 0-100%) */}
          <div className="pt-1 border-t border-border/50 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold">磨砂透光 (Frosted Blur)</span>
              <span className="font-mono text-xs font-bold text-primary">{frostedPercent}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={frostedPercent}
              onChange={(e) => onFrostedChange(Number(e.target.value))}
              className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary focus:outline-hidden"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
              <span>0% 实心</span>
              <span>20% 磨砂</span>
              <span>50% 通透</span>
              <span>100% 极透</span>
            </div>
          </div>

          {/* Section 4: 站长保存为站点默认 */}
          {authed && (
            <div className="pt-2 border-t border-border/50">
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs h-7.5 cursor-pointer"
                disabled={saving}
                onClick={handleSaveDefault}
              >
                {saveStatus ?? (saving ? "保存中…" : "保存为全站默认外观")}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
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
      onClick={() => scrollTo({ top: 0, behavior: "smooth" })}
    >
      <ArrowUp className="size-4" />
    </Button>
  )
}

/**
 * One page of the two, in the segmented shape the theme switch beside it wears.
 */
function NavTab({ href, active, icon: Icon, children }: { href: string; active: boolean; icon: LucideIcon; children: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      title={children}
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
  const { themeId, setThemeId } = useThemePreset(dark)
  const { grainPercent, setGrainPercent, frostedPercent, setFrostedPercent } = useTextureSettings()
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
      if (!localStorage.getItem("theme-preset") && typeof cfg.theme_preset === "string") {
        setThemeId(cfg.theme_preset)
      }
      if (localStorage.getItem("theme-grain-percent") === null && typeof cfg.grain_percent === "number") {
        setGrainPercent(cfg.grain_percent)
      }
      if (localStorage.getItem("theme-frosted-percent") === null && typeof cfg.frosted_percent === "number") {
        setFrostedPercent(cfg.frosted_percent)
      }
    }).catch(() => {})
    void loadDetail()
  }, [loadMe])

  useEffect(() => {
    if (closed) void loadMe()
  }, [closed, loadMe])

  useEffect(() => {
    if (me && !me.public_page && !me.authed) location.href = "/admin/"
  }, [me])

  const sorted = [...(nodes ?? [])].sort((a, b) => a.sort - b.sort || a.id - b.id)
  const selected = sorted.find((n) => n.id === open)
  const site = me?.site_name || "Monitor"

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
      {/* Zen Browser-style tactile grain overlay */}
      {grainPercent > 0 && (
        <div
          className="pointer-events-none fixed inset-0 z-50 select-none bg-noise transition-opacity duration-200"
          style={{
            opacity: Math.min(1, (grainPercent / 100) * (dark ? 0.95 : 0.88)),
          }}
          aria-hidden="true"
        />
      )}

      {/* Standard full-width sticky navigation bar aligned with page measure */}
      <header className="sticky top-0 z-40 w-full border-b border-border/70 bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
        <div className={cn(CONTAINER_CLASS, "flex h-14 items-center justify-between gap-4")}>
          <div className="flex items-center gap-6 max-sm:gap-3">
            <Link href="/" className="flex min-w-0 items-center gap-2.5 font-semibold tracking-tight text-foreground transition-colors hover:opacity-90">
              <img src="/favicon.svg" alt="" className="size-5 shrink-0" />
              <span className="truncate text-base font-bold">{site}</span>
            </Link>
            <nav aria-label="页面" className={cn(SEGMENT.list, "shrink-0")}>
              <NavTab href="/" active={open === null} icon={House}>首页</NavTab>
              {sorted.length > 0 && (
                <NavTab href={`/node/${open ?? sorted[0].id}`} active={open !== null} icon={ChartLine}>监控</NavTab>
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
            <ThemeSettingsControl
              themeId={themeId}
              onThemeChange={setThemeId}
              grainPercent={grainPercent}
              onGrainChange={setGrainPercent}
              frostedPercent={frostedPercent}
              onFrostedChange={setFrostedPercent}
              authed={me.authed}
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
      <main className={cn(CONTAINER_CLASS, "flex-1 space-y-6 py-6 max-md:py-4")}>
        {config?.notice && String(config.notice).trim() && (
          <div className="flex items-start gap-2.5 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-foreground shadow-2xs">
            <span className="font-semibold text-primary shrink-0">公告</span>
            <div className="min-w-0 flex-1 whitespace-pre-wrap">{String(config.notice).trim()}</div>
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
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
          <Card className="grid gap-6 p-5 md:grid-cols-[220px_minmax(0,1fr)] max-md:gap-4 max-md:p-3">
            <NodePicker nodes={sorted} selected={selected.id} />
            <div className="min-w-0">
              <Suspense fallback={<Skeleton className="h-96" />}>
                <NodeDetail node={selected} />
              </Suspense>
            </div>
          </Card>
        ) : (
          <Card className="py-16 text-center text-sm text-muted-foreground">
            节点不存在或未公开。<Link href="/" className="font-medium text-foreground hover:underline">返回列表</Link>
          </Card>
        )}
      </main>

      {/* Footer with matching measure */}
      <footer className="border-t border-border/60 bg-background/50">
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

      <BackToTop />
    </div>
  )
}
