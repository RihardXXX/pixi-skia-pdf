import type { CanvasKit } from "@rollerbird/canvaskit-wasm-pdf";
import * as PIXI from "pixi.js-legacy";
import { SkiaBackend } from "../render/skia-backend";
import { traversePixi } from "../render/traverse";

/**
 * Векторный экспорт PIXI.Container в PDF через **настоящий Skia PDF backend**.
 *
 * Использует `CanvasKit.MakePDFDocument(metadata)` из форка
 * `@rollerbird/canvaskit-wasm-pdf` (CanvasKit, собранный с флагом
 * `--enable_pdf` — см. README). API соответствует Skia SDK:
 *
 *   const doc = CanvasKit.MakePDFDocument({ title, ... });
 *   const canvas = doc.beginPage(width, height);   // Canvas одной страницы
 *   // ... рисуем на canvas (тем же путём, что и на экранной поверхности)
 *   doc.endPage();
 *   const bytes = doc.close();                      // Uint8Array готового PDF
 *
 * Тот же `traversePixi` обходчик дерева, что и для экранного рендера —
 * поэтому PDF гарантированно совпадает с тем, что нарисовано на Skia-канвасе.
 */
export const exportContainerToPdf = (
  ck: CanvasKit,
  container: PIXI.Container,
  options: PdfExportOptions,
): void => {
  const { fileName = "scene.pdf", width, height, background } = options;

  // CanvasKit-WASM binding (Emscripten) строго требует ВСЕ поля PDFMetadata,
  // иначе падает с "Missing field". Заполняем разумными дефолтами.
  const doc = ck.MakePDFDocument({
    title: "Pixi → Skia → PDF",
    author: "",
    subject: "",
    keywords: "",
    creator: "pixi-skia-pdf",
    producer: "Skia PDF backend (CanvasKit-WASM)",
    language: "ru",
    rasterDPI: 72,
    PDFA: false,
    compressionLevel: ck.PDFCompressionLevel.Default,
    // Emscripten-биндинг строго проверяет наличие приватного поля `_rootTag`.
    // Передаём null — PDF будет без структурных тегов, что для нашей задачи
    // (отрисовать сцену без accessibility-разметки) полностью устраивает.
    _rootTag: null,
  } as unknown as Parameters<typeof ck.MakePDFDocument>[0]);

  const pdfCanvas = doc.beginPage(width, height);

  if (background) {
    const bg = new ck.Paint();
    bg.setColor(ck.Color4f(background.r, background.g, background.b, 1));
    bg.setStyle(ck.PaintStyle.Fill);
    pdfCanvas.drawRect(ck.LTRBRect(0, 0, width, height), bg);
    bg.delete();
  }

  // Тот же backend / тот же обходчик, что и для экранного рендера.
  const backend = new SkiaBackend(ck, pdfCanvas);
  traversePixi(container, backend);

  doc.endPage();
  const bytes = doc.close();

  // Скачиваем как файл — без `jsPDF.save()` и без `canvas.toDataURL`.
  // `bytes.buffer` объявлен как ArrayBufferLike (может быть SharedArrayBuffer),
  // поэтому копируем содержимое в обычный ArrayBuffer для Blob.
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Чуть позже отзываем object URL — браузер успеет начать загрузку.
  setTimeout(() => URL.revokeObjectURL(url), 1500);
};

export interface PdfExportOptions {
  width: number;
  height: number;
  fileName?: string;
  background?: { r: number; g: number; b: number };
}
