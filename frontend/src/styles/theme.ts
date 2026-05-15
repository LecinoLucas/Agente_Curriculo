export const theme = {
  colors: {
    primary: "blue-600",
    success: "green-500",
    warning: "yellow-500",
    danger: "red-500",
  },
} as const;

export type Theme = typeof theme;
