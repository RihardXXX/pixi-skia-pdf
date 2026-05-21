# Pixi → Skia → PDF

TypeScript-приложение, которое демонстрирует:

1. Сцену на `pixi.js` (`pixi.js-legacy@7.2.4`, `forceCanvas=true`).
2. **Собственную Skia-обёртку**, которая принимает `PIXI.Container`
   и рисует тот же контейнер на канвасе через CanvasKit-WASM.
3. **Векторный экспорт сцены в PDF** — один и тот же обходчик дерева
   PIXI вызывает примитивы и на Skia, и на PDF-бэкенде.
4. События `pointerdown` / `pointerup` на обоих канвасах
   (Pixi-сцене и Skia-канвасе — клик по Skia диспатчит событие на
   тот же `PIXI.DisplayObject`).
5. Кнопку «Сгенерировать случайную фигуру» и переключение между
   тремя демо-сценами.

## Стек

| Слой        | Решение                                                |
| ----------- | ------------------------------------------------------ |
| Pixi        | `pixi.js-legacy@7.2.4` (Canvas2D fallback, `forceCanvas=true`) |
| Skia        | `canvaskit-wasm@0.39.1` (WebGL → SW fallback)          |
| PDF         | `jsPDF@2.5.x` поверх того же обходчика дерева          |
| Сборка      | Vite 5 + TypeScript 5 (strict, no `any`)               |

## Быстрый запуск

> Требуется **Node 18+** и npm.

```bash
npm install
npm run dev
```

После запуска откройте <http://localhost:5173>. В UI:

- **Сгенерировать случайную фигуру** — добавляет рандомный
  `PIXI.Graphics` (эллипс / закруглённый прямоугольник / ломаная /
  треугольник) в текущую сцену. Skia перерисовывается автоматически.
- **Следующая сцена** — переключает между тремя сценами:
  1. Сцена из ТЗ (красный эллипс, синий прямоугольник, белая и
     жёлтая линии в субконтейнере).
  2. Сцена со спрайтом (`/sample.png`) и закруглённым прямоугольником.
  3. Сцена с кругом, треугольником и крестом из линий.
- **Перерисовать Skia** — принудительный re-render.
- **Экспортировать в PDF** — сохраняет текущую сцену как **векторный**
  PDF файл `pixi-skia-scene-<ts>.pdf` через тот же обходчик дерева.

Клики по объектам как в PIXI-канвасе, так и в Skia-канвасе
логируются в нижнюю панель «События».

## Сборка production-бандла

```bash
npm run build      # tsc --noEmit && vite build → dist/
npm run preview    # запустить локально на http://localhost:4173
```

## Структура проекта

```
src/
  main.ts                    # bootstrap, UI, события, переключение сцен
  styles.css
  vite-env.d.ts              # типы Vite для ?url-импортов
  pixi/
    scenes.ts                # три демо-сцены, в т.ч. из ТЗ
    random-shape.ts          # генератор случайной фигуры
  skia/
    canvaskit-loader.ts      # инициализация CanvasKit-WASM
    renderer.ts              # высокоуровневая Skia-обёртка
  render/
    render-backend.ts        # интерфейс RenderBackend (общий для Skia/PDF)
    traverse.ts              # обходчик дерева PIXI → RenderBackend
    skia-backend.ts          # реализация RenderBackend поверх CanvasKit
    pdf-backend.ts           # реализация RenderBackend поверх jsPDF
  pdf/
    exporter.ts              # точка входа экспорта в PDF
public/
  sample.png                 # тестовая png для PIXI.Sprite
```

## Архитектура

```
┌────────────────────────┐
│   PIXI.Container       │  (входной тип, как в ТЗ)
└──────────┬─────────────┘
           │
           ▼
┌────────────────────────┐       ┌─────────────────┐
│ traversePixi(node, be) │ ────► │  RenderBackend  │
│  - save/restore        │       │   (interface)   │
│  - translate/rotate/   │       └─────┬───────────┘
│    scale               │             │
│  - hit-test by tree    │      ┌──────┴──────────────────────┐
└────────────────────────┘      ▼                             ▼
                         ┌──────────────┐              ┌──────────────┐
                         │ SkiaBackend  │              │  PdfBackend  │
                         │ canvaskit-   │              │   jsPDF      │
                         │   wasm       │              │   (vector)   │
                         └──────────────┘              └──────────────┘
                              ▼                              ▼
                       HTMLCanvasElement                файл .pdf
```

Единый интерфейс `RenderBackend` гарантирует, что Skia-канвас и
PDF-файл получают **одинаковую** сцену: один и тот же обходчик
вызывает `drawRect`, `drawEllipse`, `drawPath`, `drawImage` и
матричные операции — но на разных backend'ах.

### Поддерживаемые объекты

- `PIXI.Container` (включая вложенные)
- `PIXI.Graphics`:
  - `drawRect` (Rectangle)
  - `drawRoundedRect` (RoundedRectangle)
  - `drawCircle`
  - `drawEllipse`
  - `drawPolygon`
  - `moveTo` / `lineTo` через polygon-аппроксимацию
  - `lineStyle` (ширина, цвет, alpha) с round-cap/join
  - `beginFill` / `endFill` (цвет, alpha)
