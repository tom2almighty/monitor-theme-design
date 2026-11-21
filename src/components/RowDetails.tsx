import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Meter, OsIcon } from "@/components/NodeMarks"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import type { Node } from "@/lib/api"
import {
  bytes,
  cpuName,
  daysUntil,
  dayUsage,
  FOREVER,
  money,
  monthUsage,
  osName,
  pair,
  percent,
  periodStart,
  uptime,
  virtName,
} from "@/lib/format"
import { cn } from "@/lib/utils"

type TrafficModeKey = "sum" | "up" | "down" | "max"
type BillingCycleKey = "monthly" | "quarterly" | "semiannual" | "yearly" | "biennial" | "triennial" | "once"

const TRAFFIC_MODE_KEYS = new Set<string>(["sum", "up", "down", "max"])
const BILLING_CYCLE_KEYS = new Set<string>(["monthly", "quarterly", "semiannual", "yearly", "biennial", "triennial", "once"])

/** Arc-surface specification card that syncs with stage frosted translucency. */
function Block({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <Card className="min-w-0 gap-2.5 p-4">
      <h4 className="flex items-center justify-between gap-2 text-xs font-semibold text-foreground">
        <span className="truncate">{title}</span>
        {aside}
      </h4>
      <div className="space-y-1.5">{children}</div>
    </Card>
  )
}

/** Key-value specification row with adaptive label width for both Chinese and English copy. */
function Line({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3 text-xs leading-5">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={cn("tnum min-w-0 text-right font-medium text-foreground break-words", className)}>
        {children}
      </span>
    </div>
  )
}

/** Period usage meter against plan quota, with today's slice lifted at the tip. */
function PeriodMeter({ used, today, limit, title }: { used: number; today: number; limit: number; title: string }) {
  const pct = percent(used, limit)
  const share = pct > 0 ? (percent(Math.min(today, used), limit) / pct) * 100 : 0
  return (
    <Meter pct={pct} color="var(--color-chart-1)" title={title} className="my-1.5 h-2">
      {today > 0 && (
        <div
          className="absolute inset-y-0 right-0 min-w-0.5 rounded-r-full bg-card/55"
          style={{ width: `${share}%` }}
        />
      )}
    </Meter>
  )
}

/** Four structured specification panels: Host, Capacity & Runtime, Traffic, and Billing. */
export function NodeOverview({ node }: { node: Node }) {
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
    <div className="grid gap-3.5 @min-[34rem]:grid-cols-2 @6xl:grid-cols-4">
      <Block
        title={t("details.system.title")}
        aside={
          node.agent_version ? (
            <Badge variant="outline" className="px-1.5 py-0 font-mono text-[10px] font-normal text-muted-foreground">
              v{node.agent_version}
            </Badge>
          ) : undefined
        }
      >
        <Line label={t("details.system.os")}>
          <span className="inline-flex max-w-full items-center justify-end gap-1.5 align-middle">
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

      <Block title={t("details.resources.runtimeTitle")}>
        <Line label={t("details.resources.memTotal")}>{bytes(node.mem_total)}</Line>
        <Line label={t("details.resources.swap")}>
          {node.swap_total > 0 ? (m ? usage(m.swap_used, m.swap_total) : bytes(node.swap_total)) : t("details.resources.swapOff")}
        </Line>
        <Line label={t("details.resources.diskTotal")}>{bytes(node.disk_total)}</Line>
        {m && <Line label={t("details.resources.load")}>{m.load.map((n) => n.toFixed(2)).join(" / ")}</Line>}
        {m && (
          <Line label={t("details.resources.connections")}>
            {t("details.resources.connectionsValue", { tcp: m.tcp, udp: m.udp, procs: m.procs })}
          </Line>
        )}
      </Block>

      <Block
        title={t("details.traffic.title")}
        aside={
          since ? (
            <span className="tnum shrink-0 text-[11px] text-muted-foreground">
              {t("details.traffic.since", { date: since })}
            </span>
          ) : undefined
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
