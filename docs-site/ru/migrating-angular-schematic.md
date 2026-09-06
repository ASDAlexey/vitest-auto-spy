---
title: После refactor-jasmine-vitest от Angular
description: Собственный ng generate @schematics/angular:refactor-jasmine-vitest от Angular переписывает jasmine.createSpyObj в написанный руками объектный литерал из vi.fn() и оставляет три комментария TODO, которые не может разрешить. createSpyFromClass закрывает все три по построению — он читает прототип класса, а не место вызова, — и эта страница показывает настоящий вывод схематика рядом с одной строкой, которая его заменяет, плюс историю Karma и Vitest с номерами версий.
---

# После `refactor-jasmine-vitest` от Angular

`ng generate @schematics/angular:refactor-jasmine-vitest` переводит **синтаксис** Angular-сюиты с
jasmine на Vitest. С этой работой он справляется хорошо и честен насчёт того, чего не умеет: на
каждом вызове, за который не взялся, он оставляет комментарий `// TODO: vitest-migration:`. Эта
страница — про диф, который из него выходит: конкретно про строки `jasmine.createSpyObj`, которые он
разворачивает в написанный руками объектный литерал, и про три формы, которые он не трогает.

Это **не** [кодмод](/ru/utilities/codemod). `npx vitest-auto-spy codemod --from jasmine` переводит
сюиту с `jasmine-auto-spies` на эту библиотеку; эта страница переводит на неё вывод
Angular-схематика. Разный вход, одно назначение. Если сюита на `jasmine-auto-spies`, начинайте с
[Миграции с jasmine-auto-spies](/ru/migrating-jasmine).

## Что схематик делает с `createSpyObj` {#what-the-schematic-does-to-createspyobj}

Всё, что ниже, — настоящий вывод `@schematics/angular` **22.1.6**, запущенного на однофайловом
проекте командой
`npx schematics @schematics/angular:refactor-jasmine-vitest --project=app --no-dry-run`
(`@angular-devkit/schematics-cli` 22.x). Потом ничего не правилось, кроме вырезанных импортов.

Было:

```ts
const methods = ['get'];
const props = { baseUrl: '/api' };

describe('Orders', () => {
  let api: jasmine.SpyObj<Api>;

  beforeEach(() => {
    api = jasmine.createSpyObj('Api', ['get', 'post']);
    api.get.and.returnValue(of([{ id: 1 }]));
    TestBed.configureTestingModule({ providers: [Orders, { provide: Api, useValue: api }] });
  });

  it('spies on a real instance', () => {
    spyOn(orders, 'refresh').and.callThrough();
  });

  it('single argument', () => {
    const bare = jasmine.createSpyObj('Api');
  });

  it('method list in a variable', () => {
    const dynamic = jasmine.createSpyObj('Api', methods);
  });

  it('property map in a variable', () => {
    const withProps = jasmine.createSpyObj('Api', ['get'], props);
    expect(withProps.baseUrl).toBe('/api');
  });
});
```

Стало:

```ts
import type { MockedObject } from 'vitest';

const methods = ['get'];
const props = { baseUrl: '/api' };

describe('Orders', () => {
  let api: MockedObject<Api>;

  beforeEach(() => {
    api = {
      get: vi.fn().mockName('Api.get'),
      post: vi.fn().mockName('Api.post'),
    };
    api.get.mockReturnValue(of([{ id: 1 }]));
    TestBed.configureTestingModule({ providers: [Orders, { provide: Api, useValue: api }] });
  });

  it('spies on a real instance', () => {
    vi.spyOn(orders, 'refresh');
  });

  it('single argument', () => {
    // TODO: vitest-migration: jasmine.createSpyObj called with a single argument is not supported for transformation. See: https://vitest.dev/api/vi.html#vi-fn
    const bare = jasmine.createSpyObj('Api');
  });

  it('method list in a variable', () => {
    // TODO: vitest-migration: Cannot transform jasmine.createSpyObj with a dynamic variable. Please migrate this manually. See: https://vitest.dev/api/vi.html#vi-fn
    const dynamic = jasmine.createSpyObj('Api', methods);
  });

  it('property map in a variable', () => {
    // TODO: vitest-migration: Cannot transform jasmine.createSpyObj with a dynamic property map. Please migrate this manually. See: https://vitest.dev/api/vi.html#vi-fn
    const withProps = {
      get: vi.fn().mockName('Api.get'),
    };
    expect(withProps.baseUrl).toBe('/api');
  });
});
```

