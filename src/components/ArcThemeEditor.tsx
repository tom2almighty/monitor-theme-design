import { useEffect, useId, useMemo, useRef, useState } from "react"
import {
  ChevronLeft,
  ChevronRight,
  Minus,
  Monitor,
  Moon,
  Plus,
  RotateCcw,
  Shuffle,
  Sparkles,
  Sun,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Segmented } from "@/components/ui/segmented"
import {
  ARC_PRESET_PAGES,
  colorFromPad,
  computeArcLook,
  hexToRgb,
  knobPosition,
  nextArcColor,
  presetPageOf,
  randomArcColors,
  rgbToHsb,
  wheelColor,
} from "@/lib/arc-theme"
import { THEMES } from "@/lib/themes"
import { cn } from "@/lib/utils"

export type AppearanceMode = "light" | "dark" | "system"

interface ArcThemeEditorProps {
  mode: AppearanceMode
  dark: boolean
  onModeChange: (mode: AppearanceMode) => void
  arcEnabled: boolean
  onArcEnabledChange: (enabled: boolean) => void
  arcColors: string[]
  onArcColorsChange: (colors: string[]) => void
  arcIntensity: number
  onArcIntensityChange: (intensity: number) => void
  themeId: string
  onThemeChange: (id: string) => void
  grainPercent: number
  onGrainChange: (val: number) => void
  frostedPercent: number
  onFrostedChange: (val: number) => void
  hasLocalOverrides: boolean
  onResetDefaults: () => void
  authed?: boolean
  onSaveSiteDefault: () => Promise<void>
}

const PAD_REACH_RATIO = 0.43

const APPEARANCE_OPTIONS = [
  { value: "light" as const, label: <Sun className="size-3.5" />, title: "浅色" },
  { value: "system" as const, label: <Monitor className="size-3.5" />, title: "跟随系统" },
  { value: "dark" as const, label: <Moon className="size-3.5" />, title: "深色" },
]

const STYLE_MODE_OPTIONS = [
  { value: "arc" as const, label: "Arc 背景" },
  { value: "preset" as const, label: "经典纯色" },
]

/**
 * Interactive 2D dotted color wheel pad modeled after native Arc Browser:
 * supports 1 to 3 independently draggable color knobs, keyboard adjustment,
 * appearance switch, +/- color buttons, and random harmonious palette shuffle.
 */
