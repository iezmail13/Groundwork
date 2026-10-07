const BASE = "http://safe-next.invalid";

/**
 * Only allow same-site relative redirects ("/x"), never "//evil",
 * "https://evil", or tricks the URL parser normalises into those:
 * tabs and newlines are stripped by browsers ("/\t/evil" becomes "//evil"),
 * and backslashes are treated like slashes.
 */
export function safeNext(value: string | null | undefined, fallback = "/"): string {
  if (!value) return fallback;
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  let url: URL;
  try {
    url = new URL(value, BASE);
  } catch {
    return fallback;
  }
  if (url.origin !== BASE) return fallback;
  return url.pathname + url.search + url.hash;
}
