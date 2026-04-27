import React from "react";

export interface AvatarProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src?: string | null;
  alt?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export default function Avatar({ src, alt = "", size = "md", className = "", ...props }: AvatarProps) {
  const sizes: Record<string, string> = {
    sm: "h-8 w-8",
    md: "h-10 w-10",
    lg: "h-12 w-12",
  };

  const sizeClass = sizes[size] ?? sizes.md;

  const initials = alt
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        className={`${sizeClass} rounded-full object-cover ${className}`}
        {...props}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} rounded-full bg-gray-100 text-gray-700 flex items-center justify-center font-semibold ${className}`}
      aria-hidden
    >
      {initials || "–"}
    </div>
  );
}