function ArcColorPad({
  colors,
  onChange,
  mode,
  dark,
  intensity,
  onModeChange,
}: {
  colors: string[]
  onChange: (next: string[]) => void
  mode: AppearanceMode
  dark: boolean
  intensity: number
  onModeChange: (next: AppearanceMode) => void
}) {
  const padRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<number | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  const safeActive = Math.min(activeIndex, colors.length - 1)
  const previewLook = useMemo(() => computeArcLook(colors, intensity, dark), [colors, intensity, dark])

  const pickColorAt = (clientX: number, clientY: number) => {
    const el = padRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const reach = Math.max(1, rect.width * PAD_REACH_RATIO)
    return {
      dx: clientX - cx,
      dy: clientY - cy,
      reach,
      hex: colorFromPad(clientX - cx, clientY - cy, reach),
    }
  }

  const hitTestKnob = (dx: number, dy: number, reach: number): number => {
    for (let i = colors.length - 1; i >= 0; i--) {
      const pos = knobPosition(colors[i], reach)
      const hitRadius = i === 0 ? 22 : 16
      if (Math.hypot(dx - pos.x, dy - pos.y) <= hitRadius) {
        return i
      }
    }
    return -1
  }

  const updateColor = (index: number, hex: string) => {
    const next = [...colors]
    next[index] = hex
    onChange(next)
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("[data-pad-control='true']")) return
    const hit = pickColorAt(e.clientX, e.clientY)
    if (!hit) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)

    const found = hitTestKnob(hit.dx, hit.dy, hit.reach)
    if (found >= 0) {
      setActiveIndex(found)
      setDragging(found)
    } else {
      setDragging(safeActive)
      updateColor(safeActive, hit.hex)
    }
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragging === null) return
    const hit = pickColorAt(e.clientX, e.clientY)
    if (!hit) return
    updateColor(dragging, hit.hex)
  }

  const handlePointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragging === null) return
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    setDragging(null)
  }

  const nudgeKnob = (index: number, dh: number, ds: number) => {
    const { h, s } = rgbToHsb(...hexToRgb(colors[index]))
    const nextSat = Math.min(1, Math.max(0, s + ds))
    updateColor(index, wheelColor(h + dh, nextSat))
  }

  const handleRemoveColor = () => {
    if (colors.length <= 1) return
    const next = colors.slice(0, -1)
    setActiveIndex((prev) => Math.min(prev, next.length - 1))
    onChange(next)
  }

  const handleAddColor = () => {
    if (colors.length >= 3) return
    const next = [...colors, nextArcColor(colors)]
    setActiveIndex(next.length - 1)
    onChange(next)
  }

  const handleShuffle = () => {
    const next = randomArcColors()
    setActiveIndex(0)
    onChange(next)
  }

  return (
    <div
      ref={padRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      className={cn(
        "relative aspect-square w-full select-none overflow-hidden rounded-xl border border-border/70 touch-none",
        dragging !== null ? "cursor-grabbing" : "cursor-crosshair",
      )}
    >
      {/* Subtle live theme wash underneath Arc's dot matrix */}
      <div
        className="pointer-events-none absolute inset-0 opacity-25"
        style={{
          backgroundColor: previewLook.backgroundColor,
          backgroundImage: previewLook.backgroundImage,
        }}
        aria-hidden="true"
      />
      <div className="arc-pad-dots pointer-events-none absolute inset-0" aria-hidden="true" />

      {/* Top appearance pill (Light / System / Dark) */}
      <div
        data-pad-control="true"
        className="absolute top-3 left-1/2 z-20 -translate-x-1/2"
      >
        <Segmented
          value={mode}
          onChange={onModeChange}
          options={APPEARANCE_OPTIONS}
          label="外观模式"
          className="h-7 bg-background/70 backdrop-blur-md shadow-xs"
        />
      </div>

      {/* Independent draggable color knobs */}
      {colors.map((hex, i) => {
        const pos = knobPosition(hex, PAD_REACH_RATIO * 100)
        const isPrimary = i === 0
        const isHeld = dragging === i
        const isSelected = safeActive === i
        return (
          <button
            key={i}
            type="button"
            role="slider"
            aria-label={isPrimary ? "主色圆点" : `副色圆点 ${i + 1}`}
            aria-valuetext={hex}
            title={`拖动或使用方向键调整 (${hex})`}
            onFocus={() => setActiveIndex(i)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") { e.preventDefault(); nudgeKnob(i, 6, 0) }
              else if (e.key === "ArrowLeft") { e.preventDefault(); nudgeKnob(i, -6, 0) }
              else if (e.key === "ArrowUp") { e.preventDefault(); nudgeKnob(i, 0, 0.06) }
              else if (e.key === "ArrowDown") { e.preventDefault(); nudgeKnob(i, 0, -0.06) }
            }}
            className={cn(
              "absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-white shadow-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring motion-safe:transition-transform motion-safe:duration-100",
              isPrimary ? "size-10 border-[3px]" : "size-7 border-2",
              isHeld ? "scale-90 cursor-grabbing z-20" : "cursor-grab hover:scale-108",
              isSelected && !isHeld && "ring-2 ring-foreground/25",
            )}
            style={{
              left: `${50 + pos.x}%`,
              top: `${50 + pos.y}%`,
              backgroundColor: hex,
            }}
          />
        )
      })}

      {/* Bottom color count & shuffle bar */}
      <div
        data-pad-control="true"
        className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border/60 bg-background/75 p-1 shadow-xs backdrop-blur-md"
      >
        <button
          type="button"
          onClick={handleRemoveColor}
          disabled={colors.length <= 1}
          aria-label="减少颜色"
          title="减少颜色"
          className="inline-flex size-6 items-center justify-center rounded-full text-foreground/80 transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring outline-none disabled:pointer-events-none disabled:opacity-30 cursor-pointer"
        >
          <Minus className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={handleAddColor}
          disabled={colors.length >= 3}
          aria-label="增加颜色"
          title="增加颜色（最多 3 色）"
          className="inline-flex size-6 items-center justify-center rounded-full text-foreground/80 transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring outline-none disabled:pointer-events-none disabled:opacity-30 cursor-pointer"
        >
          <Plus className="size-3.5" />
        </button>
        <span className="mx-0.5 h-3.5 w-px bg-border/80" aria-hidden="true" />
        <button
          type="button"
          onClick={handleShuffle}
          aria-label="随机配色"
          title="随机生成原生 Arc 配色"
          className="inline-flex size-6 items-center justify-center rounded-full text-foreground/80 transition-colors hover:bg-accent hover:text-foreground active:scale-95 focus-visible:ring-2 focus-visible:ring-ring outline-none cursor-pointer"
        >
          <Shuffle className="size-3.5" />
        </button>
      </div>
    </div>
  )
}

