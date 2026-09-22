import { lazy, Suspense, useCallback, useEffect, useState, useSyncExternalStore } from "react"
import { ArrowUp, ChartLine, House, Monitor, Moon, Palette, Sun, UserRound, type LucideIcon } from "lucide-react"

import { NodePicker } from "@/components/NodePicker"
import { ServerTable } from "@/components/ServerTable"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { SEGMENT, Segmented } from "@/components/ui/segmented"
import { Skeleton } from "@/components/ui/skeleton"
import { api, useNodes } from "@/lib/api"
import { Link, useNodeRoute } from "@/lib/route"
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

// The three positions, the system's between the two appearances it picks from.
const MODES = [
  { value: "light" as const, label: <Sun />, title: "浅色" },
  { value: "system" as const, label: <Monitor />, title: "跟随系统" },
  { value: "dark" as const, label: <Moon />, title: "深色" },
]

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
      className="fixed right-4 bottom-4 z-20 rounded-full shadow-md max-md:right-3 max-md:bottom-3"
      title="回到顶部"
      onClick={() => scrollTo({ top: 0, behavior: "smooth" })}
    >
      <ArrowUp />
    </Button>
  )
}

/**
 * One page of the two, in the segmented shape the theme switch beside it wears.
 * A real anchor rather than a radio: a middle click still opens the page in a
 * new tab.
 */
function NavTab({ href, active, icon: Icon, children }: { href: string; active: boolean; icon: LucideIcon; children: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      title={children}
      className={cn(SEGMENT.item, "text-sm max-sm:px-2", active ? SEGMENT.on : SEGMENT.off)}
    >
      <Icon />
      {/* Icons alone on a phone, where the header also holds the site name, the
          theme switch and the panel link. */}
      <span className="max-sm:sr-only">{children}</span>
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

  // One measure for the header, the page and the footer: 56rem, a reading
  // width, since the table folds its wide-panel columns into the expanded row
  // and the charts read better short.
  const measure = "mx-auto w-full max-w-4xl px-4 max-md:px-3"

  return (
    // A faint wash under the cards, so they read as cards rather than as
    // outlines on the page.
    <div className="flex min-h-svh flex-col bg-muted/40">
      {/* A bar floating over the page rather than spanning it: the same measure
          as the cards, inset from the top, translucent and lifted, so it is not
          read as one more of them. The gap above it is the header's own
          padding, so it stays when the bar sticks; the padding lets clicks
          through to what scrolls beneath. */}
      <header className="pointer-events-none sticky top-0 z-10 px-4 pt-3 max-md:px-3 max-md:pt-2">
        <div className="pointer-events-auto mx-auto flex h-12 w-full max-w-4xl items-center gap-3 rounded-xl border border-border/70 bg-background/80 pr-2 pl-4 shadow-lg shadow-black/5 backdrop-blur-md supports-[backdrop-filter]:bg-background/65 max-sm:gap-2 max-sm:pl-3">
          <Link href="/" className="flex min-w-0 items-center gap-2 font-semibold tracking-tight">
            <img src="/favicon.svg" alt="" className="size-5 shrink-0" />
            <span className="truncate">{site}</span>
          </Link>
          <nav aria-label="页面" className={cn(SEGMENT.list, "shrink-0")}>
            <NavTab href="/" active={open === null} icon={House}>首页</NavTab>
            {sorted.length > 0 && (
              <NavTab href={`/node/${open ?? sorted[0].id}`} active={open !== null} icon={ChartLine}>监控</NavTab>
            )}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <Segmented
              value={mode}
              onChange={choose}
              options={MODES}
              label="外观"
              className="max-sm:[&>button]:px-2"
            />
            {/* The panel is a separate app built into the hub, so this is a
                navigation rather than a route. */}
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

      <main className={cn(measure, "flex-1 space-y-4 py-5 max-md:py-3")}>
        {error && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        )}

        {!nodes ? (
          <Skeleton className="h-80 rounded-xl" />
        ) : open === null ? (
          sorted.length === 0 ? (
            <Card className="py-16 text-center text-sm text-muted-foreground">还没有节点</Card>
          ) : (
            <ServerTable nodes={sorted} />
          )
        ) : selected ? (
          <Card className="grid gap-5 p-5 md:grid-cols-[200px_minmax(0,1fr)] max-md:gap-3 max-md:p-3">
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

      <footer>
        <div className={cn(measure, "flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-t py-5 text-xs text-muted-foreground")}>
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
