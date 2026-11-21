// Verification of the Arc color engine, chart palette separation, and token contrast. Run via `npm test`.
import {
  ARC_PRESET_PAGES,
  colorFromPad,
  computeArcChartPalette,
  computeArcLook,
  computeArcTokens,
  contrastRatio,
  DEFAULT_ARC_COLORS,
  hexToOklch,
  hexToRgb,
  isDarkHex,
  knobPosition,
  midToneHex,
  nextArcColor,
  parseArcColors,
  presetPageOf,
  randomArcColors,
  rgbToHsb,
  serializeArcColors,
  shadeHex,
  solidAlpha,
  tintedLightHex,
  validHex,
  wheelColor,
} from "./arc-theme.ts"

let failed = 0
function eq(got: unknown, want: unknown, what: string) {
  const [a, b] = [JSON.stringify(got), JSON.stringify(want)]
  if (a !== b) {
    failed++
    console.error(`✗ ${what}\n    得到 ${a}\n    期望 ${b}`)
  }
}

function nearHex(a: string, b: string, tol: number): boolean {
  const [ar, ag, ab] = hexToRgb(a)
  const [br, bg, bb] = hexToRgb(b)
  return (
    Math.abs(ar - br) * 255 <= tol &&
    Math.abs(ag - bg) * 255 <= tol &&
    Math.abs(ab - bb) * 255 <= tol
  )
}

function hueGap(a: number, b: number): number {
  return Math.abs((((a - b) % 360) + 540) % 360 - 180)
}

// Arc reference shade & palette anchors
eq(nearHex(shadeHex("#8389FF", 0.9), "#C8CAFF", 6), true, "浅色抬升与 Arc 实测一致")
eq(nearHex(shadeHex("#8389FF", 0.064), "#01021F", 3), true, "深色压暗与 Arc 实测一致")
eq(nearHex(midToneHex("#6CBAD9"), "#6CBAD9", 2), true, "midTone 在 OKLab 区间内保持原色")
eq(nearHex(tintedLightHex("#6CBAD9"), "#E4F2F8", 3), true, "tintedLight 蓝色与 Arc 一致")
eq(nearHex(tintedLightHex("#F8D558"), "#FCEDBC", 3), true, "tintedLight 黄色与 Arc 一致")

// Parsing & sanitization against malformed hub config
eq(parseArcColors("#ff00aa, bad, #123456, #abcdef, #999999"), ["#FF00AA", "#123456", "#ABCDEF"], "过滤坏值并限制最多 3 色")
eq(parseArcColors("not-a-color"), DEFAULT_ARC_COLORS, "全部无效时回退默认双色")
eq(serializeArcColors(["#6cbad9", "#7f7edc"]), "#6CBAD9,#7F7EDC", "序列化为大写逗号分隔")

// Wheel round-trip & independent pad mapping
for (const hue of [0, 45, 195, 315]) {
  const hex = wheelColor(hue, 0.65)
  const pos = knobPosition(hex, 150)
  const back = colorFromPad(pos.x, pos.y, 150)
  eq(nearHex(back, hex, 3), true, `色盘往返 (${hue}°)`)
  const hsb = rgbToHsb(...hexToRgb(hex))
  eq(Math.abs(hsb.s - 0.65) < 0.03, true, `色盘饱和度保持 (${hue}°)`)
}

// Preset lookup
eq(ARC_PRESET_PAGES.length, 5, "包含 Arc 5 页预设色板")
eq(presetPageOf(["#f8d558", "#A4F454"]), 1, "识别品牌双色页")
eq(presetPageOf(["#123456"]), -1, "自定义颜色返回 -1")

// Solid alpha bounds
eq(Number(solidAlpha(0).toFixed(2)), 0.19, "强度 0 时的单色不透明度")
eq(Number(solidAlpha(1).toFixed(2)), 0.74, "强度 1 时的单色不透明度")

// Random palette & next color generation
{
  let seed = 42
  const rng = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 0x100000000
  }
  const r2 = randomArcColors(2, rng)
  eq(r2.length, 2, "随机双色数量")
  eq(r2.every(validHex), true, "随机双色均为合法 Hex")
  const r3 = randomArcColors(3, rng)
  eq(r3.length, 3, "随机三色数量")
  eq(r3.every(validHex), true, "随机三色均为合法 Hex")
  const added = nextArcColor(["#6CBAD9"], rng)
  eq(validHex(added), true, "新增颜色为合法 Hex")
  eq(added !== "#6CBAD9", true, "新增颜色不与主色重合")
}

// Look computation: light lift for dark colors, dark half stays dark, 3-color mesh gradient
{
  const darkColorInLight = computeArcLook(["#4E3A5A"], 80, false)
  eq(isDarkHex(darkColorInLight.stops[0]), false, "浅色模式下暗主色自动抬亮")
  eq(darkColorInLight.solid, true, "单色浅色标记为 solid")

  const darkHalf = computeArcLook(["#F29BBB", "#EFB19B"], 80, true)
  eq(darkHalf.dark, true, "深色半面标记")
  eq(isDarkHex(darkHalf.stops[0]), true, "深色半面底色保持暗度")

  const mesh = computeArcLook(["#F25E6B", "#6CBAD9", "#34E895"], 80, false)
  eq(mesh.backgroundImage.includes("radial-gradient"), true, "三色背景生成多点柔光弥散")
  eq(mesh.backgroundImage.includes("linear-gradient"), true, "三色背景含底层线性渐变")
}

// Dynamic Arc chart palette: valid hex, hue separation, and contrast against card surface
for (const sample of [["#F8D558"], ["#FFFFFF"], ["#000000"], ["#6CBAD9", "#7F7EDC"], ["#F25E6B", "#34E895", "#FF8558"]]) {
  for (const dark of [false, true]) {
    const tokens = computeArcTokens(sample, 75, dark)
    const contrast = contrastRatio(tokens.primary, tokens["primary-foreground"])
    eq(contrast >= 4.5, true, `按钮前景 WCAG AA 对比度达标 (${sample.join(",")}, dark=${dark}, ratio=${contrast.toFixed(2)})`)

    const chartColors = computeArcChartPalette(sample, dark)
    eq(chartColors.every(validHex), true, `图表 5 色均为合法 Hex (${sample.join(",")}, dark=${dark})`)

    const hues = chartColors.map((hex) => hexToOklch(hex).h)
    let minGap = 360
    for (let i = 0; i < hues.length; i++) {
      for (let j = i + 1; j < hues.length; j++) {
        minGap = Math.min(minGap, hueGap(hues[i], hues[j]))
      }
    }
    eq(minGap >= 30, true, `图表 5 色色相分离 >= 30° (${sample.join(",")}, dark=${dark}, minGap=${minGap.toFixed(1)}°)`)

    for (const c of chartColors) {
      const cardContrast = contrastRatio(c, tokens.card)
      eq(cardContrast >= 3.0, true, `图表色相对卡片对比度 >= 3.0 (${sample.join(",")}, dark=${dark}, color=${c}, ratio=${cardContrast.toFixed(2)})`)
    }
  }
}

if (failed) {
  console.error(`\n${failed} 项不通过`)
  throw new Error("arc-theme 校验未通过")
}
console.log("arc-theme 校验通过")
