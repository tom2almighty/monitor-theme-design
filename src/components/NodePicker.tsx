import { useState } from "react"
import { Search } from "lucide-react"

import { Dot, Flag } from "@/components/NodeMarks"
import { Input } from "@/components/ui/input"
import type { Node } from "@/lib/api"
import { Link } from "@/lib/route"

/**
 * The chart page's node list with instant search and selection.
 */
export function NodePicker({ nodes, selected }: { nodes: Node[]; selected: number }) {
  const [query, setQuery] = useState("")
  const q = query.trim().toLowerCase()
  const shown = q ? nodes.filter((n) => `${n.name} ${n.country} ${n.os} ${n.group ?? ""}`.toLowerCase().includes(q)) : nodes

  return (
    <aside className="flex min-h-0 flex-col gap-2.5 max-md:max-h-56 max-md:border-b max-md:pb-3 md:sticky md:top-[4.75rem] md:max-h-[calc(100svh-6rem)] md:self-start md:border-r md:border-border/70 md:pr-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="搜索节点…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-8.5 pl-8 text-sm md:text-sm"
        />
      </div>
      <nav className="min-h-0 space-y-1 overflow-y-auto pr-1">
        {shown.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">没有匹配的节点</p>}
        {shown.map((n) => (
          <Link
            key={n.id}
            href={`/node/${n.id}`}
            aria-current={n.id === selected ? "page" : undefined}
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-foreground/80 transition-colors hover:bg-accent/60 hover:text-foreground aria-[current=page]:bg-accent aria-[current=page]:font-semibold aria-[current=page]:text-foreground"
          >
            <Dot node={n} className="size-2 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{n.name}</span>
            {n.group && (
              <span className="shrink-0 text-[10px] text-muted-foreground/70 bg-muted/60 px-1.5 py-0.5 rounded font-normal">
                {n.group}
              </span>
            )}
            <Flag code={n.country} showCode={false} className="shrink-0" />
          </Link>
        ))}
      </nav>
    </aside>
  )
}
