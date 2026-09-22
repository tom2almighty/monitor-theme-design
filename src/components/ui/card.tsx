import * as React from "react"

import { cn } from "@/lib/utils"

// shadcn/ui's card, with the gutters a status page can afford: 16px rather than
// the kit's 24px, since the table inside wants the width.

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn("flex flex-col gap-4 rounded-xl border bg-card py-4 text-card-foreground shadow-sm", className)}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-header" className={cn("flex flex-col gap-1.5 px-4", className)} {...props} />
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-title" className={cn("leading-none font-semibold", className)} {...props} />
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("px-4", className)} {...props} />
}

export { Card, CardContent, CardHeader, CardTitle }
