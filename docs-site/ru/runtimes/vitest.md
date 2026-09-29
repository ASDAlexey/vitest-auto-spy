---
title: Vitest
description: Как работать с vitest-auto-spy на Vitest без настройки, что положить в setup-файл и что делать с Vitest 5, isolate false, шардированием и browser mode.
---

# Vitest

На Vitest вы импортируете `vitest-auto-spy` и пишете тест. Настраивать ничего не нужно: импорт сам
подключает библиотеку к мокам Vitest. Эта страница пригодится, если проект работает на Vitest и вам нужна
первая спека, setup-файл или ответ на вопрос именно про Vitest.

```ts
// user.service.ts: export class UserService { getName(id: number): string { … } }
// greeter.ts:      export class Greeter { constructor(private users: UserService) {} greet(id: number) { … } }
import { beforeEach, describe, expect, it } from 'vitest';
import { type Spy, createSpyFromClass } from 'vitest-auto-spy';

import { Greeter } from './greeter';
import { UserService } from './user.service';

describe('Greeter', () => {
  let users: Spy<UserService>;
  let greeter: Greeter;

  beforeEach(() => {
    users = createSpyFromClass(UserService); // теперь каждый метод — спай
    greeter = new Greeter(users);
  });

  it('greets the name the service returns', () => {
    users.getName.calledWith(1).mockReturnValue('Ada');

    expect(greeter.greet(1)).toBe('Hello, Ada!');
    expect(users.getName).toHaveBeenCalledWith(1);
  });
});
```

_Спай_ — подставная функция: она записывает каждый вызов и возвращает то, что вы ей задали.
`createSpyFromClass` читает класс и отдаёт объект, в котором каждый метод — спай. Родные методы моков
Vitest (`mockReturnValue`, `mock.calls`, `toHaveBeenCalledWith`) работают на нём как обычно.
`calledWith(1)` задаёт ответ только для этого аргумента; вызов с любым другим аргументом вернёт
`undefined`. Другие такие хелперы — на странице [Управляющие хелперы](/ru/core/control-helpers).

