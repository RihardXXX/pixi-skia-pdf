import CanvasKitInit, { type CanvasKit } from "canvaskit-wasm";
// Vite подставляет URL к .wasm-файлу из node_modules — он попадёт в /dist при сборке.
import canvaskitWasmUrl from "canvaskit-wasm/bin/canvaskit.wasm?url";

let cached: Promise<CanvasKit> | null = null;

/** Однократно инициализирует CanvasKit (Skia-WASM). */
export const loadCanvasKit = (): Promise<CanvasKit> => {
  if (!cached) {
    cached = CanvasKitInit({ locateFile: () => canvaskitWasmUrl });
  }
  return cached;
};
