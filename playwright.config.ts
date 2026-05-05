import { defineConfig, devices } from "@playwright/test";

const FRONTEND_PORT = process.env.PLAYWRIGHT_FRONTEND_PORT ?? "4173";
const BACKEND_PORT = process.env.PLAYWRIGHT_BACKEND_PORT ?? "8100";
const FRONTEND_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${FRONTEND_PORT}`;
const API_URL = process.env.PLAYWRIGHT_API_BASE_URL ?? `http://127.0.0.1:${BACKEND_PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  timeout: 180_000,
  expect: {
    timeout: 20_000,
  },
  use: {
    baseURL: FRONTEND_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    viewport: {
      width: 1600,
      height: 1400,
    },
  },
  webServer: {
    command: `FRONTEND_PORT=${FRONTEND_PORT} BACKEND_PORT=${BACKEND_PORT} VITE_API_BASE_URL=${API_URL} npm run dev:full`,
    url: `${FRONTEND_URL}/login`,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 240_000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
});
