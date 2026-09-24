import manifest from "../../theme.json"

export type ConfigField = {
  key: string
  type: string
  default: unknown
  options?: { value: string; label?: string }[]
  min?: number
  max?: number
  help?: string
  label?: string
}

function fits(field: ConfigField, value: unknown): boolean {
  if (value === undefined || value === null) return false
  switch (field.type) {
    case "boolean":
      return typeof value === "boolean"
    case "number":
      return typeof value === "number" && Number.isFinite(value)
        && value >= (field.min ?? -Infinity) && value <= (field.max ?? Infinity)
    case "select":
      return !!field.options?.some((option) => option.value === value)
    default:
      return typeof value === "string"
  }
}

export const fields = ((manifest as { config?: (ConfigField | { type: "title"; label: string })[] }).config ?? [])
  .filter((f): f is ConfigField => f.type !== "title")

export async function loadConfig(): Promise<Record<string, unknown>> {
  let saved: Record<string, unknown> = {}
  try {
    const res = await fetch(`/api/themes/${manifest.short}/config`)
    if (res.ok) saved = await res.json()
  } catch {
    // 断网同样按默认值
  }
  const pick = (f: ConfigField) => (fits(f, saved[f.key]) ? saved[f.key] : f.default)
  return Object.fromEntries(fields.map((f) => [f.key, pick(f)]))
}

export async function saveConfig(values: Record<string, unknown>): Promise<void> {
  const url = `/api/themes/${manifest.short}/config`
  const read = await fetch(url)
  if (!read.ok) throw new Error(await read.text())
  const next: Record<string, unknown> = await read.json()
  for (const f of fields) {
    if (values[f.key] === f.default) delete next[f.key]
    else if (values[f.key] !== undefined) next[f.key] = values[f.key]
  }
  const res = await fetch(url, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(next),
  })
  if (!res.ok) throw new Error(await res.text())
}
