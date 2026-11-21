import { lazy, Suspense } from "react"

import { NodeOverview } from "@/components/RowDetails"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { Node } from "@/lib/api"

// The charts are most of the bundle, so they stay out of the entry chunk. App
// warms this module on hover/focus so switching to a node feels immediate.
const NodeDetail = lazy(() => import("@/components/NodeDetail").then((module) => ({ default: module.NodeDetail })))

/**
 * Single-server detail page rendered inside the Arc main stage:
 * live hardware/billing snapshot cards above the historical & latency charts.
 * Navigation, search, grouping, and node switching live in the Arc sidebar.
 */
export function MonitorPage({ selected }: { selected: Node }) {
  return (
    <div className="@container min-w-0 space-y-5">
      <NodeOverview node={selected} showHistoryLink={false} />

      <Card className="min-w-0 gap-0 py-0">
        <div className="min-w-0 p-4 max-sm:p-3">
          <Suspense fallback={<Skeleton className="h-96 w-full" />}>
            <NodeDetail node={selected} />
          </Suspense>
        </div>
      </Card>
    </div>
  )
}
