/**
 * Native Arc theme color engine: multi-point HSB/OKLCH palette generation,
 * light/dark dual halves, surface hierarchy tokens, and harmonized chart colors.
 */

export interface ArcPresetPage {
  id: string
  name: string
  swatches: string[][]
}

export interface ArcThemeState {
  /** One to three uppercase "#RRGGBB" key colors on the wheel. */
  colors: string[]
  /** Background color intensity, 0 to 100. */
  intensity: number
}

export interface ArcLook {
  /** Resolved gradient stop colors for the active appearance. */
  stops: string[]
  /** Accent seed color used to derive harmonious UI tokens. */
  accent: string
  /** True when only one key color is selected in light mode. */
  solid: boolean
  /** True when rendering the dark half. */
  dark: boolean
  /** Normalized intensity in [0, 1]. */
  intensity: number
  /** Full CSS background-image value for the page canvas. */
  backgroundImage: string
  /** Solid fallback CSS background color matching the top of the canvas. */
  backgroundColor: string
}

// Arc's five catalog groups, nine colors each, in sRGB.
export const ARC_BRAND = [
  "#F2EAE4", "#F29BBB", "#A6729D", "#F25E6B", "#FF8558", "#F8D558", "#34E895", "#6CBAD9", "#666789",
]
export const ARC_BRAND_PAIRS = [
  "#EFF1E3", "#EFB19B", "#A6727F", "#EAAF5A", "#F0E941", "#A4F454", "#38E5E7", "#7F7EDC", "#7F6589",
]
export const ARC_PASTEL = [
  "#FEFBFA", "#FFE9F3", "#F1D1EC", "#FFCBD1", "#FFE0D3", "#FFF9E5", "#DEFDEB", "#DCF3FC", "#C5C6E5",
]
export const ARC_DRAB = [
  "#4E3A5A", "#693558", "#8F4042", "#B16D40", "#D7B35D", "#CDCCA4", "#7AA982", "#226149", "#26456B",
]
export const ARC_GREYSCALE = [
  "#FFFFFF", "#E6E6E6", "#CCCCCC", "#B2B2B2", "#808080", "#666666", "#333333", "#1A1A1A", "#000000",
]

export const ARC_PRESET_PAGES: ArcPresetPage[] = [
  { id: "brand", name: "品牌", swatches: ARC_BRAND.map((c) => [c]) },
  { id: "brand-pairs", name: "品牌双色", swatches: ARC_BRAND.map((c, i) => [c, ARC_BRAND_PAIRS[i]]) },
  { id: "pastel", name: "粉彩", swatches: ARC_PASTEL.map((c) => [c]) },
  { id: "drab", name: "复古", swatches: ARC_DRAB.map((c) => [c]) },
  { id: "greyscale", name: "灰度", swatches: ARC_GREYSCALE.map((c) => [c]) },
]

export const DEFAULT_ARC_COLORS = ["#6CBAD9", "#7F7EDC"]
export const DEFAULT_ARC_INTENSITY = 75

const HEX_RE = /^#[0-9a-fA-F]{6}$/

export function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0
  return Math.min(1, Math.max(0, v))
}

export function clampPercent(v: number, fallback = DEFAULT_ARC_INTENSITY): number {
  if (!Number.isFinite(v)) return fallback
  return Math.round(Math.min(100, Math.max(0, v)))
}

export function validHex(s: string): boolean {
  return HEX_RE.test(s)
}

export function normalizeHex(s: string): string | null {
  const trimmed = s.trim()
  return validHex(trimmed) ? trimmed.toUpperCase() : null
}

/**
 * Parses a comma-separated hex string (as stored in theme.json / hub config)
 * into 1 to 3 normalized "#RRGGBB" colors, falling back safely on bad input.
 */
export function parseArcColors(raw: unknown, fallback: string[] = DEFAULT_ARC_COLORS): string[] {
  const list = Array.isArray(raw)
    ? raw.filter((item): item is string => typeof item === "string")
    : typeof raw === "string"
      ? raw.split(",")
      : []

  const valid: string[] = []
  for (const item of list) {
    const hex = normalizeHex(item)
    if (hex && valid.length < 3) valid.push(hex)
  }
  return valid.length > 0 ? valid : [...fallback]
}

export function serializeArcColors(colors: string[]): string {
  return parseArcColors(colors).join(",")
}

