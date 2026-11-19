import { useSyncExternalStore } from "react";
import { hostAppearance } from "./lib/desktop";

export const THEMES = [
  { id: "rivethub", label: "RivetHub", hint: "Emerald on near-black. The default." },
  { id: "rivethub-light", label: "RivetHub light", hint: "The same emerald on a light page." },
  { id: "everforest", label: "Everforest", hint: "Warm green on charcoal, with serif headings." },
  { id: "t3-dark", label: "T3 dark", hint: "Black with blue accents, like T3 Code." },
  { id: "t3-light", label: "T3 light", hint: "Light grey with blue accents." },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

const KEY = "rivethub.theme";
const DEFAULT: ThemeId = "rivethub";
const listeners = new Set<() => void>();

const HOST_THEME = { dark: "t3-dark", light: "t3-light" } as const;

function isTheme(value: unknown): value is ThemeId {
  return THEMES.some((t) => t.id === value);
}

function storedChoice(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/**
 * An explicit saved theme wins. Otherwise a host's appearance selects the T3 theme.
 * With neither, the app stays on its own default.
 */
export function resolveTheme(stored: string | null, appearance: "light" | "dark" | null): ThemeId {
  if (isTheme(stored)) return stored;
  if (appearance === "dark" || appearance === "light") return HOST_THEME[appearance];
  return DEFAULT;
}

function currentTheme(): ThemeId {
  const appearance = hostAppearance();
  return resolveTheme(storedChoice(), appearance ? appearance.get() : null);
}

function paint(theme: ThemeId): void {
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", getComputedStyle(document.documentElement).getPropertyValue("--background").trim());
  listeners.forEach((l) => l());
}

let stopFollowing: (() => void) | undefined;

function followHost(): void {
  stopFollowing?.();
  stopFollowing = undefined;
  if (isTheme(storedChoice())) return;
  const appearance = hostAppearance();
  if (!appearance) return;
  stopFollowing = appearance.onChange(() => {
    if (isTheme(storedChoice())) return;
    paint(currentTheme());
  });
}

export function applyStoredTheme(): void {
  paint(currentTheme());
  followHost();
}

export function setTheme(theme: ThemeId): void {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // the theme still applies for this visit
  }
  paint(theme);
}

export function useTheme(): ThemeId {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => (isTheme(document.documentElement.dataset.theme) ? (document.documentElement.dataset.theme as ThemeId) : currentTheme()),
  );
}
