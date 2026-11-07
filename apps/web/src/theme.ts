import { useSyncExternalStore } from "react";

export const THEMES = [
  { id: "everforest", label: "Everforest", hint: "Warm green on charcoal. The default." },
  { id: "t3-dark", label: "T3 dark", hint: "Black with blue accents, like T3 Code." },
  { id: "t3-light", label: "T3 light", hint: "Light grey with blue accents." },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

const KEY = "rivethub.theme";
const DEFAULT: ThemeId = "everforest";
const listeners = new Set<() => void>();

function isTheme(value: unknown): value is ThemeId {
  return THEMES.some((t) => t.id === value);
}

function read(): ThemeId {
  try {
    const stored = localStorage.getItem(KEY);
    if (isTheme(stored)) return stored;
  } catch {
    // storage can be blocked; fall back to the default
  }
  return DEFAULT;
}

export function applyStoredTheme(): void {
  document.documentElement.dataset.theme = read();
}

export function setTheme(theme: ThemeId): void {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // the theme still applies for this visit
  }
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", getComputedStyle(document.documentElement).getPropertyValue("--background").trim());
  listeners.forEach((l) => l());
}

export function useTheme(): ThemeId {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => (isTheme(document.documentElement.dataset.theme) ? (document.documentElement.dataset.theme as ThemeId) : read()),
  );
}
