import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

/*
 * Unit tests for the vendor dashboard. Node by default; a test that renders
 * React opts into jsdom with a `// @vitest-environment jsdom` docblock.
 */
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\//, replacement: fileURLToPath(new URL("./", import.meta.url)) },
      // `server-only` throws on import outside a React Server environment; the
      // modules under test are server code, so it is a no-op here.
      { find: /^server-only$/, replacement: fileURLToPath(new URL("./test/server-only.ts", import.meta.url)) },
    ],
  },
  test: {
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**"],
  },
})
