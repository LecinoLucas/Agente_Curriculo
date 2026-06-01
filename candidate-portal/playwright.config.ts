import { defineConfig, devices } from '@playwright/test';

const PORTAL_BASE_URL =
  process.env.CANDIDATE_PORTAL_BASE_URL ??
  process.env.PLAYWRIGHT_BASE_URL ??
  'http://localhost:5174';

const PUBLIC_API_BASE_URL =
  process.env.CANDIDATE_PORTAL_PUBLIC_API_BASE_URL ??
  process.env.VITE_PUBLIC_API_BASE_URL ??
  'http://localhost:8000/api/v1/public';

const portalUrl = new URL(PORTAL_BASE_URL);
const portalPort = portalUrl.port || (portalUrl.protocol === 'https:' ? '443' : '80');

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  reporter: 'line',
  outputDir: 'test-results/e2e',
  expect: {
    timeout: 10_000,
  },
  use: {
    ...devices['Desktop Chrome'],
    baseURL: PORTAL_BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1440, height: 900 },
  },
  webServer:
    process.env.CANDIDATE_PORTAL_SKIP_WEBSERVER === '1'
      ? undefined
      : {
          command: `VITE_PUBLIC_API_BASE_URL=${PUBLIC_API_BASE_URL} npm run dev -- --host ${portalUrl.hostname} --port ${portalPort} --strictPort`,
          url: PORTAL_BASE_URL,
          reuseExistingServer: true,
          stdout: 'pipe',
          stderr: 'pipe',
          timeout: 60_000,
        },
});
