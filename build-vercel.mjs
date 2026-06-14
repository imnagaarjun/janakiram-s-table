#!/usr/bin/env node
/**
 * Post-build script: assembles Vercel Build Output API structure.
 *
 * .vercel/output/
 *   config.json                       <- routing rules
 *   static/                           <- served by Vercel CDN
 *     assets/...                      <- copied from dist/client/assets/
 *   functions/
 *     index.func/
 *       .vc-config.json               <- marks this as a Node.js function
 *       package.json                  <- {"type":"module"} so .js is ESM
 *       index.js                      <- thin req/res -> fetch adapter
 *       server.mjs                    <- esbuild bundle of dist/server/server.js
 *                                        WITH all node_modules inlined, so the
 *                                        function is fully self-contained (Vercel
 *                                        functions do not ship node_modules).
 */

import { cpSync, mkdirSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";
import * as esbuild from "esbuild";

const root = process.cwd();
const out = join(root, ".vercel", "output");

// 1. Static assets → CDN
const staticDir = join(out, "static");
mkdirSync(staticDir, { recursive: true });
cpSync(join(root, "dist", "client", "assets"), join(staticDir, "assets"), { recursive: true });

// Copy any other top-level client files (manifest, etc.)
for (const f of readdirSync(join(root, "dist", "client"))) {
  if (f !== "assets") {
    cpSync(join(root, "dist", "client", f), join(staticDir, f), { recursive: true });
  }
}

// 2. Serverless function
const funcDir = join(out, "functions", "index.func");
mkdirSync(funcDir, { recursive: true });

// Bundle the SSR server + ALL dependencies into a single self-contained file.
await esbuild.build({
  entryPoints: [join(root, "dist", "server", "server.js")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: join(funcDir, "server.mjs"),
  // Provide a CommonJS require shim for any deps that need it under ESM.
  banner: {
    js: 'import { createRequire as __cr } from "module"; const require = __cr(import.meta.url);',
  },
  logLevel: "error",
});

// Thin adapter: Vercel Node (req,res) -> Web Fetch (Request/Response)
writeFileSync(
  join(funcDir, "index.js"),
  `import server from "./server.mjs";

export default async function handler(req, res) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const url = new URL(req.url, proto + "://" + host);

  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v != null) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
  }

  const request = new Request(url.toString(), {
    method: req.method,
    headers,
    body: ["GET", "HEAD"].includes(req.method) ? undefined : req,
    duplex: "half",
  });

  const response = await server.fetch(request, {}, {});

  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  const body = await response.arrayBuffer();
  res.end(Buffer.from(body));
}
`
);

// ESM package.json so Node treats .js files as ES modules
writeFileSync(join(funcDir, "package.json"), JSON.stringify({ type: "module" }, null, 2));

// Function config: Node.js 22
writeFileSync(
  join(funcDir, ".vc-config.json"),
  JSON.stringify(
    { runtime: "nodejs22.x", handler: "index.js", launcherType: "Nodejs", shouldAddHelpers: false },
    null,
    2
  )
);

// 3. Vercel routing config
writeFileSync(
  join(out, "config.json"),
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: "/assets/(.*)", dest: "/assets/$1" },
        { src: "/(.*)", dest: "/index" },
      ],
    },
    null,
    2
  )
);

console.log("✓ Vercel output assembled at .vercel/output/ (server bundled self-contained)");
