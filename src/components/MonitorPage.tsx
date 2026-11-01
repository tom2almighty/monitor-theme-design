import { lazy, Suspense, useEffect, useMemo, useState } from "react"

import { NodeFilterBar } from "@/components/NodeFilterBar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { Node } from "@/lib/api"
import { EMPTY_FILTERS, filterNodes, type NodeFilters } from "@/lib/filters"
import { navigate } from "@/lib/route"

// The charts are most of the bundle, so they stay out of the entry chunk. App
// warms this module at start, which keeps the first visit to the page immediate.
const NodeDetail = lazy(() => import("@/components/NodeDetail").then((module) => ({ default: module.NodeDetail })))

/**
 * One node's charts, under the filters that chose it. The filter bar sits above
 * the chart on both desktop and mobile: a fixed sidebar would tie the page
 * height to the viewport and push the footer below the fold once a fleet has
 * enough nodes to fill it.
 */
export function MonitorPage({ nodes, selected }: { nodes: Node[]; selected: Node }) {
  const [filters, setFilters] = useState<NodeFilters>(EMPTY_FILTERS)
  const filtered = useMemo(() => filterNodes(nodes, filters), [nodes, filters])

  // The URL's node wins while it is in the result; otherwise the first result
  // stands in immediately and the effect brings the URL along.
  const current = filtered.some((node) => node.id === selected.id) ? selected : filtered[0] ?? null
  const currentId = current?.id

  useEffect(() => {
    if (currentId !== undefined && currentId !== selected.id) navigate(`/node/${currentId}`)
  }, [currentId, selected.id])

  const change = (patch: Partial<NodeFilters>) => setFilters((value) => ({ ...value, ...patch }))
  const reset = () => setFilters(EMPTY_FILTERS)

  return (
    <div className="min-w-0 space-y-4">
      <NodeFilterBar
        allNodes={nodes}
        filtered={filtered}
        selected={current ?? selected}
        filters={filters}
        onChange={change}
        onReset={reset}
      />

      {current ? (
        <Card className="min-w-0 gap-0 py-0">
          <div className="min-w-0 p-4 max-sm:p-3">
            <Suspense fallback={<Skeleton className="h-96 w-full" />}>
              <NodeDetail node={current} />
            </Suspense>
          </div>
        </Card>
      ) : (
        <Card className="py-16 text-center text-sm text-muted-foreground">
          <p>没有匹配的节点，试试放宽筛选条件。</p>
          <Button variant="outline" size="sm" className="mx-auto mt-3" onClick={reset}>
            清除筛选
          </Button>
        </Card>
      )}
    </div>
  )
}
