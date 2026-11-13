export const THEMES = [
  { id: "rivethub", label: "RivetHub", hint: "Emerald on near-black. The default." },
  { id: "rivethub-light", label: "RivetHub light", hint: "The same emerald on a light page." },
  { id: "everforest", label: "Everforest", hint: "Warm green on charcoal, with serif headings." },
  { id: "t3-dark", label: "T3 dark", hint: "Black with blue accents, like T3 Code." },
  { id: "t3-light", label: "T3 light", hint: "Light grey with blue accents." },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export interface Palette {
  background: string;
  sidebar: string;
  card: string;
  raised: string;
  foreground: string;
  muted: string;
  border: string;
  input: string;
  accent: string;
  selected: string;
  primary: string;
  primaryForeground: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  message: string;
  code: string;
  /** The face for headlines and reading text. Undefined is the system sans. */
  reading: string | undefined;
  scheme: "dark" | "light";
}

/** Same semantic colors as the web app. oklch tokens are hex so React Native can paint them. */
export const PALETTES: Record<ThemeId, Palette> = {
  // RivetHub's own palette, from rivethub-desktop's crates/model/src/palette.rs, as the web app uses it.
  rivethub: {
    background: "#181e1b",
    sidebar: "#0f1512",
    card: "#1f2622",
    raised: "#2b332e",
    foreground: "#dee4df",
    muted: "#a7b2ab",
    border: "#2b332e",
    input: "#414a45",
    accent: "#1d2420",
    selected: "#1f4535",
    primary: "#6cdbac",
    primaryForeground: "#003825",
    success: "#6cdbac",
    warning: "#f5c56b",
    error: "#ffb4ab",
    info: "#8ecbff",
    message: "#1f4535",
    code: "#111714",
    reading: undefined,
    scheme: "dark",
  },
  "rivethub-light": {
    background: "#fbfdfb",
    sidebar: "#e9f0eb",
    card: "#f2f7f3",
    raised: "#e4ebe6",
    foreground: "#171d1a",
    muted: "#56615b",
    border: "#d9e1db",
    input: "#c6d0c9",
    accent: "#edf2ee",
    selected: "#c4ecd8",
    primary: "#006c4c",
    primaryForeground: "#ffffff",
    success: "#006c4c",
    warning: "#8a5100",
    error: "#ba1a1a",
    info: "#0b57d0",
    message: "#c4ecd8",
    code: "#edf2ee",
    reading: undefined,
    scheme: "light",
  },
  everforest: {
    background: "#2d353b",
    sidebar: "#232a2e",
    card: "#343f44",
    raised: "#3d484d",
    foreground: "#d3c6aa",
    muted: "#9da9a0",
    border: "#3d484d",
    input: "#475258",
    accent: "#2f3a3f",
    selected: "#324244",
    primary: "#a7c080",
    primaryForeground: "#232a2e",
    success: "#a7c080",
    warning: "#dbbc7f",
    error: "#e67e80",
    info: "#7fbbb3",
    message: "#466662",
    code: "#272e33",
    reading: "serif",
    scheme: "dark",
  },
  "t3-dark": {
    background: "#000000",
    sidebar: "#111111",
    card: "#111111",
    raised: "#1a1a1a",
    foreground: "#f5f5f5",
    muted: "#a3a3a3",
    border: "rgba(255, 255, 255, 0.08)",
    input: "rgba(255, 255, 255, 0.11)",
    accent: "rgba(255, 255, 255, 0.04)",
    selected: "rgba(255, 255, 255, 0.07)",
    primary: "#346bf1",
    primaryForeground: "#ffffff",
    success: "#00d492",
    warning: "#ffb900",
    error: "#ff6467",
    info: "#51a2ff",
    message: "#1e1e1e",
    code: "rgba(255, 255, 255, 0.05)",
    reading: "serif",
    scheme: "dark",
  },
  "t3-light": {
    background: "#fcfcfc",
    sidebar: "#fafafa",
    card: "#ffffff",
    raised: "#f4f4f5",
    foreground: "#18181b",
    muted: "#71717b",
    border: "#e4e4e7",
    input: "#d4d4d8",
    accent: "#f4f4f5",
    selected: "#ffffff",
    primary: "#1b4ed8",
    primaryForeground: "#ffffff",
    success: "#007a55",
    warning: "#bb4d00",
    error: "#e7000b",
    info: "#155dfc",
    message: "#ebebed",
    code: "#f4f4f5",
    reading: "serif",
    scheme: "light",
  },
};

export function alpha(color: string, amount: number): string {
  const match = /^#([\da-f]{6})$/i.exec(color);
  if (!match?.[1]) return color;
  const hex = match[1];
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${amount})`;
}

export function isTheme(value: unknown): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}