/**
 * Arc's five preset swatch pages with left/right pagination.
 */
function ArcSwatchBar({
  colors,
  onSelect,
}: {
  colors: string[]
  onSelect: (next: string[]) => void
}) {
  const matchedPage = presetPageOf(colors)
  const colorsKey = colors.join(",")
  const [paged, setPaged] = useState<{ key: string; index: number } | null>(null)
  const pageIndex =
    paged && paged.key === colorsKey
      ? paged.index
      : matchedPage >= 0
        ? matchedPage
        : paged?.index ?? 0

  const page = ARC_PRESET_PAGES[pageIndex] ?? ARC_PRESET_PAGES[0]

  const goPage = (next: number) => {
    const clamped = Math.min(ARC_PRESET_PAGES.length - 1, Math.max(0, next))
    setPaged({ key: colorsKey, index: clamped })
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Arc 预设色板</span>
        <span className="tnum">{page.name} · {pageIndex + 1}/{ARC_PRESET_PAGES.length}</span>
      </div>
      <div className="flex items-center justify-between gap-1">
        <button
          type="button"
          onClick={() => goPage(pageIndex - 1)}
          disabled={pageIndex <= 0}
          aria-label="上一页预设颜色"
          title="上一页预设"
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring outline-none disabled:pointer-events-none disabled:opacity-30 cursor-pointer"
        >
          <ChevronLeft className="size-3.5" />
        </button>

        <div className="flex min-w-0 flex-1 items-center justify-between gap-1 px-0.5">
          {page.swatches.map((swatch, idx) => {
            const active =
              swatch.length === colors.length &&
              swatch.every((hex, i) => hex.toUpperCase() === colors[i]?.toUpperCase())
            const bg =
              swatch.length > 1
                ? `linear-gradient(135deg, ${swatch[0]}, ${swatch[swatch.length - 1]})`
                : swatch[0]
            return (
              <button
                key={`${page.id}-${idx}`}
                type="button"
                onClick={() => onSelect([...swatch])}
                aria-label={`${page.name} ${idx + 1}`}
                aria-pressed={active}
                title={`${page.name} ${idx + 1} (${swatch.join(" → ")})`}
                className={cn(
                  "size-5 shrink-0 rounded-full transition-transform outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer motion-safe:hover:scale-110 motion-safe:active:scale-95",
                  active
                    ? "ring-2 ring-primary ring-offset-2 ring-offset-popover"
                    : "border border-foreground/15",
                )}
                style={{ background: bg }}
              />
            )
          })}
        </div>

        <button
          type="button"
          onClick={() => goPage(pageIndex + 1)}
          disabled={pageIndex >= ARC_PRESET_PAGES.length - 1}
          aria-label="下一页预设颜色"
          title="下一页预设"
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring outline-none disabled:pointer-events-none disabled:opacity-30 cursor-pointer"
        >
          <ChevronRight className="size-3.5" />
        </button>
      </div>
    </div>
  )
}

/**
 * Arc's signature sinusoidal wave slider for background color intensity (0-100%).
 */
function ArcWaveSlider({
  value,
  onChange,
}: {
  value: number
  onChange: (next: number) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const clipId = useId()
  const ratio = Math.min(1, Math.max(0, value / 100))

  // Build 6-cycle sine wave matching Arc's growing amplitude curve.
  const wavePath = useMemo(() => {
    const w = 220
    const h = 36
    const padX = 8
    const amp = 1.8 + 9.5 * ratio
    const pts: string[] = []
    for (let px = padX; px <= w - padX; px += 2) {
      const t = (px - padX) / (w - padX * 2)
      const y = h / 2 - amp * Math.sin(t * Math.PI * 12)
      pts.push(`${px === padX ? "M" : "L"}${px.toFixed(1)},${y.toFixed(1)}`)
    }
    return pts.join(" ")
  }, [ratio])

  const updateFromClientX = (clientX: number) => {
    const el = trackRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const pad = 8
    const pct = ((clientX - rect.left - pad) / Math.max(1, rect.width - pad * 2)) * 100
    onChange(Math.round(Math.min(100, Math.max(0, pct))))
  }

  return (
    <div className="min-w-0 flex-1 space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-foreground">显色强度</span>
        <span className="tnum font-mono text-muted-foreground">{value}%</span>
      </div>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="显色强度"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        onPointerDown={(e) => {
          e.preventDefault()
          e.currentTarget.setPointerCapture(e.pointerId)
          updateFromClientX(e.clientX)
        }}
        onPointerMove={(e) => {
          if (e.buttons !== 1 && e.pointerType === "mouse") return
          if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
          updateFromClientX(e.clientX)
        }}
        onPointerUp={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId)
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); onChange(Math.min(100, value + 5)) }
          else if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); onChange(Math.max(0, value - 5)) }
          else if (e.key === "Home") { e.preventDefault(); onChange(0) }
          else if (e.key === "End") { e.preventDefault(); onChange(100) }
        }}
        className="relative flex h-9 w-full cursor-pointer select-none items-center rounded-lg bg-muted/70 px-1 touch-none outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <svg viewBox="0 0 220 36" preserveAspectRatio="none" className="h-9 w-full overflow-visible" aria-hidden="true">
          <defs>
            <clipPath id={clipId}>
              <rect x="0" y="0" width={8 + 204 * ratio} height="36" />
            </clipPath>
          </defs>
          <path
            d={wavePath}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            className="text-foreground/20"
          />
          <path
            d={wavePath}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            clipPath={`url(#${clipId})`}
            className="text-primary"
          />
        </svg>
        <span
          className="pointer-events-none absolute top-1/2 h-6 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-border bg-background shadow-sm"
          style={{ left: `calc(8px + (100% - 16px) * ${ratio})` }}
          aria-hidden="true"
        />
      </div>
    </div>
  )
}

