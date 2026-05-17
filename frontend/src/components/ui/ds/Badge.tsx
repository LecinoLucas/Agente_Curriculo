import React from "react";

type Variant = "success" | "warning" | "danger" | "neutral";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
  children: React.ReactNode;
  className?: string;
}

const VARIANT: Record<Variant, string> = {
  success: "bg-green-50 text-green-700 border-transparent",
  warning: "bg-yellow-50 text-yellow-800 border-transparent",
  danger: "bg-red-50 text-red-700 border-transparent",
  neutral: "bg-gray-100 text-gray-800 border-transparent",
};

export default function Badge({ variant = "neutral", className = "", children, ...props }: BadgeProps) {
  const base = "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium";
  return (
    <span className={`${base} ${VARIANT[variant]} ${className}`} {...props}>
      {children}
    </span>
  );
}
