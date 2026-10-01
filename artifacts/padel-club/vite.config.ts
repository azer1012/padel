import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const rawPort = process.env.PORT;
const port =
  rawPort && !Number.isNaN(Number(rawPort)) && Number(rawPort) > 0 ? Number(rawPort) : 5173;

// Local dev: the app calls /api on its own origin, so forward it to the API server.
const apiTarget = process.env.API_URL ?? `http://localhost:${process.env.API_PORT ?? 3000}`;

const basePath = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base: basePath,
  envPrefix: ["VITE_", "NEXT_PUBLIC_", "EXPO_PUBLIC_"],
  envDir: path.resolve(import.meta.dirname, "..", ".."),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          // Loaded on demand only (invite QR code)
          if (id.includes("qrcode-generator")) return undefined;
          if (
            /recharts|react-smooth|\/d3-|victory-vendor|decimal\.js-light|internmap|react-transition-group|dom-helpers/.test(
              id,
            )
          )
            return "charts";
          if (id.includes("@supabase")) return "supabase";
          if (id.includes("@radix-ui")) return "radix-ui";
          if (
            /node_modules\/(\.pnpm\/[^/]+\/node_modules\/)?(react|react-dom|scheduler|wouter|@tanstack|use-sync-external-store|regexparam)\//.test(
              id,
            )
          )
            return "react-vendor";
          if (id.includes("framer-motion")) return "motion";
          return "vendor";
        },
      },
    },
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      "/api": { target: apiTarget, changeOrigin: true },
    },
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
