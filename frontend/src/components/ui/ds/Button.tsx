import React, { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: React.ReactNode;
  className?: string;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-blue-600 hover:bg-blue-700 text-white border border-transparent",
  secondary: "bg-gray-100 hover:bg-gray-200 text-gray-900 border border-gray-200",
  ghost: "bg-transparent hover:bg-gray-50 text-gray-900 border border-transparent",
  danger: "bg-red-600 hover:bg-red-700 text-white border border-transparent",
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
