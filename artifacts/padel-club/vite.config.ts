import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const rawPort = process.env.PORT;
const port =
  rawPort && !Number.isNaN(Number(rawPort)) && Number(rawPort) > 0 ? Number(rawPort) : 5173;

// Local dev: the app calls /api on its own origin, so forward it to the API server.
const apiTarget = process.env.API_URL ?? `http://localhost:${process.env.API_PORT ?? 3000}`;

const basePath = process.env.BASE_PATH ?? "/";

/**
 * SEO that needs the public domain (VITE_SITE_URL): canonical URL, absolute
 * Open Graph image, structured data, sitemap.xml and the robots.txt Sitemap line.
 * Without VITE_SITE_URL the build still works, just without these.
 */
function seo(): Plugin {
  const env = loadEnv("production", path.resolve(import.meta.dirname, "..", ".."), "VITE_");
  const site = (process.env.VITE_SITE_URL ?? env.VITE_SITE_URL ?? "").replace(/\/$/, "");
  const club = process.env.VITE_CLUB_NAME ?? env.VITE_CLUB_NAME ?? "Smash Padel";
  const publicPages = ["/", "/terrains", "/open-matches", "/tournaments", "/news", "/contact"];
  return {
    name: "padel-seo",
    transformIndexHtml(html) {
      if (!site) return html;
      const ld = {
        "@context": "https://schema.org",
        "@type": "SportsActivityLocation",
        name: club,
        url: site,
        image: `${site}/opengraph.jpg`,
        sport: "Padel",
        address: {
          "@type": "PostalAddress",
          streetAddress:
            process.env.VITE_CLUB_ADDRESS ?? env.VITE_CLUB_ADDRESS ?? "Les Berges du Lac",
          addressLocality: "Tunis",
          addressCountry: "TN",
        },
        ...((process.env.VITE_CLUB_PHONE ?? env.VITE_CLUB_PHONE)
          ? { telephone: process.env.VITE_CLUB_PHONE ?? env.VITE_CLUB_PHONE }
          : {}),
      };
      return html
        .replace('content="/opengraph.jpg"', `content="${site}/opengraph.jpg"`)
        .replace(
          "</head>",
          `    <link rel="canonical" href="${site}/" />\n` +
            `    <meta property="og:url" content="${site}/" />\n` +
            `    <meta name="twitter:image" content="${site}/opengraph.jpg" />\n` +
            `    <script type="application/ld+json">${JSON.stringify(ld)}</script>\n  </head>`,
        );
    },
    generateBundle() {
      const robots = `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /dashboard\nDisallow: /wallet\nDisallow: /profile\nDisallow: /reservations\nDisallow: /join/\n${site ? `\nSitemap: ${site}/sitemap.xml\n` : ""}`;
      this.emitFile({ type: "asset", fileName: "robots.txt", source: robots });
      if (!site) return;
      const urls = publicPages
        .map((p) => `  <url><loc>${site}${p === "/" ? "/" : p}</loc></url>`)
        .join("\n");
      this.emitFile({
        type: "asset",
        fileName: "sitemap.xml",
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
      });
    },
  };
}

export default defineConfig({
  base: basePath,
  // Only VITE_* variables reach the browser bundle. Never prefix a secret with VITE_.
  envPrefix: ["VITE_"],
  envDir: path.resolve(import.meta.dirname, "..", ".."),
  plugins: [react(), tailwindcss(), seo()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
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
