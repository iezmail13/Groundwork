import { describe, expect, it } from "vitest";
import {
  formatWindow,
  hashToken,
  NO_MAINTENANCE,
  parseSetting,
  retryAfterSeconds,
  safeEqual,
  servedDuringMaintenance,
  settingFromEnv,
  upcomingWindow,
} from "@/lib/maintenance";
import { edgeConfigItemUrl } from "@/lib/maintenance-source";

const now = new Date("2026-10-23T12:00:00Z");

describe("maintenance setting", () => {
  it("parses the stored JSON and normalises times", () => {
    expect(parseSetting({ active: true, message: " Upgrading ", starts_at: "2026-10-25T22:00:00-04:00", ends_at: null })).toEqual({
      active: true,
      message: "Upgrading",
      startsAt: "2026-10-26T02:00:00.000Z",
      endsAt: null,
    });
  });

  it("treats anything malformed as no maintenance", () => {
    expect(parseSetting(null)).toEqual(NO_MAINTENANCE);
    expect(parseSetting({ active: "yes" })).toEqual(NO_MAINTENANCE);
    expect(parseSetting({ active: true, starts_at: "not a date" })).toEqual(NO_MAINTENANCE);
    expect(parseSetting({ active: false, starts_at: "2026-10-25T23:00:00Z", ends_at: "2026-10-25T22:00:00Z" })).toEqual(NO_MAINTENANCE);
  });

  it("falls back to environment variables", () => {
    expect(settingFromEnv({ MAINTENANCE_MODE: "on", MAINTENANCE_MESSAGE: "Back soon", MAINTENANCE_ENDS_AT: "2026-10-23T13:00:00Z" })).toEqual({
      active: true,
      message: "Back soon",
      startsAt: null,
      endsAt: "2026-10-23T13:00:00.000Z",
    });
    expect(settingFromEnv({})).toEqual(NO_MAINTENANCE);
    expect(settingFromEnv({ MAINTENANCE_MODE: "off" }).active).toBe(false);
  });
});

describe("scheduled window", () => {
  const at = (hours: number) => new Date(now.getTime() + hours * 3600_000).toISOString();

  it("shows only for a future start within 48 hours", () => {
    expect(upcomingWindow({ ...NO_MAINTENANCE, startsAt: at(24), endsAt: at(25) }, now)).toEqual({ startsAt: at(24), endsAt: at(25) });
    expect(upcomingWindow({ ...NO_MAINTENANCE, startsAt: at(49) }, now)).toBeNull();
    expect(upcomingWindow({ ...NO_MAINTENANCE, startsAt: at(-1) }, now)).toBeNull();
    expect(upcomingWindow({ ...NO_MAINTENANCE, active: true, startsAt: at(2) }, now)).toBeNull();
  });

  it("says when to retry", () => {
    expect(retryAfterSeconds({ ...NO_MAINTENANCE, active: true, endsAt: at(1) }, now)).toBe(3600);
    expect(retryAfterSeconds({ ...NO_MAINTENANCE, active: true }, now)).toBe(300);
    expect(retryAfterSeconds({ ...NO_MAINTENANCE, active: true, endsAt: at(-1) }, now)).toBe(300);
  });

  it("formats the window in the viewer's zone, naming it", () => {
    expect(formatWindow("2026-10-26T02:00:00Z", "2026-10-26T03:00:00Z", "America/Toronto")).toBe("Sun, Oct 25, 10:00–11:00 pm EDT");
    expect(formatWindow("2026-10-26T02:00:00Z", null, "UTC")).toMatch(/^Mon, Oct 26, 2:00 am UTC$/);
    expect(formatWindow("2026-10-26T03:30:00Z", "2026-10-26T05:00:00Z", "America/Toronto")).toBe("Sun, Oct 25, 11:30 pm – Mon, Oct 26, 1:00 am EDT");
  });
});

describe("bypass and routing", () => {
  it("hashes tokens and compares them safely", async () => {
    const a = await hashToken("correct horse battery staple");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(safeEqual(a, await hashToken("correct horse battery staple"))).toBe(true);
    expect(safeEqual(a, await hashToken("wrong"))).toBe(false);
    expect(safeEqual(a, "")).toBe(false);
  });

  it("keeps the landing page and the maintenance page reachable", () => {
    expect(servedDuringMaintenance("/")).toBe(true);
    expect(servedDuringMaintenance("/maintenance")).toBe(true);
    expect(servedDuringMaintenance("/login")).toBe(false);
    expect(servedDuringMaintenance("/northside/dashboard")).toBe(false);
  });

  it("builds the Edge Config item URL from the connection string", () => {
    expect(edgeConfigItemUrl("https://edge-config.vercel.com/ecfg_abc123?token=t0k")).toBe(
      "https://edge-config.vercel.com/ecfg_abc123/item/maintenance?token=t0k",
    );
    expect(edgeConfigItemUrl(undefined)).toBeNull();
    expect(edgeConfigItemUrl("https://edge-config.vercel.com/ecfg_abc123")).toBeNull();
    expect(edgeConfigItemUrl("not a url")).toBeNull();
  });
});
