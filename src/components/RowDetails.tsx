import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { ChartLine } from "lucide-react"

import { deployed, Meter, OsIcon } from "@/components/NodeMarks"
import { Badge } from "@/components/ui/badge"
import { Segmented } from "@/components/ui/segmented"
import { Skeleton } from "@/components/ui/skeleton"
import type { Node } from "@/lib/api"
import {
  bytes, cpuName, daysUntil, dayUsage, FOREVER, money, monthUsage, osName, pair, percent, periodStart,
  uptime, virtName,
} from "@/lib/format"
import { fetchHistory, latencyWindow } from "@/lib/history"
import { knownPing } from "@/lib/pings"
import { Link } from "@/lib/route"
import { cn } from "@/lib/utils"

// From the chart page's chunk, which App warms at start, so the table itself
// carries no recharts.
const Latency = lazy(() => import("@/components/NodeDetail").then((m) => ({ default: m.Latency })))

type TrafficModeKey = "sum" | "up" | "down" | "max"
type BillingCycleKey = "monthly" | "quarterly" | "semiannual" | "yearly" | "biennial" | "triennial" | "once"

const TRAFFIC_MODE_KEYS = new Set<string>(["sum", "up", "down", "max"])
const BILLING_CYCLE_KEYS = new Set<string>(["monthly", "quarterly", "semiannual", "yearly", "biennial", "triennial", "once"])

/**
 * One topic per card, on the shaded strip the open row lays down.
 */
function Block({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-lg border border-border/80 bg-card p-3.5 shadow-xs">
      <h4 className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold text-foreground">
        <span>{title}</span>
        {aside}
      </h4>
      <div className="space-y-1">{children}</div>
    </section>
  )
}

/** One fact per line, the label in a fixed column so the values align. */
function Line({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 grid-cols-[4.2rem_minmax(0,1fr)] items-baseline gap-x-2 text-xs leading-5">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("tnum break-words font-medium text-foreground", className)}>{children}</span>
    </div>
  )
}

/**
 * This period's usage against the plan's quota, with today's share lifted a
 * shade at the tip.
 */
function PeriodMeter({ used, today, limit, title }: { used: number; today: number; limit: number; title: string }) {
  const pct = percent(used, limit)
  const share = pct > 0 ? (percent(Math.min(today, used), limit) / pct) * 100 : 0
  return (
    <Meter pct={pct} title={title} className="my-1.5 h-2">
      {today > 0 && <div className="absolute inset-y-0 right-0 min-w-0.5 rounded-r-full bg-background/45" style={{ width: `${share}%` }} />}
    </Meter>
  )
}

