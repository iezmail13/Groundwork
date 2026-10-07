// npx tsx scripts/deploy/supabase-key.ts keys.json
// Prints the browser-safe key from `supabase projects api-keys -o json`.
import { readFileSync } from "node:fs";
import { pickPublishableKey } from "./lib";

const file = process.argv[2];
if (!file) {
  console.error("Usage: supabase-key.ts <api-keys.json>");
  process.exit(2);
}
try {
  process.stdout.write(pickPublishableKey(JSON.parse(readFileSync(file, "utf8"))));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
