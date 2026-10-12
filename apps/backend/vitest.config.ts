import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

/*
 * Backend unit tests. Phase 1A scope: the pure financial invariants
 * introduced by the Finance module (Money arithmetic, currency-code
 * convention, provider-capability coherence, finance scope guard).
 *
 * No DB / HTTP integration harness yet — see the Phase 1A summary. When
 * one is added, give it a separate project/config so these stay fast.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
    // TypeScript BEFORE JavaScript, as tsx and tsup (esbuild) resolve it.
    // packages/types/src once held stale, TRACKED compiler emit (`*.js` from
    // commit 7864f73) beside the `.ts` sources, and Vite's default order tries
    // `.js` first: extensionless imports such as `export * from "./admin"`
    // loaded an old AdminPermissions in which dozens of keys were undefined, so
    // every test of a route gated by one of them ran against `undefined`.
    // Found by the route-manifest test (RBAC Phase 2); the emit has been
    // deleted (bug class #11). This order stays so a stray `.js` can never
    // shadow a source again.
    extensions: [".ts", ".tsx", ".mts", ".mjs", ".js", ".jsx", ".json"],
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
})
