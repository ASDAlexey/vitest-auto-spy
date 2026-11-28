---
title: После refactor-jasmine-vitest от Angular
description: Как заменить объекты с vi.fn() и исправить три TODO для createSpyObj после запуска схематика refactor-jasmine-vitest от Angular.
---

# После `refactor-jasmine-vitest` от Angular

Схематик `refactor-jasmine-vitest` от Angular заменяет `jasmine.createSpyObj` объектами с `vi.fn()`
или оставляет комментарии `// TODO: vitest-migration:`. Чтобы заменить такой объект или закончить
переход, передайте исходный класс в `createSpyFromClass`. Вы получите типизированные спаи без списка методов:

```ts
import { createSpyFromClass } from 'vitest-auto-spy';

const api = createSpyFromClass(Api);
```

Если старый спай задавал значения свойств или подменял только часть методов, см.
[как исправить три TODO](#the-three-todos-and-the-line-beside-each).

Если вы используете `jasmine-auto-spies`, начните с раздела
[«Переход с jasmine-auto-spies»](/ru/migrating-jasmine). Для него нужен
[кодмод](/ru/utilities/codemod) (`npx vitest-auto-spy codemod --from jasmine`), а не схематик Angular.

## Что схематик делает с `createSpyObj` {#what-the-schematic-does-to-createspyobj}

Так `@schematics/angular` **22.1.6** переписал проект из одного файла. Команда запуска
через `@angular-devkit/schematics-cli` 22.x:

```sh
npx schematics @schematics/angular:refactor-jasmine-vitest --project=app --no-dry-run
```

Из примеров убраны исходные импорты.

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

Если методы перечислены прямо в вызове, схематик создаёт `vi.fn()` для каждого из них. Он даёт
мокам имена вроде `Api.get`, чтобы их было видно в сообщениях об ошибках. Ещё он заменяет
`jasmine.SpyObj<Api>` на `MockedObject<Api>`, а `.and.returnValue(v)` — на `.mockReturnValue(v)`.

`spyOn(o, 'm').and.callThrough()` превращается в `vi.spyOn(o, 'm')`. Vitest по умолчанию вызывает
исходный метод. [`spyOn` в Jasmine](/ru/migrating-jasmine#spyon-means-the-opposite-thing-on-the-two-sides)
по умолчанию его заменяет.

При записи файла TypeScript меняет отступы на четыре пробела и заменяет кавычки. Запустите Prettier,
чтобы вернуть привычное форматирование. Схематик не добавляет импорт `vi`: по умолчанию
`addImports` равен `false`. Билдер `@angular/build:unit-test` включает глобальные функции Vitest.

Количество TODO видно в консоли и в отчёте `jasmine-vitest-<date>.md` в корне проекта:

```
- 3 TODO(s) added for manual review:
  - 1x createSpyObj-single-argument
  - 1x createSpyObj-dynamic-variable
  - 1x createSpyObj-dynamic-property-map
```

## Три TODO и строка напротив каждого {#the-three-todos-and-the-line-beside-each}

Все три сообщения из `@schematics/angular` 22.1.6 предлагают использовать `vi.fn()`.
Если у вас есть исходный класс, начните с [`createSpyFromClass`](/ru/core/create-spy-from-class),
как в примере выше. В `TestBed` зарегистрируйте спай через
[`provideAutoSpy` и получите его через `injectSpy`](/ru/adapters/angular):

```ts
import { TestBed } from '@angular/core/testing';
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/angular';

TestBed.configureTestingModule({ providers: [Orders, provideAutoSpy(Api)] });
const api = injectSpy(Api);
```

### `createSpyObj-single-argument` {#createspyobj-single-argument}

> jasmine.createSpyObj called with a single argument is not supported for transformation.

Передайте класс вместо имени: `createSpyFromClass(Api)` создаёт спаи для методов прототипа.
Схематик оставляет `jasmine.createSpyObj('Api')` как есть, потому что в вызове нет списка методов.
Под Vitest такой вызов падает с ошибкой `ReferenceError: jasmine is not defined`.

### `createSpyObj-dynamic-variable` {#createspyobj-dynamic-variable}

> Cannot transform jasmine.createSpyObj with a dynamic variable. Please migrate this manually.

Если нужны спаи для всех методов прототипа, уберите список. Схематик не может прочитать его из
переменной: например, из общего `const`, параметра хелпера или результата `Object.keys`.
Если нужны спаи только для перечисленных методов, оставьте переменную и передайте её в
[`onlyMethodsToSpyOn`](/ru/core/create-spy-from-class#configuration). Вместо `string[]` используйте
тип на основе ключей класса:

```ts
const methods = ['get'] satisfies Array<keyof Api>;

api = createSpyFromClass(Api, { onlyMethodsToSpyOn: methods });
```

### `createSpyObj-dynamic-property-map` {#createspyobj-dynamic-property-map}

> Cannot transform jasmine.createSpyObj with a dynamic property map. Please migrate this manually.

Проверьте изменения: схематик переписывает вызов, но выбрасывает третий аргумент, `props`.
Он оставляет `{ get: vi.fn().mockName('Api.get') }` и сообщает о пропавших свойствах только в TODO.
При проверке объекта на соответствие `MockedObject<Api>` TypeScript сообщит, что поля не хватает.
При запуске теста `withProps.baseUrl` окажется `undefined`.

Как вернуть `baseUrl`, зависит от того, как свойство объявлено в классе:

- **Обычное поле:** в `Spy<Api>` у поля тот же тип. Присвойте `api.baseUrl = '/api'` или передайте
  объект с полями в `provideAutoSpy(Api, { overrides: props })`.
- **Поле `readonly` или сигнал:** вызовите
  [`mockReadonlyProp(api, 'baseUrl', '/api')`](/ru/adapters/angular#signal-readonly-property-mocking).
  Чтобы отменить подмену, вызовите `restoreMockedProps()`.
- **Геттер:** задайте
  [`gettersToSpyOn: ['baseUrl']`](/ru/core/create-spy-from-class#accessor-spies-—-accessorspies).
  Затем вызовите `api.accessorSpies.getters.baseUrl.mockReturnValue('/api')`. Тип свойства не меняется.

## Почему двух динамических случаев здесь просто не бывает {#why-the-two-dynamic-cases-cannot-exist-here}

Схематику нужны имена методов прямо в вызове, в виде массива или объекта. Он не знает, что лежит
в переменной. Если списка нет, ему нечего преобразовывать.

При запуске тестов `createSpyFromClass` ищет методы в `Api.prototype` и в цепочке прототипов.
TypeScript строит тип `Spy<Api>` по тому же классу. Добавите метод — он появится у спая при
следующем запуске. Удалите метод — TypeScript укажет на тесты, которые ещё его вызывают.

Если исходного класса нет, используйте `createSpyObj` из
[`vitest-auto-spy/jasmine`](/ru/migrating-jasmine). Он принимает те же аргументы, что и Jasmine,
и читает имена при запуске теста, поэтому список можно передать в переменной. Тип ключей зависит
от того, что видит TypeScript: у списка `string[]` ключи будут типа `string`. Вызов с одним
аргументом выдаст ошибку с подсказкой. Если класс есть, лучше использовать `createSpyFromClass`.

## Во что литерал обходится потом {#what-the-literal-costs-afterwards}

В [руководстве Angular по тестированию](https://angular.dev/guide/testing/services) такие объекты
пишут вручную. Вот что меняется, если создавать спай по классу:

- **Новые методы.** `MockedObject<Api>` требует все члены `Api`. Добавили метод — допишите строку
  `name: vi.fn().mockName('Api.name')` в каждый объект. `Spy<Api>` подхватит метод сам.
- **Возвращаемые значения.** С `vi.fn()` используйте `api.get.mockReturnValue(of([...]))`. Если
  метод возвращает `Observable`, спай по классу даёт
  [`nextWith` / `throwWith`](/ru/core/control-helpers#observable-methods-properties-—-nextwith) и
  `calledWith('/orders').nextWith([...])`. Для `Promise` есть
  [`resolveWith` / `rejectWith`](/ru/core/control-helpers#promise-returning-methods-—-resolvewith).
  С [`mustBeCalledWith`](/ru/core/control-helpers#synchronous-methods) вызов любого метода с
  неверными аргументами приводит к падению теста вместо возврата `undefined`.
- **Вызовы без настройки.** По умолчанию оба варианта возвращают `undefined`. Чтобы такие вызовы
  приводили к падению, включите [`strict: true`](/ru/core/strict-mode) для одного спая или всех тестов.
- **Имена в сообщениях об ошибках.** Если указать базовое имя, схематик даёт мокам имена вроде
  `Api.get`. Без него (`jasmine.createSpyObj(['get'])`) он создаёт безымянные `vi.fn()`. Спаи по
  классу получают имена своих методов, если раннер поддерживает именование.

## Если сначала хочется остановиться на синтаксисе jasmine {#if-you-would-rather-stop-at-jasmine-syntax-first}

Если хотите сменить раннер сейчас, а спаи переписать позже, не запускайте схематик для этих спаев.
Добавьте импорт [`jasmine` из `vitest-auto-spy/jasmine`](/ru/migrating-jasmine#jasmine-s-own-globals)
в каждый тестовый файл, где он нужен:

```ts
import { jasmine } from 'vitest-auto-spy/jasmine';

const api = jasmine.createSpyObj('Api', ['get', 'post']); // unchanged, runs under Vitest
api.get.and.returnValue(of([])); // .and, .calls, .withArgs are back
```

Импорт не меняет `globalThis`. Когда будете переписывать спаи, [кодмод](/ru/utilities/codemod)
удалит этот импорт. В `bun test` и `node --test` этот модуль не загружается. Вместо импорта в
тестах вызовите `enableJasmineCompat()` из `vitest-auto-spy/jasmine-compat` в файле настройки тестов.
Подробнее: [На Bun и `node:test`](/ru/migrating-jasmine#on-bun-and-node-test).

## Как было на самом деле, с версиями {#the-record-with-versions}

История версий сверена с первоисточниками 2026-09-02, если не указана другая дата:

- **2023-04-27: Karma объявляют устаревшей её мейнтейнеры.** В коммите `450fdfda` репозитория
  `karma-runner/karma` в README добавили уведомление: «Karma is deprecated and is not accepting
  new features or general bug fixes». В списке изменений Angular CLI такого объявления о Karma
  нет. В **22.0.0** устарели билдеры на Webpack из `build-angular`. Вместо них Angular рекомендует
  билдеры из `@angular/build`. `@angular/build:karma` — одна из замен.
- **21.0.0 (2025-11-19): `ng new` по умолчанию использует Vitest вместо Karma и Jasmine.** Выбрать
  `karma` по-прежнему можно через `testRunner` (`2ffc527b`). В той же версии появился схематик
  перехода с Jasmine на Vitest (`58474ec7`).
- **22.0.0 (2026-06-03): Angular стабилизировал схематик** (`de630c2f`) и удалил два экспериментальных
  билдера: `@angular-devkit/build-angular:jest` и `@angular-devkit/build-angular:web-test-runner`.
  Стабилизация касается того, какие конструкции в тестах умеет преобразовывать схематик. В 22.1.6
  и 22.2.0 у него в коллекции по-прежнему описание `[EXPERIMENTAL] Refactors Jasmine tests to use Vitest APIs.`
  и настройка `"hidden": true`. В `ng generate --help` его нет, поэтому указывайте полное имя.
- **22.2.0: `ng new` использует Vitest 5.** Он задаёт для `vitest` диапазон `^5.0.0`, а в 22.1.x
  был `^4.0.8`. Миграция с Karma на Vitest и схематик `vitest-browser` используют тот же диапазон
  для `@vitest/coverage-*` и браузерных провайдеров. `ng generate config vitest` теперь создаёт
  `vitest-base.config.mts` вместо `vitest-base.config.ts`. Проверено 2026-09-26 по архиву
  `@schematics/angular` 22.2.0.