/** The four cards: the machine, what it is doing, what it has moved, and its term. */
export function NodeOverview({ node, showHistoryLink = true }: { node: Node; showHistoryLink?: boolean }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage ?? i18n.language
  const m = node.online ? node.metrics : null
  const away = node.last_seen ? Date.now() / 1000 - node.last_seen : 0
  const days = node.expires_in !== undefined ? node.expires_in : daysUntil(node.expires_at)
  const used = monthUsage(node)
  const today = dayUsage(node)
  const limit = node.traffic_limit
  const since = periodStart(node.month_start, lang)
  const usage = (u: number, total: number) => `${pair(u, total)} (${percent(u, total).toFixed(1)}%)`
  const flow = (rx: number, tx: number) => `↓ ${bytes(rx)} · ↑ ${bytes(tx)}`
  const trafficModeLabel = TRAFFIC_MODE_KEYS.has(node.traffic_mode)
    ? t(`details.traffic.modes.${node.traffic_mode as TrafficModeKey}`)
    : node.traffic_mode
  const cycleLabel = BILLING_CYCLE_KEYS.has(node.billing_cycle)
    ? t(`details.billing.cycles.${node.billing_cycle as BillingCycleKey}`)
    : node.billing_cycle

  const metering = [
    node.traffic_reset_day > 0 && t("details.traffic.resetDay", { day: node.traffic_reset_day }),
    limit > 0 && trafficModeLabel,
  ].filter(Boolean)

  return (
    <div className="grid gap-3 @min-[30rem]:grid-cols-2 @6xl:grid-cols-4">
      <Block
        title={t("details.system.title")}
        aside={
          <div className="flex items-center gap-1.5">
            {node.group && (
              <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-normal">
                {node.group}
              </Badge>
            )}
            {node.agent_version && (
              <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal text-muted-foreground">
                v{node.agent_version}
              </Badge>
            )}
          </div>
        }
      >
        <Line label={t("details.system.os")}>
          <span className="inline-flex max-w-full items-center gap-1.5 align-middle">
            <OsIcon os={node.os} />
            <span className="min-w-0 truncate">{osName(node.os) || "—"}</span>
          </span>
        </Line>
        {node.kernel && <Line label={t("details.system.kernel")}>{node.kernel}</Line>}
        <Line label={t("details.system.arch")}>{[node.arch, virtName(node.virt)].filter(Boolean).join(" · ") || "—"}</Line>
        <Line label={t("details.system.cpu")}>
          {node.cpu_name
            ? `${cpuName(node.cpu_name)} × ${node.cpu_cores}`
            : t("details.system.cores", { count: node.cpu_cores })}
        </Line>
        <Line label={node.online ? t("status.online") : t("status.offline")}>
          {node.online
            ? (m ? uptime(m.uptime, lang) : t("status.waitingReport"))
            : away >= 60
              ? uptime(away, lang)
              : t("status.justNow")}
        </Line>
      </Block>

      <Block
        title={t("details.resources.title")}
        aside={
          showHistoryLink ? (
            <Link href={`/node/${node.id}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
              <ChartLine className="size-3" />
              {t("details.resources.historyLink")}
            </Link>
          ) : null
        }
      >
        {m && <Line label={t("details.resources.cpu")}>{m.cpu.toFixed(1)}%</Line>}
        <Line label={t("details.resources.mem")}>{m ? usage(m.mem_used, m.mem_total) : bytes(node.mem_total)}</Line>
        <Line label={t("details.resources.swap")}>
          {node.swap_total > 0 ? (m ? usage(m.swap_used, m.swap_total) : bytes(node.swap_total)) : t("details.resources.swapOff")}
        </Line>
        <Line label={t("details.resources.disk")}>{m ? usage(m.disk_used, m.disk_total) : bytes(node.disk_total)}</Line>
        {m && <Line label={t("details.resources.load")}>{m.load.map((n) => n.toFixed(2)).join(" / ")}</Line>}
      </Block>

      <Block
        title={t("details.traffic.title")}
        aside={
          since && (
            <span className="tnum text-[11px] text-muted-foreground">
              {t("details.traffic.since", { date: since })}
            </span>
          )
        }
      >
        <Line label={t("details.traffic.period")}>{limit > 0 ? usage(used, limit) : `${bytes(used)} / ${FOREVER}`}</Line>
        {limit > 0 && (
          <PeriodMeter
            used={used}
            today={today}
            limit={limit}
            title={t("details.traffic.periodTitle", { pair: pair(used, limit), today: bytes(today) })}
          />
        )}
        <Line label={t("details.traffic.today")}>{flow(node.day_rx, node.day_tx)}</Line>
        <Line label={t("details.traffic.total")}>{flow(node.total_rx, node.total_tx)}</Line>
        {metering.length > 0 && <Line label={t("details.traffic.metering")}>{metering.join(" · ")}</Line>}
      </Block>

      <Block title={t("details.billing.title")}>
        <Line label={t("details.billing.renew")}>
          {node.price > 0 ? `${money(node.price, node.currency)} / ${cycleLabel}` : t("details.billing.free")}
        </Line>
        <Line label={t("details.billing.expiry")}>{node.expires_at || t("details.billing.permanent")}</Line>
        {days !== null && (
          <Line label={t("details.billing.remaining")}>
            {days < 0 ? (
              <Badge variant="destructive" className="px-1.5 py-0 text-[10px]">
                {t("details.billing.expiredDays", { days: -days })}
              </Badge>
            ) : days <= 7 ? (
              <Badge variant="warning" className="px-1.5 py-0 text-[10px]">
                {t("details.billing.remainingDays", { days })}
              </Badge>
            ) : (
              t("details.billing.days", { days })
            )}
          </Line>
        )}
      </Block>
    </div>
  )
}

/**
 * What a row opens into: two tabs, the round trips to the node first and the
 * four cards of what it is behind them.
 */
export function RowDetails({ node }: { node: Node }) {
  const { t } = useTranslation()
  const [learned, setLearned] = useState<boolean | null>(null)
  const has = learned ?? knownPing(node.id)
  const [tab, setTab] = useState<string | null>(null)
  const shown = has === true ? tab ?? "latency" : "overview"
  const ready = deployed(node)

  const tabs = useMemo(
    () => [
      { value: "latency", label: t("details.tabLatency") },
      { value: "overview", label: t("details.tabOverview") },
    ],
    [t],
  )

  useEffect(() => {
    if (ready) void fetchHistory(node.id, latencyWindow(), "ping")
  }, [node.id, ready])

  if (!ready) {
    return <p className="px-4 py-4 text-sm text-muted-foreground">{t("details.notDeployed")}</p>
  }

  return (
    <div className="space-y-3.5 px-4 py-3.5 text-xs @max-3xl:px-2">
      {has === true && (
        <div className="flex items-center">
          <Segmented value={shown} onChange={setTab} options={tabs} label={t("details.viewLabel")} />
        </div>
      )}

      {has === undefined && <Skeleton className="h-[320px] rounded-lg" />}

      <div hidden={shown !== "latency"}>
        <Suspense fallback={has === true ? <Skeleton className="h-[320px] rounded-lg" /> : null}>
          <Latency id={node.id} card className="h-[280px] @max-3xl:h-[220px]" onKnown={setLearned} />
        </Suspense>
      </div>

      <div hidden={shown !== "overview" || has === undefined}>
        <NodeOverview node={node} />
      </div>
    </div>
  )
}
