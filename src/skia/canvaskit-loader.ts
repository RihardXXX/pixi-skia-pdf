// Форк CanvasKit, собранный с флагом `--enable_pdf` (см. README) —
// предоставляет API `CanvasKit.MakePDFDocument`, `Document.beginPage` и т.д.
// Пакет UMD (module.exports = ...), Rollup в prod-build не делает default
// interop для vendor-пакетов из file:./vendor/, поэтому используем
// namespace-импорт и достаём фактическую инициализирующую функцию вручную.
import * as CanvasKitMod from "@rollerbird/canvaskit-wasm-pdf";
import type {
  CanvasKit,
  CanvasKitInitOptions,
} from "@rollerbird/canvaskit-wasm-pdf";
import canvaskitPdfWasmUrl from "@rollerbird/canvaskit-wasm-pdf/bin/canvaskit.wasm?url";

type Initializer = (opts: CanvasKitInitOptions) => Promise<CanvasKit>;

// Поддерживаем оба варианта interop: { default: fn } и сам fn.
const CanvasKitInit: Initializer =
  ((CanvasKitMod as unknown) as { default?: Initializer }).default ??
  ((CanvasKitMod as unknown) as Initializer);

let cached: Promise<CanvasKit> | null = null;

/** Однократно инициализирует CanvasKit (Skia-WASM с PDF backend). */
export const loadCanvasKit = (): Promise<CanvasKit> => {
  if (cached) return cached;
  cached = CanvasKitInit({ locateFile: () => canvaskitPdfWasmUrl });
  return cached;
};
