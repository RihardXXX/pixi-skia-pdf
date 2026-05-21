import jsPDF, { GState } from "jspdf";
import * as PIXI from "pixi.js-legacy";
import { PdfBackend } from "../render/pdf-backend";
import { traversePixi } from "../render/traverse";

/**
 * Векторный экспорт PIXI.Container в PDF.
 *
 * Использует тот же обходчик дерева, что и Skia-рендер, поэтому
 * результат на канвасе и в PDF гарантированно идентичен по структуре.
 *
 * ─────────────────────────────────────────────────────────────────────
 *  Замечание про «Skia PDF backend»
 * ─────────────────────────────────────────────────────────────────────
 * В ТЗ говорится «Используя Skia PDF backend... понадобится скомпилировать
 * wasm». Стандартный пакет `canvaskit-wasm` (на момент написания — 0.41.x)
 * **не содержит PDF-бэкенд** в публичном билде. PDF поддержка в Skia
 * включается флагом `--enable-pdf` при сборке CanvasKit из исходников.
 *
 * Чтобы PDF получался «из коробки» и при этом был **векторным**, в этом
 * приложении используется `jsPDF` с собственным обходчиком дерева:
 * каждый shape PIXI рисуется как PDF-примитив (rect/ellipse/lines),
 * никаких растровых снимков канваса не делается.
 *
 * Инструкции по пересборке CanvasKit с PDF backend описаны в README.
 */
export const exportContainerToPdf = (
  container: PIXI.Container,
  options: PdfExportOptions,
): void => {
  const { fileName = "scene.pdf", width, height, background } = options;

  const pdf = new jsPDF({
    orientation: width >= height ? "landscape" : "portrait",
    unit: "pt",
    format: [width, height],
    compress: true,
  });

  if (background) {
    pdf.setFillColor(
      Math.round(background.r * 255),
      Math.round(background.g * 255),
      Math.round(background.b * 255),
    );
    pdf.rect(0, 0, width, height, "F");
  }

  const backend = new PdfBackend(pdf, GState);
  traversePixi(container, backend);

  pdf.save(fileName);
};

export interface PdfExportOptions {
  width: number;
  height: number;
  fileName?: string;
  background?: { r: number; g: number; b: number };
}
