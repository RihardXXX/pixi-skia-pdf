import * as PIXI from "pixi.js-legacy";

/**
 * Демонстрационные сцены — то самое описание из ТЗ.
 * Каждая возвращает корневой `PIXI.Container`, который можно:
 *  - добавить в `PIXI.Application.stage`;
 *  - отрендерить через `SkiaRenderer`;
 *  - экспортировать в PDF.
 */

/** Сцена из примера ТЗ. */
export const buildSceneFromBrief = (): PIXI.Container => {
  const mainContainer = new PIXI.Container();
  const subContainer = new PIXI.Container();
  const g1 = new PIXI.Graphics();
  const g2 = new PIXI.Graphics();
  const g3 = new PIXI.Graphics();
  const g4 = new PIXI.Graphics();

  g1.beginFill("#ff0000").drawEllipse(0, 0, 200, 100).endFill();
  g1.position.set(200, 100);
  g1.angle = 30;
  g1.eventMode = "static";
  g1.cursor = "pointer";
  g1.hitArea = new PIXI.Ellipse(0, 0, 200, 100);
  g1.name = "g1";

  g2.beginFill("#0000ff").drawRect(-50, -75, 100, 150).endFill();
  g2.position.set(120, 60);
  g2.angle = 15;
  g2.scale.set(1.5, 1.7);
  g2.eventMode = "static";
  g2.cursor = "pointer";
  g2.hitArea = new PIXI.Rectangle(-50, -75, 100, 150);
  g2.name = "g2";

  g3.lineStyle(10, "#ffffff", 1).moveTo(0, 0).lineTo(150, 100);
  g3.angle = -20;
  g3.eventMode = "static";
  g3.name = "g3";

  g4.lineStyle(10, "#ffff00", 1).moveTo(0, 70).lineTo(150, -30);
  g4.angle = 20;
  g4.eventMode = "static";
  g4.name = "g4";

  subContainer.position.set(75, 50);
  subContainer.addChild(g3, g4);
  mainContainer.addChild(subContainer, g1, g2);

  return mainContainer;
};

/** Сцена с PIXI.Sprite — для проверки drawImage. */
export const buildSpriteScene = async (): Promise<PIXI.Container> => {
  const mainContainer = new PIXI.Container();
  // BASE_URL уважает Vite base path — работает и локально на /, и на GitHub Pages.
  const texture = await PIXI.Assets.load<PIXI.Texture>(`${import.meta.env.BASE_URL}sample.png`);

  const sprite = new PIXI.Sprite(texture);
  sprite.anchor.set(0.5);
  sprite.position.set(300, 200);
  sprite.scale.set(0.5);
  sprite.angle = 12;
  sprite.eventMode = "static";
  sprite.cursor = "pointer";
  sprite.name = "sprite";

  const frame = new PIXI.Graphics();
  frame.lineStyle(4, "#222222", 1).drawRect(0, 0, 400, 300);
  frame.position.set(100, 60);

  const accent = new PIXI.Graphics();
  accent
    .beginFill("#4f8cff")
    .drawRoundedRect(-60, -30, 120, 60, 12)
    .endFill();
  accent.position.set(300, 420);
  accent.eventMode = "static";
  accent.cursor = "pointer";
  accent.hitArea = new PIXI.Rectangle(-60, -30, 120, 60);
  accent.name = "accent";

  mainContainer.addChild(frame, sprite, accent);
  return mainContainer;
};

/** Третья сцена — простые формы для разнообразия. */
export const buildShapesScene = (): PIXI.Container => {
  const root = new PIXI.Container();

  const circle = new PIXI.Graphics();
  circle.beginFill("#ffb84c").drawCircle(0, 0, 80).endFill();
  circle.position.set(180, 200);
  circle.eventMode = "static";
  circle.hitArea = new PIXI.Circle(0, 0, 80);
  circle.cursor = "pointer";
  circle.name = "circle";

  const tri = new PIXI.Graphics();
  tri.beginFill("#4fd391")
    .drawPolygon([0, -80, 80, 60, -80, 60])
    .endFill();
  tri.position.set(420, 200);
  tri.angle = -10;
  tri.eventMode = "static";
  tri.hitArea = new PIXI.Polygon([0, -80, 80, 60, -80, 60]);
  tri.cursor = "pointer";
  tri.name = "tri";

  const cross = new PIXI.Graphics();
  cross
    .lineStyle(12, "#ff5050", 1)
    .moveTo(-50, -50)
    .lineTo(50, 50)
    .moveTo(50, -50)
    .lineTo(-50, 50);
  cross.position.set(300, 420);
  cross.angle = 25;
  cross.name = "cross";

  root.addChild(circle, tri, cross);
  return root;
};
