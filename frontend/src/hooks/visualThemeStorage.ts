export type VisualTheme = "theme-1" | "theme-2" | "theme-3" | "theme-4";

export const DEFAULT_PUBLIC_THEME: VisualTheme = "theme-4";

const LEGACY_VISUAL_THEME_KEY = "visual-theme";

function applyVisualTheme(theme: VisualTheme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-visual-theme", theme);
}

export function clearLegacyVisualTheme() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(LEGACY_VISUAL_THEME_KEY);
}

export function initializeVisualTheme() {
  clearLegacyVisualTheme();
  applyVisualTheme(DEFAULT_PUBLIC_THEME);
  return DEFAULT_PUBLIC_THEME;
}

export function setDocumentVisualTheme(theme: VisualTheme) {
  applyVisualTheme(theme);
}
