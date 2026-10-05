import { defineConfig, devices } from "@playwright/test";
/** Isolated network fixtures in tests; this never enables an application mock. */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 12_000 },
  outputDir: process.env.SAP_E2E_OUTPUT ?? "./test-results",
  reporter: [["list"]],
  use: {
    baseURL: process.env.SAP_E2E_BASE_URL ?? "http://localhost:3000",
    channel: process.env.SAP_E2E_CHANNEL,
    timezoneId: "Asia/Jakarta",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1600, height: 1000 },
      },
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } },
    },
  ],
});
