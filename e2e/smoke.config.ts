import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: "http://localhost:5174",
    trace: "off",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "smoke",
      testMatch: "**/smoke-c5.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
});
