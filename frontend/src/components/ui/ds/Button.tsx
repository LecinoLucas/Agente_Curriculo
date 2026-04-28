import React, { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: React.ReactNode;
  className?: string;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-primary hover:bg-primary/90 text-primary-foreground border border-transparent",
  secondary: "ui-btn-secondary border",
  ghost: "bg-transparent hover:bg-[hsl(var(--surface-muted))] text-[hsl(var(--text))] border border-transparent",
  danger: "bg-[hsl(var(--danger))] hover:bg-[hsl(var(--danger))]/90 text-white border border-transparent",
};

export default function Button({
  variant = "primary",
  disabled = false,
  className = "",
  children,
  ...props
}: ButtonProps) {
  const base =
    "inline-flex items-center px-4 py-2 rounded-lg font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 transition";
  const disabledClass = disabled ? "opacity-50 cursor-not-allowed" : "active:scale-95";

  return (
    <button
      type={props.type ?? "button"}
      className={`${base} ${VARIANT_CLASSES[variant]} ${disabledClass} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
