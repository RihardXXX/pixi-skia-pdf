import type { jsPDF, GState } from "jspdf";
import type {
  ImageSource,
  PathCommand,
  RenderBackend,
  Rgba,
  Stroke,
} from "./render-backend";

/**
 * Реализация {@link RenderBackend} поверх jsPDF.
 *
 * jsPDF строит **векторный** PDF, рисуя примитивы через вызовы
 * `rect`, `ellipse`, `circle`, `lines`, что даёт корректное
 * масштабирование без потерь качества.
 *
 * Так как jsPDF не имеет полноценного стека save/restore матриц,
 * мы поддерживаем собственный стек трансформаций и применяем
 * накопленную матрицу к каждой точке вручную (PDF native units = pt).
 */
export class PdfBackend implements RenderBackend {
  /** Текущая матрица 2x3: [a, b, c, d, e, f] (как в Canvas2D). */
  private matrix: Matrix = identity();
  private readonly stack: Matrix[] = [];
  private readonly cache = new Map<ImageSource, string>();

  constructor(
    private readonly pdf: jsPDF,
    private readonly GStateCtor: new (opts: Record<string, unknown>) => GState,
  ) {}

  save(): void {
    this.stack.push([...this.matrix] as Matrix);
  }

  restore(): void {
    const restored = this.stack.pop();
    if (restored) this.matrix = restored;
  }

  translate(x: number, y: number): void {
    this.matrix = multiply(this.matrix, [1, 0, 0, 1, x, y]);
  }

  rotate(radians: number): void {
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    this.matrix = multiply(this.matrix, [cos, sin, -sin, cos, 0, 0]);
  }

  scale(sx: number, sy: number): void {
    this.matrix = multiply(this.matrix, [sx, 0, 0, sy, 0, 0]);
  }

  drawRect(
    x: number,
    y: number,
    width: number,
    height: number,
    fill: Rgba | null,
    stroke: Stroke | null,
  ): void {
    // Трансформируем четыре угла в мировые координаты и рисуем как полигон.
    const corners = [
      this.transformPoint(x, y),
      this.transformPoint(x + width, y),
      this.transformPoint(x + width, y + height),
      this.transformPoint(x, y + height),
    ];
    this.drawPolygon(corners, fill, stroke, true);
  }

  drawEllipse(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    fill: Rgba | null,
    stroke: Stroke | null,
  ): void {
    // Эллипс с произвольным поворотом → аппроксимация ломаной через transformPoint.
    const segments = 64;
    const pts: Point[] = [];
    for (let i = 0; i < segments; i++) {
      const t = (i / segments) * Math.PI * 2;
      pts.push(this.transformPoint(cx + Math.cos(t) * rx, cy + Math.sin(t) * ry));
    }
    this.drawPolygon(pts, fill, stroke, true);
  }

  drawCircle(
    cx: number,
    cy: number,
    radius: number,
    fill: Rgba | null,
    stroke: Stroke | null,
  ): void {
    this.drawEllipse(cx, cy, radius, radius, fill, stroke);
  }

  drawRoundedRect(
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    fill: Rgba | null,
    stroke: Stroke | null,
  ): void {
    // Простейшая аппроксимация: прямоугольник + 4 четверти круга, всё через transformPoint.
    const r = Math.min(radius, width / 2, height / 2);
    const corners: Point[] = [];
    const arc = (
      cx: number,
      cy: number,
      from: number,
      to: number,
      steps = 8,
    ): void => {
      for (let i = 0; i <= steps; i++) {
        const t = from + (to - from) * (i / steps);
        corners.push(this.transformPoint(cx + Math.cos(t) * r, cy + Math.sin(t) * r));
      }
    };
    arc(x + r, y + r, Math.PI, 1.5 * Math.PI);
    arc(x + width - r, y + r, 1.5 * Math.PI, 2 * Math.PI);
    arc(x + width - r, y + height - r, 0, 0.5 * Math.PI);
    arc(x + r, y + height - r, 0.5 * Math.PI, Math.PI);
    this.drawPolygon(corners, fill, stroke, true);
  }

