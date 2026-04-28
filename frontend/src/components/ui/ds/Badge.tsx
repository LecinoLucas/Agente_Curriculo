import React from "react";

type Variant = "success" | "warning" | "danger" | "neutral";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
  children: React.ReactNode;
  className?: string;
}

const VARIANT: Record<Variant, string> = {
  success: "ui-badge-success",
  warning: "ui-badge-warning",
  danger: "ui-badge-danger",
  neutral: "ui-badge-neutral",
};

export default function Badge({ variant = "neutral", className = "", children, ...props }: BadgeProps) {
  const base = "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium";
  return (
    <span className={`${base} ${VARIANT[variant]} ${className}`} {...props}>
      {children}
    </span>
  );
}