Переписывание случая с литералом сделано верно и аккуратно: `jasmine.SpyObj<Api>` становится
`MockedObject<Api>`, `.and.returnValue(v)` — `.mockReturnValue(v)`, каждому `vi.fn()` даётся имя
`Api.get` ради вывода при падении, а `spyOn(o, 'm').and.callThrough()` превращается в голый
`vi.spyOn(o, 'm')` — и это правильно, потому что `vi.spyOn` по умолчанию пропускает вызов дальше,
тогда как `spyOn` из jasmine его подменяет
([перевёрнутое умолчание](/ru/migrating-jasmine#spyon-means-the-opposite-thing-on-the-two-sides)).
Схематик перепечатывает файл через принтер TypeScript, поэтому отступы становятся четырёхпробельными,
а кавычки меняются; Prettier возвращает всё назад. `vi` не импортируется, потому что `addImports` по
умолчанию `false` — билдер `@angular/build:unit-test` включает глобали Vitest.

Сводка, которую он печатает, и отчёт `jasmine-vitest-<date>.md`, который он кладёт в корень проекта,
считают то, за что он не взялся:

```
- 3 TODO(s) added for manual review:
  - 1x createSpyObj-single-argument
  - 1x createSpyObj-dynamic-variable
  - 1x createSpyObj-dynamic-property-map
```

## Три TODO и строка напротив каждого {#the-three-todos-and-the-line-beside-each}

Сообщения процитированы дословно из `refactor/jasmine-vitest/utils/todo-notes.js` в
`@schematics/angular` 22.1.6, и все три ведут на `vi.fn()` как на способ жить дальше. У всех трёх
здесь один и тот же ответ, потому что [`createSpyFromClass`](/ru/core/create-spy-from-class) не видит
списка методов никогда — он читает класс.

```ts
import { createSpyFromClass } from 'vitest-auto-spy';

api = createSpyFromClass(Api); // каждый метод прототипа, типизированный, с хелперами по типу возврата
```

Внутри `TestBed` — то же самое в виде провайдера, через
[`provideAutoSpy` / `injectSpy`](/ru/adapters/angular):

```ts
TestBed.configureTestingModule({ providers: [Orders, provideAutoSpy(Api)] });
api = injectSpy(Api);
```

### `createSpyObj-single-argument` {#createspyobj-single-argument}

> jasmine.createSpyObj called with a single argument is not supported for transformation.

`jasmine.createSpyObj('Api')` даёт дублю имя и не перечисляет ничего, так что разворачивать нечего.
Схематик оставляет вызов как есть, и в рантайме под Vitest строка падает с
`ReferenceError: jasmine is not defined`. `createSpyFromClass(Api)` — та самая форма с одним
аргументом, которая работает: имя берётся от класса, а методы — те, что есть у его прототипа.

### `createSpyObj-dynamic-variable` {#createspyobj-dynamic-variable}

> Cannot transform jasmine.createSpyObj with a dynamic variable. Please migrate this manually.

`jasmine.createSpyObj('Api', methods)`, где `methods` объявлен где-то ещё — общий `const`, параметр
хелпера, список, собранный через `Object.keys`, — не может быть развёрнут трансформером, который
видит только этот вызов. Здесь разворачивать нечего: `createSpyFromClass(Api)` ставит спай на каждый
метод, который есть у прототипа. А если список существовал, чтобы _сузить_ дубль, — это
[`onlyMethodsToSpyOn`](/ru/core/create-spy-from-class#configuration), и он может остаться
переменной, типизированной ключами методов класса, а не как `string[]`:

```ts
const methods = ['get'] satisfies Array<keyof Api>;

api = createSpyFromClass(Api, { onlyMethodsToSpyOn: methods });
```

### `createSpyObj-dynamic-property-map` {#createspyobj-dynamic-property-map}

> Cannot transform jasmine.createSpyObj with a dynamic property map. Please migrate this manually.

Вот здесь диф стоит прочитать, потому что схематик всё-таки **переписывает** вызов и роняет третий
аргумент на пол: `jasmine.createSpyObj('Api', ['get'], props)` стал
`{ get: vi.fn().mockName('Api.get') }`, и `withProps.baseUrl` строкой ниже теперь `undefined` —
ошибка компиляции там, где объявлен `MockedObject<Api>`, и молчаливый `undefined` там, где он не
объявлен. Единственное, что об этом говорит, — комментарий.

Честный ответ зависит от того, чем это свойство является на классе:

- **обычное поле** сохраняет свой объявленный тип на `Spy<Api>`, так что либо присвойте его, либо
  отдайте карту в `overrides` провайдера — `provideAutoSpy(Api, { overrides: props })`;
- **`readonly`-поле** или **сигнал** — это
  [`mockReadonlyProp(api, 'baseUrl', '/api')`](/ru/adapters/angular#signal-readonly-property-mocking),
  который запоминает подменённый дескриптор, чтобы `restoreMockedProps()` мог всё вернуть;
- **геттер** — это
  [`gettersToSpyOn: ['baseUrl']`](/ru/core/create-spy-from-class#accessor-spies-—-accessorspies), а
  значение задаётся через `api.accessorSpies.getters.baseUrl.mockReturnValue('/api')` — само свойство
  остаётся типизированным так, как объявил класс.

## Почему двух динамических случаев здесь просто не бывает {#why-the-two-dynamic-cases-cannot-exist-here}

Схематик преобразует **место вызова**: имена методов он обязан увидеть литеральным массивом или
объектом в списке аргументов, потому что строка в переменной может прийти откуда угодно. Значит,
нелитеральный список преобразовать нельзя, а формы с одним аргументом преобразовывать не во что
вообще.

`createSpyFromClass` читает **прототип**: в рантайме он обходит `Api.prototype` (и его цепочку) и
ставит спаи на то, что нашёл, а `Spy<Api>` — это mapped-тип по тому же классу на этапе компиляции.
Никакого списка в месте вызова — ни литерального, ни какого-либо ещё — нет, так что динамическим
быть нечему. Метод, добавленный в `Api` через месяц, окажется на дубле при следующем прогоне теста;
удалённый метод станет ошибкой компиляции на строке, которая его всё ещё зовёт.

То же верно для `createSpyObj` из точки входа [`vitest-auto-spy/jasmine`](/ru/migrating-jasmine),
которая сохраняет форму вызова jasmine для сюиты, ещё не готовой назвать класс: имена она читает в
рантайме, поэтому список в переменной там работает, а возвращаемый объект типизирован теми именами,
которые видит компилятор, — переменная типа `string[]` даёт ему ключи `string`. Форму с одним
аргументом она тоже отвергает — сообщением, которое называет способ починки. Где класс есть,
предпочитайте класс.

## Во что литерал обходится потом {#what-the-literal-costs-afterwards}

Литерал, который пишет схематик, — ровно то, что
[руководство по тестированию на angular.dev](https://angular.dev/guide/testing/services) советует
писать руками, так что ничего неправильного в нём нет. Это форма сопровождения, и счёт приходит
позже:

- **Его правят при каждом изменении класса.** `MockedObject<Api>` требует каждый член `Api`, поэтому
  добавленный в сервис метод — это ошибка компиляции в каждой спеке, где лежит литерал, и каждая
  чинится ещё одной строкой `name: vi.fn().mockName('Api.name')`. `Spy<Api>` следует за классом.
- **Никаких хелперов по типу возврата.** `api.get.mockReturnValue(of([...]))` — единственная форма,
  которую знает `vi.fn()`. Здесь `api.get` возвращает `Observable`, поэтому у него есть
  [`nextWith` / `throwWith`](/ru/core/control-helpers#observable-methods-properties-—-nextwith) и
  `calledWith('/orders').nextWith([...])`; у метода, возвращающего `Promise`, есть
  [`resolveWith` / `rejectWith`](/ru/core/control-helpers#promise-returning-methods-—-resolvewith); а
  у каждого метода есть
  [`mustBeCalledWith`](/ru/core/control-helpers#synchronous-methods), который валит тест на
  несовпадении аргументов вместо того, чтобы вернуть `undefined`.
- **Ненастроенный метод молчит в обоих случаях.** `vi.fn()` возвращает `undefined`, и ненастроенный
  спай здесь тоже; [`strict: true`](/ru/core/strict-mode) превращает это в падение на том вызове,
  который его вызвал, — для одного дубля или для всей сюиты.
- **С именованием ничья, но в одну сторону.** С базовым именем схематик называет каждый мок
  `Api.get`, и это хороший вывод при падении; форма без базового имени
  (`jasmine.createSpyObj(['get'])`) получает голые `vi.fn()`. Здесь каждый спай метода назван по
  своему методу — на любом раннере, который умеет имена.

## Если сначала хочется остановиться на синтаксисе jasmine {#if-you-would-rather-stop-at-jasmine-syntax-first}

Собственный вывод схематика уже ушёл дальше синтаксиса jasmine, так что это альтернатива тому, чтобы
запускать его по спаям вообще: раннер переезжает, спеки — нет, а дубли переписываются позже, по
одному. [`vitest-auto-spy/jasmine`](/ru/migrating-jasmine#jasmine-s-own-globals) — это тот самый шаг:

```ts
import { jasmine } from 'vitest-auto-spy/jasmine';

const api = jasmine.createSpyObj('Api', ['get', 'post']); // без изменений, работает под Vitest
api.get.and.returnValue(of([])); // .and, .calls, .withArgs снова на месте
```

В `globalThis` ничего не ставится — это импорт на файл, который [кодмод](/ru/utilities/codemod) в
конце удаляет. На `bun test` или `node --test`, где эту точку входа загрузить нельзя,
`enableJasmineCompat()` из `vitest-auto-spy/jasmine-compat` включает те же неймспейсы из setup-файла;
см. [На Bun и `node:test`](/ru/migrating-jasmine#on-bun-and-node-test).

## Как было на самом деле, с версиями {#the-record-with-versions}

Про эту миграцию повторяют три вещи, и все три — не вполне то, что произошло. Каждая строка ниже
сверена с первоисточником 2026-09-02.

- **Angular не объявлял Karma устаревшей. Это сделали её собственные мейнтейнеры, в 2023 году.**
  Уведомление — "Karma is deprecated and is not accepting new features or general bug fixes" — было
  добавлено в README Karma коммитом `450fdfda` от 2023-04-27 в `karma-runner/karma`. В чейнджлоге
  Angular CLI нет ни одной записи об устаревании Karma; **22.0.0** объявил устаревшим семейство
  билдеров — "Webpack builders in build-angular are deprecated. Use @angular/build builders
  instead." — а `@angular/build:karma` как раз одна из замен, а не одна из устаревших вещей.
- **Vitest стал умолчанием `ng new` в 21.0.0** (2025-11-19). Строка чейнджлога — "configure Vitest
  for new projects and allow runner choice" (`2ffc527b`), а сообщение коммита гласит "configure
  Vitest as the default unit testing runner, replacing Karma and Jasmine", с опцией `testRunner`,
  чтобы выбрать `karma`. В том же релизе появился и схематик: "introduce initial jasmine-to-vitest
  unit test refactor schematic" (`58474ec7`).
- **22.0.0** (2026-06-03) удалил экспериментальные билдеры — "The experimental
  `@angular-devkit/build-angular:jest` and `@angular-devkit/build-angular:web-test-runner` builders
  have been removed." — и привёз "stabilize refactor-jasmine-vitest schematic" (`de630c2f`).
  Стабилизация здесь — утверждение о покрытии тестовых паттернов, а не о видимости: в 22.1.6 запись в
  коллекции по-прежнему читается как `[EXPERIMENTAL] Refactors Jasmine tests to use Vitest APIs.` и
  помечена `"hidden": true`, так что в `ng generate --help` схематик не появляется и звать его надо
  полным именем.
