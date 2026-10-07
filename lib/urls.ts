import "server-only";
import { headers } from "next/headers";
import { originOf } from "@/lib/origin";

/** Absolute origin of this deployment, for links sent in email. */
export async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured?.trim()) {
    try {
      return originOf(configured);
    } catch {
      // a mistyped value set by hand mustn't stop sign-in; use the request's own host
    }
  }
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}
