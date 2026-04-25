import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground shadow-sm",
        secondary: "border-transparent bg-blue-50 text-blue-700 border-blue-200",
        destructive: "border-transparent bg-rose-100 text-rose-700 border-rose-200",
        outline: "text-foreground border-border bg-white",
        success: "border-transparent bg-emerald-100 text-emerald-700 border-emerald-200",
        warning: "border-transparent bg-amber-100 text-amber-800 border-amber-200",
        danger: "border-transparent bg-rose-100 text-rose-700 border-rose-200",
        neutral: "border-transparent bg-slate-100 text-slate-600",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