/** Returns sRGB components in [0, 1]; mid-grey for malformed input. */
export function hexToRgb(hex: string): [number, number, number] {
  if (!validHex(hex)) return [0.5, 0.5, 0.5]
  const v = Number.parseInt(hex.slice(1), 16)
  return [((v >> 16) & 0xff) / 255, ((v >> 8) & 0xff) / 255, (v & 0xff) / 255]
}

export function rgbToHex(r: number, g: number, b: number): string {
  const ch = (v: number) => Math.round(clamp01(v) * 255).toString(16).padStart(2, "0").toUpperCase()
  return `#${ch(r)}${ch(g)}${ch(b)}`
}

/** Linear sRGB interpolation between two hex colors by t in [0, 1]. */
export function mixHex(a: string, b: string, t: number): string {
  const f = clamp01(t)
  const [ar, ag, ab] = hexToRgb(a)
  const [br, bg, bb] = hexToRgb(b)
  return rgbToHex(ar + (br - ar) * f, ag + (bg - ag) * f, ab + (bb - ab) * f)
}

export function hexToRgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${clamp01(alpha).toFixed(3)})`
}

/** Rec. 709 luma on sRGB channels, matching Arc's light/dark threshold check. */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function isDarkHex(hex: string): boolean {
  return luminance(hex) < 0.45
}

function srgbToLinear(x: number): number {
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
}

function linearToSrgb(x: number): number {
  if (x <= 0.0031308) return 12.92 * x
  return 1.055 * (x ** (1 / 2.4)) - 0.055
}

/** WCAG 2.x relative luminance for accessible foreground contrast checks. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex)
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
}

/** WCAG 2.x contrast ratio between two hex colors. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

function readableForeground(bg: string): string {
  return contrastRatio(bg, "#FFFFFF") >= contrastRatio(bg, "#121216") ? "#FFFFFF" : "#121216"
}

export function rgbToHsb(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  const d = mx - mn
  let h = 0
  if (d > 1e-5) {
    if (mx === r) h = ((g - b) / d) % 6
    else if (mx === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h = ((h * 60) % 360 + 360) % 360
  }
  const s = mx > 0 ? d / mx : 0
  return { h, s, v: mx }
}

export function hsbToRgb(h: number, s: number, v: number): [number, number, number] {
  const hh = (((h % 360) + 360) % 360) / 60
  const ss = clamp01(s)
  const vv = clamp01(v)
  const i = Math.floor(hh)
  const f = hh - i
  const p = vv * (1 - ss)
  const q = vv * (1 - f * ss)
  const t = vv * (1 - (1 - f) * ss)
  switch (i % 6) {
    case 0: return [vv, t, p]
    case 1: return [q, vv, p]
    case 2: return [p, vv, t]
    case 3: return [p, q, vv]
    case 4: return [t, p, vv]
    default: return [vv, p, q]
  }
}

/** Color on Arc's wheel: angle is hue, radius is saturation, brightness 0.95. */
export function wheelColor(hue: number, saturation: number): string {
  const [r, g, b] = hsbToRgb(hue, saturation, 0.95)
  return rgbToHex(r, g, b)
}

/** Returns knob coordinates relative to the center of a color pad with given reach. */
export function knobPosition(hex: string, reach: number): { x: number; y: number } {
  const { h, s } = rgbToHsb(...hexToRgb(hex))
  const rad = (h * Math.PI) / 180
  return {
    x: Math.cos(rad) * s * reach,
    y: Math.sin(rad) * s * reach,
  }
}

/** Maps a pointer offset from the pad center to its wheel color. */
export function colorFromPad(dx: number, dy: number, reach: number): string {
  const hue = (Math.atan2(dy, dx) * 180) / Math.PI
  const sat = Math.min(1, Math.hypot(dx, dy) / Math.max(1, reach))
  return wheelColor(hue, sat)
}

/** Keeps HSL hue and saturation while moving lightness to the target value. */
export function shadeHex(hex: string, lightness: number): string {
  const [r, g, b] = hexToRgb(hex)
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  const d = mx - mn
  const l0 = (mx + mn) / 2
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l0 - 1))
  let h = 0
  if (d > 0) {
    if (mx === r) h = ((g - b) / d) % 6
    else if (mx === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h = ((h / 6) % 1 + 1) % 1
  }
  const q = (1 - Math.abs(2 * lightness - 1)) * Math.min(1, s)
  const x = q * (1 - Math.abs(((h * 6) % 2) - 1))
  const m = lightness - q / 2
  let rr = 0
  let gg = 0
  let bb = 0
  switch (Math.floor(h * 6) % 6) {
    case 0: [rr, gg, bb] = [q, x, 0]; break
    case 1: [rr, gg, bb] = [x, q, 0]; break
    case 2: [rr, gg, bb] = [0, q, x]; break
    case 3: [rr, gg, bb] = [0, x, q]; break
    case 4: [rr, gg, bb] = [x, 0, q]; break
    default: [rr, gg, bb] = [q, 0, x]; break
  }
  return rgbToHex(rr + m, gg + m, bb + m)
}

function rgbToOklab(c: [number, number, number]): [number, number, number] {
  const r = srgbToLinear(c[0])
  const g = srgbToLinear(c[1])
  const b = srgbToLinear(c[2])
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

function oklabToLinearRgb(L: number, a: number, b: number): [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b
  const l = l_ * l_ * l_
  const m = m_ * m_ * m_
  const s = s_ * s_ * s_
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

function inSrgbGamut(rgb: [number, number, number]): boolean {
  const eps = 1e-4
  return (
    rgb[0] >= -eps && rgb[0] <= 1 + eps &&
    rgb[1] >= -eps && rgb[1] <= 1 + eps &&
    rgb[2] >= -eps && rgb[2] <= 1 + eps
  )
}

/** Converts a hex color into perceptual OKLCH coordinates (L in [0,1], C >= 0, H in [0,360)). */
export function hexToOklch(hex: string): { l: number; c: number; h: number } {
  const [l, a, b] = rgbToOklab(hexToRgb(hex))
  const c = Math.hypot(a, b)
  const h = c < 1e-5 ? 0 : ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360
  return { l, c, h }
}

/** Converts OKLCH to the nearest in-gamut sRGB hex by reducing chroma smoothly when needed. */
export function oklchToHex(l: number, c: number, h: number): string {
  const clampedL = clamp01(l)
  const rad = ((((h % 360) + 360) % 360) * Math.PI) / 180
  const cosH = Math.cos(rad)
  const sinH = Math.sin(rad)

  const toLinear = (chroma: number) => oklabToLinearRgb(clampedL, chroma * cosH, chroma * sinH)
  let rgb = toLinear(Math.max(0, c))
  if (!inSrgbGamut(rgb)) {
    let lo = 0
    let hi = Math.max(0, c)
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2
      if (inSrgbGamut(toLinear(mid))) lo = mid
      else hi = mid
    }
    rgb = toLinear(lo)
  }
  return rgbToHex(linearToSrgb(clamp01(rgb[0])), linearToSrgb(clamp01(rgb[1])), linearToSrgb(clamp01(rgb[2])))
}

function oklabL(c: [number, number, number]): number {
  return rgbToOklab(c)[0]
}

function edgeAtOklabL(hex: string, target: number): [number, number, number] {
  const { h, s } = rgbToHsb(...hexToRgb(hex))
  const at = (sat: number, val: number): [number, number, number] => hsbToRgb(h, sat, val)
  const solve = (fn: (x: number) => number) => {
    let lo = 0
    let hi = 1
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2
      if (fn(mid) < target) lo = mid
      else hi = mid
    }
    return (lo + hi) / 2
  }
  if (s < 0.05) {
    return at(0, solve((v) => oklabL(at(0, v))))
  }
  if (target <= oklabL(at(1, 1))) {
    return at(1, solve((v) => oklabL(at(1, v))))
  }
  return at(1 - solve((x) => oklabL(at(1 - x, 1))), 1)
}

function paletteBase(hex: string): [number, number, number] {
  const c = hexToRgb(hex)
  return oklabL(c) >= 0.68 ? c : edgeAtOklabL(hex, 0.68)
}

/** Arc's dark ink tone derived from a light theme accent. */
export function inkHex(accent: string): string {
  const { h, s, v } = rgbToHsb(...hexToRgb(accent))
  return rgbToHex(...hsbToRgb(h, Math.min(1, s + 0.1), v * 0.135))
}

/** Arc's toolbar accent tone: rich saturated dark on light themes, muted on dark. */
export function toolbarHex(accent: string, dark: boolean): string {
  const { h, s, v } = rgbToHsb(...hexToRgb(accent))
  const ns = dark ? s * 0.6 : Math.min(1, s + 0.1)
  const nv = dark ? v * 0.8 : v * 0.46
  return rgbToHex(...hsbToRgb(h, ns, nv))
}

/** Arc's palette midTone: OKLab lightness clamped into [0.68, 0.794]. */
export function midToneHex(accent: string): string {
  const base = paletteBase(accent)
  if (oklabL(base) <= 0.794) return rgbToHex(base[0], base[1], base[2])
  const e = edgeAtOklabL(accent, 0.794)
  return rgbToHex(e[0], e[1], e[2])
}

/** Arc's palette tintedLight: mixed toward white until OKLab lightness is 0.95. */
export function tintedLightHex(accent: string): string {
  const base = paletteBase(accent)
  if (oklabL(base) >= 0.95) return rgbToHex(base[0], base[1], base[2])
  const mix = (t: number): [number, number, number] => [
    base[0] + (1 - base[0]) * t,
    base[1] + (1 - base[1]) * t,
    base[2] + (1 - base[2]) * t,
  ]
  let lo = 0
  let hi = 1
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2
    if (oklabL(mix(mid)) < 0.95) lo = mid
    else hi = mid
  }
  const c = mix(lo)
  return rgbToHex(c[0], c[1], c[2])
}

/** Fitted alpha for single-color solid themes: 0.19 at 0 to 0.74 at 1. */
export function solidAlpha(intensity01: number): number {
  return 0.19 + 0.55 * clamp01(intensity01)
}

/** Finds the preset page containing an exact swatch match, or -1. */
export function presetPageOf(colors: string[]): number {
  const normalized = parseArcColors(colors)
  return ARC_PRESET_PAGES.findIndex((page) =>
    page.swatches.some(
      (swatch) =>
        swatch.length === normalized.length &&
        swatch.every((hex, i) => hex.toUpperCase() === normalized[i]),
    ),
  )
}

/**
 * Generates a fresh native Arc-style random palette (1 to 3 colors) across the
 * full hue wheel using organic harmony strategies.
 */
export function randomArcColors(count?: 1 | 2 | 3, rng: () => number = Math.random): string[] {
  const targetCount: 1 | 2 | 3 = count ?? (rng() < 0.15 ? 1 : rng() < 0.62 ? 2 : 3)
  const baseHue = rng() * 360
  const baseSat = 0.36 + rng() * 0.48
  const first = wheelColor(baseHue, baseSat)
  if (targetCount === 1) return [first]

  const strategy = rng()
  const sign = rng() < 0.5 ? 1 : -1
  let offset1: number
  let offset2: number
  if (strategy < 0.55) {
    offset1 = sign * (28 + rng() * 34)
    offset2 = -sign * (28 + rng() * 38)
  } else if (strategy < 0.85) {
    offset1 = sign * (55 + rng() * 45)
    offset2 = sign * (135 + rng() * 40)
  } else {
    offset1 = sign * (105 + rng() * 30)
    offset2 = -sign * (105 + rng() * 30)
  }

  const jitterSat = () => clamp01(baseSat + (rng() - 0.5) * 0.24)
  const second = wheelColor(baseHue + offset1, Math.max(0.24, jitterSat()))
  if (targetCount === 2) return [first, second]
  const third = wheelColor(baseHue + offset2, Math.max(0.24, jitterSat()))
  return [first, second, third]
}

/**
 * Picks an organic harmonious next color on the wheel when the user clicks "+".
 * Avoids colliding with existing knobs so the new dot is immediately grabbable.
 */
export function nextArcColor(existing: string[], rng: () => number = Math.random): string {
  const safe = parseArcColors(existing)
  const { h, s } = rgbToHsb(...hexToRgb(safe[0]))
  const baseSat = s < 0.15 ? 0.52 : clamp01(s + (rng() - 0.5) * 0.14)
  if (safe.length === 1) {
    const offset = (rng() < 0.5 ? 1 : -1) * (34 + rng() * 26)
    return wheelColor(h + offset, baseSat)
  }
  const h2 = rgbToHsb(...hexToRgb(safe[1])).h
  const delta = (((h2 - h) % 360) + 540) % 360 - 180
  const offset = delta >= 0 ? -(38 + rng() * 32) : 38 + rng() * 32
  return wheelColor(h + offset, baseSat)
}

function angularDiff(a: number, b: number): number {
  const d = Math.abs((((a - b) % 360) + 540) % 360 - 180)
  return d
}

/**
 * Derives a perceptually balanced 5-color chart palette from the active Arc colors.
 * Ensures every series harmonizes with the Arc shell while maintaining >= 42 deg
 * hue separation and consistent contrast against both light and dark cards.
 */
export function computeArcChartPalette(
  rawColors: string[],
  dark: boolean,
): [string, string, string, string, string] {
  const colors = parseArcColors(rawColors)
  const parsed = colors.map(hexToOklch)
  const chromatic = parsed.filter((c) => c.c >= 0.035)

  // Editorial low-chroma fallback for Arc greyscale / near-monochrome themes.
  if (chromatic.length === 0) {
    const hues = [248, 166, 68, 305, 18]
    const lSet = dark ? [0.76, 0.74, 0.78, 0.73, 0.74] : [0.54, 0.55, 0.60, 0.53, 0.56]
    const chroma = dark ? 0.105 : 0.10
    return hues.map((h, i) => oklchToHex(lSet[i], chroma, h)) as [string, string, string, string, string]
  }

  const chosenHues: number[] = [chromatic[0].h]
  for (let i = 1; i < chromatic.length; i++) {
    const candidate = chromatic[i].h
    if (chosenHues.every((h) => angularDiff(h, candidate) >= 42)) {
      chosenHues.push(candidate)
    }
  }

  // Candidate hue offsets ordered to yield warm accent, cool teal, then berry/rose.
  const baseHue = chosenHues[0]
  const offsets = [-148, -56, 127, 68, 186, 108, -112, 38, -28, 224]
  while (chosenHues.length < 5) {
    let bestHue = (baseHue + 72 * chosenHues.length) % 360
    let bestMinDist = -1
    for (const off of offsets) {
      const cand = ((baseHue + off) % 360 + 360) % 360
      const minDist = Math.min(...chosenHues.map((h) => angularDiff(h, cand)))
      if (minDist > bestMinDist) {
        bestMinDist = minDist
        bestHue = cand
      }
    }
    chosenHues.push(bestHue)
  }

  const avgChroma = chromatic.reduce((sum, item) => sum + item.c, 0) / chromatic.length
  const targetChroma = Math.min(0.155, Math.max(0.115, avgChroma * 0.92))
  const lLight = [0.55, 0.57, 0.61, 0.54, 0.56]
  const lDark = [0.75, 0.74, 0.78, 0.73, 0.74]

  return chosenHues.slice(0, 5).map((hue, i) => {
    // Yellow-green hues (75..125 deg) look brighter per L; keep lightness slightly disciplined in light mode.
    const isWarmYellow = hue >= 72 && hue <= 122
    const l = dark
      ? lDark[i] + (isWarmYellow ? 0.02 : 0)
      : lLight[i] + (isWarmYellow ? 0.03 : 0)
    const c = isWarmYellow ? Math.min(targetChroma, 0.13) : targetChroma
    return oklchToHex(l, c, hue)
  }) as [string, string, string, string, string]
}

/**
 * Computes the resolved Arc visual look and multi-layered CSS gradient backdrop
 * for the current appearance (light or dark).
 */
export function computeArcLook(
  rawColors: string[],
  intensityPercent: number,
  dark: boolean,
): ArcLook {
  const colors = parseArcColors(rawColors)
  const intensity = clamp01(intensityPercent / 100)

  let stops: string[]
  let accent: string
  let solid = false

  if (dark) {
    const mixWeight = 0.07 + 0.25 * intensity
    const baseDark = "#2B2632"
    const deepNeutral = "#17161D"
    const anchorBase = mixHex(deepNeutral, baseDark, 0.35 + 0.65 * intensity)
    accent = shadeHex(colors[0], 0.064)
    stops = colors.map((c) => {
      const darkKey = shadeHex(c, 0.064)
      const [kr, kg, kb] = hexToRgb(darkKey)
      const [br, bg, bb] = hexToRgb(anchorBase)
      const glow = shadeHex(c, 0.22)
      const [gr, gg, gb] = hexToRgb(glow)
      const r = br * (1 - mixWeight) + kr * mixWeight + gr * (0.14 * intensity)
      const g = bg * (1 - mixWeight) + kg * mixWeight + gg * (0.14 * intensity)
      const b = bb * (1 - mixWeight) + kb * mixWeight + gb * (0.14 * intensity)
      return rgbToHex(r, g, b)
    })
  } else {
    const lifted = isDarkHex(colors[0]) ? colors.map((c) => shadeHex(c, 0.9)) : [...colors]
    accent = lifted[0]
    if (lifted.length === 1) {
      solid = true
      const alpha = solidAlpha(intensity)
      const tinted = mixHex("#F5F5F7", lifted[0], alpha)
      stops = [tinted, mixHex("#F5F5F7", lifted[0], alpha * 0.82)]
    } else {
      const pull = (1 - intensity) * 0.62
      stops = lifted.map((c) => mixHex(c, "#FFFFFF", pull))
    }
  }

  const backgroundColor = stops[0]
  let backgroundImage: string

  if (colors.length === 1) {
    const glow = dark
      ? hexToRgba(midToneHex(colors[0]), 0.12 * intensity)
      : hexToRgba(stops[0], 0.55)
    backgroundImage = [
      `radial-gradient(120% 90% at 15% 0%, ${glow} 0%, transparent 65%)`,
      `linear-gradient(180deg, ${stops[0]} 0%, ${stops[stops.length - 1]} 100%)`,
    ].join(", ")
  } else if (colors.length === 2) {
    const p0 = knobPosition(colors[0], 1)
    const p1 = knobPosition(colors[1], 1)
    const angle = Math.round(((Math.atan2(p1.y - p0.y, p1.x - p0.x) * 180) / Math.PI + 450) % 360)
    const bloomA = dark ? hexToRgba(midToneHex(colors[0]), 0.16 * intensity) : hexToRgba(stops[0], 0.72)
    const bloomB = dark ? hexToRgba(midToneHex(colors[1]), 0.15 * intensity) : hexToRgba(stops[1], 0.68)
    backgroundImage = [
      `radial-gradient(85% 75% at 18% 12%, ${bloomA} 0%, transparent 68%)`,
      `radial-gradient(80% 75% at 86% 84%, ${bloomB} 0%, transparent 70%)`,
      `linear-gradient(${angle}deg, ${stops[0]} 0%, ${stops[1]} 100%)`,
    ].join(", ")
  } else {
    const pos = colors.map((c, idx) => {
      const p = knobPosition(c, 1)
      const x = Math.round(50 + p.x * 38 + (idx === 0 ? -12 : idx === 1 ? 14 : 0))
      const y = Math.round(50 + p.y * 38 + (idx === 0 ? -10 : idx === 2 ? 12 : 0))
      return {
        x: Math.min(92, Math.max(8, x)),
        y: Math.min(92, Math.max(8, y)),
      }
    })
    const layers = colors.map((c, i) => {
      const color = dark
        ? hexToRgba(midToneHex(c), 0.16 * intensity)
        : hexToRgba(stops[i], 0.78)
      return `radial-gradient(75% 75% at ${pos[i].x}% ${pos[i].y}%, ${color} 0%, transparent 70%)`
    })
    layers.push(`linear-gradient(155deg, ${stops[0]} 0%, ${stops[1]} 52%, ${stops[2]} 100%)`)
    backgroundImage = layers.join(", ")
  }

  return {
    stops,
    accent,
    solid,
    dark,
    intensity,
    backgroundImage,
    backgroundColor,
  }
}

/**
 * Derives the complete semantic CSS token set from an Arc theme so the sidebar,
 * floating stage, elevated cards, status indicators, and all telemetry charts
 * form one cohesive color system in both light and dark modes.
 */
export function computeArcTokens(
  rawColors: string[],
  intensityPercent: number,
  dark: boolean,
): Record<string, string> {
  const colors = parseArcColors(rawColors)
  const look = computeArcLook(colors, intensityPercent, dark)
  const primarySeed = colors[0]
  const [chart1, chart2, chart3, chart4, chart5] = computeArcChartPalette(colors, dark)

  if (dark) {
    const primary = midToneHex(primarySeed)
    const primaryFg = readableForeground(primary)
    const stage = mixHex("#15161B", look.stops[0], 0.16)
    const cardTint = mixHex("#1D1F26", look.stops[0], 0.20)
    const popoverTint = mixHex("#20222B", look.stops[0], 0.24)
    const secondary = mixHex("#262832", look.stops[0], 0.22)
    const muted = mixHex("#21232C", look.stops[0], 0.18)
    const accentBg = mixHex("#2B2D3A", primary, 0.15)
    const fg = mixHex("#ECEEF3", tintedLightHex(primarySeed), 0.10)
    const mutedFg = mixHex("#9A9EAE", tintedLightHex(primarySeed), 0.10)

    return {
      background: look.backgroundColor,
      stage,
      foreground: fg,
      card: cardTint,
      "card-foreground": fg,
      popover: popoverTint,
      "popover-foreground": fg,
      primary,
      "primary-foreground": primaryFg,
      secondary,
      "secondary-foreground": fg,
      muted,
      "muted-foreground": mutedFg,
      accent: accentBg,
      "accent-foreground": fg,
      destructive: "#F05A5B",
      "destructive-foreground": "#FFFFFF",
      success: "#34C785",
      "success-foreground": "#0E1A14",
      warning: "#F0B240",
      "warning-foreground": "#1A140A",
      info: "#5FA0FA",
      "info-foreground": "#0E1624",
      border: "rgba(255, 255, 255, 0.095)",
      input: "rgba(255, 255, 255, 0.14)",
      ring: primary,
      "arc-chrome-fg": "rgba(255, 255, 255, 0.94)",
      "arc-chrome-muted": "rgba(255, 255, 255, 0.72)",
      "arc-chrome-glass": "rgba(255, 255, 255, 0.14)",
      "arc-chrome-hover": "rgba(255, 255, 255, 0.08)",
      "arc-chrome-field": "rgba(255, 255, 255, 0.09)",
      "arc-chrome-border": "rgba(255, 255, 255, 0.12)",
      "chart-1": chart1,
      "chart-2": chart2,
      "chart-3": chart3,
      "chart-4": chart4,
      "chart-5": chart5,
    }
  }

  // Light mode: softly Arc-tinted paper stage + crisp elevated white cards + ink-tinted hairlines.
  const primary = toolbarHex(look.accent, false)
  const primaryFg = readableForeground(primary)
  const ink = inkHex(look.accent)
  const fg = mixHex("#181920", ink, 0.35)
  const mutedFg = mixHex("#5F6370", ink, 0.22)
  const stage = mixHex("#F6F7FA", look.stops[0], 0.055)
  const cardTint = mixHex("#FFFFFF", look.stops[0], 0.015)
  const popoverTint = mixHex("#FFFFFF", look.stops[0], 0.02)
  const secondary = mixHex("#ECEEF3", look.stops[0], 0.15)
  const muted = mixHex("#EEF0F5", look.stops[0], 0.16)
  const accentBg = mixHex("#E8EBF1", look.stops[0], 0.20)

  return {
    background: look.backgroundColor,
    stage,
    foreground: fg,
    card: cardTint,
    "card-foreground": fg,
    popover: popoverTint,
    "popover-foreground": fg,
    primary,
    "primary-foreground": primaryFg,
    secondary,
    "secondary-foreground": fg,
    muted,
    "muted-foreground": mutedFg,
    accent: accentBg,
    "accent-foreground": fg,
    destructive: "#D9383A",
    "destructive-foreground": "#FFFFFF",
    success: "#168A5B",
    "success-foreground": "#FFFFFF",
    warning: "#C27803",
    "warning-foreground": "#FFFFFF",
    info: "#2563EB",
    "info-foreground": "#FFFFFF",
    border: hexToRgba(ink, 0.105),
    input: hexToRgba(ink, 0.16),
    ring: primary,
    "arc-chrome-fg": ink,
    "arc-chrome-muted": hexToRgba(ink, 0.72),
    "arc-chrome-glass": "rgba(255, 255, 255, 0.78)",
    "arc-chrome-hover": "rgba(0, 0, 0, 0.055)",
    "arc-chrome-field": "rgba(255, 255, 255, 0.48)",
    "arc-chrome-border": "rgba(0, 0, 0, 0.09)",
    "chart-1": chart1,
    "chart-2": chart2,
    "chart-3": chart3,
    "chart-4": chart4,
    "chart-5": chart5,
  }
}
