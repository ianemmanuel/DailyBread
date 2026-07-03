import { defineConfig } from "tsup";
import { tsconfigPathsPlugin } from "esbuild-plugin-tsconfig-paths";

export default defineConfig({
  entry: ["src/index.ts"],

  bundle: true,

  platform: "node",

  target: "node22",

  format: ["esm"],

  outDir: "dist",

  splitting: false,

  clean: true,

  treeshake: true,

  sourcemap: true,

  minify: false,

  dts: false,

  skipNodeModulesBundle: true,

  shims: false,

  esbuildPlugins: [tsconfigPathsPlugin()]
});