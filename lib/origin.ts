/**
 * The origin part of a configured site URL: "app.example.org/",
 * "https://App.example.org/x" and "https://app.example.org" all give
 * "https://app.example.org". A bare host gets https; http stays for local use.
 */
export function originOf(value: string): string {
  const input = value.trim();
  return new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`).origin;
}
