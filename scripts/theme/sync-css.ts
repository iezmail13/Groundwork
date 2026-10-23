// Writes the token values from lib/theme/theme.ts into the light and dark
// blocks of app/globals.css. Run `npm run theme:sync` after changing a token;
// tests/unit/theme.test.ts fails while the two disagree.
import { readFileSync, writeFileSync } from "node:fs";
import { CSS_NAMES, deriveTokens, type ThemeTokens } from "../../lib/theme/theme";

const FILE = "app/globals.css";
const BLOCKS = [
  [":root {", "light"],
  [':root[data-theme="dark"] {', "dark"],
  [':root:not([data-theme="light"]) {', "dark"],
] as const;

let css = readFileSync(FILE, "utf8");
for (const [selector, mode] of BLOCKS) {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`${FILE} has no "${selector}" block`);
  const end = css.indexOf("}", start);
  const tokens = deriveTokens(mode);
  let body = css.slice(start, end);
  for (const key of Object.keys(CSS_NAMES) as (keyof ThemeTokens)[]) {
    const pattern = new RegExp(`(--${CSS_NAMES[key]}:\\s*)[^;]+;`);
    if (!pattern.test(body)) throw new Error(`${selector} is missing --${CSS_NAMES[key]}`);
    body = body.replace(pattern, `$1${tokens[key]};`);
  }
  css = css.slice(0, start) + body + css.slice(end);
}
writeFileSync(FILE, css);
console.log(`Updated ${FILE}`);
