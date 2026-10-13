import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

/*
 * Unit tests for the ERP. Node by default; a test that renders React opts
 * into jsdom with a `// @vitest-environment jsdom` docblock.
 */
export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: fileURLToPath(new URL("./", import.meta.url)) }],
  },
  test: {
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**"],
  },
})
