import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["__tests__/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // Supabase auth mock for tests — prevents SSR cookie/header deps
      "@/lib/supabase-auth": path.resolve(
        __dirname,
        "lib/testing/supabase-auth-mock.ts"
      ),
    },
  },
});
