import os from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const e2ePort = process.env.PLAYWRIGHT_PORT || "3198";
const baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL || `http://127.0.0.1:${e2ePort}`;
const e2eStorePath = process.env.STOCKFLOW_STORE_PATH || path.join(os.tmpdir(), `stockflow-e2e-store-${Date.now()}.json`);

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: process.env.PLAYWRIGHT_WEB_COMMAND || `npx next start -p ${e2ePort}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120 * 1000,
    env: {
      STOCKFLOW_DATA_ADAPTER: "local",
      STOCKFLOW_STORE_PATH: e2eStorePath,
      STOCKFLOW_OWNER_EMAIL: "owner@example.com",
      STOCKFLOW_OWNER_NAME: "Ada Owner",
      STOCKFLOW_OWNER_PASSWORD: "owner-pass-1",
      STOCKFLOW_REFERENCE_JSON: JSON.stringify({
        warehouses: [
          { name: "Bremen", country: "Germany" },
          { name: "Turnhout", country: "Belgium" },
          { name: "Spain", country: "Spain" },
        ],
        companies: [
          { name: "North Mill", kind: "supplier" },
          { name: "Meridian Packaging", kind: "customer" },
        ],
        materials: [
          { materialNumber: "LDPE", description: "LDPE film", unit: "kg", lowStockThresholdKg: 25 },
        ],
        packagingTypes: [
          { name: "Normal Pallet", tareKg: 25 },
        ],
      }),
    },
  },
});
