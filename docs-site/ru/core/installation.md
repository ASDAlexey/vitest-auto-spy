---
title: Установка
description: Поставьте vitest-auto-spy, проверьте, что нужно проекту, и подключите библиотеку к Angular CLI, Vitest, Bun, node:test или Rstest.
---

# Установка

Поставьте пакет как dev-зависимость:

```bash
npm i -D vitest-auto-spy
```

На Vitest больше ничего не нужно: импортируйте `createSpyFromClass` в спеке, и всё работает. Своих
рантайм-зависимостей у пакета нет. Первую спеку проще всего написать по странице
[Начало работы](./introduction).

## Что нужно проекту {#what-you-need}

Пакеты ниже даёт ваш проект. Все они необязательные: ставьте пакет, только если пользуетесь точкой
входа, которой он нужен.

| Peer-зависимость            | Для чего                                                                       | Версия   |
| --------------------------- | ------------------------------------------------------------------------------ | -------- |
| `vitest`                    | точка входа по умолчанию `vitest-auto-spy` и все точки входа только под Vitest | `>=2.1`  |
| `rxjs`                      | спаи для Observable из `vitest-auto-spy/rxjs`; rxjs 8 тоже подходит            | `>=7.2`  |
| `@angular/core`             | `vitest-auto-spy/angular` и `vitest-auto-spy/bun-angular`                      | `>=20`   |
| `@angular/common`           | только `vitest-auto-spy/angular-http`                                          | `>=20`   |
| `@angular/router`           | только `vitest-auto-spy/angular-router`                                        | `>=20`   |
| `@angular/forms`            | только `vitest-auto-spy/signal-forms` (сигнальные формы есть с Angular 22)     | `>=20`   |
| `@angular/platform-browser` | матчеры директив из `vitest-auto-spy/angular/matchers` и preload для Bun       | `>=20`   |
| `@angular/compiler`         | `vitest-auto-spy/angular/matchers` и preload `vitest-auto-spy/bun-angular`     | `>=20`   |
| `@rstest/core`              | только `vitest-auto-spy/rstest`                                                | `>=0.11` |

| Инструмент | Минимум                                                               |
| ---------- | --------------------------------------------------------------------- |
| Node.js    | 22                                                                    |
| Vitest     | 2.1                                                                   |
| Angular    | 20 для точек входа Angular, 22 для `/signal-forms`                    |
| Bun        | 1.4 для `vitest-auto-spy/bun-angular`; для `/bun` — любой свежий      |
| TypeScript | 4.7 для типизированных хелперов; чистый JavaScript работает без типов |

Почему минимумы именно такие — на странице [Совместимость](./compatibility).

## Подключение {#wiring-it-up}

Выберите раздел под то, чем вы запускаете тесты. В конце каждого — команда запуска.

### Angular CLI (`ng test`) {#angular-cli-ng-test}

Проекты на билдере `@angular/build:unit-test` запускают Vitest командой `ng test`. `TestBed` билдер
настраивает сам, а `vitest` и `rxjs` в новом проекте Angular CLI уже есть. Setup-файл нужен только для
двух необязательных возможностей:

- **спаи для Observable**: `nextWith` и другие хелперы для методов, которые возвращают `Observable`;
- **проверки между тестами**: `setupAutoSpy()` откатывает глобальные значения, которые подменил тест,
  и сообщает, что тест не убрал за собой, например таймеры или вывод в консоль.

1. Создайте setup-файл:

   ```ts
   // src/test-setup.ts
   // спаи для Observable; уберите, если не нужны
   import 'vitest-auto-spy/rxjs';

   // проверки между тестами
   import { setupAutoSpy } from 'vitest-auto-spy/setup';

   setupAutoSpy();
   ```

2. Укажите его в цели `test`:

   ```jsonc
   // angular.json → projects → <ваше-приложение> → architect → test
   "test": {
     "builder": "@angular/build:unit-test",
     "options": {
       // оставьте опции, которые тут уже есть, и добавьте эту строку
       // путь — от корня воркспейса
       "setupFiles": ["src/test-setup.ts"]
     }
   }
   ```

3. Запустите тесты:

   ```bash
   ng test
   ```

- Не вызывайте в этом файле `TestBed.initTestEnvironment()`: билдер уже сделал это, и второй вызов
  бросит `Cannot set base providers because it has already been called`. (Редкий случай: если один
  файл служит и `ng test`, и обычному `vitest`, оберните этот вызов в проверку
  `isAngularUnitTestBuilder()` из `vitest-auto-spy/setup`.)