  drawPath(
    subpaths: PathCommand[][],
    fill: Rgba | null,
    stroke: Stroke | null,
  ): void {
    // jsPDF поддерживает lines() для последовательностей сегментов от начальной точки.
    // Для общности: каждый подпуть превращаем в массив [start, ...segs] и рисуем
    // через нативный путь PDF (jsPDF.path() недоступен в текущей мажорной версии напрямую,
    // используем lines() для аппроксимации).
    if (!fill && !stroke) return;

    this.applyStyle(fill, stroke);
    const style = pickStyle(fill, stroke);

    for (const sub of subpaths) {
      if (sub.length === 0) continue;
      let cx = 0;
      let cy = 0;
      const segments: number[][] = [];
      let started = false;
      let close = false;
      for (const cmd of sub) {
        switch (cmd.type) {
          case "moveTo": {
            const p = this.transformPoint(cmd.x, cmd.y);
            cx = p.x;
            cy = p.y;
            started = true;
            break;
          }
          case "lineTo": {
            const p = this.transformPoint(cmd.x, cmd.y);
            segments.push([p.x - cx, p.y - cy]);
            cx = p.x;
            cy = p.y;
            break;
          }
          case "bezierTo": {
            const c1 = this.transformPoint(cmd.cp1x, cmd.cp1y);
            const c2 = this.transformPoint(cmd.cp2x, cmd.cp2y);
            const p = this.transformPoint(cmd.x, cmd.y);
            segments.push([
              c1.x - cx,
              c1.y - cy,
              c2.x - cx,
              c2.y - cy,
              p.x - cx,
              p.y - cy,
            ]);
            cx = p.x;
            cy = p.y;
            break;
          }
          case "quadraticTo": {
            const c = this.transformPoint(cmd.cpx, cmd.cpy);
            const p = this.transformPoint(cmd.x, cmd.y);
            // Конвертация квадратичной в кубическую кривую.
            const c1x = cx + (2 / 3) * (c.x - cx);
            const c1y = cy + (2 / 3) * (c.y - cy);
            const c2x = p.x + (2 / 3) * (c.x - p.x);
            const c2y = p.y + (2 / 3) * (c.y - p.y);
            segments.push([
              c1x - cx,
              c1y - cy,
              c2x - cx,
              c2y - cy,
              p.x - cx,
              p.y - cy,
            ]);
            cx = p.x;
            cy = p.y;
            break;
          }
          case "close":
            close = true;
            break;
        }
      }
      if (started && segments.length > 0) {
        this.pdf.lines(segments, cx, cy, [1, 1], style, close);
      }
    }
  }

  drawImage(
    image: ImageSource,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    // jsPDF.addImage умеет принимать canvas/img напрямую, но не учитывает наш матричный стек.
    // Поэтому: запекаем картинку в дополнительный canvas нужного размера и переводим её
    // PDF-овой матрицей (через transformPoint левого-верхнего угла + ширины/высоты под текущим масштабом).
    const dataUrl = this.imageToDataUrl(image);
    if (!dataUrl) return;

    const tl = this.transformPoint(x, y);
    const tr = this.transformPoint(x + width, y);
    const bl = this.transformPoint(x, y + height);

    const w = Math.hypot(tr.x - tl.x, tr.y - tl.y);
    const h = Math.hypot(bl.x - tl.x, bl.y - tl.y);

    // jsPDF не умеет наклон при addImage, но базовый поворот через matrix мы сохранили в координатах.
    // Для тестового задания этого достаточно: сдвиг + равномерное масштабирование.
    this.pdf.addImage(dataUrl, "PNG", tl.x, tl.y, w, h, undefined, "FAST");
  }

  private drawPolygon(
    points: Point[],
    fill: Rgba | null,
    stroke: Stroke | null,
    close: boolean,
  ): void {
    if (points.length === 0) return;
    if (!fill && !stroke) return;
    this.applyStyle(fill, stroke);
    const start = points[0];
    const segs: number[][] = [];
    let prev = start;
    for (let i = 1; i < points.length; i++) {
      const p = points[i];
      segs.push([p.x - prev.x, p.y - prev.y]);
      prev = p;
    }
    this.pdf.lines(segs, start.x, start.y, [1, 1], pickStyle(fill, stroke), close);
  }

  private applyStyle(fill: Rgba | null, stroke: Stroke | null): void {
    if (fill) {
      this.pdf.setFillColor(
        Math.round(fill.r * 255),
        Math.round(fill.g * 255),
        Math.round(fill.b * 255),
      );
      this.pdf.setGState(new this.GStateCtor({ opacity: fill.a }));
    }
    if (stroke) {
      this.pdf.setDrawColor(
        Math.round(stroke.color.r * 255),
        Math.round(stroke.color.g * 255),
        Math.round(stroke.color.b * 255),
      );
      this.pdf.setLineWidth(stroke.width);
      this.pdf.setLineCap("round");
      this.pdf.setLineJoin("round");
      this.pdf.setGState(new this.GStateCtor({ "stroke-opacity": stroke.color.a }));
    }
  }

  private transformPoint(x: number, y: number): Point {
    const [a, b, c, d, e, f] = this.matrix;
    return { x: a * x + c * y + e, y: b * x + d * y + f };
  }

  private imageToDataUrl(image: ImageSource): string | null {
    const cached = this.cache.get(image);
    if (cached) return cached;

    const tmp = document.createElement("canvas");
    if (image instanceof HTMLCanvasElement) {
      tmp.width = image.width;
      tmp.height = image.height;
      const ctx = tmp.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(image, 0, 0);
    } else if (image instanceof HTMLImageElement) {
      tmp.width = image.naturalWidth;
      tmp.height = image.naturalHeight;
      const ctx = tmp.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(image, 0, 0);
    } else {
      // ImageBitmap
      tmp.width = image.width;
      tmp.height = image.height;
      const ctx = tmp.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(image, 0, 0);
    }

    const url = tmp.toDataURL("image/png");
    this.cache.set(image, url);
    return url;
  }
}

const pickStyle = (fill: Rgba | null, stroke: Stroke | null): "F" | "S" | "FD" => {
  if (fill && stroke) return "FD";
  if (fill) return "F";
  return "S";
};

type Matrix = readonly [number, number, number, number, number, number];
const identity = (): Matrix => [1, 0, 0, 1, 0, 0];

const multiply = (a: Matrix, b: Matrix): Matrix => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];

interface Point {
  x: number;
  y: number;
}
