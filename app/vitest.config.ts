import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.test.jsonc" } })],
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 30000,
    // cron-parser and luxon are CommonJS; the optimizer converts them for the Workers runner.
    deps: { optimizer: { ssr: { enabled: true, include: ["cron-parser", "luxon"] } } },
  },
});
