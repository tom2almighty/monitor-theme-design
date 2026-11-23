import { lazy, memo, Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import type { Node } from "@/lib/api"

// The charts are most of the bundle, so they stay out of the entry chunk. App
// warms this module on hover/focus so switching to a node feels immediate.
const NodeDetail = lazy(() => import("@/components/NodeDetail").then((module) => ({ default: module.NodeDetail })))

function DetailSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-52 rounded-lg" />
          <Skeleton className="h-4 w-64 rounded-md" />
        </div>
        <Skeleton className="h-8 w-52 rounded-lg" />
      </div>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-72 rounded-xl" />
        ))}
      </div>
    </div>
  )
}

/**
 * Single-server telemetry studio rendered inside the Arc main stage.
 */
export const MonitorPage = memo(function MonitorPage({ selected }: { selected: Node }) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <NodeDetail node={selected} />
    </Suspense>
  )
})