/**
 * Arc's 20-dot circular rotary dial for tactile film grain (0-100%).
 */
function ArcGrainDial({
  value,
  onChange,
}: {
  value: number
  onChange: (next: number) => void
}) {
  const dialRef = useRef<HTMLDivElement>(null)
  const ratio = Math.min(1, Math.max(0, value / 100))
  const dotCount = 20

  const updateFromPointer = (clientX: number, clientY: number) => {
    const el = dialRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    let angle = Math.atan2(clientY - cy, clientX - cx) + Math.PI / 2
    if (angle < 0) angle += Math.PI * 2
    const pct = Math.round((angle / (Math.PI * 2)) * 100)
    onChange(Math.min(100, Math.max(0, pct)))
  }

  const knobAngle = ratio * Math.PI * 2 - Math.PI / 2
  const x1 = 25 + 6 * Math.cos(knobAngle)
  const y1 = 25 + 6 * Math.sin(knobAngle)
  const x2 = 25 + 12 * Math.cos(knobAngle)
  const y2 = 25 + 12 * Math.sin(knobAngle)

  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <span className="tnum font-mono text-xs text-muted-foreground">颗粒 {value}%</span>
      <div
        ref={dialRef}
        role="slider"
        tabIndex={0}
        aria-label="颗粒强度"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        title="旋转调节颗粒质感"
        onPointerDown={(e) => {
          e.preventDefault()
          e.currentTarget.setPointerCapture(e.pointerId)
          updateFromPointer(e.clientX, e.clientY)
        }}
        onPointerMove={(e) => {
          if (e.buttons !== 1 && e.pointerType === "mouse") return
          if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
          updateFromPointer(e.clientX, e.clientY)
        }}
        onPointerUp={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId)
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); onChange(Math.min(100, value + 5)) }
          else if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); onChange(Math.max(0, value - 5)) }
          else if (e.key === "Home") { e.preventDefault(); onChange(0) }
          else if (e.key === "End") { e.preventDefault(); onChange(100) }
        }}
        className="relative size-11 cursor-pointer select-none rounded-full touch-none outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <svg viewBox="0 0 50 50" className="size-full" aria-hidden="true">
          {Array.from({ length: dotCount }, (_, i) => {
            const a = (i / dotCount) * Math.PI * 2 - Math.PI / 2
            const lit = ratio > 0 && i / dotCount <= ratio
            return (
              <circle
                key={i}
                cx={25 + 21.5 * Math.cos(a)}
                cy={25 + 21.5 * Math.sin(a)}
                r="1.4"
                fill="currentColor"
                className={lit ? "text-primary" : "text-foreground/20"}
              />
            )
          })}
          <circle
            cx="25"
            cy="25"
            r="14.5"
            fill="var(--background)"
            stroke="var(--border)"
            strokeWidth="1.2"
          />
          <line
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            className="text-foreground"
          />
        </svg>
      </div>
    </div>
  )
}

/**
 * Top-right theme studio popover combining native Arc background customization
 * with classic tweakcn presets and frosted card transparency controls.
 */
