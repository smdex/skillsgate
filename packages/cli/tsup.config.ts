import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  outDir: "dist",
  target: "node18",
  platform: "node",
  splitting: true,
  sourcemap: true,
  dts: true,
  clean: true,
  banner: {},
  external: [
    "@napi-rs/keyring",
    "@clack/prompts",
    "@modelcontextprotocol/sdk",
    "picocolors",
    "open",
    "zod",
  ],
  noExternal: [],
  shims: true,
});
