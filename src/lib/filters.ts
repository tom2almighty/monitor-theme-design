import type { Node } from "@/lib/api"
import { osName } from "@/lib/format"

/**
 * The monitor page's filters. `group` and `country` use `null` for "all" and
 * `""` for the nodes without one, so a group named "全部" cannot be confused
 * with the unfiltered state.
 */
export type NodeFilters = {
  query: string
  group: string | null
  country: string | null
  os: string | null
  online: boolean
}

export const EMPTY_FILTERS: NodeFilters = { query: "", group: null, country: null, os: null, online: false }

/**
 * Distribution without its version or the words every distribution shares:
 * "Debian GNU/Linux 12" and "Debian GNU/Linux 13" are one filter.
 */
export function osFamily(os: string): string {
  const name = osName(os).replace(/\s+(Linux|LTS)\b/gi, "").trim()
  return name.split(/\s+v?\d/)[0]?.trim() || "未知"
}

export function filterNodes(nodes: Node[], filters: NodeFilters): Node[] {
  const q = filters.query.trim().toLowerCase()
  return nodes.filter((node) => {
    if (filters.group !== null && (node.group ?? "") !== filters.group) return false
    if (filters.country !== null && (node.country ?? "") !== filters.country) return false
    if (filters.os !== null && osFamily(node.os) !== filters.os) return false
    if (filters.online && !node.online) return false
    if (q && !`${node.name} ${node.country} ${node.group ?? ""} ${node.os}`.toLowerCase().includes(q)) return false
    return true
  })
}
