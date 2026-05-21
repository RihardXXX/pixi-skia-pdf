/**
 * Универсальный интерфейс «рендер-бэкенда» для отрисовки PIXI-сцены.
 *
 * Один и тот же обходчик дерева (`traversePixi`) вызывает один и тот же
 * набор примитивов на разных backend'ах:
 *  - Skia / CanvasKit (рендер на HTMLCanvas)
 *  - jsPDF (векторный PDF)
 *
 * Это позволяет PIXI-сцене один в один воспроизводиться и на canvas, и в PDF.
 */
export interface RenderBackend {
  /** Сохранить текущую трансформацию/состояние. */
  save(): void;
  /** Восстановить состояние из стека save(). */
  restore(): void;

  /** Перенос системы координат. */
  translate(x: number, y: number): void;
  /** Поворот системы координат на угол (в радианах). */
  rotate(radians: number): void;
  /** Масштабирование системы координат. */
  scale(sx: number, sy: number): void;

  /**
   * Рисует прямоугольник.
   * @param x, y — координаты левого-верхнего угла в локальных координатах
   * @param width, height — размеры
   * @param fill — заливка (RGBA или null если без заливки)
   * @param stroke — обводка (RGBA + ширина) или null
   */
  drawRect(
    x: number,
    y: number,
    width: number,
    height: number,
    fill: Rgba | null,
    stroke: Stroke | null,
  ): void;

  /**
   * Рисует эллипс по центру (cx, cy) с радиусами rx и ry.
   */
  drawEllipse(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    fill: Rgba | null,
    stroke: Stroke | null,
  ): void;

  /** Рисует круг (частный случай эллипса). */
  drawCircle(
    cx: number,
    cy: number,
    radius: number,
    fill: Rgba | null,
    stroke: Stroke | null,
  ): void;

  /** Рисует скруглённый прямоугольник. */
  drawRoundedRect(
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    fill: Rgba | null,
    stroke: Stroke | null,
  ): void;

  /**
   * Рисует произвольный путь по командам moveTo / lineTo / bezier.
   * @param subpaths — массив подпутей, каждый — массив команд.
   */
  drawPath(
    subpaths: PathCommand[][],
    fill: Rgba | null,
    stroke: Stroke | null,
  ): void;

  /**
   * Рисует растровое изображение (PIXI.Sprite).
   * Координаты заданы в локальной системе — backend применяет текущую матрицу.
   */
  drawImage(
    image: ImageSource,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void;
}

/** Цвет RGBA, каждое поле 0..1. */
export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Параметры обводки. */
export interface Stroke {
  color: Rgba;
  width: number;
}

/** Команды произвольного пути. */
export type PathCommand =
  | { type: "moveTo"; x: number; y: number }
  | { type: "lineTo"; x: number; y: number }
  | { type: "bezierTo"; cp1x: number; cp1y: number; cp2x: number; cp2y: number; x: number; y: number }
  | { type: "quadraticTo"; cpx: number; cpy: number; x: number; y: number }
  | { type: "close" };

/** Источник изображения для рендера. */
export type ImageSource = HTMLImageElement | HTMLCanvasElement | ImageBitmap;
