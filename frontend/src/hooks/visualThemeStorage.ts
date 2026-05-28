export type VisualTheme = "theme-1" | "theme-2";

export const DEFAULT_PUBLIC_THEME: VisualTheme = "theme-1";
export const DEFAULT_THEME: VisualTheme = "theme-1";

const LEGACY_VISUAL_THEME_KEY = "visual-theme";

function applyVisualTheme(theme: VisualTheme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-visual-theme", theme);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(LEGACY_VISUAL_THEME_KEY, theme);
  }
}

export function clearLegacyVisualTheme() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(LEGACY_VISUAL_THEME_KEY);
}

export function initializeVisualTheme() {
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem(LEGACY_VISUAL_THEME_KEY) as VisualTheme | null;
    if (stored === "theme-1" || stored === "theme-2") {
      applyVisualTheme(stored);
      return stored;
    }
  }
  applyVisualTheme(DEFAULT_PUBLIC_THEME);
  return DEFAULT_PUBLIC_THEME;
}

export function setDocumentVisualTheme(theme: VisualTheme) {
  applyVisualTheme(theme);
}
