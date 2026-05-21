import * as PIXI from "pixi.js-legacy";
import { loadCanvasKit } from "./skia/canvaskit-loader";
import { SkiaRenderer } from "./skia/renderer";
import { exportContainerToPdf } from "./pdf/exporter";
import {
  buildSceneFromBrief,
  buildShapesScene,
  buildSpriteScene,
} from "./pixi/scenes";
import { createRandomShape } from "./pixi/random-shape";

/** Размеры рабочей области (одинаковы для PIXI и Skia, чтобы итоговый PDF совпадал по координатам). */
const STAGE_WIDTH = 600;
const STAGE_HEIGHT = 600;

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Не найден элемент #${id}`);
  return el as T;
};

const status = $("status");
const log = $<HTMLUListElement>("log");
const pixiHost = $("pixi-host");
const skiaCanvas = $<HTMLCanvasElement>("skia-canvas");

const setStatus = (text: string): void => {
  status.textContent = text;
};

const appendLog = (text: string, kind: "pixi" | "skia" | "info" = "info"): void => {
  const li = document.createElement("li");
  li.textContent = `${new Date().toLocaleTimeString()}  ${text}`;
  if (kind !== "info") li.className = kind;
  log.prepend(li);
  // Ограничим длину лога, чтобы не разрасталось.
  while (log.children.length > 100) log.removeChild(log.lastChild!);
};

/** Инициализация Pixi-приложения по требованию ТЗ — forceCanvas=true. */
const createPixiApp = (): PIXI.Application => {
  const app = new PIXI.Application({
    width: STAGE_WIDTH,
    height: STAGE_HEIGHT,
    background: 0xffffff,
    forceCanvas: true, // явно требование ТЗ
    antialias: true,
    autoStart: true,
    resolution: window.devicePixelRatio,
  });
  // Фиксируем CSS-размер view, чтобы DPR-resolution не «растягивал»
  // канвас за пределы 600×600 — это важно, чтобы координаты совпадали
  // с Skia-канвасом (который мы рисуем в логических 600×600 пикселях).
  const view = app.view as HTMLCanvasElement;
  view.style.width = `${STAGE_WIDTH}px`;
  view.style.height = `${STAGE_HEIGHT}px`;
  return app;
};

/** Состояние приложения — какие сцены загружены и какая активна. */
interface AppState {
  pixi: PIXI.Application;
  skia: SkiaRenderer;
  scenes: PIXI.Container[];
  index: number;
  /** Текущий корневой контейнер активной сцены — то, что мы рендерим в Skia/PDF. */
  current(): PIXI.Container;
}

const bootstrap = async (): Promise<void> => {
  setStatus("Загружаем CanvasKit (Skia-WASM)…");
  const ck = await loadCanvasKit();

  setStatus("Инициализируем PIXI (forceCanvas=true)…");
  const pixi = createPixiApp();
  pixiHost.appendChild(pixi.view as HTMLCanvasElement);

  // Делаем интерактивную область на размер сцены (для legacy-режима).
  pixi.stage.eventMode = "static";
  pixi.stage.hitArea = new PIXI.Rectangle(0, 0, STAGE_WIDTH, STAGE_HEIGHT);

  setStatus("Готовим Skia-Renderer…");
  const skia = new SkiaRenderer(ck, skiaCanvas, { background: [1, 1, 1, 1] });

  setStatus("Строим демо-сцены…");
  const scenes: PIXI.Container[] = [buildSceneFromBrief(), buildShapesScene()];
  // Sprite-сцена грузит PNG — если ассет не доступен, не валим всё приложение.
  try {
    const sprite = await buildSpriteScene();
    scenes.splice(1, 0, sprite);
  } catch (error) {
    console.warn("Не удалось загрузить sprite-сцену:", error);
  }

  const state: AppState = {
    pixi,
    skia,
    scenes,
    index: 0,
    current() {
      return scenes[this.index];
    },
  };

  // Назначаем pointerDown/pointerUp на все интерактивные потомки текущей сцены.
  bindPointerEvents(state, "pixi");

  // Первичная отрисовка
  setActiveScene(state, 0);

  // Кнопки.
  $("btn-random").addEventListener("click", () => {
    const shape = createRandomShape(STAGE_WIDTH, STAGE_HEIGHT);
    bindNodePointerEvents(shape, "pixi", state);
    state.current().addChild(shape);
    appendLog(`Добавлена случайная фигура "${shape.name ?? "shape"}"`);
    renderSkia(state);
  });

  $("btn-next-scene").addEventListener("click", () => {
    setActiveScene(state, (state.index + 1) % state.scenes.length);
  });

  $("btn-resync").addEventListener("click", () => {
    renderSkia(state);
    appendLog("Skia-канвас перерисован вручную");
  });

  $("btn-export-pdf").addEventListener("click", () => {
    try {
      setStatus("Экспортируем PDF через Skia PDF backend…");
      exportContainerToPdf(ck, state.current(), {
        width: STAGE_WIDTH,
        height: STAGE_HEIGHT,
        fileName: `pixi-skia-scene-${Date.now()}.pdf`,
        background: { r: 1, g: 1, b: 1 },
      });
      appendLog("PDF сохранён (Skia PDF backend, vector)");
      setStatus("PDF сохранён");
    } catch (error) {
      console.error(error);
      appendLog(`Ошибка экспорта PDF: ${(error as Error).message}`);
      setStatus("Ошибка экспорта — см. консоль");
    }
  });

  // Авто-перерисовка Skia после каждого тика Pixi-рендера (даёт «живую» синхронизацию).
  pixi.ticker.add(() => {
    // Чтобы не перерисовывать Skia 60 раз в секунду — делаем простой троттлинг через флаг.
    requestSkiaSync(state);
  });

  // Реагируем на pointer-события на Skia-канвасе тоже (требование ТЗ).
  attachSkiaCanvasInteraction(state);

  setStatus("Готово. Двигайте мышью и нажимайте на фигуры.");
};