Этот пример — вся спека целиком: без setup-файла, без плагина, без правок в `vitest.config.ts`. Для
Angular импортируйте из `vitest-auto-spy/angular`, см. [Подпуть для Angular](#the-angular-subpath).

## Что относится к setup-файлу {#what-belongs-in-the-setup-file}

Setup-файл необязателен. Две вещи действуют на весь прогон, поэтому их место там, а не в каждой спеке:

```ts
// vitest.setup.ts
import 'vitest-auto-spy/rxjs';

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

- **`import 'vitest-auto-spy/rxjs'`** включает хелперы для Observable (`nextWith`,
  `observablePropsToSpyOn`) во всех спеках. Нужен установленный `rxjs`. Без этой строки первый же
  `nextWith` бросит ошибку, в которой назван этот импорт. См. [RxJS](/ru/runtimes/rxjs).
- **[`setupAutoSpy()`](/ru/utilities/setup)** по умолчанию делает две вещи:
  - после каждого теста откатывает свойства, подменённые через `mockReadonlyProp` и другие хелперы
    `mock*Prop`, чтобы подмена не утекла в следующий тест;
  - останавливает прогон, если в `node_modules` две копии `vitest-auto-spy`.

  Остальные проверки — опции, которые вы включаете сами, например
  `setupAutoSpy({ strayTimers: true, restoreMocks: true })`. Полный список — на странице
  [Setup](/ru/utilities/setup).

В Angular-проектах часто добавляют третью строку — `registerSignalMatchers()` из
`vitest-auto-spy/angular/matchers` для [матчеров сигналов](/ru/adapters/angular), например
`toHaveSignalValue`.

## Vitest 5 {#vitest-5}

**Одна установка работает с Vitest от 2.1 до 5.x.** Диапазон peer-зависимости — `>=2.1.0`. Отдельного
мажора, тега `@next` или вторых типов для Vitest 5 нет. В монорепозитории, где одно приложение на
Vitest 4, а другое на Vitest 5, стоит одна и та же версия `vitest-auto-spy`, и спека переносится между
ними без правок.

**Уже учтено.** Два изменения в Vitest 5 касаются библиотек спаев, и библиотека учитывает оба:

- **`vi.clearAllMocks()` и `clearMocks: true`** очищают спаи этой библиотеки так же, как `vi.fn()`.
- **Типы матчеров.** В Vitest 5 интерфейс `Matchers<T>` стал `Matchers<R, T>`. Матчеры из пакета
  (`toHaveFocus`, `toHaveSignalValue`, `toBeLoading`, `toHaveResourceValue`, `toHaveResourceError`,
  `toHaveDirectiveApplied` и набор для jasmine) проходят проверку типов на обеих версиях. Подключать
  лишний `.d.ts` не нужно.

Насколько быстрее работает Vitest 5, см.
[Производительность → Vitest 5 под Angular unit-test builder](../core/performance#vitest-5-under-the-angular-unit-test-builder).

**Может потребовать правок у вас.** Два других изменения Vitest 5 могут задеть ваши спеки. Они
описаны в двух следующих разделах.

### Единственное, что всё ещё может сломать ваши спеки {#the-one-thing-that-can-still-break-your-specs}

В Vitest 5 `clearMocks` включён по умолчанию, и `vi.clearAllMocks()` выполняется перед каждым тестом.
Это изменение самого Vitest, а не библиотеки. Оно ломает один приём: тест проверяет вызов, сделанный в
_предыдущем_ тесте или в `beforeAll`. Теперь такой тест видит ноль вызовов.

Считайте такой вызов в обычной переменной, а не по истории спая:

```ts
let initCalls = 0;
const init = vi.fn(() => {
  initCalls += 1;
});

beforeAll(() => {
  install({ init }); // install: ваш собственный код под тестом
});

it('asked once for the whole file', () => {
  expect(initCalls).toBe(1); // а не expect(init).toHaveBeenCalledTimes(1)
});
```

Если спеки трогать не хочется, поставьте `clearMocks: false` в `vitest.config.ts` — вернётся поведение
Vitest 4.

### Единственная возможность, ради которой нужно поменять строчку {#the-one-feature-that-needs-a-line-changed}

Это касается вас, только если вы используете `setupAutoSpy({ pruneMockRegistry: true })`.

_Долгоживущий мок_ создаётся один раз в общем файле-фикстуре, и им пользуются многие спеки. Опция
запоминает реализацию каждого такого мока. Если случайный `vi.resetAllMocks()` опустошит мок, опция
вернёт реализацию. На Vitest 4 опция находит долгоживущие моки сама. На Vitest 5 не может: пометьте
каждый такой мок через `keepMockRegistered`, иначе после сброса он останется пустым. Пометка работает на любой версии Vitest:

```ts
// fixtures/logger.mock.ts: его импортируют многие спеки
import { vi } from 'vitest';
import { keepMockRegistered } from 'vitest-auto-spy/setup';

export const logger = { channel: keepMockRegistered(vi.fn().mockReturnThis()), info: vi.fn() };
```

## Изоляция {#isolation}

По умолчанию Vitest запускает каждый файл спеки в чистом окружении. Оставшийся патч свойства или спай
в переменной уровня модуля исчезают вместе с файлом.

Изоляцию можно выключить ради скорости: `isolate: false` в `vitest.config.ts`. Тогда то, что оставил
один файл, достаётся следующему. `setupAutoSpy()` по умолчанию откатывает подменённые свойства.
Для остального включите `restoreMocks: true` и `strayTimers: true`. Сам пакет гоняет свои тесты в
CI в обоих режимах.

```ts
// vitest.config.ts: режим, в котором нужна осторожность
export default defineConfig({
  test: {
    isolate: false,
    setupFiles: ['./vitest.setup.ts'], // теперь делает настоящую работу
  },
});
```

Какие проверки стоит включить в этом режиме, см. [Setup](/ru/utilities/setup).

При `isolate: false` иначе ведут себя ещё три вещи:

- **С плагином Analog укажите пул явно.** `@analogjs/vite-plugin-angular` по умолчанию ставит
  `test.pool` в `vmThreads`. VM-пул даёт каждому файлу свежий контекст, что бы ни говорил `isolate`,
  так что `isolate: false` тогда ничего не делит. Задайте `pool: 'threads'` (или `'forks'`) сами.
- **`vi.resetModules()` сбрасывает и `TestBed`.** Он заново загружает `@angular/core/testing` для
  каждого следующего файла воркера. `setupTestBed()` из Analog запоминает в `globalThis`, что уже
  выполнился, поэтому новую копию пропускает, и эти файлы падают с
  `Cannot read properties of null (reading 'ngModule')`. В setup-файле инициализируйте `TestBed`
  заново, когда `getTestBed().platform` равен `null`, или уберите `vi.resetModules()`. См.
  [Две копии `@angular/core/testing`](/ru/adapters/angular-troubleshooting#two-copies-of-angular-core-testing).
- **`vi.mock` действует только на модули, загруженные после него.** Модуль, который уже импортировал
  предыдущий файл, остаётся со своей настоящей зависимостью. Спека, которая его мокает, берёт свежий
  граф модулей через `vi.hoisted(() => vi.resetModules())` и сбрасывает его в
  `afterAll(() => vi.resetModules())`.

### Общий патч `TestBed` переживает файл, который его попросил {#a-shared-testbed-patch-outlives-the-file-that-asked-for-it}

**Симптом:** с `isolate: false` спеки локально проходят, а в CI падают с `NG0201: No provider found` в
файлах, которые никто не менял.

**Причина:** setup-файл один раз на воркер патчит `TestBed.configureTestingModule`, чтобы добавить
провайдер. С `isolate: false` патч остаётся для всех следующих файлов этого воркера. Спеки, которые
этот провайдер не объявляли, всё равно проходят: его добавил сосед. В CI прогон обычно изолирован (прогон с
покрытием включает изоляцию), и там эти спеки падают.

**Что делать:** прежде чем доверять общему патчу `TestBed`, один раз прогоните все тесты с изоляцией.
Объявляйте провайдер в каждой спеке, которой он нужен.

### Падение на этапе загрузки записывается на каждый файл воркера {#a-load-time-failure-is-reported-against-every-file-in-the-worker}

**Симптом:** прогон показывает много упавших _файлов_ и ноль упавших _тестов_, а список меняется от
прогона к прогону.

**Причина:** один файл бросает ошибку, пока загружаются его импорты. Это убивает воркер, и Vitest
помечает упавшими все файлы, которые воркер выполнял. Число зависит от того, какие файлы оказались в
том же воркере. Один и тот же неизменённый проект за четыре прогона показал 0, 95, 104 и 151 упавший
файл, и ни один файл не попал во все четыре списка.

Vitest виновника не называет. Vitest 4 печатает ошибку один раз, без стека и без имени модуля. Репортер
`json` показывает то же голое сообщение с `assertionResults: []`.

**Что делать:**

> Чините только файлы, которые упали на **собственных** проверках, и запускайте снова.

Остальные файлы в списке — случайные соседи. Следующий прогон покажет, какие падения настоящие.

## Шардирование в CI {#sharding-in-ci}

Чтобы разделить большой набор тестов между машинами CI, нужны три флага Vitest:

- `--shard=<index>/<count>` выбирает файлы для каждой машины.
- `--reporter=blob` сохраняет результаты каждой машины в файл (_блоб_).
- `--merge-reports` сводит все блобы в один отчёт и одну карту покрытия.

Vitest делит тесты по файлам, и `setupAutoSpy()` тоже работает пофайлово. При шардировании никакие
настройки этого пакета менять не нужно.

**Пороги покрытия проверяйте только в сводной джобе.** Каждый шард покрывает лишь свои файлы. Набор со
100 % покрытия на шарде 1 из 2 показывает 50 %, и порог валит шард. Отключайте пороги, когда в команде
есть `--shard`:

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

const sharded = process.argv.some((arg) => arg.startsWith('--shard'));

export default defineConfig({
  test: {
    coverage: {
      enabled: true,
      provider: 'istanbul',
      thresholds: sharded ? undefined : { lines: 90, branches: 90, functions: 90, statements: 90 },
    },
  },
});
```

```yaml
# .github/workflows/test.yml
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        shard: [1, 2, 3, 4]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: npm }
      - run: npm ci
      - run: npx vitest run --shard=${{ matrix.shard }}/4 --reporter=default --reporter=blob
      - uses: actions/upload-artifact@v4
        if: ${{ !cancelled() }}
        with:
          name: blob-${{ matrix.shard }}
          path: .vitest/blob
          include-hidden-files: true
          retention-days: 1

  merge:
    needs: test
    if: ${{ !cancelled() }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: npm }
      - run: npm ci
      - uses: actions/download-artifact@v4
        with:
          pattern: blob-*
          path: .vitest/blob
          merge-multiple: true
      - run: npx vitest --merge-reports --reporter=default
```

Зачем нужна каждая строка (сверено с Vitest 5.0):

| Строка                                         | Что будет без неё                                                                                                                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `path: .vitest/blob`                           | Vitest 5 пишет блобы сюда, и `--merge-reports` читает их отсюда. Vitest 4 писал в `.vitest-reports/`; старый workflow выгрузит пустую папку.                                    |
| `include-hidden-files: true`                   | `.vitest` начинается с точки, `upload-artifact` её пропускает, и сводной джобе нечего сводить.                                                                                  |
| `--reporter=default` рядом с `--reporter=blob` | в логе шарда будет только путь к блобу, без результатов тестов.                                                                                                                 |
| <code v-pre>if: ${{ !cancelled() }}</code>     | упавший шард ничего не выгрузит, и в сводном отчёте вместо падения будет дыра.                                                                                                  |
| `npm ci` в сводной джобе                       | `--merge-reports` не запускает тесты, но загружает конфиг и провайдер покрытия. Блобы от другой версии Vitest он не принимает, поэтому все джобы ставятся из одного lock-файла. |

Сделайте сводную джобу обязательной. Она падает, если в любом шарде упал тест или не добран порог.

## Browser mode: экспорты модулей только для чтения {#browser-mode-module-exports-are-read-only}

**Симптом:** после перехода на [browser mode](https://vitest.dev/guide/browser/) спека, которая была
зелёной под jsdom или happy-dom, падает на первом спае экспорта:

```text
Cannot spy on export "load". Module namespace is not configurable in ESM.
```

**Причина:** `vi.spyOn(api, 'load')` для `import * as api from './api'` патчит экспорты модуля. В Node
Vitest загружает модули сам и это разрешает. В браузере модули загружаются нативно, и их экспорты
запечатаны. Angular-проекты сталкиваются с этим, когда включают опцию `browsers` у
`@angular/build:unit-test`.

**Что делать:** подменяйте класс, а не экспорт модуля. Ни один из этих способов не патчит экспорт
модуля, поэтому в browser mode они работают без изменений:

- `createSpyFromClass(Api)` читает `Api.prototype` и возвращает новый объект.
- `provideAutoSpy(Api)` отдаёт этот объект в DI Angular.
- `vi.spyOn(Api.prototype, 'load')` патчит прототип, а это обычный объект.

Для обычной функции, экспортированной из модуля, используйте `vi.mock('./api', { spy: true })` из
Vitest. Реальные реализации остаются, а каждый экспорт становится спаем. Затем
[`assertMocked`](/ru/utilities/module-mocks) проверит, что мок применился.

**Кстати:** даже в Node спай на экспорт модуля не видит вызовов изнутри этого модуля.

## Подпуть для Angular {#the-angular-subpath}

Angular-проект импортирует из `vitest-auto-spy/angular`. Эта точка входа подключается к Vitest тем же способом
и добавляет хелперы для `TestBed`:

```ts
import { injectSpy, provideAutoSpy, renderShallow, stable } from 'vitest-auto-spy/angular';
```

Vitest должен уметь компилировать Angular: например, `@analogjs/vite-plugin-angular` плюс вызов
`setupTestBed()` или билдер `@angular/build:unit-test` из Angular CLI.

**Частая ошибка:** с `@angular/build` 22.2 пакеты Analog старше 2.7.5 роняют прогон на старте с
`TypeError: cache.has is not a function`. Обновите Analog до 2.7.5 или новее;
[`doctor` об этом сообщает](/ru/utilities/cli#analog-behind-angular-build).

Дальше: [Angular](/ru/adapters/angular) и [Angular на Bun](/ru/runtimes/bun-angular) — тот же набор
тестов под `bun test`.

## Подробнее {#in-depth}

**Как библиотека подключается к Vitest.** Ядро не зависит от тест-раннера. Импорт `vitest-auto-spy`
регистрирует _адаптер раннера_ — небольшую прослойку между библиотекой и моками раннера. На Vitest
библиотека строит собственные спаи и регистрирует их в Vitest, поэтому `vi.clearAllMocks()`,
`mock.calls` и `toHaveBeenCalledWith` работают с ними как с моками Vitest. У других раннеров свои точки входа: [Bun](/ru/runtimes/bun),
[node:test](/ru/runtimes/node), [Rstest](/ru/runtimes/rstest). Хелперы библиотеки (`calledWith`,
`resolveWith`, `nextWith`) везде ведут себя одинаково, а родные методы моков остаются методами раннера.

**Почему `clearAllMocks` очищает эти спаи и на Vitest 5.** Vitest 5 хранит зарегистрированные моки за
`WeakRef` и очищает только те, что вызывались с прошлой очистки. Движок спаев, отличный от `vi.fn()`,
должен сам зарегистрироваться, чтобы очистка его нашла. Собственный движок библиотеки это делает.

**Почему матчеры проходят проверку типов на обеих версиях.** TypeScript не сливает объявления с разным
списком параметров типа. Поэтому матчеры из пакета объявлены на `Assertion` из Chai, у которого
параметров типа нет ни в одной версии.
