// npm run check:labels
// Fails if a primitive label (Project, Task, Session, ...) is hard-coded in
// UI code instead of coming from t(key, form).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { findViolations } from "./label-check-core";

const ROOT = process.cwd();
const SCAN = ["app", "components", "lib"];
// The only files allowed to spell labels out.
const ALLOW = new Set(["lib/terminology/defaults.ts", "lib/supabase/database.types.ts"]);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const files = SCAN.flatMap((d) => walk(join(ROOT, d))).filter((f) => !ALLOW.has(relative(ROOT, f)));
const violations = files.flatMap((f) => findViolations(relative(ROOT, f), readFileSync(f, "utf8")));

if (violations.length > 0) {
  console.error(`check:labels found ${violations.length} hard-coded primitive label(s). Use t(key, form) instead:\n`);
  for (const v of violations) console.error(`  ${v.file}:${v.line}  "${v.text}"`);
  process.exit(1);
}
console.log(`check:labels: ${files.length} files clean.`);
