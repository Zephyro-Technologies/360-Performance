import { defineConfig } from "vitest/config";

// Integration suite — talks to a live local Supabase. NOT part of `pnpm test`
// (the script is `test:rls`); it runs in its own CI job after `supabase start`.
export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
