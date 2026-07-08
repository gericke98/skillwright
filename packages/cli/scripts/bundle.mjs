import { rmSync } from "node:fs";
import { build } from "esbuild";

// Produce the publishable CLI in bundle/ (separate from dist/, which tsc --build
// owns for workspace declarations). @skillwright/shared is inlined (it is not
// published separately); playwright and ws stay external npm deps.
//
// splitting:true is load-bearing: bin.ts lazily `import("./run")` etc., and
// those chunks are the only ones that pull playwright. With splitting, they stay
// separate chunks loaded on demand, so `skillwright list`/`distill` never touch
// playwright at startup. Bundling to a single file would inline them and force
// playwright to resolve at load time.
rmSync("bundle", { recursive: true, force: true });

await build({
  entryPoints: ["src/bin.ts"],
  bundle: true,
  splitting: true,
  platform: "node",
  target: "node20",
  format: "esm",
  external: ["playwright", "ws"],
  outdir: "bundle",
  logLevel: "info",
});
