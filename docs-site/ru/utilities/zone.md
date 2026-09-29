---
title: fakeAsync на Vitest
description: vitest-auto-spy/zone включает fakeAsync и waitForAsync из Angular на Vitest. Отдельный импорт, поэтому zoneless-проект его никогда не загружает.
---

# `fakeAsync` на Vitest

`vitest-auto-spy/zone` включает на Vitest `fakeAsync`, `tick()` и `waitForAsync` из Angular. Он
нужен, если Angular-проект работает на zone.js и каждый тест с `fakeAsync` падает с такой ошибкой:

```text
Error: Expected to be running in 'ProxyZone', but it was not found.
```

Работает с Angular 20 и новее. Zoneless-проекту эта точка входа не нужна. Остальная библиотека её не
импортирует, так что zone.js в такой проект не попадёт.

Поставьте пакет и добавьте один импорт в setup-файл тестов. С `ng test` (билдер Angular
`@angular/build:unit-test`) больше ничего не нужно:

```bash
npm install -D vitest-auto-spy
```

```ts
// src/test-setup.ts, указан в "setupFiles" цели (target) "test" в angular.json
import 'vitest-auto-spy/zone';
```

С обычным `vitest.config.ts` в setup-файле строк больше; см.
[С обычным `vitest.config.ts`](#with-a-plain-vitest-config-ts). После этого спеки с `fakeAsync`
работают как есть.

## Подключение {#set-it-up}

### С `ng test` (билдер unit-тестов Angular) {#with-ng-test-angular-s-unit-test-builder}

Если приложение работает на zone.js, билдер сам загружает `zone.js` и `zone.js/testing`. Он же
настраивает `TestBed`, DOM и компиляцию Angular. Одной строки в setup-файле выше достаточно: создайте
файл и добавьте его путь в опцию `setupFiles` цели (target) `test` в `angular.json`.

### С обычным `vitest.config.ts` {#with-a-plain-vitest-config-ts}

Обычный конфиг должен сделать то, что делает билдер. Нужны плагин, который компилирует компоненты
Angular (здесь `@analogjs/vite-plugin-angular`), DOM (`jsdom`), `globals: true` и setup-файл:

```bash
npm install -D vitest-auto-spy @analogjs/vite-plugin-angular jsdom
```

```ts
// vitest.config.ts
import angular from '@analogjs/vite-plugin-angular';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [angular()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
});
```

Setup-файл загружает сначала zone.js, потом `zone.js/testing`, потом `vitest-auto-spy/zone`. Затем он
инициализирует окружение `TestBed`. Порядок первых трёх строк важен: `vitest-auto-spy/zone` нужны уже загруженные zone.js и
`zone.js/testing`.

```ts
// src/test-setup.ts
import 'zone.js';
import 'zone.js/testing';
import 'vitest-auto-spy/zone';

import { getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';

getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
```

`globals: true` обязателен: патч заменяет глобальные `it` и хуки (см. [Требования](#requirements)).
Чтобы TypeScript знал глобальные `describe` и `it`, добавьте `"types": ["vitest/globals"]` в
`compilerOptions` файла `tsconfig.spec.json`.

## Спека с `fakeAsync` {#write-a-fakeasync-spec}

В самой спеке патч никак не упоминается. Пишите её так, как показано в документации Angular.
Используйте глобальные `it`, `test` и хуки (`beforeEach` и остальные), а не импортированные из
`'vitest'`, иначе патч до них не доберётся. Импортировать `expect` или `vi` из `'vitest'` можно.

```ts
import { Component, signal } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';

@Component({ selector: 'app-cart-badge', template: '{{ count() }}' })
class CartBadgeComponent {
  readonly count = signal(0);

  constructor() {
    setTimeout(() => this.count.set(3), 200);
  }
}

describe('CartBadgeComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [CartBadgeComponent] });
  });

  it('shows the count after the delay', fakeAsync(() => {
    const fixture = TestBed.createComponent(CartBadgeComponent);

    tick(200);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toBe('3');
  }));
});
```

## Что он делает {#what-it-does}

`fakeAsync` работает только внутри особой зоны zone.js — прокси-зоны (`ProxyZoneSpec` из
`zone.js/testing`). Патч выполняет в ней тело каждого теста и каждого хука, а `fakeAsync` вставляет в эту зону свои
фейковые таймеры.

Патч оборачивает глобальные `it`, `test`, `beforeEach`, `afterEach`, `beforeAll` и `afterAll`. Их
модификаторы работают как раньше: `it.each`, `it.skip`, `it.only`, `it.todo`, `it.concurrent`,
`describe.skip`, `describe.only` и фикстуры `test.extend`.

Как патч при этом не ломает раннер — в разделе
[Как патч сохраняет раннер целым](#how-the-patch-keeps-the-runner-intact).

## Одна зона на прогон или по одной на колбэк {#one-zone-for-the-run-or-one-per-callback}

### `installProxyZonePatch(options?)` {#installproxyzonepatch-options}

Импорт `vitest-auto-spy/zone` уже ставит патч со `scope: 'shared'`. Вызывайте
`installProxyZonePatch()` сами, только чтобы выбрать другой режим:

```ts
// src/test-setup.ts
import 'zone.js';
import 'zone.js/testing';

import { installProxyZonePatch } from 'vitest-auto-spy/zone';

installProxyZonePatch({ scope: 'callback' });
```

Вызов заменяет общий патч, и повторный импорт точки входа не переключает его обратно. Второй вызов с
тем же `scope` ничего не меняет. Функция возвращает функцию, которая ставит на место то, что она
заменила.

| Опция   | Тип                      | По умолчанию | Смысл                                                                                  |
| ------- | ------------------------ | ------------ | -------------------------------------------------------------------------------------- |
| `scope` | `'shared' \| 'callback'` | `'shared'`   | `'shared'` — одна прокси-зона на все тесты; `'callback'` — своя на каждый тест или хук |

Используйте `'callback'` для спек с `test.concurrent`, которые вызывают `fakeAsync`.

Для чего задуманы два значения:

- **`'shared'`** — так делает собственный jasmine-патч Angular, и на это рассчитано большинство
  спек Angular. Компонент, созданный в `beforeEach`, часто запускает таймер в конструкторе. `tick()`
  внутри `fakeAsync`-теста должен этот таймер увидеть, значит, обоим нужна одна зона. Если зона своя
  у каждого колбэка, они окажутся в разных зонах, и тест будет ждать таймер, который никто не
  продвинет.
- **`'callback'`** даёт каждому телу теста и хука свою зону. Он задуман для `test.concurrent`: там
  два колбэка выполняются одновременно, и общая зона смешала бы их состояние.

## Требования {#requirements}

**Глобальные функции включены: `test: { globals: true }`.** Патч заменяет глобальные `it`, `test` и
хуки раннера. Если спека импортирует `it` из `'vitest'`, она получает исходную функцию, и патч её не
изменит.

**zone.js загружен раньше.** Эта точка входа сама zone.js не импортирует. Под
`@angular/build:unit-test` его загружает билдер. В остальных случаях импортируйте `zone.js` и
`zone.js/testing` в начале сетап-файла, до этой точки входа.

Если чего-то не хватает, патч бросает ошибку прямо из сетап-файла и говорит, что добавить:

| Текст ошибки начинается с                                                 | Что сделать                                                           |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `vitest-auto-spy/zone: globalThis.Zone is not there`                      | импортировать `zone.js` и `zone.js/testing` до `vitest-auto-spy/zone` |
| `vitest-auto-spy/zone: zone.js is loaded but Zone.ProxyZoneSpec is not`   | добавить `import 'zone.js/testing';` после `zone.js`                  |
| `vitest-auto-spy/zone: the runner globals (it, beforeEach, …) are not on` | задать `test: { globals: true }` в конфиге Vitest                     |

Полный текст первой ошибки:

```text
[vitest-auto-spy] vitest-auto-spy/zone: globalThis.Zone is not there, so there is nothing to patch — this entry does not import zone.js itself, so that a zoneless project never pulls it in.
Load it at the top of the setup file: `import 'zone.js'; import 'zone.js/testing';` (under @angular/build:unit-test the builder does this already).
Docs: https://asdalexey.github.io/vitest-auto-spy/utilities/zone#requirements
```

## `fakeAsync` и хелперы со своим таймаутом {#fakeasync-and-the-helpers-that-time-themselves-out}

Это важно, только если внутри `fakeAsync` вы используете проверки потоков из библиотеки ([хелперы
эмиссий](/ru/core/observable-assertions)) или её хелпер [`stable`](/ru/adapters/angular). Их таймауты
идут по реальному времени, и `tick()` их не сдвигает.

Такой хелпер ждёт значение не дольше своего таймаута, и этот таймаут — часть проверки. Если бы `tick()`
его сдвигал, перевод фейковых часов ради значения мог бы сначала исчерпать ожидание.

Всё, что планирует тестируемый код, по-прежнему идёт по фейковым часам: таймеры, промисы и
микрозадачи. Двигайте их, как обычно, через `tick()` и `flushMicrotasks()`.

## Подробнее {#in-depth}

Этот раздел не нужен, чтобы пользоваться точкой входа.

### Почему не `zone.js/plugins/vitest-patch` {#why-not-zone-js-plugins-vitest-patch}

`zone.js/testing` патчит три раннера: jasmine, mocha и jest. Vitest среди них нет.

В zone.js 0.16.2 (2026-05-06) есть собственный патч для Vitest — `zone.js/plugins/vitest-patch`. Но
сам он не подключается:

- `zone.js/testing` его не включает. В этом бандле лежат патчи для jasmine, mocha и jest, а слово
  `vitest` не встречается ни разу.
- `@angular/build:unit-test` во всех версиях с 20 по 22 добавляет в полифилы только
  `zone.js/testing`.
- Единственный пакет, который подключает патч побочным эффектом, — `@analogjs/vitest-angular`, через
  `…/setup-zone`. Проект, который переходит на нативный билдер, теряет этот патч вместе с Analog.

Некоторые руководства советуют подключить официальный плагин вручную. Например, ng-mocks в
инструкции по установке требует такой порядок: `zone.js`, затем `zone.js/testing`, затем
`zone.js/plugins/vitest-patch`. (У ng-mocks свой список проверенных сочетаний: Angular 20 / Vitest 3 / jsdom 26 только
zoneless и Angular 21 и 22 / Vitest 4 / jsdom 28 с zone.js или без. Это список ng-mocks, а не этой
точки входа.)

Если так сделать, вы получите поведение плагина из таблицы ниже. Замер на Vitest 4.1.9 и
zone.js 0.16.2, по одному файлу спеки на каждый API:

| В спеке                                 | Без плагина           | С `zone.js/plugins/vitest-patch`                                                                   |
| --------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------- |
| `it.skip` / `it.todo` / `it.concurrent` | попадают в отчёт      | **теста нет, а прогон завершается кодом 0**                                                        |
| `it.only`                               | выполняется только он | **этого теста нет; выполняется несфокусированный**                                                 |
| `it.each`                               | проходит              | **`TypeError: Cannot read properties of undefined (reading 'apply')`, ни одного теста не собрано** |
| `describe.skip`                         | пропускается          | **набор тестов выполняется**                                                                       |
| `describe.only`                         | выполняется только он | **выполняются все наборы тестов**                                                                  |
| `test.extend`                           | фикстуры работают     | **`TypeError: test.extend is not a function`**                                                     |
| `test: { globals: false }`              | —                     | ничего не патчит, ни о чём не предупреждает, каждый `fakeAsync` по-прежнему падает                 |

Причина в том, что плагин заменяет глобальные функции раннера обычными функциями и заново вешает на
них десять жёстко заданных имён. Поэтому `it.extend`, `it.fails` и `it.scoped` пропадают совсем.
`it.skip`, `it.only` и `it.todo` превращаются в фабрики: они возвращают функцию вместо того, чтобы
зарегистрировать тест. Плагин сохраняет `fn.length`, но не `fn.toString()`, а именно его Vitest
читает, чтобы найти фикстуры в деструктуризации.

Те же файлы спек под `vitest-auto-spy/zone` ведут себя в точности как прогон без патча.

Справедливости ради: простой `fakeAsync` в обычном `it` внутри обычного `describe` под официальным
плагином работает. Свою задачу он решает — для спек, где нет ни одного модификатора теста.

### Как патч сохраняет раннер целым {#how-the-patch-keeps-the-runner-intact}

`fakeAsync` нужно одно: колбэк, который он оборачивает, должен выполняться в зоне с `ProxyZoneSpec`.
В этот ZoneSpec `fakeAsync` подставляет свой `FakeAsyncTestZoneSpec`. Поэтому патч выполняет тело каждого
теста и хука внутри ответвлённой (fork) прокси-зоны.

Трудность в том, чтобы не потревожить раннер. Каждая из трёх возможных ошибок ломает чужие файлы, и
каждая измерена на официальном плагине выше:

| Деталь                                                      | Что ломается без неё                                                                                                                                         |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| в исходнике самой обёртки **нет** параметров                | Vitest читает `fn.toString()`, чтобы найти фикстуры; `function (...args)` роняет каждый файл с `FixtureParseError: … must use object destructuring`          |
| затем обёртка отдаёт исходные `fn.length` и `fn.toString()` | раннер читает оба, чтобы решить, как вызвать колбэк; обёртка, которая показала бы свои ноль параметров, изменила бы это решение и спрятала фикстуры          |
| `it` **проксируется**, а не заменяется                      | `each` — метод, который читает `this`; вызванный отдельно, он возвращает `undefined`, и следующая строка падает. `it.skip` / `test.each` работают сами собой |

Повторный вызов `installProxyZonePatch` не трогает уже заменённые глобальные функции. Это важно при
`isolate: false`: Vitest тогда выполняет setup-файл для каждого файла спек, а глобальные функции
живут весь воркер, и патч не должен оборачивать их второй раз.

### Почему это отдельная точка входа {#why-it-is-a-separate-entry}

zone.js — только `devDependency` этого пакета. Это не зависимость и не опциональный peer.
У `vitest-auto-spy` вообще нет рантайм-зависимостей, поэтому его установка никогда не добавит zone.js
в ваше дерево зависимостей.

Ни одна другая точка входа библиотеки не обращается к этому модулю, даже косвенно. `dist/zone.js`
самодостаточен, и ничто другое в `dist/` на него не ссылается. Zoneless-проект, который импортирует
`vitest-auto-spy`, не получает ни кода зон, ни импорта zone.js, ни одного байта этого файла. Пакет
держит это как правило, а не как случайность одного релиза (см. `AGENTS.md`).
