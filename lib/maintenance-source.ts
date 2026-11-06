import { NO_MAINTENANCE, parseSetting, settingFromEnv, type MaintenanceSetting } from "./maintenance";

// Reads the maintenance setting (D87) for the proxy. Vercel Edge Config is
// read with a plain fetch to its read endpoint (no package), using the
// EDGE_CONFIG connection string Vercel adds when an Edge Config is connected
// to the project. Without one, the MAINTENANCE_* environment variables apply.

const CACHE_MS = 10_000;
const TIMEOUT_MS = 1_500;

let cached: { at: number; value: MaintenanceSetting } | null = null;

/** The item URL for a connection string like https://edge-config.vercel.com/ecfg_x?token=y. */
export function edgeConfigItemUrl(connection: string | undefined, key = "maintenance"): string | null {
  if (!connection) return null;
  try {
    const url = new URL(connection);
    const token = url.searchParams.get("token");
    const id = url.pathname.replace(/^\/+|\/+$/g, "");
    if (!token || !/^ecfg_[A-Za-z0-9]+$/.test(id)) return null;
    return `${url.origin}/${id}/item/${key}?token=${encodeURIComponent(token)}`;
  } catch {
    return null;
  }
}

export async function readMaintenance(env: Record<string, string | undefined> = process.env): Promise<MaintenanceSetting> {
  const fallback = settingFromEnv(env);
  const itemUrl = edgeConfigItemUrl(env.EDGE_CONFIG);
  if (!itemUrl) return fallback;
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  try {
    const res = await fetch(itemUrl, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    // a missing item means maintenance was never switched on
    const value = res.status === 404 ? NO_MAINTENANCE : res.ok ? parseSetting(await res.json()) : fallback;
    cached = { at: Date.now(), value };
    return value;
  } catch {
    // Edge Config unreachable: keep the last known value, else the env fallback
    return cached?.value ?? fallback;
  }
}
