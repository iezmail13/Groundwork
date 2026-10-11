// Project colours: tints and shades of navy and bone only.
export const PROJECT_COLORS = [
  { value: "#163260", name: "Navy" },
  { value: "#445A7E", name: "Slate" },
  { value: "#72829B", name: "Dusk" },
  { value: "#9FA9B9", name: "Mist" },
  { value: "#DDD6C8", name: "Sand" },
  { value: "#0B1930", name: "Ink" },
] as const;

export const PROJECT_COLOR_VALUES = PROJECT_COLORS.map((c) => c.value) as [string, ...string[]];
export const DEFAULT_PROJECT_COLOR = PROJECT_COLORS[0].value;
