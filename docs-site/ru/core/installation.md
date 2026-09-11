---
title: Установка
description: Поставьте vitest-auto-spy, выберите точку входа под свой раннер и подключите её к Vitest, Bun, node:test или Rstest.
---

# Установка

```bash
npm i -D vitest-auto-spy
```

::: tip Имя во множественном числе — это алиас
[`vitest-auto-spies`](https://www.npmjs.com/package/vitest-auto-spies) — тонкий пакет-алиас, который
реэкспортирует этот, точка входа в точку входа: опечатка ставит тот же самый код. Предпочитайте имя
в единственном числе; алиас генерируется из него и всегда только следует за ним.
:::

Все peer-зависимости **предоставляет ваш проект**; `rxjs` и `@angular/core` **необязательны** —
ставьте их только под соответствующую точку входа. У самого пакета **ноль рантайм-зависимостей**.

| Peer            | Нужен для                                                                        | Опционален? |
| --------------- | -------------------------------------------------------------------------------- | ----------- |
| `vitest`        | раннер по умолчанию                                                              | нет         |
| `rxjs`          | спаев за observable в `vitest-auto-spy/rxjs` — `>=7`, без верхней границы (rxjs 8 тоже) | да  |
| `@angular/core` | хелперов `vitest-auto-spy/angular` и `vitest-auto-spy/bun-angular`               | да          |
| `@angular/router` | только `vitest-auto-spy/angular-router` — `>=20`                                 | да          |

| Инструмент | Минимум                                                              |
| ---------- | -------------------------------------------------------------------- |
| Node.js    | ≥ 22 — у 18 и 20 закончилась поддержка; CI гоняет 22, 24 и 26        |
| Vitest     | ≥ 2.1                                                                |
| Bun        | ≥ 1.4 для `vitest-auto-spy/bun-angular`; для `/bun` — любой свежий Bun |
| TypeScript | ≥ 4.7 для типизированных хелперов (чистый JS тоже работает, просто без типов) |

Vitest **≥ 2.1** — потому что типизированная поверхность `spy.method.mock.settledResults` это
собственный тип `Mock` из Vitest, а `settledResults` появился в `@vitest/spy` только в 2.0, и 2.1 —
та версия, на которой линейка 2.x реально стоит. Сами рантайм-хелперы по-прежнему работают и на более
старом Vitest (`settledResults` библиотека полифиллит для `bun:test` и `node:test` в любом случае),
но типы там уже не сходятся, поэтому диапазон перестал на них претендовать.

Node **≥ 22** — это нижняя граница. У Node 18 и 20 закончилась поддержка, и каждому раннеру из
поддерживаемого диапазона уже нужно больше, чем любая из них: Vitest 4 объявляет
`^20.0.0 || ^22.0.0 || >=24.0.0`, а Vite 7, который он за собой тянет, ещё строже —
`^20.19.0 || >=22.12.0`; на Node 18 прогон падает с `TypeError: crypto.hash is not a function`,
не успев загрузить ни одной спеки. Vitest 5 закручивает гайки дальше, до
`^22.12.0 || ^24.0.0 || >=26.0.0`. CI гоняет Node 22, 24 и 26; публикуемый вывод по-прежнему
ES2022. Какую из трёх запускать на самом деле — и чего это стоит — измерено в
[Производительности → Какая версия Node](./performance#which-node-version).

Поставляется **как ESM с приложенными типами `.d.ts`**. Два подпути дополнительно везут сборку
CommonJS — `vitest-auto-spy/node` (сюита `node --test`, написанная на CJS) и
`vitest-auto-spy/eslint-plugin` (его подгружает CommonJS-конфиг `eslint.config.cjs`). Всё остальное
только ESM, потому что `require()` там никогда бы и не заработал: Vitest сам отказывается быть
затребованным (`Vitest cannot be imported in a CommonJS module using require()`), так что любая
точка входа поверх Vitest падала на первой же строке собственного `.cjs`. Тест-раннеры грузят ESM
нативно, так что ничего не потеряно, — а выброшенный недостижимый вывод сократил публикуемый пакет
примерно вдвое.

## Точки входа {#entry-points}

Библиотека поставляет фреймворконезависимое ядро плюс слои под рантаймы и фреймворки, так что
обычный проект на Node / Bun / React / Vue **не тянет в рантайм-бандл ни rxjs, ни Angular** — а
начиная с 4.0.0 и в свою TypeScript-программу тоже:

| Импорт                           | Даёт                                                                                                                                                                                                                                                                     | Тянет за собой              |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `vitest-auto-spy`                | `createSpyFromClass`, `createAutoMock`, `mockDeep`, `createMock`, `createFixture` / `createFixtureFactory`, `createFunctionSpy`, хелперы `mock*Prop`, [проверки observable](./observable-assertions), [мосты типов](./spy-typing), `errorHandler`, типы | `vitest`                    |
| `vitest-auto-spy/bun`            | то же ядро, но на моках `bun:test` из Bun                                                                                                                                                                                                                               | `bun:test`                  |
| `vitest-auto-spy/bun-angular`    | ангуляровский `TestBed` под `bun test` — DOM, JIT-резолв `templateUrl` и zoneless-окружение из одного preload, плюс ядро и ангуляровские хелперы                                                                                                                        | `bun:test`, `@angular/core` |
| `vitest-auto-spy/node`           | то же ядро, но на `mock.fn()` из `node:test`                                                                                                                                                                                                                            | `node:test`                 |
| `vitest-auto-spy/rstest`         | то же ядро, но на `rstest.fn()` / `rstest.spyOn()` из Rstest — [раннер Rstest](../runtimes/rstest)                                                                                                                                                                     | `@rstest/core`              |
| `vitest-auto-spy/rxjs`           | спаев за observable (`nextWith`, `nextWithValues`, `observablePropsToSpyOn`, …) и `createObservableWithValues`                                                                                                                                                        | `rxjs`                      |
| `vitest-auto-spy/dom-stubs`      | глобальные объекты, которые компонент создаёт себе сам, — `stubIntersectionObserver`, `stubResizeObserver`, `stubMutationObserver`, `stubObserver`, `stubMediaElement`, `stubAbortController` и билдеры записей. До 4.0.0 жили в корневой точке входа                    | —                           |
| `vitest-auto-spy/diagnostics`    | `compareTestRuns` / `summarizeTestRun` / `formatTestRunComparison` и `diffByField` — два отчёта, которых счётчик не даст. До 4.0.0 жили в корневой точке входа; чистые функции, так что этот подпуть импортируется и из простого Node-скрипта                            | —                           |
| `vitest-auto-spy/angular`        | `provideAutoSpy`, `injectSpy`, `renderShallow`, `createWithAutoSpies`, `stable`/`flushEffects`, матчеры сигналов, диагностику TestBed, хелперы `mock*Prop`                                                                                                              | `@angular/core`             |
| `vitest-auto-spy/nestjs`         | `provideAutoSpy`, `injectSpy` для `Test.createTestingModule`                                                                                                                                                                                                            | — (ваш `@nestjs/*`)         |
| `vitest-auto-spy/react`          | ядро, с естественным импортом для сюит на React Testing Library                                                                                                                                                                                                          | — (ваш `react`)             |
| `vitest-auto-spy/vue`            | `provideAutoSpy` для `global.provide` плюс спаи на стор Pinia                                                                                                                                                                                                      | — (ваши `vue`/`pinia`)      |
| `vitest-auto-spy/svelte`         | ядро, с естественным импортом для сюит на Svelte                                                                                                                                                                                                                        | — (ваш `svelte`)            |
| `vitest-auto-spy/console`        | [спаев за console](../utilities/console) — молчаливые типизированные спаи поверх глобального `console`                                                                                                                                                              | `vitest`                    |
| `vitest-auto-spy/jasmine`        | [прямую замену для сюиты на `jasmine-auto-spies`](../migrating-jasmine) — `.and` / `.calls` / `.withArgs` на каждом спае, `createSpyObj`, неймспейс `jasmine`, `registerJasmineMatchers`                                                                              | `vitest`                    |
| `vitest-auto-spy/setup`          | [`setupAutoSpy()`](../utilities/setup) и [`setupFakeTimers()`](../utilities/fake-timers)                                                                                                                                                                                 | `vitest`                    |
| `vitest-auto-spy/jasmine-compat` | один только `enableJasmineCompat()` — тот же слой `.and` / `.calls`, но без регистрации адаптера, для `bun test` и `node --test`                                                                                                                                        | — (ваш раннер)              |
| `vitest-auto-spy/observer-spy`   | [`subscribeSpyTo`](../runtimes/rxjs#subscribespyto-for-a-suite-arriving-with-observer-spy) — поверхность `@hirez_io/observer-spy`                                                                                                                                       | `rxjs`                      |
| `vitest-auto-spy/zone`           | [патч зоны](../utilities/zone), благодаря которому ангуляровский `fakeAsync` работает под Vitest                                                                                                                                                                        | `vitest`, `zone.js`         |
| `vitest-auto-spy/eslint-plugin`  | [правила линтера](../utilities/eslint-plugin), которые направляют сюиту на эти хелперы                                                                                                                                                                                  | — (ваш `eslint`)            |

Каждая точка входа регистрирует свой мок-адаптер **при импорте**, поэтому импортируйте ту, что
соответствует вашему тест-раннеру: если подмешать `vitest-auto-spy` в прогон `bun test`, останется
установленным не тот адаптер.

`vitest-auto-spy/jasmine` работает только на Vitest именно по этой причине — он регистрирует
адаптер Vitest, а значит импортирует `vitest`. На `bun test` и `node --test` вместо этого один раз
вызовите `enableJasmineCompat()` из `vitest-auto-spy/jasmine-compat` в файле настройки; он не
регистрирует никакого адаптера, поэтому уживается с той рантайм-точкой входа, которую вы уже
импортируете.

## Подключение {#wiring-it-up}

### Vitest {#vitest}

Никакой настройки: достаточно `import { createSpyFromClass } from 'vitest-auto-spy'` в спеке. Файл
настройки нужен только для того, что глобально по своей природе, — для слоя rxjs и гигиены прогона:

```ts
// vitest.setup.ts
import 'vitest-auto-spy/rxjs';
// один раз — включает спаев за observable везде
import { setupAutoSpy } from 'vitest-auto-spy/setup';

setupAutoSpy();
```

```ts
// vitest.config.ts
export default defineConfig({
  test: {
    setupFiles: ['./vitest.setup.ts'],
  },
});
```

`setupAutoSpy()` важнее всего, когда сюита делит одно окружение (`isolate: false`), — там
невосстановленный патч свойства переживает файл, который его поставил. См.
[Гигиена тестового прогона](../utilities/setup).

### Bun {#bun}

```ts
// user.test.ts
import { describe, expect, it } from 'bun:test';
import { createSpyFromClass } from 'vitest-auto-spy/bun';
```

```bash
bun test
```

Аналог файла настройки Vitest здесь — preload:

```toml
# bunfig.toml
[test]
preload = ["./bun-setup.ts"]
```

У Angular под `bun test` своя точка входа и свой preload — см.
[Angular на Bun](/ru/runtimes/bun-angular). Флаги `--isolate`, `--parallel`, `--shard`, `--changed`
и `--timings` из Bun 1.4 работают без изменений; что каждый из них означает для ваших спаев,
разобрано в [Bun](/ru/runtimes/bun).

### node:test {#node-test}

```ts
// user.test.ts
import { describe, it } from 'node:test';
import { createSpyFromClass } from 'vitest-auto-spy/node';
```

```bash
node --test
```

У `node:test` нет `expect`; берите к нему `node:assert` (или любую библиотеку проверок) — поверхность
спая от этого не меняется.

### Rstest {#rstest}

```bash
npm i -D @rstest/core vitest-auto-spy
```

```ts
// user.test.ts
import { describe, expect, it } from '@rstest/core';
import { createSpyFromClass } from 'vitest-auto-spy/rstest';
```

```bash
npx rstest run
```

С `globals: true` в конфиге глобалы `rs` / `rstest` заменяют первую строку импорта. Нативная поверхность
моков повторяет Vitest — `mock.calls` как голый массив, семейство `mockReturnValue`, — поэтому
[управляющие хелперы](./control-helpers) читаются так же, как на Vitest. См. [Rstest](/ru/runtimes/rstest).

## TypeScript {#typescript}

Типизированным хелперам не нужно ничего сверх обычной настройки. С **4.0.0** это касается и rxjs: ни
одно объявление, которое везёт этот пакет, не называет типов rxjs, поэтому проект без rxjs не ставит
его и не грузит в TypeScript-программу — 189 файлов `.d.ts` из rxjs, которые раньше приезжали с
каждым `import { createSpyFromClass }`. До 4.0.0 `rxjs` приходилось ставить для проверки типов даже
в сюите, которая ни разу не трогала observable.

Если вы _всё же_ пользуетесь слоем observable, `import 'vitest-auto-spy/rxjs'` должен стоять и в
файле, который попадает в этот `tsconfig`, и в рантайм-настройке: именно этот импорт делает
`returnSubject()` настоящим `Subject<T>` из rxjs, а не структурным `SubjectLike<T>`. См.
[Переход на 4.0](/ru/upgrading-4).

```jsonc
{
  "compilerOptions": {
    // "bundler" или "node16"/"nodenext" — что угодно, что понимает подпути в `exports`
    "moduleResolution": "bundler",
  },
}
```

`Spy<T>` — это **mapped type**: он отбрасывает члены `#private` и `private`, поэтому не присваивается
к `T`. Объявляйте переменную как `Spy<T>`, а не как `T`, либо соединяйте одно с другим через
[`asInstance` / `asSpy`](./spy-typing).
