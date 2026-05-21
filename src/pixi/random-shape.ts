import * as PIXI from "pixi.js-legacy";

/**
 * Случайная фигура — для кнопки «Сгенерировать случайную линию/фигуру»
 * (вариант интерактивности из ТЗ).
 */
export const createRandomShape = (
  width: number,
  height: number,
): PIXI.Graphics => {
  const g = new PIXI.Graphics();
  const variant = Math.floor(Math.random() * 4);
  const color = randomColor();
  const alpha = 0.6 + Math.random() * 0.4;

  switch (variant) {
    case 0: {
      // Эллипс с заливкой
      const rx = 20 + Math.random() * 60;
      const ry = 20 + Math.random() * 60;
      g.beginFill(color, alpha).drawEllipse(0, 0, rx, ry).endFill();
      g.hitArea = new PIXI.Ellipse(0, 0, rx, ry);
      break;
    }
    case 1: {
      // Прямоугольник со скруглением и заливкой
      const w = 40 + Math.random() * 80;
      const h = 40 + Math.random() * 80;
      g.beginFill(color, alpha).drawRoundedRect(-w / 2, -h / 2, w, h, 8).endFill();
      g.hitArea = new PIXI.Rectangle(-w / 2, -h / 2, w, h);
      break;
    }
    case 2: {
      // Ломаная линия
      const segments = 3 + Math.floor(Math.random() * 4);
      g.lineStyle(2 + Math.random() * 8, color, alpha);
      let x = 0;
      let y = 0;
      g.moveTo(x, y);
      for (let i = 0; i < segments; i++) {
        x += (Math.random() - 0.5) * 120;
        y += (Math.random() - 0.5) * 120;
        g.lineTo(x, y);
      }
      break;
    }
    default: {
      // Треугольник
      const r = 30 + Math.random() * 60;
      const points = [0, -r, r * 0.9, r * 0.7, -r * 0.9, r * 0.7];
      g.beginFill(color, alpha).drawPolygon(points).endFill();
      g.hitArea = new PIXI.Polygon(points);
      break;
    }
  }

  g.position.set(Math.random() * width, Math.random() * height);
  g.angle = Math.random() * 360 - 180;
  g.eventMode = "static";
  g.cursor = "pointer";
  g.name = `rand-${Date.now().toString(36)}`;

  return g;
};

const randomColor = (): number => {
  return Math.floor(Math.random() * 0xffffff);
};
