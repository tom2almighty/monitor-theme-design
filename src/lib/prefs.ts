import { useState } from "react"

// Prefixed: the panel at `/admin/` shares this origin's storage, and `theme` is
// already a key the two apps agree on.
const PREFIX = "serverstatus:"

/**
 * A setting the visitor made once and expects to find made on the next row they
 * open and the next day they visit. Each expanded row mounts its own chart, so
 * state held in the chart would start every row from the default.
 *
 * Read back only when it is the kind that was stored: a value of another kind
 * is an older build's, or someone's, and the default is safer than a surprise.
 */
export function usePref<T extends boolean | number>(name: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PREFIX + name) ?? "null") as unknown
      return typeof saved === typeof initial ? (saved as T) : initial
    } catch {
      return initial
    }
  })
  return [
    value,
    (next: T) => {
      localStorage.setItem(PREFIX + name, JSON.stringify(next))
      setValue(next)
    },
  ] as const
}
