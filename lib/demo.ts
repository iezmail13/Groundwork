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
