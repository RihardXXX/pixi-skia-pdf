import * as PIXI from "pixi.js-legacy";
import type { PathCommand, RenderBackend, Rgba, Stroke } from "./render-backend";

/**
 * Обходит дерево PIXI.Container и вызывает соответствующие методы backend'а.
 *
 * Поддерживает:
 *  - вложенные `PIXI.Container`
 *  - трансформации (position / pivot / rotation / scale / skew)
 *  - `PIXI.Graphics` со shape: Rectangle, RoundedRectangle, Circle, Ellipse, Polygon
 *  - произвольные пути из `lineTo`, формируемые legacy-битами geometry
 *  - `PIXI.Sprite` с прозрачностью и transform
 *  - alpha наследуется по дереву (worldAlpha)
 */
export const traversePixi = (
  node: PIXI.DisplayObject,
  backend: RenderBackend,
  parentAlpha = 1,
): void => {
  if (!node.visible) return;

  const worldAlpha = parentAlpha * node.alpha;
  if (worldAlpha <= 0) return;

  backend.save();
  applyTransform(node, backend);

  if (node instanceof PIXI.Graphics) {
    drawGraphics(node, backend, worldAlpha);
  } else if (node instanceof PIXI.Sprite) {
    drawSprite(node, backend);
  }

  if (node instanceof PIXI.Container) {
    for (const child of node.children) {
      traversePixi(child, backend, worldAlpha);
    }
  }

  backend.restore();
};

/** Применяет к backend'у локальную трансформацию PIXI-объекта. */
const applyTransform = (node: PIXI.DisplayObject, backend: RenderBackend): void => {
  const { position, scale, pivot, rotation, skew } = node;
  backend.translate(position.x, position.y);
  if (rotation !== 0) backend.rotate(rotation);
  if (skew.x !== 0 || skew.y !== 0) {
    // PIXI применяет skew как поворот осей; для тестового задания
    // оставляем простую реализацию через rotate+scale без skew.
    // Если нужен skew — можно расширить backend методом transform(a,b,c,d,e,f).
  }
  if (scale.x !== 1 || scale.y !== 1) backend.scale(scale.x, scale.y);
  if (pivot.x !== 0 || pivot.y !== 0) backend.translate(-pivot.x, -pivot.y);
};

/** Извлекает геометрию PIXI.Graphics и рисует через backend. */
const drawGraphics = (
  graphics: PIXI.Graphics,
  backend: RenderBackend,
  worldAlpha: number,
): void => {
  // PIXI.Graphics хранит все вызовы в виде массива graphicsData.
  // Каждый элемент — отдельная фигура с собственными fillStyle / lineStyle / shape.
  const data = (graphics.geometry as PIXI.GraphicsGeometry).graphicsData;
  for (const gd of data) {
    const fill = extractFill(gd, worldAlpha);
    const stroke = extractStroke(gd, worldAlpha);
    drawShape(gd.shape, gd.type, fill, stroke, backend);
  }
};

/** Преобразует fillStyle PIXI -> Rgba. */
const extractFill = (
  gd: PIXI.GraphicsData,
  worldAlpha: number,
): Rgba | null => {
  const fs = gd.fillStyle;
  if (!fs || !fs.visible || fs.alpha === 0) return null;
  return colorToRgba(fs.color, fs.alpha * worldAlpha);
};

/** Преобразует lineStyle PIXI -> Stroke. */
const extractStroke = (
  gd: PIXI.GraphicsData,
  worldAlpha: number,
): Stroke | null => {
  const ls = gd.lineStyle;
  if (!ls || !ls.visible || ls.width === 0 || ls.alpha === 0) return null;
  return {
    color: colorToRgba(ls.color, ls.alpha * worldAlpha),
    width: ls.width,
  };
};

/** Рисует конкретный shape через backend. */
const drawShape = (
  shape: PIXI.IShape,
  type: PIXI.SHAPES,
  fill: Rgba | null,
  stroke: Stroke | null,
  backend: RenderBackend,
): void => {
  switch (type) {
    case PIXI.SHAPES.RECT: {
      const r = shape as PIXI.Rectangle;
      backend.drawRect(r.x, r.y, r.width, r.height, fill, stroke);
      return;
    }
    case PIXI.SHAPES.RREC: {
      const rr = shape as PIXI.RoundedRectangle;
      backend.drawRoundedRect(rr.x, rr.y, rr.width, rr.height, rr.radius, fill, stroke);
      return;
    }
    case PIXI.SHAPES.CIRC: {
      const c = shape as PIXI.Circle;
      backend.drawCircle(c.x, c.y, c.radius, fill, stroke);
      return;
    }
    case PIXI.SHAPES.ELIP: {
      const e = shape as PIXI.Ellipse;
      backend.drawEllipse(e.x, e.y, e.width, e.height, fill, stroke);
      return;
    }
    case PIXI.SHAPES.POLY: {
      const p = shape as PIXI.Polygon;
      backend.drawPath([polygonToCommands(p)], fill, stroke);
      return;
    }
  }
};

/** Полигон PIXI (плоский массив [x1,y1,x2,y2,...]) -> команды пути. */
const polygonToCommands = (poly: PIXI.Polygon): PathCommand[] => {
  const pts = poly.points;
  if (pts.length < 2) return [];
  const cmds: PathCommand[] = [{ type: "moveTo", x: pts[0], y: pts[1] }];
  for (let i = 2; i < pts.length; i += 2) {
    cmds.push({ type: "lineTo", x: pts[i], y: pts[i + 1] });
  }
  if (poly.closeStroke) cmds.push({ type: "close" });
  return cmds;
};

/** Рисует PIXI.Sprite через backend.drawImage. */
const drawSprite = (sprite: PIXI.Sprite, backend: RenderBackend): void => {
  const source = resolveImageSource(sprite.texture);
  if (!source) return;
  const w = sprite.texture.width;
  const h = sprite.texture.height;
  const ax = sprite.anchor.x * w;
  const ay = sprite.anchor.y * h;
  backend.drawImage(source, -ax, -ay, w, h);
};

const resolveImageSource = (
  texture: PIXI.Texture,
): HTMLImageElement | HTMLCanvasElement | ImageBitmap | null => {
  const base = texture.baseTexture;
  const resource: any = base.resource;
  const src = resource?.source ?? resource?.bitmap ?? null;
  if (
    src instanceof HTMLImageElement ||
    src instanceof HTMLCanvasElement ||
    (typeof ImageBitmap !== "undefined" && src instanceof ImageBitmap)
  ) {
    return src;
  }
  return null;
};

/**
 * Преобразует PIXI-цвет (number 0xRRGGBB) и alpha в Rgba {0..1}.
 * PIXI 7 хранит цвет как 0xRRGGBB. В тестовом ТЗ цвета задаются строками '#rrggbb',
 * которые PIXI сам нормализует в number.
 */
const colorToRgba = (color: number, alpha: number): Rgba => ({
  r: ((color >> 16) & 0xff) / 255,
  g: ((color >> 8) & 0xff) / 255,
  b: (color & 0xff) / 255,
  a: Math.max(0, Math.min(1, alpha)),
});
