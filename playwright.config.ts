import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3000);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1360, height: 900 },
        // Use a preinstalled Chromium when Playwright's own build isn't available.
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
          : {},
      },
    },
  ],
  // Starts the dev server unless one is already running on the port.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run dev -- -p ${PORT}`,
        url: `${baseURL}/login`,
        reuseExistingServer: true,
        timeout: 180_000,
        // show the Google button so its hand-off to Supabase can be tested
        // (Google itself isn't configured locally; the test stops at the redirect)
        // and let tests switch maintenance mode per browser (development only, see proxy.ts)
        env: {
          ...process.env,
          NEXT_PUBLIC_GOOGLE_SIGN_IN: "true",
          E2E_MAINTENANCE_OVERRIDE: "1",
          MAINTENANCE_BYPASS_TOKEN: "e2e-bypass-token-0123456789",
        } as Record<string, string>,
      },
});
