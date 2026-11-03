import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
if (existsSync(".env.e2e")) loadEnvFile(".env.e2e");
if (
  process.env.E2E_ALLOW_RESET !== "true" ||
  !process.env.TEST_RESET_KEY ||
  !process.env.SEED_PASSWORD
)
  throw new Error(
    "Create .env.e2e for an isolated test database first (see PLAYWRIGHT-README.md)",
  );
export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  //timeout: 60000,
  //expect: { timeout: 10000 },
  timeout: 180_000,
  expect: { timeout: 30_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:5173",
    video: "on",
    trace: "on",
    screenshot: "only-on-failure",
    launchOptions: {
      slowMo: Number(process.env.E2E_SLOWMO ?? 0),
      ...(process.env.E2E_CHROMIUM_PATH
        ? {
            executablePath: process.env.E2E_CHROMIUM_PATH,
            args: ["--no-sandbox"],
          }
        : {}),
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer:
    process.env.E2E_EXTERNAL_SERVERS === "true"
      ? undefined
      : [
          {
            command: "node --env-file=../.env.e2e --import tsx src/server.ts",
            cwd: "./backend",
            url: "http://127.0.0.1:4000/api/health",
            reuseExistingServer: false,
            env: { NODE_ENV: "test" },
            timeout: 120000,
          },
          {
            command: "npm run dev -w frontend",
            url: "http://127.0.0.1:5173/login",
            reuseExistingServer: false,
            timeout: 120000,
          },
        ],
});
