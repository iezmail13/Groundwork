// The seeded demo organization (npm run seed). Shared by the seed script and
// the development-only sign-in shortcut on /login.

export const DEMO_ORG = { name: "Northside Youth Collective", slug: "northside-youth-collective", preset: "nonprofit" };

export const DEMO_USERS = [
  { email: "jordan@northside.example.org", fullName: "Jordan Ellis", role: "owner" },
  { email: "priya@northside.example.org", fullName: "Priya Shah", role: "manager" },
  { email: "marcus@northside.example.org", fullName: "Marcus Chen", role: "admin" },
  { email: "sofia@northside.example.org", fullName: "Sofia Alvarez", role: "staff" },
] as const;

export function devShortcutEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** Google sign-in shows only once it's configured in Supabase Auth (set at build time). */
export function googleSignInEnabled(): boolean {
  return process.env.NEXT_PUBLIC_GOOGLE_SIGN_IN === "true";
}

/** The Cloudflare Turnstile site key for the demo's captcha; the captcha is off without it (D115). */
export function turnstileSiteKey(): string | null {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || null;
}

/** What a demo visitor is told when they reach for something a demo can't do (D115). */
export const DEMO_ONLY = "That isn't available in the demo. Start free to use it with your team.";
