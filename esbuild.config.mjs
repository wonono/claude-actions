import { build, context } from "esbuild";

const watch = process.argv.includes("--watch");

const options = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node18",
  sourcemap: true,
  logLevel: "info",
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log("esbuild watching for changes…");
} else {
  await build(options);
}
