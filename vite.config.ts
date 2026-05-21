import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: {
    port: 5173,
    open: false,
    fs: { strict: false },
  },
  build: {
    target: "es2020",
    sourcemap: true,
    outDir: "dist",
    assetsInlineLimit: 0,
  },
  // canvaskit-wasm — это UMD-модуль (module.exports = CanvasKitInit).
  // Vite сам обернёт его в ESM через optimizeDeps + esbuild interop.
  // WASM-файл подтягиваем отдельно через `?url` импорт.
});
