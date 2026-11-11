// The dark-mode setting (D84): light, dark, or follow the device ("system").
// profiles.theme_mode is the source of truth; the "theme" cookie mirrors it
// so the server can render <html data-theme> with no flash of the wrong mode.

export const THEME_MODES = ["light", "dark", "system"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

export const THEME_COOKIE = "theme";
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function parseThemeMode(value: string | null | undefined): ThemeMode {
  return THEME_MODES.includes(value as ThemeMode) ? (value as ThemeMode) : "system";
}
