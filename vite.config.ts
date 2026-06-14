import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

// Always use the Vercel preset for builds; local `vite dev` is unaffected.
const isProduction = process.env.NODE_ENV === "production";

export default defineConfig({
  plugins: [
    tanstackStart(isProduction ? { server: { preset: "vercel" } } : {}),
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
