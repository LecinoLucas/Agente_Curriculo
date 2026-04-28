import React from "react";

export interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}

export default function Card({ children, className = "", hover = false }: CardProps) {
  const base = "ui-card rounded-xl p-4";
  const hoverClass = hover ? "hover:shadow-md hover:-translate-y-1 transition-transform" : "";

  return <div className={`${base} ${hoverClass} ${className}`}>{children}</div>;
}
