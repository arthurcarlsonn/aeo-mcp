import { defineConfig } from "tsup";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

export default defineConfig({
  define: { __PKG_VERSION__: JSON.stringify(pkg.version) },
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  dts: false,
  clean: true,
  sourcemap: false,
  splitting: false,
  banner: { js: "#!/usr/bin/env node" },
});