let skiaSyncPending = false;
const requestSkiaSync = (state: AppState): void => {
  if (skiaSyncPending) return;
  skiaSyncPending = true;
  requestAnimationFrame(() => {
    skiaSyncPending = false;
    renderSkia(state);
  });
};

const renderSkia = (state: AppState): void => {
  state.skia.render(state.current());
};

const setActiveScene = (state: AppState, index: number): void => {
  // Убираем предыдущую сцену из stage Pixi.
  state.pixi.stage.removeChildren();
  state.index = index;
  state.pixi.stage.addChild(state.current());
  bindPointerEvents(state, "pixi");
  appendLog(`Активна сцена #${index + 1}`);
  renderSkia(state);
};

/** Привязка pointer-событий ко всем интерактивным детям текущей сцены. */
const bindPointerEvents = (state: AppState, sourceLabel: PointerSource): void => {
  walk(state.current(), (node) => {
    if (node.eventMode === "static" || node.eventMode === "dynamic") {
      bindNodePointerEvents(node, sourceLabel, state);
    }
  });
};

type PointerSource = "pixi" | "skia";

const bindNodePointerEvents = (
  node: PIXI.DisplayObject,
  sourceLabel: PointerSource,
  _state: AppState,
): void => {
  node.removeAllListeners?.("pointerdown");
  node.removeAllListeners?.("pointerup");
  node.on("pointerdown", () => {
    const label = node.name ?? node.constructor.name;
    appendLog(`pointerdown → ${label} [${sourceLabel}]`, sourceLabel);
  });
  node.on("pointerup", () => {
    const label = node.name ?? node.constructor.name;
    appendLog(`pointerup   → ${label} [${sourceLabel}]`, sourceLabel);
  });
};

/**
 * Skia-канвас не имеет собственной системы событий — он просто рисует.
 * Чтобы события `pointerDown / pointerUp` работали и при кликах по Skia-канвасу,
 * мы перенаправляем DOM-события (mouseDown/mouseUp/pointerDown/pointerUp) в PIXI:
 * это даёт корректный hit-test на тех же DisplayObject'ах.
 */
const attachSkiaCanvasInteraction = (state: AppState): void => {
  const dispatch = (
    event: PointerEvent,
    pixiEventName: "pointerdown" | "pointerup",
  ): void => {
    const rect = skiaCanvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) * STAGE_WIDTH) / rect.width;
    const y = ((event.clientY - rect.top) * STAGE_HEIGHT) / rect.height;

    const hit = hitTest(state.current(), x, y);
    if (hit) {
      hit.emit(pixiEventName, makeFakeFederatedEvent(pixiEventName, x, y) as never);
      appendLog(
        `Skia canvas → ${pixiEventName} → ${hit.name ?? hit.constructor.name}`,
        "skia",
      );
    } else {
      appendLog(`Skia canvas → ${pixiEventName} (мимо фигур)`, "skia");
    }
  };

  skiaCanvas.addEventListener("pointerdown", (e) => dispatch(e, "pointerdown"));
  skiaCanvas.addEventListener("pointerup", (e) => dispatch(e, "pointerup"));
};

/**
 * Хит-тест по точке (x, y) в координатах сцены.
 * Используем встроенный PIXI hit-test: применяем worldTransform каждого узла
 * и проверяем containsPoint.
 *
 * Идём с конца children (top-most rendered first), как делает Pixi.
 */
const hitTest = (
  root: PIXI.DisplayObject,
  x: number,
  y: number,
): PIXI.DisplayObject | null => {
  const point = new PIXI.Point(x, y);

  const visit = (node: PIXI.DisplayObject): PIXI.DisplayObject | null => {
    if (!node.visible) return null;

    if (node instanceof PIXI.Container) {
      for (let i = node.children.length - 1; i >= 0; i--) {
        const child = visit(node.children[i]);
        if (child) return child;
      }
    }

    if (node.eventMode !== "static" && node.eventMode !== "dynamic") return null;

    const local = node.worldTransform.applyInverse(point);
    const hitArea = node.hitArea as PIXI.IHitArea | null | undefined;
    if (hitArea && typeof hitArea.contains === "function") {
      if (hitArea.contains(local.x, local.y)) return node;
    } else if (node instanceof PIXI.Sprite) {
      const w = node.texture.width;
      const h = node.texture.height;
      const ax = node.anchor.x * w;
      const ay = node.anchor.y * h;
      if (local.x >= -ax && local.x <= w - ax && local.y >= -ay && local.y <= h - ay) {
        return node;
      }
    }
    return null;
  };

  return visit(root);
};

/** Возвращает минимальный объект, чтобы PIXI принял emit('pointerdown', ...). */
const makeFakeFederatedEvent = (
  type: string,
  x: number,
  y: number,
): Partial<PIXI.FederatedPointerEvent> => ({
  type,
  global: new PIXI.Point(x, y),
});

/** Утилита — рекурсивный обход дерева. */
const walk = (
  node: PIXI.DisplayObject,
  fn: (n: PIXI.DisplayObject) => void,
): void => {
  fn(node);
  if (node instanceof PIXI.Container) {
    for (const child of node.children) walk(child, fn);
  }
};

bootstrap().catch((err) => {
  console.error(err);
  setStatus(`Ошибка инициализации: ${(err as Error).message}`);
});
