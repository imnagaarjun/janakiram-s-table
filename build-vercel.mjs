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
 *       index.js                      <- the SSR handler
 *       (all files from dist/server/) <- bundled alongside
 */

import { cpSync, mkdirSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";

const root = process.cwd();
const out = join(root, ".vercel", "output");

// 1. Static assets → CDN
const staticDir = join(out, "static");
mkdirSync(staticDir, { recursive: true });
cpSync(join(root, "dist", "client", "assets"), join(staticDir, "assets"), { recursive: true });

// Also copy manifest
const clientFiles = readdirSync(join(root, "dist", "client"));
for (const f of clientFiles) {
  if (f !== "assets") {
    cpSync(join(root, "dist", "client", f), join(staticDir, f), { recursive: true });
  }
}

// 2. Serverless function
const funcDir = join(out, "functions", "index.func");
mkdirSync(funcDir, { recursive: true });

// Copy the entire dist/server/ tree into the function directory
cpSync(join(root, "dist", "server"), join(funcDir, "dist", "server"), { recursive: true });

// Write the function entry point
writeFileSync(
  join(funcDir, "index.js"),
  `import server from "./dist/server/server.js";

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

export const config = { api: { bodyParser: false } };
`
);

// ESM package.json so Node.js treats .js files as ES modules
writeFileSync(
  join(funcDir, "package.json"),
  JSON.stringify({ type: "module" }, null, 2)
);

// Function config: Node.js 22, ESM
writeFileSync(
  join(funcDir, ".vc-config.json"),
  JSON.stringify({ runtime: "nodejs22.x", handler: "index.js", launcherType: "Nodejs", shouldAddHelpers: true }, null, 2)
);

// 3. Vercel routing config
writeFileSync(
  join(out, "config.json"),
  JSON.stringify(
    {
      version: 3,
      routes: [
        // Static assets served by CDN
        { src: "/assets/(.*)", dest: "/assets/$1" },
        // Fallback: everything else → serverless function
        { src: "/(.*)", dest: "/index" },
      ],
    },
    null,
    2
  )
);

console.log("✓ Vercel output assembled at .vercel/output/");
