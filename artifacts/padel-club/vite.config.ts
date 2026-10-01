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

/** Branding of this installation, from .env (VITE_CLUB_*). Defaults are neutral. */
function brand() {
  const env = loadEnv("production", path.resolve(import.meta.dirname, "..", ".."), "VITE_");
  const get = (k: string) => (process.env[k] ?? env[k] ?? "").trim();
  return {
    name: get("VITE_CLUB_NAME") || "Padel Club",
    shortName: get("VITE_CLUB_SHORT_NAME") || get("VITE_CLUB_NAME") || "Padel Club",
    tagline: get("VITE_CLUB_TAGLINE") || "Réservez un terrain ce soir",
    description:
      get("VITE_CLUB_DESCRIPTION") ||
      "Voyez les terrains libres en direct, réservez en quelques secondes avec vos tokens, rejoignez des open matches et les tournois du club.",
    themeColor: get("VITE_CLUB_THEME_COLOR") || "#0A1030",
    address: get("VITE_CLUB_ADDRESS"),
    city: get("VITE_CLUB_CITY"),
    country: get("VITE_CLUB_COUNTRY"),
  };
}

const escapeHtml = (v: string) =>
  v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Club name, description and colours in index.html and the PWA manifest (one source: .env). */
function branding(): Plugin {
  const manifest = () => {
    const b = brand();
    return JSON.stringify(
      {
        name: b.name,
        short_name: b.shortName,
        description: b.description,
        id: "./",
        start_url: "./?source=pwa",
        scope: "./",
        display: "standalone",
        orientation: "portrait",
        background_color: b.themeColor,
        theme_color: b.themeColor,
        lang: "fr",
        dir: "auto",
        categories: ["sports", "lifestyle"],
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          {
            src: "icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
        shortcuts: [
          {
            name: "Réserver un terrain",
            short_name: "Réserver",
            url: "./terrains?source=shortcut",
            icons: [{ src: "icon-192.png", sizes: "192x192" }],
          },
          {
            name: "Mes réservations",
            short_name: "Mes matchs",
            url: "./reservations?source=shortcut",
            icons: [{ src: "icon-192.png", sizes: "192x192" }],
          },
        ],
      },
      null,
      2,
    );
  };
  return {
    name: "padel-branding",
    transformIndexHtml(html) {
      const b = brand();
      return html
        .replaceAll("%CLUB_NAME%", escapeHtml(b.name))
        .replaceAll("%CLUB_TAGLINE%", escapeHtml(b.tagline))
        .replaceAll("%CLUB_DESCRIPTION%", escapeHtml(b.description))
        .replaceAll("%CLUB_THEME_COLOR%", escapeHtml(b.themeColor));
    },
    configureServer(server) {
      server.middlewares.use("/manifest.webmanifest", (_req, res) => {
        res.setHeader("Content-Type", "application/manifest+json");
        res.end(manifest());
      });
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "manifest.webmanifest", source: manifest() });
    },
  };
}

/**
 * SEO that needs the public domain (VITE_SITE_URL): canonical URL, absolute
 * Open Graph image, structured data, sitemap.xml and the robots.txt Sitemap line.
 * Without VITE_SITE_URL the build still works, just without these.
 */
function seo(): Plugin {
  const env = loadEnv("production", path.resolve(import.meta.dirname, "..", ".."), "VITE_");
  const site = (process.env.VITE_SITE_URL ?? env.VITE_SITE_URL ?? "").replace(/\/$/, "");
  const club = brand().name;
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
        ...(brand().address
          ? {
              address: {
                "@type": "PostalAddress",
                streetAddress: brand().address,
                ...(brand().city ? { addressLocality: brand().city } : {}),
                ...(brand().country ? { addressCountry: brand().country } : {}),
              },
            }
          : {}),
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
  plugins: [react(), tailwindcss(), branding(), seo()],
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
