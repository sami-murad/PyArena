/// <reference types="vitest/config" />
import { fileURLToPath, URL } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

import { websitesInfo } from "./src/config/websitesInfo.ts";

/**
 * index.html cannot import TypeScript, so this plugin fills its
 * %SITE_*% placeholders from websitesInfo.ts at build time.
 * websitesInfo.ts stays the single source of truth.
 */
function siteMetadata(): Plugin {
  const values: Record<string, string> = {
    "%SITE_NAME%": websitesInfo.name,
    "%SITE_TAGLINE%": websitesInfo.tagline,
    "%SITE_DESCRIPTION%": websitesInfo.description,
    "%SITE_FAVICON%": websitesInfo.favicon,
    "%SITE_AUTHOR%": websitesInfo.author,
  };
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return {
    name: "pyarena-site-metadata",
    transformIndexHtml(html) {
      return Object.entries(values).reduce((out, [key, value]) => out.split(key).join(escape(value)), html);
    },
  };
}

/**
 * Preload the two fonts every page needs above the fold (latin subsets of the
 * body and display faces), so text does not reflow when they arrive. The file
 * names are hashed at build time, so the links are added from the bundle.
 */
const PRELOADED_FONTS = [/inter-latin-wght-normal-[\w-]+\.woff2$/, /fredoka-latin-wght-normal-[\w-]+\.woff2$/];

function preloadFonts(): Plugin {
  return {
    name: "pyarena-preload-fonts",
    apply: "build",
    transformIndexHtml(html, ctx) {
      const files = Object.keys(ctx.bundle ?? {}).filter((f) => PRELOADED_FONTS.some((re) => re.test(f)));
      return {
        html,
        tags: files.map((file) => ({
          tag: "link",
          attrs: { rel: "preload", href: `/${file}`, as: "font", type: "font/woff2", crossorigin: "" },
          injectTo: "head" as const,
        })),
      };
    },
  };
}

const backend = process.env.VITE_DEV_BACKEND_URL ?? "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react(), siteMetadata(), preloadFonts()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 5173,
    // Same-origin in development: the browser talks to Vite, Vite forwards to FastAPI.
    proxy: {
      "/api": { target: backend, changeOrigin: false },
      "/socket.io": { target: backend, ws: true, changeOrigin: false },
    },
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("monaco-editor")) return "monaco";
          if (id.includes("node_modules")) return "vendor";
          return undefined;
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    css: false,
  },
});
