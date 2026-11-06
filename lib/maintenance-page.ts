import { CONTACT_EMAIL, type MaintenanceSetting } from "./maintenance";

// The maintenance page (D87), rendered by the proxy as plain HTML so it needs
// no database, no session and no React. Groundwork branding only (D86).

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function maintenancePageHtml(setting: MaintenanceSetting, nonce: string): string {
  const message = setting.message ? `<p class="message">${escapeHtml(setting.message)}</p>` : "";
  const end = setting.endsAt
    ? `<p class="end">Expected back: <time datetime="${escapeHtml(setting.endsAt)}" id="ends">${escapeHtml(
        new Date(setting.endsAt).toUTCString(),
      )}</time></p>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Maintenance · Groundwork</title>
<link rel="icon" href="/logo.svg">
<style>
  :root { color-scheme: light dark; --bg: #fbf9f4; --ink: #163260; --muted: #445a7e; --rule: #ddd6c8; --accent: #0006bf; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0c1c35; --ink: #f1eee7; --muted: #b6c1d8; --rule: #364152; --accent: #8084ff; } }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--bg); color: var(--ink);
    font: 1rem/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; padding: 24px 16px; }
  main { max-width: 34rem; width: 100%; border-top: 3px solid var(--accent); padding-top: 24px; }
  .brand { display: flex; align-items: center; gap: 10px; font-weight: 800; font-size: 1.1rem; margin-bottom: 28px; }
  .brand img { width: 36px; height: 36px; }
  h1 { font-size: clamp(1.6rem, 6vw, 2.2rem); line-height: 1.15; margin: 0 0 12px; }
  .message { font-size: 1.1rem; margin: 0 0 12px; }
  .end { font-weight: 600; margin: 0 0 20px; }
  .safe { color: var(--muted); margin: 0 0 8px; }
  a { color: var(--accent); font-weight: 600; }
  a:focus-visible, button:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
  .check { margin-top: 20px; font-size: .9rem; color: var(--muted); display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  button { font: inherit; font-weight: 600; color: var(--ink); background: transparent; border: 1px solid var(--rule); border-radius: 6px; padding: 6px 12px; cursor: pointer; }
  button:hover { border-color: var(--ink); }
</style>
</head>
<body>
<main>
  <div class="brand"><img src="/logo.svg" alt="" width="36" height="36">groundwork</div>
  <h1>We're doing some maintenance</h1>
  ${message}
  ${end}
  <p class="safe">Your work is safe. Everything will be where you left it when we're back.</p>
  <p class="safe">Questions? Email <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>
  <p class="check" role="status" aria-live="polite"><span id="status">This page checks every minute and reloads when we're back.</span>
    <button type="button" id="again">Check now</button></p>
</main>
<script nonce="${nonce}" src="/maintenance.js" defer></script>
</body>
</html>`;
}
