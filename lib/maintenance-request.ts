import "server-only";
import { headers } from "next/headers";
import { MAINTENANCE_HEADER, NO_MAINTENANCE, parseSetting, type MaintenanceSetting } from "./maintenance";

/** The maintenance setting the proxy read for this request (D87). */
export async function getMaintenance(): Promise<MaintenanceSetting> {
  const raw = (await headers()).get(MAINTENANCE_HEADER);
  if (!raw) return NO_MAINTENANCE;
  try {
    return parseSetting(JSON.parse(raw));
  } catch {
    return NO_MAINTENANCE;
  }
}
