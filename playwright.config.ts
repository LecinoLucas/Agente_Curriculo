import { defineConfig, devices } from "@playwright/test";
import { ADMIN_STORAGE_STATE } from "./e2e/auth";

const FRONTEND_PORT = process.env.PLAYWRIGHT_FRONTEND_PORT ?? "4173";
const BACKEND_PORT = process.env.PLAYWRIGHT_BACKEND_PORT ?? "8100";
const FRONTEND_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${FRONTEND_PORT}`;
const API_URL = process.env.PLAYWRIGHT_API_BASE_URL ?? `http://127.0.0.1:${BACKEND_PORT}`;

const UNAUTHENTICATED_SPECS = [
  "**/pipeline-login.spec.ts",
  "**/alice-candidate-portal.spec.ts",
];

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  timeout: 180_000,
  expect: {
    timeout: 20_000,
  },
  globalSetup: require.resolve("./e2e/global-setup"),
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
      name: "unauthenticated",
      testMatch: UNAUTHENTICATED_SPECS,
      use: {
        ...devices["Desktop Chrome"],
      },
    },
    {
      name: "authenticated",
      testIgnore: UNAUTHENTICATED_SPECS,
      use: {
        ...devices["Desktop Chrome"],
        storageState: ADMIN_STORAGE_STATE,
      },
    },
  ],
});
