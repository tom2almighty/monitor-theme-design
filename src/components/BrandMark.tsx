import { useId } from "react"

import { cn } from "@/lib/utils"

/**
 * Dynamic Arc telemetry brand mark matching public/favicon.svg while adapting
 * its squircle gradient to the active Arc theme's chart-1 -> chart-2 palette.
 */
export function BrandMark({ className }: { className?: string }) {
  const id = useId().replace(/:/g, "")
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn("size-5 shrink-0", className)}
    >
      <defs>
        <linearGradient id={`${id}-bg`} x1="2" y1="2" x2="30" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--color-chart-1)" />
          <stop offset="100%" stopColor="var(--color-chart-2)" />
        </linearGradient>
        <linearGradient id={`${id}-sheen`} x1="16" y1="2" x2="16" y2="18" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.30" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
      </defs>

      <rect x="1.5" y="1.5" width="29" height="29" rx="8.5" fill={`url(#${id}-bg)`} />
      <rect
        x="2"
        y="2"
        width="28"
        height="28"
        rx="8"
        fill={`url(#${id}-sheen)`}
        stroke="#FFFFFF"
        strokeOpacity="0.24"
        strokeWidth="1"
      />
      <path
        d="M6.5 17.2 H10.8 L13.7 10.2 L17.5 21.4 L20.4 14.8 H24.5"
        stroke="#FFFFFF"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="24.5" cy="14.8" r="3.4" fill="#FFFFFF" fillOpacity="0.26" />
      <circle cx="24.5" cy="14.8" r="1.75" fill="#FFFFFF" />
    </svg>
  )
}
