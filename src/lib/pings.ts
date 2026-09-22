const KEY = "serverstatus:pinged"

/**
 * Which nodes a probe pings, as far as the windows fetched so far have shown:
 * true or false once one has arrived, undefined until then.
 *
 * Three things hang on it. An expanded row opens on its latency tab for a node
 * known to have a probe, on its overview for one known to have none, and on a
 * placeholder while the first window is on its way rather than on either -- a
 * latency tab promised to a node that turns out to have none is what this
 * exists to prevent. The chart page offers its latency tab on the same answer,
 * and asks the hub for round trips only when the tab is open or the answer is
 * still unknown. Kept in storage as well as memory, so a node opened yesterday
 * opens today on the right tab without a window having to arrive first.
 */
const pinged = new Map<number, boolean>(load())

function load(): [number, boolean][] {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, unknown>
    return Object.entries(saved)
      .filter(([, v]) => typeof v === "boolean")
      .map(([k, v]) => [Number(k), v as boolean])
  } catch {
    return []
  }
}

export function knownPing(id: number): boolean | undefined {
  return pinged.get(id)
}

/**
 * Recorded once a window has arrived. Anything in it settles the question. An
 * empty window settles it the other way only when it is a day or wider: a probe
 * is drawn for its timeouts too, so an empty hour means no probe ran in that
 * hour, which a hub restart can account for, while an empty day cannot be
 * anything but no probe.
 */
export function recordPing(id: number, has: boolean, hours: number): boolean {
  const known = has || (hours < 24 && pinged.get(id) === true)
  pinged.set(id, known)
  try {
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(pinged)))
  } catch {
    // Storage full or disabled: memory still holds it for this page.
  }
  return known
}
