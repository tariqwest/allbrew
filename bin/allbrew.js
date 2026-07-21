#!/usr/bin/env node

// Multi-runtime entry shim for allbrew.
//   - Bun  and Deno: import the TypeScript entry directly (both run TS natively)
//   - Node:          use tsx's programmatic `tsImport` to load the TypeScript entry
//
// `bin/allbrew.ts` remains the Bun-native entry (`#!/usr/bin/env bun`) for
// `bun run bin/allbrew.ts` / `./bin/allbrew.ts` direct invocation.

if (typeof Bun !== "undefined" || typeof Deno !== "undefined") {
  await import("./allbrew.ts");
} else {
  let tsImport;
  try {
    ({ tsImport } = await import("tsx/esm/api"));
  } catch (err) {
    console.error(
      "allbrew under Node requires the 'tsx' loader to run TypeScript without a compile step.\n" +
        "Install it with:  npm install -g tsx\n" +
        "Or reinstall allbrew without --no-optional (tsx ships as an optionalDependency).",
    );
    process.exit(1);
  }
  await tsImport("./allbrew.ts", import.meta.url);
}
