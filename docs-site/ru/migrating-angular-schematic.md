---
title: После refactor-jasmine-vitest от Angular
description: Схематик refactor-jasmine-vitest от Angular превращает jasmine.createSpyObj в написанные руками литералы из vi.fn() и оставляет три TODO. createSpyFromClass закрывает все три одной строкой; здесь настоящий вывод схематика рядом с исправлением.
---

# После `refactor-jasmine-vitest` от Angular

Вы запустили схематик Angular `refactor-jasmine-vitest`, и теперь в спеках лежат написанные руками
объекты из `vi.fn()` и комментарии `// TODO: vitest-migration:`. Эта страница заменяет каждый
остаток `jasmine.createSpyObj` одной строкой, которая читает класс, а не список методов:

```ts
import { createSpyFromClass } from 'vitest-auto-spy';

api = createSpyFromClass(Api); // все методы Api, с типами и хелперами по типу возврата
```

Схематик переводит **синтаксис** с Jasmine на Vitest и делает это хорошо. Там, где он не может
решить сам, он оставляет TODO. Три TODO, которые он оставляет на `createSpyObj`, разобраны
[ниже](#the-three-todos-and-the-line-beside-each).

Это **не** [кодмод](/ru/utilities/codemod). `npx vitest-auto-spy codemod --from jasmine` переводит
проект на `jasmine-auto-spies`; эта страница начинается с вывода схематика. Если ваш проект на
`jasmine-auto-spies`, начните с [Перехода с jasmine-auto-spies](/ru/migrating-jasmine).

## Что схематик делает с `createSpyObj` {#what-the-schematic-does-to-createspyobj}

Ниже — настоящий вывод `@schematics/angular` **22.1.6** на проекте из одного файла. Команда:
`npx schematics @schematics/angular:refactor-jasmine-vitest --project=app --no-dry-run`
(`@angular-devkit/schematics-cli` 22.x). После запуска удалены только импорты.

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

Для литеральных аргументов переписывание верное:

- `jasmine.SpyObj<Api>` становится `MockedObject<Api>`;
- `.and.returnValue(v)` становится `.mockReturnValue(v)`;
- каждый `vi.fn()` получает имя вроде `Api.get` для сообщений о падении;
- `spyOn(o, 'm').and.callThrough()` становится голым `vi.spyOn(o, 'm')`. Это правильно: `vi.spyOn`
  по умолчанию вызывает настоящий метод, а `spyOn` из Jasmine его заменяет
  ([перевёрнутое умолчание](/ru/migrating-jasmine#spyon-means-the-opposite-thing-on-the-two-sides)).

Схематик перепечатывает файл принтером TypeScript, поэтому отступы становятся по четыре пробела, а
кавычки меняются; Prettier всё возвращает. `vi` не импортируется: `addImports` по умолчанию `false`, а
билдер `@angular/build:unit-test` включает глобальные функции Vitest.

То, что он пропустил, схематик считает в сводке в консоли и в отчёте `jasmine-vitest-<date>.md` в
корне проекта:

```
- 3 TODO(s) added for manual review:
  - 1x createSpyObj-single-argument
  - 1x createSpyObj-dynamic-variable
  - 1x createSpyObj-dynamic-property-map
```

## Три TODO и строка напротив каждого {#the-three-todos-and-the-line-beside-each}

Сообщения ниже процитированы из `@schematics/angular` 22.1.6. Все три отправляют к `vi.fn()`. Здесь у
всех трёх один ответ: [`createSpyFromClass`](/ru/core/create-spy-from-class) не нужен список
методов, он читает класс.

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

`jasmine.createSpyObj('Api')` задаёт имя и не перечисляет методов, так что разворачивать нечего.
Схематик оставляет вызов как есть, и под Vitest он падает с
`ReferenceError: jasmine is not defined`. `createSpyFromClass(Api)` — рабочая форма с одним
аргументом: вы передаёте класс, и спай получает все его методы.

### `createSpyObj-dynamic-variable` {#createspyobj-dynamic-variable}

> Cannot transform jasmine.createSpyObj with a dynamic variable. Please migrate this manually.

Здесь `methods` объявлен где-то ещё: общий `const`, параметр хелпера или список из `Object.keys`.
Инструмент, который видит только этот вызов, развернуть его не может. `createSpyFromClass(Api)`
список не нужен: он ставит спай на каждый метод класса. Если список был нужен, чтобы _ограничить_
спай, используйте [`onlyMethodsToSpyOn`](/ru/core/create-spy-from-class#configuration). Он может
остаться переменной, но с типом имён методов класса, а не `string[]`:

```ts
const methods = ['get'] satisfies Array<keyof Api>;

api = createSpyFromClass(Api, { onlyMethodsToSpyOn: methods });
```

### `createSpyObj-dynamic-property-map` {#createspyobj-dynamic-property-map}

> Cannot transform jasmine.createSpyObj with a dynamic property map. Please migrate this manually.

Здесь дифф стоит прочитать внимательно. Схематик **переписывает** вызов, но теряет третий аргумент.
`jasmine.createSpyObj('Api', ['get'], props)` превратился в `{ get: vi.fn().mockName('Api.get') }`,
и `withProps.baseUrl` строкой ниже теперь `undefined`. Там, где объявлен `MockedObject<Api>`, это
ошибка компиляции, в остальных местах — молчаливый `undefined`. Сообщает об этом только комментарий
TODO.

Исправление зависит от того, чем это свойство является в классе:

- **обычное поле** сохраняет свой тип на `Spy<Api>`. Присвойте его или передайте объект в
  `overrides` провайдера: `provideAutoSpy(Api, { overrides: props })`;
- **`readonly`-поле** или **сигнал**: используйте
  [`mockReadonlyProp(api, 'baseUrl', '/api')`](/ru/adapters/angular#signal-readonly-property-mocking).
  Он запоминает, что заменил, и `restoreMockedProps()` может это вернуть;
- **геттер**: используйте
  [`gettersToSpyOn: ['baseUrl']`](/ru/core/create-spy-from-class#accessor-spies-—-accessorspies) и
  задайте значение через `api.accessorSpies.getters.baseUrl.mockReturnValue('/api')`. Само свойство
  сохраняет тип, объявленный в классе.

## Почему двух динамических случаев здесь просто не бывает {#why-the-two-dynamic-cases-cannot-exist-here}

Схематик переписывает **место вызова**. Имена методов он должен видеть литеральным массивом или
объектом прямо в аргументах, потому что в переменной может оказаться что угодно. Поэтому
нелитеральный список переписать нельзя, а в вызове без списка переписывать нечего.

`createSpyFromClass` читает **класс**. В рантайме он обходит `Api.prototype` и его родителей и
ставит спаи на всё, что нашёл. При компиляции `Spy<Api>` строится по тому же классу. Списка в месте
вызова нет, поэтому динамическим быть нечему. Метод, добавленный в `Api` через месяц, появится у
спая при следующем запуске тестов. Удалённый метод станет ошибкой компиляции на строке, которая его
ещё вызывает.

У [`vitest-auto-spy/jasmine`](/ru/migrating-jasmine) тоже есть `createSpyObj` — для спек, которые
пока не готовы назвать класс. Он сохраняет форму вызова Jasmine и читает имена в рантайме, поэтому
список в переменной там работает. Тип результата строится по тем именам, которые видит компилятор:
переменная `string[]` даёт ключи `string`. Форму с одним аргументом он отвергает с ошибкой, в которой
назван способ исправить. Если класс есть, берите класс.

## Во что литерал обходится потом {#what-the-literal-costs-afterwards}

Литерал, который пишет схематик, — это то, что
[руководство по тестированию на angular.dev](https://angular.dev/guide/testing/services) советует
писать руками. Ошибки в нём нет. Просто его дороже поддерживать:

- **Его правят при каждом изменении класса.** `MockedObject<Api>` требует все члены `Api`. Добавьте
  метод в сервис — и каждая спека с литералом перестанет компилироваться, пока вы не допишете ещё
  одну строку `name: vi.fn().mockName('Api.name')`. `Spy<Api>` следует за классом сам.
- **Нет хелперов по типу возврата.** `vi.fn()` знает только `api.get.mockReturnValue(of([...]))`.
  Здесь `api.get` возвращает `Observable`, поэтому у него есть
  [`nextWith` / `throwWith`](/ru/core/control-helpers#observable-methods-properties-—-nextwith) и
  `calledWith('/orders').nextWith([...])`. У метода, который возвращает `Promise`, есть
  [`resolveWith` / `rejectWith`](/ru/core/control-helpers#promise-returning-methods-—-resolvewith).
  У каждого метода есть [`mustBeCalledWith`](/ru/core/control-helpers#synchronous-methods): при
  неверных аргументах он валит тест, а не возвращает `undefined`.
- **Ненастроенный метод молчит в обоих случаях.** `vi.fn()` возвращает `undefined`, ненастроенный
  спай здесь — тоже. [`strict: true`](/ru/core/strict-mode) превращает такой вызов в падение — для
  одного спая или для всех тестов.
- **С именами примерно поровну.** С базовым именем схематик называет каждый мок `Api.get`, и в
  сообщениях о падении это удобно. Без базового имени (`jasmine.createSpyObj(['get'])`) получаются
  голые `vi.fn()`. Здесь каждый спай метода назван по своему методу на любом раннере, который
  поддерживает имена.

## Если сначала хочется остановиться на синтаксисе jasmine {#if-you-would-rather-stop-at-jasmine-syntax-first}

Это альтернатива запуску схематика на ваших спаях. Меняется раннер, спеки остаются как есть, а спаи
вы переписываете позже, по одному.
[`vitest-auto-spy/jasmine`](/ru/migrating-jasmine#jasmine-s-own-globals) позволяет так сделать:

```ts
import { jasmine } from 'vitest-auto-spy/jasmine';

const api = jasmine.createSpyObj('Api', ['get', 'post']); // без изменений, работает под Vitest
api.get.and.returnValue(of([])); // .and, .calls, .withArgs снова на месте
```

В `globalThis` ничего не добавляется: вы импортируете модуль в каждом файле, а
[кодмод](/ru/utilities/codemod) в конце удаляет этот импорт. На `bun test` или `node --test`, где эта
точка входа не загружается, вызовите `enableJasmineCompat()` из `vitest-auto-spy/jasmine-compat` в
setup-файле; см. [На Bun и `node:test`](/ru/migrating-jasmine#on-bun-and-node-test).

## Как было на самом деле, с версиями {#the-record-with-versions}

Про эту миграцию часто говорят не совсем точные вещи. Каждая строка ниже сверена с первоисточником
2026-09-02.

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
  Стабилизация здесь — утверждение о покрытии тестовых паттернов, а не о видимости: в 22.1.6 и всё
  ещё в 22.2.0 запись в коллекции читается как
  `[EXPERIMENTAL] Refactors Jasmine tests to use Vitest APIs.` и помечена `"hidden": true`, так что в
  `ng generate --help` схематик не появляется и звать его надо полным именем.
- **22.2.0 делает новый проект проектом на Vitest 5** (сверено с тарболом `@schematics/angular`
  22.2.0 на 2026-09-26). `ng new` пинит `vitest` на `^5.0.0` — 22.1.x пинил `^4.0.8`, — миграция с
  Karma на Vitest и схематик `vitest-browser` ставят `@vitest/coverage-*` и браузерные провайдеры на
  тот же диапазон, а `ng generate config vitest` пишет `vitest-base.config.mts` там, где раньше писал
  `vitest-base.config.ts`.
