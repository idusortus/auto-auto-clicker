import { defineConfig } from '@playwright/test';

// Phase 5 smoke test config. A single mobile-emulated Chromium project drives the
// real Vite dev server, mirroring the target device shape (390x844, touch, DPR 3).
const PORT = 5173;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests',
  // One worker keeps the shared dev server + console assertions deterministic.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
    trace: 'off',
  },
  webServer: {
    // --strictPort fails loudly instead of silently drifting to another port.
    command: 'npm run dev -- --port 5173 --strictPort',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
