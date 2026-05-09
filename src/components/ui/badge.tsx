import type { HTMLAttributes } from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-lg px-2.5 py-1 text-[11px] font-medium tracking-[0.08em] uppercase",
  {
    variants: {
      variant: {
        default: "bg-accent text-accent-foreground",
        subtle: "bg-white/80 text-muted-foreground dark:bg-[#0f172a] dark:text-slate-400",
        primary: "bg-primary/12 text-primary dark:bg-[#13233f] dark:text-[#8eb8ff]",
        danger: "bg-[rgba(154,52,18,0.10)] text-[rgba(154,52,18,0.92)] dark:bg-[rgba(127,29,29,0.24)] dark:text-[#fda29b]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

interface BadgeProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant, className }))} {...props} />
}