- Держите `import 'vitest-auto-spy/rxjs'` в setup-файле, а не в другом `.ts`. С `@angular/build` 22.2 прочие
  вспомогательные файлы билдер не компилирует, даже если они перечислены в `tsconfig.spec.json`.
  В `tsconfig` setup-файл добавлять не нужно.

Все проверки `setupAutoSpy()` и их значения по умолчанию — на странице
[Гигиена тестового прогона](../utilities/setup). Чтобы убедиться, что всё работает, запустите спеку
со страницы [Начало работы](./introduction). Как писать спеку с `provideAutoSpy` и
`injectSpy` в `TestBed`, показывает следующая страница, [Angular](../adapters/angular).

### Vitest {#vitest}

Настройка не нужна: достаточно `import { createSpyFromClass } from 'vitest-auto-spy'` в спеке.
Setup-файл добавляйте только для того, что глобально по природе: спаев для Observable и проверок
между тестами.

```ts
// vitest.setup.ts
// спаи для Observable, один раз на все спеки
import 'vitest-auto-spy/rxjs';

// проверки между тестами
import { setupAutoSpy } from 'vitest-auto-spy/setup';

setupAutoSpy();
```

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./vitest.setup.ts'],
  },
});
```

```bash
npx vitest
```

`setupAutoSpy()` важнее всего, когда файлы тестов делят одно окружение (`isolate: false`). Там
глобальное значение, которое забыли вернуть, протекает в следующий файл. Подробнее —
[Гигиена тестового прогона](../utilities/setup).

Angular на Vitest без `ng test` (например, с Vite-плагином Analog) требует вашего обычного
setup-файла для `TestBed`. Если после этого `injectSpy` говорит, что `TestBed` не инициализирован,
см. [Две копии тестового модуля Angular](#two-copies-of-the-angular-testing-module).

### Bun {#bun}

```ts
// user.test.ts
import { describe, expect, it } from 'bun:test';
import { createSpyFromClass } from 'vitest-auto-spy/bun';
```

```bash
bun test
```

Аналог setup-файла в Bun — preload:

```toml
# bunfig.toml
[test]
preload = ["./bun-setup.ts"]
```

У Angular под `bun test` своя точка входа и свой preload: см.
[Angular на Bun](/ru/runtimes/bun-angular). Флаги Bun `--isolate`, `--parallel`, `--shard`,
`--changed` и `--timings` работают без изменений; что каждый значит для ваших спаев, разобрано на
странице [Bun](/ru/runtimes/bun).

### node:test {#node-test}

```ts
// user.test.ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createSpyFromClass } from 'vitest-auto-spy/node';
```

```bash
node --test
```

В `node:test` нет `expect`. Проверяйте через `node:assert`, как выше, или любую библиотеку проверок;
спаи работают одинаково.

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

С `globals: true` в конфиге глобалы `rs` / `rstest` заменяют первую строку импорта. Моки Rstest
устроены как у Vitest (`mock.calls`, `mockReturnValue`), поэтому страница
[Управляющие хелперы](./control-helpers) подходит без изменений. См. [Rstest](/ru/runtimes/rstest).

## Точки входа {#entry-points}

Точка входа — путь импорта под ваш раннер или фреймворк. Импорт заодно связывает библиотеку с
мок-функцией этого раннера. Импортируйте ту, что подходит вашему раннеру: `vitest-auto-spy` в
прогоне `bun test` подключит не ту мок-функцию.

| Импорт                                | Что даёт                                                                                                                                                                                                                                                         | Что нужно                                                |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `vitest-auto-spy`                     | ядро: `createSpyFromClass`, `createAutoMock`, `mockDeep`, `createMock`, `createFixture` / `createFixtureFactory`, `createFunctionSpy`, хелперы `mock*Prop`, [проверки на Observable](./observable-assertions), [мосты типов](./spy-typing), `errorHandler`, типы | `vitest`                                                 |
| `vitest-auto-spy/bun`                 | то же ядро на моках `bun:test`                                                                                                                                                                                                                                   | `bun:test`                                               |
| `vitest-auto-spy/bun-angular`         | `TestBed` из Angular под `bun test`: DOM, загрузка `templateUrl` и zoneless-окружение из одного preload, плюс ядро и хелперы Angular                                                                                                                             | `bun:test`, `@angular/core`, `@angular/platform-browser` |
| `vitest-auto-spy/node`                | то же ядро на `mock.fn()` из `node:test`                                                                                                                                                                                                                         | `node:test`                                              |
| `vitest-auto-spy/rstest`              | то же ядро на `rstest.fn()` / `rstest.spyOn()` из Rstest; см. [Rstest](../runtimes/rstest)                                                                                                                                                                       | `@rstest/core`                                           |
| `vitest-auto-spy/rxjs`                | спаи для Observable (`nextWith`, `nextWithValues`, `observablePropsToSpyOn`, …) и `createObservableWithValues`                                                                                                                                                   | `rxjs`                                                   |
| `vitest-auto-spy/dom-stubs`           | заглушки браузерных глобалов, которые компонент создаёт сам: `stubIntersectionObserver`, `stubResizeObserver`, `stubMutationObserver`, `stubObserver`, `stubMediaElement`, `stubAbortController`, `stubAnimationFrame`, `stubElementRect` и билдеры записей      | —                                                        |
| `vitest-auto-spy/diagnostics`         | `compareTestRuns`, `summarizeTestRun`, `formatTestRunComparison` и `diffByField`; обычные функции, работают и из Node-скрипта                                                                                                                                    | —                                                        |
| `vitest-auto-spy/angular`             | `provideAutoSpy`, `injectSpy` и его тип `Spy<T>`, `renderShallow`, `createWithAutoSpies`, `stable` / `flushEffects`, хелперы `mock*Prop`                                                                                                                         | `@angular/core`                                          |
| `vitest-auto-spy/angular/diagnostics` | `enableAngularDiagnostics` и хелперы для замера времени `TestBed`                                                                                                                                                                                                | `@angular/core`                                          |
| `vitest-auto-spy/angular/doubles`     | подмены диалога Material и подмены `Window` / `Document`; при импорте подключает мок-функцию Vitest                                                                                                                                                              | `@angular/core`                                          |
| `vitest-auto-spy/angular/matchers`    | `registerDirectiveMatchers`, `registerResourceMatchers`, `registerSignalMatchers`; каждый вызывается один раз из setup-файла                                                                                                                                     | `@angular/core`, `@angular/platform-browser`             |
| `vitest-auto-spy/angular-http`        | [`httpResource()` и `HttpClient` в спеке](../adapters/angular-http): `provideHttpTesting`, `expectRequest`, `expectNoRequest`                                                                                                                                    | `@angular/common`, `@angular/core`                       |
| `vitest-auto-spy/angular-router`      | [`ActivatedRoute` и `Router`, у которых значения согласованы](../adapters/angular-router): `provideActivatedRoute`, `injectActivatedRoute`, `provideRouterDouble`                                                                                                | `@angular/router`, `@angular/core`, `rxjs`               |
| `vitest-auto-spy/signal-forms`        | [сигнальные формы Angular в спеке](../adapters/signal-forms): `createForm` и `registerFormMatchers()` для `toHaveFieldErrors`                                                                                                                                    | `@angular/forms`, `@angular/core`                        |
| `vitest-auto-spy/nestjs`              | `provideAutoSpy`, `injectSpy` для `Test.createTestingModule`                                                                                                                                                                                                     | — (ваш `@nestjs/*`)                                      |
| `vitest-auto-spy/react`               | ядро под именем, привычным для спек на React Testing Library                                                                                                                                                                                                     | — (ваш `react`)                                          |
| `vitest-auto-spy/vue`                 | `provideAutoSpy` для `global.provide` плюс спаи для сторов Pinia                                                                                                                                                                                                 | — (ваши `vue` / `pinia`)                                 |
| `vitest-auto-spy/svelte`              | ядро под именем, привычным для спек на Svelte                                                                                                                                                                                                                    | — (ваш `svelte`)                                         |
| `vitest-auto-spy/console`             | [спаи консоли](../utilities/console): тихие типизированные спаи поверх глобального `console`                                                                                                                                                                     | `vitest`                                                 |
| `vitest-auto-spy/jasmine`             | [API `jasmine-auto-spies`](../migrating-jasmine): `.and` / `.calls` / `.withArgs` на каждом спае, `createSpyObj`, пространство имён `jasmine`, `registerJasmineMatchers`                                                                                         | `vitest`                                                 |
| `vitest-auto-spy/jasmine-compat`      | только `enableJasmineCompat()`: тот же слой `.and` / `.calls` для `bun test` и `node --test`                                                                                                                                                                     | — (ваш раннер)                                           |
| `vitest-auto-spy/setup`               | [`setupAutoSpy()`](../utilities/setup) и [`setupFakeTimers()`](../utilities/fake-timers)                                                                                                                                                                         | `vitest`                                                 |
| `vitest-auto-spy/observer-spy`        | [`subscribeSpyTo`](../runtimes/rxjs#subscribespyto-for-a-suite-arriving-with-observer-spy), API `@hirez_io/observer-spy`                                                                                                                                         | `rxjs`                                                   |
| `vitest-auto-spy/zone`                | [патч зоны](../utilities/zone), с которым `fakeAsync` из Angular работает под Vitest                                                                                                                                                                             | `vitest`, `zone.js`                                      |
| `vitest-auto-spy/eslint-plugin`       | [правила линтера](../utilities/eslint-plugin), которые подсказывают спекам эти хелперы                                                                                                                                                                           | — (ваш `eslint`)                                         |
| `vitest-auto-spy/perf-reporter`       | репортер Vitest, которым пользуется [`npx vitest-auto-spy perf`](../utilities/cli), для списка `reporters`                                                                                                                                                       | `vitest`                                                 |

Проект без Angular и rxjs не загружает ни того, ни другого: они приходят только с точками входа,
которые их называют.

`vitest-auto-spy/angular` дополняет корневую точку входа, а не заменяет её. Из корневых экспортов она
повторяет только тип `Spy<T>`, хелперы `mock*Prop` вместе с `restoreMockedProps` и
`countMockedProps`, семейство `expectEmission` и `registerAutoSpyDefaults` / `clearAutoSpyDefaults`.
`createSpyFromClass`, `createMock`, `createAutoMock`, `asInstance` и остальное берутся из
`vitest-auto-spy`. Поэтому Angular-спека, которой они нужны, импортирует из обеих:

```ts
import { createAutoMock } from 'vitest-auto-spy';
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/angular';
```

`vitest-auto-spy/bun-angular` устроена иначе: это точка входа раннера, и она повторяет всё ядро.

`vitest-auto-spy/jasmine` работает только на Vitest, потому что импортирует `vitest`. На `bun test` и
`node --test` вместо него один раз вызовите `enableJasmineCompat()` из
`vitest-auto-spy/jasmine-compat` в setup-файле. Он работает с той точкой входа раннера, которую вы
уже импортируете.

**Частая ошибка:** спай, созданный до импорта любой точки входа, падает с
`No mock adapter registered`. Сообщение называет раннер, который библиотека распознала, и импорт,
который нужно добавить.

## TypeScript {#typescript}

Типизированным хелперам не нужно ничего особенного. В `tsconfig.json` нужен режим разрешения
модулей, который понимает подпути вроде `vitest-auto-spy/angular`:

```jsonc
{
  "compilerOptions": {
    // "bundler", "node16" или "nodenext"
    "moduleResolution": "bundler",
  },
}
```

Если вы подменяете Observable, TypeScript должен видеть файл с `import 'vitest-auto-spy/rxjs'`,
иначе хелперы для Observable типизированы неточно. Setup-файл из раздела
[Подключение](#wiring-it-up) уже подходит: его компилируют и `ng test`, и Vitest.

`Spy<T>` нельзя передать туда, где ждут `T`, потому что в нём нет членов `private` и `#private`. Объявляйте
переменную как `Spy<T>` или переводите одно в другое через [`asInstance` / `asSpy`](./spy-typing).

## Если что-то не работает {#troubleshooting}

### Две копии тестового модуля Angular {#two-copies-of-the-angular-testing-module}

**Симптом:** `injectSpy` падает с `Need to call TestBed.initTestEnvironment() first`, хотя ваш
setup-файл инициализирует `TestBed`. Другой вид той же ошибки —
`Cannot read properties of null (reading 'ngModule')`.

**Причина:** Vitest загрузил `vitest-auto-spy` из `node_modules` как есть, не обрабатывая. Тогда Node
загрузила вторую копию `@angular/core/testing`, и пакет обращается к копии, которую никто не
инициализировал. Чаще всего так бывает с Vite-плагином Analog, а не с `ng test`.

**Что сделать:** попросите Vitest обрабатывать пакет вместе с вашим кодом, чтобы копия была одна:

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { server: { deps: { inline: ['vitest-auto-spy'] } } } });
```

`injectSpy` и `renderShallow` пишут эту подсказку в своей ошибке.
[`npx vitest-auto-spy doctor`](../utilities/cli#angular-testbed-split) находит такой конфиг ещё до
запуска тестов.
