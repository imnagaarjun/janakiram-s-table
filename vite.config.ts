import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

// DEPLOYMENT_TARGET=vercel must be set in Vercel project env vars
const preset = process.env.DEPLOYMENT_TARGET === "vercel" ? "vercel" : undefined;

export default defineConfig({
  plugins: [
    tanstackStart(preset ? { server: { preset } } : {}),
    react(),
    tailwindcss(),
    tsconfigPaths(),
  ],
  server: {
    port: 8080,
    host: true,
    strictPort: true,
  },
});
