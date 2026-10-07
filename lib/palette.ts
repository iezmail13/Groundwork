// Project colours: tints and shades of navy and bone only.
export const PROJECT_COLORS = [
  { value: "#1F2D4D", name: "Navy" },
  { value: "#4B566E", name: "Slate" },
  { value: "#777F90", name: "Dusk" },
  { value: "#A3A7B1", name: "Mist" },
  { value: "#DDD6C8", name: "Sand" },
  { value: "#101727", name: "Ink" },
] as const;

export const PROJECT_COLOR_VALUES = PROJECT_COLORS.map((c) => c.value) as [string, ...string[]];
export const DEFAULT_PROJECT_COLOR = PROJECT_COLORS[0].value;
