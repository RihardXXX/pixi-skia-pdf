// Форк CanvasKit, собранный с флагом `--enable_pdf` (см. README) —
// предоставляет API `CanvasKit.MakePDFDocument`, `Document.beginPage` и т.д.
//
// Пакет UMD (`module.exports = CanvasKitInit`). Vite с
// `build.commonjsOptions.defaultIsModuleExports = true` корректно
// делает interop и в dev (esbuild), и в prod (Rollup) — поэтому
// обычный default-import работает.
import CanvasKitInit, { type CanvasKit } from "@rollerbird/canvaskit-wasm-pdf";
import canvaskitPdfWasmUrl from "@rollerbird/canvaskit-wasm-pdf/bin/canvaskit.wasm?url";

let cached: Promise<CanvasKit> | null = null;

/** Однократно инициализирует CanvasKit (Skia-WASM с PDF backend). */
export const loadCanvasKit = (): Promise<CanvasKit> => {
  if (cached) return cached;
  cached = CanvasKitInit({ locateFile: () => canvaskitPdfWasmUrl });
  return cached;
};