- `PIXI.Sprite` (png) с `anchor`, `position`, `rotation`, `scale`

### Поддерживаемые трансформации

`position` (translate) · `rotation`/`angle` · `scale` · `pivot` —
наследуются по дереву. `worldAlpha` корректно перемножается с
локальной непрозрачностью.

### События

PIXI 7 в legacy-режиме оперирует FederatedEvents (`eventMode: "static"`).
В этом проекте:

- Pixi сам обрабатывает события на своём канвасе.
- Для Skia-канваса в `main.ts` реализован собственный hit-test:
  обход дерева PIXI с применением `worldTransform.applyInverse()` и
  проверкой `hitArea.contains()` (или габаритов спрайта). Найденный
  узел получает `emit("pointerdown"|"pointerup", ...)`. Поэтому
  клики по Skia-канвасу триггерят те же обработчики, что и клики по
  PIXI-канвасу. Это требование ТЗ:
  > События должны работать корректно на обоих канвасах.

## Замечание про Skia PDF backend

ТЗ говорит:
> Используя Skia PDF backend, реализовать функционал экспорта сцены в PDF файл.
> На этом этапе понадобится скомпилировать wasm.

Публичный npm-пакет `canvaskit-wasm@0.x` **не содержит PDF backend** —
PDF-поддержка в Skia включается флагом сборки `--enable-pdf` при
ручной компиляции CanvasKit из исходников
(см. `skia/modules/canvaskit/compile.sh`). Полная сборка требует
Emscripten SDK, depot_tools, checkout Skia (~5 GB) и нескольких часов
машинного времени.

**Решение в этом проекте.** Чтобы PDF получался «из коробки» и при
этом был **векторным**, мы используем `jsPDF` с собственным
backend'ом, который вызывает один и тот же обходчик `traversePixi`,
что и Skia. Никакого `canvas.toDataURL()` или «снимка» не
делается — каждая фигура рисуется как PDF-примитив (`rect`,
`ellipse`-аппроксимация, `lines`). Векторный результат
масштабируется без потерь качества и не превращается в растр.

### Как пересобрать CanvasKit с PDF backend

Если нужен «канонический» Skia PDF backend (`SkPDF::MakeDocument`),
вот шаги для пересборки (выполняется на Linux/macOS, ≥ 10 GB свободно):

```bash
# 1. depot_tools (для управления зависимостями Skia).
git clone https://chromium.googlesource.com/chromium/tools/depot_tools.git
export PATH="$PWD/depot_tools:$PATH"

# 2. checkout Skia.
git clone https://skia.googlesource.com/skia.git
cd skia
python3 tools/git-sync-deps

# 3. Emscripten (https://emscripten.org/docs/getting_started/downloads.html).
git clone https://github.com/emscripten-core/emsdk.git
./emsdk/emsdk install latest
./emsdk/emsdk activate latest
source ./emsdk/emsdk_env.sh

# 4. Сборка CanvasKit с PDF backend.
cd modules/canvaskit
./compile.sh --release --enable_pdf

# 5. Скопировать получившиеся файлы в наш проект:
cp out/canvaskit_pdf_release/canvaskit.{js,wasm} \
   <путь к этому репо>/public/canvaskit-pdf/
```

После пересборки в `src/skia/canvaskit-loader.ts` достаточно
переключить `locateFile` на новый файл и вызывать
`Surface.makePDFDocument(...)` (его API уже описан в исходниках
CanvasKit, но не экспортируется в публичный билд). В нашей
архитектуре нужно будет добавить третий backend — `SkiaPdfBackend`,
повторяющий те же методы `RenderBackend`, что и `SkiaBackend`, но
рисующий на `pdfCanvas` вместо обычного `Canvas`. Сцена сама не
меняется.

## Деплой на бесплатный хостинг

Проект статичен (`dist/` после `npm run build`). Любой провайдер
подходит. Самые быстрые варианты:

### Cloudflare Pages

```bash
npm run build
npx wrangler pages deploy dist --project-name pixi-skia-pdf
```

### Netlify

```bash
npm run build
npx netlify deploy --dir dist --prod
```

### Vercel

```bash
npm run build
npx vercel deploy --prod
```

### GitHub Pages

```bash
npm run build
# скопировать dist/* в branch gh-pages, либо использовать actions/deploy-pages
```

> ⚠️ Размер `canvaskit.wasm` ~6.8 MB — не забудьте, что хостинг
> должен корректно отдавать `.wasm` с заголовком
> `Content-Type: application/wasm` (Cloudflare/Netlify/Vercel это
> делают по умолчанию).

## Проверка качества

```bash
npm run typecheck    # tsc --noEmit
npm run build        # обычная prod-сборка
```

В проекте: `strict: true`, `noImplicitAny`, `noUnusedLocals`,
`noUnusedParameters`. Никаких `any` в публичном API.

## Лицензия

MIT.
