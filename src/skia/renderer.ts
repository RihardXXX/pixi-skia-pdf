import type { CanvasKit, Surface as SkSurface } from "canvaskit-wasm";
import * as PIXI from "pixi.js-legacy";
import { SkiaBackend } from "../render/skia-backend";
import { traversePixi } from "../render/traverse";

/**
 * Высокоуровневая обёртка над Skia (CanvasKit-WASM).
 *
 * Принимает корневой `PIXI.Container` и отрисовывает его поверх HTMLCanvas
 * силами Skia. Поддерживает локальные трансформации (translate / rotate /
 * scale) и базовые типы DisplayObject — `PIXI.Container`, `PIXI.Graphics`,
 * `PIXI.Sprite` (см. `traverse.ts`).
 *
 * ВАЖНО: класс не управляет жизненным циклом исходного PIXI.Container.
 * Вы можете в любой момент изменить дерево и вызвать `render()` повторно —
 * Skia-канвас будет полностью перерисован.
 */
export class SkiaRenderer {
  private surface: SkSurface;
  private readonly width: number;
  private readonly height: number;
  private readonly background: [number, number, number, number];

  constructor(
    private readonly ck: CanvasKit,
    canvas: HTMLCanvasElement,
    options: SkiaRendererOptions = {},
  ) {
    this.width = canvas.width;
    this.height = canvas.height;
    this.background = options.background ?? [1, 1, 1, 1];

    const surface = ck.MakeWebGLCanvasSurface(canvas) ?? ck.MakeSWCanvasSurface(canvas);
    if (!surface) {
      throw new Error(
        "Skia: не удалось создать Surface ни через WebGL, ни через CPU. Проверьте поддержку браузера.",
      );
    }
    this.surface = surface;
  }

  /**
   * Главный метод обёртки — рендерит переданный контейнер на Skia-canvas.
   *
   * Используется один обходчик дерева `traversePixi`, который вызывает
   * `RenderBackend` (для Skia здесь — `SkiaBackend`).
   */
  render(container: PIXI.Container): void {
    const skCanvas = this.surface.getCanvas();
    skCanvas.clear(
      this.ck.Color4f(
        this.background[0],
        this.background[1],
        this.background[2],
        this.background[3],
      ),
    );

    const backend = new SkiaBackend(this.ck, skCanvas);
    traversePixi(container, backend);

    this.surface.flush();
  }

  /** Возвращает текущие размеры канваса. */
  size(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  /** Освобождает ресурсы Skia. Вызывать при уничтожении приложения. */
  dispose(): void {
    if (!this.surface.isDeleted()) {
      this.surface.delete();
    }
  }
}

export interface SkiaRendererOptions {
  /** Фон канваса (RGBA 0..1). По умолчанию — белый. */
  background?: [number, number, number, number];
}
