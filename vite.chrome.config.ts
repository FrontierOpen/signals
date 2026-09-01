import { defineConfig } from "vite";

const entry = new URL("./ui/site-header.ts", import.meta.url).pathname;
const outDir = new URL("./public/assets", import.meta.url).pathname;

export default defineConfig({
  publicDir: false,
  build: {
    target: "es2020",
    outDir,
    emptyOutDir: false,
    copyPublicDir: false,
    sourcemap: false,
    minify: "esbuild",
    rollupOptions: {
      input: entry,
      output: {
        format: "iife",
        name: "FrontierSignalsSiteHeader",
        entryFileNames: "site-header-v5.js",
      },
    },
  },
});
