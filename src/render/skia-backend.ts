import type {
  CanvasKit,
  Canvas as SkCanvas,
  Paint as SkPaint,
} from "canvaskit-wasm";
import type {
  ImageSource,
  PathCommand,
  RenderBackend,
  Rgba,
  Stroke,
} from "./render-backend";

/**
 * Реализация {@link RenderBackend} поверх CanvasKit (Skia-WASM).
 *
 * Рисует один в один то же, что Pixi-canvas: shape'ы, штрихи, заливки,
 * растровые спрайты с учётом локальных трансформаций.
 */
export class SkiaBackend implements RenderBackend {
  private readonly imageCache = new WeakMap<object, SkiaImageRecord>();

  constructor(
    private readonly ck: CanvasKit,
    private readonly canvas: SkCanvas,
  ) {}

  save(): void {
    this.canvas.save();
  }
  restore(): void {
    this.canvas.restore();
  }
  translate(x: number, y: number): void {
    this.canvas.translate(x, y);
  }
  rotate(radians: number): void {
    // CanvasKit принимает градусы.
    this.canvas.rotate((radians * 180) / Math.PI, 0, 0);
  }
  scale(sx: number, sy: number): void {
    this.canvas.scale(sx, sy);
  }

  drawRect(
    x: number,
    y: number,
    width: number,
    height: number,
    fill: Rgba | null,
    stroke: Stroke | null,
  ): void {
    const rect = this.ck.LTRBRect(x, y, x + width, y + height);
    if (fill) {
      const p = this.makePaint(fill);
      this.canvas.drawRect(rect, p);
      p.delete();
    }
    if (stroke) {
      const p = this.makeStrokePaint(stroke);
      this.canvas.drawRect(rect, p);
      p.delete();
    }
  }

  drawEllipse(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    fill: Rgba | null,
    stroke: Stroke | null,
  ): void {
    const oval = this.ck.LTRBRect(cx - rx, cy - ry, cx + rx, cy + ry);
    if (fill) {
      const p = this.makePaint(fill);
      this.canvas.drawOval(oval, p);
      p.delete();
    }
    if (stroke) {
      const p = this.makeStrokePaint(stroke);
      this.canvas.drawOval(oval, p);
      p.delete();
    }
  }

  drawCircle(
    cx: number,
    cy: number,
    radius: number,
    fill: Rgba | null,
    stroke: Stroke | null,
  ): void {
    if (fill) {
      const p = this.makePaint(fill);
      this.canvas.drawCircle(cx, cy, radius, p);
      p.delete();
    }
    if (stroke) {
      const p = this.makeStrokePaint(stroke);
      this.canvas.drawCircle(cx, cy, radius, p);
      p.delete();
    }
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
    const rrect = this.ck.RRectXY(
      this.ck.LTRBRect(x, y, x + width, y + height),
      radius,
      radius,
    );
    if (fill) {
      const p = this.makePaint(fill);
      this.canvas.drawRRect(rrect, p);
      p.delete();
    }
    if (stroke) {
      const p = this.makeStrokePaint(stroke);
      this.canvas.drawRRect(rrect, p);
      p.delete();
    }
  }

  drawPath(
    subpaths: PathCommand[][],
    fill: Rgba | null,
    stroke: Stroke | null,
  ): void {
    const path = new this.ck.Path();
    for (const sub of subpaths) {
      for (const cmd of sub) {
        switch (cmd.type) {
          case "moveTo":
            path.moveTo(cmd.x, cmd.y);
            break;
          case "lineTo":
            path.lineTo(cmd.x, cmd.y);
            break;
          case "bezierTo":
            path.cubicTo(cmd.cp1x, cmd.cp1y, cmd.cp2x, cmd.cp2y, cmd.x, cmd.y);
            break;
          case "quadraticTo":
            path.quadTo(cmd.cpx, cmd.cpy, cmd.x, cmd.y);
            break;
          case "close":
            path.close();
            break;
        }
      }
    }
    if (fill) {
      const p = this.makePaint(fill);
      this.canvas.drawPath(path, p);
      p.delete();
    }
    if (stroke) {
      const p = this.makeStrokePaint(stroke);
      this.canvas.drawPath(path, p);
      p.delete();
    }
    path.delete();
  }

  drawImage(
    image: ImageSource,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    const record = this.acquireImage(image);
    if (!record) return;

    const srcRect = this.ck.LTRBRect(0, 0, record.width, record.height);
    const dstRect = this.ck.LTRBRect(x, y, x + width, y + height);

    const paint = new this.ck.Paint();
    paint.setAntiAlias(true);
    this.canvas.drawImageRect(record.image, srcRect, dstRect, paint);
    paint.delete();
  }

  /** Очистка кеша Skia-изображений — вызывать при уничтожении рендера. */
  dispose(): void {
    // Skia-изображения будут удалены вместе со связкой WeakMap,
    // здесь оставлено для симметрии и для возможного расширения.
  }

  private makePaint(color: Rgba): SkPaint {
    const paint = new this.ck.Paint();
    paint.setStyle(this.ck.PaintStyle.Fill);
    paint.setColor(this.ck.Color4f(color.r, color.g, color.b, color.a));
    paint.setAntiAlias(true);
    return paint;
  }

  private makeStrokePaint(stroke: Stroke): SkPaint {
    const paint = new this.ck.Paint();
    paint.setStyle(this.ck.PaintStyle.Stroke);
    paint.setStrokeWidth(stroke.width);
    paint.setStrokeCap(this.ck.StrokeCap.Round);
    paint.setStrokeJoin(this.ck.StrokeJoin.Round);
    paint.setColor(
      this.ck.Color4f(stroke.color.r, stroke.color.g, stroke.color.b, stroke.color.a),
    );
    paint.setAntiAlias(true);
    return paint;
  }

  private acquireImage(source: ImageSource): SkiaImageRecord | null {
    const cached = this.imageCache.get(source as object);
    if (cached) return cached;
    const image = this.ck.MakeImageFromCanvasImageSource(source as CanvasImageSource);
    if (!image) return null;
    const record: SkiaImageRecord = {
      image,
      width: image.width(),
      height: image.height(),
    };
    this.imageCache.set(source as object, record);
    return record;
  }
}

interface SkiaImageRecord {
  image: ReturnType<CanvasKit["MakeImageFromCanvasImageSource"]>;
  width: number;
  height: number;
}
