import { lazy, Suspense, useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from "react"
import { ArrowUp, ChartLine, House, Monitor, Moon, Sun, UserRound, type LucideIcon } from "lucide-react"

import { NodePicker } from "@/components/NodePicker"
import { ServerTable } from "@/components/ServerTable"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { api, useNodes } from "@/lib/api"
import { Link, useNodeRoute } from "@/lib/route"
import { cn } from "@/lib/utils"

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
 *
 * The system's answer is subscribed to rather than copied into state: a flip
 * landing between the first render and the effect that would have attached the
 * listener is otherwise never heard, and the next one is a day away.
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
    choose: (next: Mode) => {
      if (next === "system") localStorage.removeItem("theme")
      else localStorage.setItem("theme", next)
      setMode(next)
    },
  }
}

const MODES: { mode: Mode; icon: LucideIcon; label: string }[] = [
  { mode: "light", icon: Sun, label: "浅色" },
  { mode: "system", icon: Monitor, label: "跟随系统" },
  { mode: "dark", icon: Moon, label: "深色" },
]

/**
 * The three positions in one pill, the system's between the two appearances it
 * picks from. A radio group, since exactly one is on; the arrow keys move along
 * it as they do in one, and only the position that is on takes a tab stop.
 */
function ThemeSwitch({ mode, choose }: { mode: Mode; choose: (mode: Mode) => void }) {
  return (
    <div
      role="radiogroup"
      aria-label="外观"
      className="flex rounded-full border bg-card/85 p-0.5 shadow-md backdrop-blur"
      onKeyDown={(e) => {
        const by = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0
        if (!by) return
        e.preventDefault()
        const next = (MODES.findIndex((m) => m.mode === mode) + by + MODES.length) % MODES.length
        choose(MODES[next].mode)
        ;(e.currentTarget.children[next] as HTMLElement).focus()
      }}
    >
      {MODES.map(({ mode: m, icon: Icon, label }) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          aria-label={label}
          title={label}
          tabIndex={mode === m ? 0 : -1}
          onClick={() => choose(m)}
          className={cn(
            "grid size-8 place-items-center rounded-full transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 max-md:size-7",
            mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-primary",
          )}
        >
          <Icon className="size-4 max-md:size-3.5" />
        </button>
      ))}
    </div>
  )
}

/** Kept in the corner rather than the header, as the classic layout does. */
function Toolbox({ mode, choose }: { mode: Mode; choose: (mode: Mode) => void }) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const sync = () => setScrolled(scrollY > 200)
    addEventListener("scroll", sync, { passive: true })
    return () => removeEventListener("scroll", sync)
  }, [])
  return (
    <div className="fixed right-3 bottom-5 z-20 flex flex-col items-end gap-2.5 max-md:bottom-3">
      {scrolled && (
        <Button
          variant="ghost"
          size="icon"
          className="size-9 rounded-full border bg-card/85 text-primary shadow-md backdrop-blur hover:bg-card hover:text-primary max-md:size-8"
          title="回到顶部"
          onClick={() => scrollTo({ top: 0, behavior: "smooth" })}
        >
          <ArrowUp />
        </Button>
      )}
      <ThemeSwitch mode={mode} choose={choose} />
    </div>
  )
}

function NavItem({ href, active, icon: Icon, children }: { href: string; active: boolean; icon: LucideIcon; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className="inline-flex items-center gap-1.5 px-3.5 text-sm transition-colors hover:text-primary aria-[current=page]:text-primary max-sm:px-2.5"
    >
      <Icon className="size-3.5" />
      {children}
    </Link>
  )
}

export default function App() {
  const { mode, choose } = useTheme()
  const [me, setMe] = useState<Me | null>(null)
  const [meError, setMeError] = useState("")
  const { nodes, error, closed } = useNodes()
  const open = useNodeRoute()

  const loadMe = useCallback(() => {
    // `|| "..."`: HTTP/2 has no statusText, so a bodiless 502 from a proxy arrives
    // as "" and would otherwise render as still loading, with no retry button.
    return api<Me>("/me")
      .then((next) => { setMe(next); setMeError("") })
      .catch((e: Error) => setMeError(e.message || "网络错误"))
  }, [])

  useEffect(() => {
    loadMe()
    void loadDetail()
  }, [loadMe])

  // The status page was closed while this tab was open: re-query, so the effect
  // below sends an anonymous visitor to the panel instead of a list that stopped.
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
      {meError ? <div className="space-y-3 text-center"><p role="alert">加载失败：{meError}</p><Button onClick={loadMe}>重试</Button></div> : "加载中…"}
    </div>
  )

  if (!me.public_page && !me.authed) return null

  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-10 border-b bg-nav shadow-[0_1px_10px_rgb(0_0_0/0.1)]">
        <div className="mx-auto flex h-12 w-[95vw] max-w-[1680px] items-stretch max-md:w-full max-md:px-2">
          <Link href="/" className="mr-5 flex min-w-0 items-center gap-2 text-lg max-sm:mr-1 max-sm:text-base">
            <img src="/favicon.svg" alt="" className="size-5 shrink-0" />
            <span className="truncate">{site}</span>
          </Link>
          <nav className="flex shrink-0 items-stretch">
            <NavItem href="/" active={open === null} icon={House}>首页</NavItem>
            {sorted.length > 0 && (
              <NavItem href={`/node/${open ?? sorted[0].id}`} active={open !== null} icon={ChartLine}>监控</NavItem>
            )}
          </nav>
          {/* The panel is a separate app built into the hub, so this is a
              navigation rather than a route. */}
          <a href="/admin/" className="ml-auto inline-flex shrink-0 items-center gap-1.5 px-3.5 text-sm transition-colors hover:text-primary max-sm:px-2">
            <UserRound className="size-3.5" />
            <span className="max-sm:sr-only">{me.authed ? "后台" : "登录"}</span>
          </a>
        </div>
      </header>

      <main className="mx-auto w-[95vw] max-w-[1680px] flex-1 space-y-4 py-5 max-md:w-full max-md:px-2 max-md:py-2.5">
        {error && (
          <p role="alert" className="rounded-md border border-destructive/25 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
            {error}
          </p>
        )}

        {!nodes ? (
          <Skeleton className="h-80" />
        ) : open === null ? (
          sorted.length === 0 ? (
            <p className="rounded-md border bg-card py-16 text-center text-sm text-muted-foreground shadow-sm">还没有节点</p>
          ) : (
            <ServerTable nodes={sorted} />
          )
        ) : selected ? (
          <div className="grid gap-5 rounded-md border bg-card p-5 text-card-foreground shadow-sm max-md:gap-3 max-md:p-2.5 md:grid-cols-[220px_minmax(0,1fr)]">
            <NodePicker nodes={sorted} selected={selected.id} />
            <div className="min-w-0">
              <Suspense fallback={<Skeleton className="h-96" />}>
                <NodeDetail node={selected} />
              </Suspense>
            </div>
          </div>
        ) : (
          <p className="rounded-md border bg-card py-16 text-center text-sm text-muted-foreground shadow-sm">
            节点不存在或未公开。<Link href="/" className="text-primary hover:underline">返回列表</Link>
          </p>
        )}
      </main>

      <footer className="pb-5 text-center text-xs text-muted-foreground max-md:pb-3">
        {site} | ServerStatus | Powered by{" "}
        <a href="https://github.com/monitor-probe/monitor" target="_blank" rel="noreferrer" className="hover:text-primary">
          monitor
        </a>
      </footer>

      <Toolbox mode={mode} choose={choose} />
    </div>
  )
}
