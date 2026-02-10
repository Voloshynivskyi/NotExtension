// C:\Users\ASUS ZenBook\Documents\Portfolio Projects\NotExtension\scripts\build-core.mjs
import { build } from "esbuild";
import path from "node:path";

const root = process.cwd();

await build({
  entryPoints: [path.join(root, "core/background/index.js")],
  bundle: true,
  format: "iife",
  outfile: path.join(root, "extension/background/service-worker.js"),
});

await build({
  entryPoints: [path.join(root, "core/content/index.js")],
  bundle: true,
  format: "iife",
  outfile: path.join(root, "extension/content/content.js"),
});

console.log("✅ core built into extension/");