export function ArcThemeEditor({
  mode,
  dark,
  onModeChange,
  arcEnabled,
  onArcEnabledChange,
  arcColors,
  onArcColorsChange,
  arcIntensity,
  onArcIntensityChange,
  themeId,
  onThemeChange,
  grainPercent,
  onGrainChange,
  frostedPercent,
  onFrostedChange,
  hasLocalOverrides,
  onResetDefaults,
  authed,
  onSaveSiteDefault,
}: ArcThemeEditorProps) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handlePointer = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as globalThis.Node)) {
        setOpen(false)
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("pointerdown", handlePointer)
    document.addEventListener("keydown", handleKey)
    return () => {
      document.removeEventListener("pointerdown", handlePointer)
      document.removeEventListener("keydown", handleKey)
    }
  }, [open])

  const handleSaveDefault = async () => {
    setSaving(true)
    setSaveStatus(null)
    try {
      await onSaveSiteDefault()
      setSaveStatus("已设为全站默认")
      setTimeout(() => setSaveStatus(null), 2500)
    } catch (e: unknown) {
      setSaveStatus(e instanceof Error ? e.message : "保存失败")
      setTimeout(() => setSaveStatus(null), 3000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="relative" ref={menuRef}>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="主题与背景设置"
        className={cn(
          "size-8 rounded-md transition-colors cursor-pointer",
          open ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
        )}
        title="主题与背景设置"
      >
        <Sparkles className="size-3.5 text-primary" />
      </Button>

      {open && (
        <div
          role="dialog"
          aria-label="主题与背景设置"
          className="absolute right-0 top-full z-50 mt-2 w-[min(21.5rem,calc(100vw-1.5rem))] max-h-[calc(100dvh-5rem)] overflow-y-auto rounded-2xl border border-border/80 bg-popover/95 p-3.5 text-popover-foreground shadow-xl backdrop-blur-xl space-y-3.5"
        >
          {/* Mode toggle: Arc dynamic theme vs classic tweakcn solid presets */}
          <div className="flex items-center justify-between gap-2">
            <Segmented
              value={arcEnabled ? "arc" : "preset"}
              onChange={(v) => onArcEnabledChange(v === "arc")}
              options={STYLE_MODE_OPTIONS}
              label="主题风格模式"
              className="flex-1 [&>button]:flex-1"
            />
            {hasLocalOverrides && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onResetDefaults}
                aria-label="恢复站点默认外观"
                title="恢复站点默认外观"
                className="shrink-0 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <RotateCcw className="size-3.5" />
              </Button>
            )}
          </div>

          {arcEnabled ? (
            <>
              <ArcColorPad
                colors={arcColors}
                onChange={onArcColorsChange}
                mode={mode}
                dark={dark}
                intensity={arcIntensity}
                onModeChange={onModeChange}
              />

              <ArcSwatchBar colors={arcColors} onSelect={onArcColorsChange} />

              <div className="flex items-end gap-3 border-t border-border/60 pt-3">
                <ArcWaveSlider value={arcIntensity} onChange={onArcIntensityChange} />
                <ArcGrainDial value={grainPercent} onChange={onGrainChange} />
              </div>
            </>
          ) : (
            <>
              <div>
                <div className="flex items-center justify-between border-b border-border/60 pb-1.5">
                  <span className="text-xs font-semibold">经典配色方案</span>
                  <span className="text-xs text-muted-foreground">tweakcn</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  {THEMES.map((t) => {
                    const active = themeId === t.id
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => onThemeChange(t.id)}
                        className={cn(
                          "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-all cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          active
                            ? "border-primary bg-primary/10 font-semibold text-foreground shadow-2xs"
                            : "border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                        title={t.desc}
                      >
                        <span
                          className="size-3 shrink-0 rounded-full border border-foreground/15 shadow-xs"
                          style={{ backgroundColor: t.accentColor }}
                        />
                        <span className="min-w-0 flex-1 truncate font-medium leading-tight">{t.name}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-1.5 border-t border-border/60 pt-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">颗粒强度</span>
                  <span className="tnum font-mono text-primary font-semibold">{grainPercent}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  aria-label="颗粒强度"
                  value={grainPercent}
                  onChange={(e) => onGrainChange(Number(e.target.value))}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-muted accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </>
          )}

          {/* Card frosted translucency control */}
          <div className="space-y-1.5 border-t border-border/60 pt-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">卡片磨砂透光</span>
              <span className="tnum font-mono text-muted-foreground">{frostedPercent}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              aria-label="卡片磨砂透光"
              value={frostedPercent}
              onChange={(e) => onFrostedChange(Number(e.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-muted accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {/* Site admin save button */}
          {authed && (
            <div className="border-t border-border/60 pt-2.5">
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-full text-xs cursor-pointer"
                disabled={saving}
                onClick={handleSaveDefault}
              >
                {saveStatus ?? (saving ? "保存中…" : "保存为全站默认外观")}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
