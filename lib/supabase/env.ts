// Public Supabase settings. These are safe to ship to the browser.
// NEXT_PUBLIC_* values must be referenced literally so Next can inline them.

export function supabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set. Copy .env.example to .env.local.");
  return url;
}

export function supabasePublishableKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set. Copy .env.example to .env.local.");
  }
  return key;
}
