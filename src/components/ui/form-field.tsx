import * as React from "react"
import { cn } from "@/lib/utils"

export function FormField({
  children,
  className,
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("grid gap-2", className)}>{children}</div>
}

export function FormLabel({
  children,
  className,
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("text-[14px] font-medium text-[#667085] dark:text-slate-400", className)}>{children}</div>
}

export function FormControl({
  children,
  className,
  tone = "default",
  invalid = false,
}: React.HTMLAttributes<HTMLDivElement> & {
  tone?: "default" | "muted"
  invalid?: boolean
}) {
  return (
    <div
      className={cn(
        "flex h-12 items-center rounded-[1rem] border px-4 transition",
        invalid
          ? "border-[rgba(217,45,32,0.28)] bg-[rgba(254,243,242,0.9)]"
          : tone === "muted"
            ? "border-[#cfd8e6] bg-[#edf3fa] dark:border-[#334155] dark:bg-[#111827]"
            : "border-[#cfd8e6] bg-white dark:border-[#334155] dark:bg-[#0f172a]",
        className,
      )}
    >
      {children}
    </div>
  )
}

export function FormHint({
  children,
  className,
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-xs leading-5 text-[#98a2b3] dark:text-slate-500", className)}>{children}</p>
}

export function FormError({
  children,
  className,
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[10px] border border-[rgba(217,45,32,0.18)] bg-[rgba(254,243,242,0.9)] px-4 py-3 text-sm text-[#b42318]",
        className,
      )}
    >
      {children}
    </div>
  )
}
