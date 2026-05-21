import { defineConfig } from "vite";

// Для GitHub Pages: репо публикуется по пути /pixi-skia-pdf/.
// В dev-сервере path всегда '/', поэтому условно поставим base только в production.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/pixi-skia-pdf/" : "/",
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
    commonjsOptions: {
      // canvaskit-wasm-pdf — UMD: `module.exports = CanvasKitInit`.
      // По умолчанию Rollup CJS plugin не создаёт default-экспорт для таких
      // модулей в prod-сборке (хотя Vite в dev делает interop через esbuild).
      defaultIsModuleExports: true,
      // file:vendor пакеты Rollup иначе обрабатывает — нужно явно включить
      // их в commonjs-плагин и потребовать interop default-экспорта.
      include: [/canvaskit-wasm-pdf/, /node_modules/],
      requireReturnsDefault: "auto",
      transformMixedEsModules: true,
    },
  },
  // canvaskit-wasm — это UMD-модуль (module.exports = CanvasKitInit).
  // Vite сам обернёт его в ESM через optimizeDeps + esbuild interop.
  // WASM-файл подтягиваем отдельно через `?url` импорт.
  optimizeDeps: {
    // vendor-пакеты (file:./vendor/...) Vite по умолчанию не оптимизирует,
    // поэтому без default-экспорта рушится UMD CJS. Включаем явно.
    include: ["@rollerbird/canvaskit-wasm-pdf"],
  },
}));
