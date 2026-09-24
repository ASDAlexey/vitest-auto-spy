---
title: Моки модулей, которые ничего не сделали
description: assertMocked, moduleNamespace и adoptMock — доказать, что vi.mock() применился под бандлером, дать его фабрике форму, которую узнаёт interop-проба, и настроить построенные ею моки через calledWith.
---

# Моки модулей, которые ничего не сделали

```ts
import { adoptMock, assertMocked, moduleNamespace } from 'vitest-auto-spy';
```

`vi.mock()` — единственный кусок перенесённой сюиты, который умеет падать **молча**. Это трансформ
над графом модулей, поэтому ему нечего сказать, когда граф оказался не таким, как предполагала
спека, — а дальше либо тест зеленеет по неверной причине, либо падает так, что с мокингом это никак
не связать.

## `assertMocked(namespace, options?)` {#assertmocked-namespace-options}

```ts
import * as engine from '@app/pricing-engine';

vi.mock('@app/pricing-engine');

beforeEach(() => {
  assertMocked(engine, { specifier: '@app/pricing-engine', exports: ['createEngine'] });
});
```

Падает на той строке, которая понадеялась на мок, и называет модуль. Без `exports` он проверяет, что
моком раннера является _хоть какой-то_ экспорт; с ними — что моком является каждый названный, а это
как раз то, что нужно фабрике, которая заглушает часть модуля и реэкспортирует остальное: фабрика,
потерявшая тот единственный экспорт, который дёргает тест, снаружи всё ещё выглядит замоканной.

**Пустой** список `exports` не принимается, а отвергается. `exports: []` — то, что получается из
`Object.keys(stubs)` или отфильтрованной константы, когда результат пуст, — раньше уходил в ветку
именованных экспортов, не находил, что проверять, и возвращался, так что единственный вызов в файле,
чья работа — доказать, что мок применился, не доказывал ничего.

### Два способа для `vi.mock` стать no-op {#the-two-ways-vi-mock-becomes-a-no-op}

**Бандлер уже заинлайнил модуль.** Под `@angular/build:unit-test` — или когда `vite-node` получил
предсобранный вход — алиас воркспейса (`@scope/lib`) или barrel-модуль к моменту установки мока уже часть
бандла. Перехватывать больше нечего. Никакого предупреждения не печатается.

**`isolate: false` и модуль, который уже в графе воркера.** Встроенный вроде `node:fs` держит тот
мок, который дошёл до него первым, поэтому одна и та же спека проходит или падает в зависимости от
порядка, в котором воркер разобрал файлы. Прогон, зелёный локально и красный в CI, каждый раз на
другом файле, — это оно.

Ни у того, ни у другого нет лечения внутри `vi.mock`. Работает — не мокать модуль вообще: передайте
зависимость внутрь (провайдером TestBed, аргументом конструктора, параметром функции) и заглушите
значение. `assertMocked` — то, что превращает молчаливый случай во внятную фразу, чтобы к этому
выводу приходили за один прогон, а не за три.

## Дайте настоящий шов {#provide-a-real-seam}

У молчаливого `vi.mock` есть громкий близнец, и напарываются на него _следом_: после того как мок
ничего не сделал, естественный ход — потянуться за спаем:

```ts
import * as appMetrics from '@app/domain-metrics';

vi.spyOn(appMetrics, 'injectAppMetrics'); // TypeError: Cannot redefine property: injectAppMetrics
```

Причина та же, симптом противоположный. Стоит бандлеру заинлайнить barrel-модуль, его экспорты становятся
живыми связями на объекте пространства имён модуля: не configurable, не writable, не заменяемые ни
`vi.spyOn`, ни `jest.spyOn`, ни `Object.defineProperty`, ни чем угодно ещё. Нет такой библиотеки
спаев, которая бы это выиграла, — а `TypeError` не говорит ничего из перечисленного: называет
свойство и умолкает.

Написанный руками в спеке `vi.spyOn` этот пакет не видит, так что там по-прежнему прилетит голый
`TypeError`. Везде, где переопределение идёт через библиотеку, то же падение перебрасывается целой
фразой — с именем свойства, с тем, чем цель является на самом деле, и с выходом; это касается и
спаев на аксессоры (спай `observablePropsToSpyOn` / геттер-сеттер, снятый с авто-мока), и хелперов
`mock*Prop`:

```
[vitest-auto-spy] Cannot spy on the 'get' accessor of 'injectAppMetrics': the property is not
configurable, so it cannot be redefined. The target is an ES module namespace.
An ES module namespace is what a bundler leaves behind once it has inlined a barrel or a workspace
alias (`@angular/build:unit-test`, a pre-bundled `vite-node` entry): the export is a live binding,
not a writable property, and no spy library — this one, `vi.spyOn`, `jest.spyOn` — can replace it.
`vi.mock()` of the same module is the silent version of this failure, not the fix.
Give the code under test a real seam and spy on that: inject the dependency, pass it in as an
argument, or reach it through a class or object your own code owns.
```

`mockValueProp` / `mockReadonlyProp` формулируют первую строку под то, что делают сами
(`Cannot mock the property 'x': it is not configurable, so it cannot be redefined.`), а остальное у
них общее. И ничего после себя не оставляют: журнал отката пишется только после того, как
переопределение удалось, поэтому отказавший патч не вернётся вторым заходом как падение
`restoreMockedProps()` на тирдауне из-за того, чего не было.

**Шов — это изменение в тестируемом коде, а не в тесте.** Три формы, от дешёвой к дорогой:

```ts
// 1. Внедрить. Потребитель берёт зависимость из DI, поэтому спека подсовывает дубль.
readonly #metrics = inject(AppMetrics);
// спека: TestBed.configureTestingModule({ providers: [provideAutoSpy(AppMetrics)] });

// 2. Передать внутрь. Свободной функции, принимающей коллаборатора аргументом, мокинг не нужен вовсе.
export function priceBasket(items: Item[], rate: RateLookup): number { … }
// спека: priceBasket(items, () => 1.2);

// 3. Владеть косвенностью. Реэкспортируйте вызов третьей стороны через класс, которым владеете вы,
//    и пустите через него всех вызывающих — и все спеки.
@Service()
export class MetricsGateway {
  track(event: string): void {
    injectAppMetrics().track(event);
  }
}
```

Все три переживают бандлер, потому что ни одна не полагается на то, что в графе модулей есть граница
там, где её хочет спека. В этом и суть: `vi.mock` и `vi.spyOn` по модулю оба ставят на границу,
которую сборка вправе убрать, а шов, который вы написали сами, сборка обязана сохранить.

Когда зависимость внедрена, [`trackInjections`](/ru/utilities/track-injections) — это то, что
проверяет, _каких именно_ коллабораторов точка входа действительно запросила; на этот вопрос обычно
и подменял ответ мок barrel-модуля.

## `moduleNamespace(exports, options?)` {#modulenamespace-exports-options}

```ts
vi.mock('shaka-player', () => moduleNamespace({ Player: mockConstructor(() => playerStub) }));
```

Возвращает `{ ...exports, default, __esModule: true }` — форму, которую щупает через
`mod.default ?? mod` любая зависимость, написанная так, чтобы работать и как CommonJS, и как ESM.
`default` — всё пространство имён, если только фабрика не указала свой.

Отсутствующий `default` — то падение, которое это убирает. Фабрика, возвращающая голые именованные
экспорты, заставляет Vitest бросить `No "default" export is defined on the mock` **изнутри этой самой
зависимости**, со стеком, который называет библиотеку, а не фабрику тремя строками выше в спеке.

### Модуль, чей дефолтный экспорт _и есть_ зависимость {#a-module-whose-default-export-is-the-dependency}

Библиотека дат, плеер, сгенерированный клиент — уйма пакетов экспортирует единственную вызываемую
сущность как свой дефолт, и именно её заглушает спека:

```ts
const format = vi.fn(() => 'Monday');

vi.mock('dayjs', () => moduleNamespace({ default: vi.fn(() => ({ format })) }));
```

`default`, который записала фабрика, — это `default`, который несёт пространство имён. Подмена его
объектом пространства имён — то, что превращало `default(…)` в `default is not a function` внутри
зависимости: то же самое падение, ради удаления которого этот хелпер и существует, только пришедшее
с другой стороны. `ModuleNamespace<T>` типизирован под это: `default` — это тип того `default`,
который фабрика объявила, когда он есть, а иначе — тип самого пространства имён.

### `lenient` {#lenient}

```ts
vi.mock('shaka-player', () => moduleNamespace({ Player }, { lenient: true }));
```

Читает экспорт, которого фабрика не определила, как `undefined`, а не бросает.

Строгое поведение по умолчанию лучше: оно ловит фабрику, разъехавшуюся с модулем, который она
изображает. Но Jest не бросал, поэтому перенесённая с него сюита может тянуться за экспортами,
которые никогда не заглушала, — и там защита срабатывает внутри продакшен-кода, за несколько кадров
от ассерта, который сказал бы, чего тест на самом деле хотел. Включите послабление, чтобы сначала
перенести, а затянуть позже.

`then` и символьные ключи не присваиваются никогда, в любом режиме: пространство имён, отвечающее на
`then`, было бы принято за промис у `await import(…)` и никогда бы не зарезолвилось.

### `passthrough` {#passthrough}

```ts
vi.mock('./api', async (importOriginal) => moduleNamespace(await importOriginal<typeof import('./api')>(), { passthrough: true }));
```

Каждый экспорт-функция становится спаем, который выполняет настоящую функцию, пока тест его не
настроит, и в любом случае записывает каждый вызов. Это `vi.mock(path, { spy: true })` из Vitest с
хелперами этой библиотеки сверху — `calledWith`, `mustBeCalledWith`, `resolveWith` — и то же правило,
что у [`createSpyFromInstance(obj, { passthrough: true })`](/ru/core/create-spy-from-class#passthrough):

- **Настроенный экспорт отдаётся целиком.** Цепочка `calledWith(7)` отвечает `undefined` на
  `loadUser(1)`, как у любого другого спая; к настоящему `loadUser` она не откатывается.
- **`resetAutoSpy(api)` возвращает настоящую функцию.**
- **Классы и значения остаются как есть.** Классу нужен `new`, а дубль для этого —
  [`mockConstructor`](/ru/utilities/constructor-doubles). Вложенные объекты не обходятся.

Экспорты типизированы как собственные функции модуля, поэтому до хелперов добирайтесь через
[`adoptMock`](#adoptmock-mock-options): спай, построенный этой библиотекой, он возвращает как есть.

```ts
import { loadUser } from './api';

adoptMock(loadUser).calledWith(7).resolveWith({ id: 7, name: 'Ada' });
```

## `adoptMock(mock, options?)` {#adoptmock-mock-options}

```ts
import { loadUser } from './api';
import { greet } from './greeting';

vi.mock('./api', () => ({ loadUser: vi.fn() }));

it('greets the user it loaded', async () => {
  adoptMock(loadUser).calledWith(7).resolveWith({ id: 7, name: 'Ada' });

  await expect(greet(7)).resolves.toBe('Hello, Ada');
});
```

Фабрика `vi.mock` строит собственные `vi.fn()`, и спека получает их обратно с типами настоящих
функций: `mockResolvedValue` есть, `calledWith` и `resolveWith` — нет. `adoptMock` забирает такой мок
**на месте**. Это тот же объект — тестируемый код держит его через замоканный модуль, так что копия
ничего бы не настроила, — вызовы, которые он уже записал, остаются записанными, а возвращается он
с типом спая функции по сигнатуре самого экспорта.

- **Пока тест не настроил мок, ничего не меняется.** Ненастроенный вызов получает то, что мок
  отвечал раньше: реализацию, с которой он был построен (`vi.fn(impl)`), или `undefined`. После
  настройки решает настройка, как у любого спая: список аргументов, которому не подошёл ни один
  `calledWith`, получает значение спая по умолчанию.
- **Сбросы раннера её не трогают.** `vi.resetAllMocks()`, `mockReset: true` и `mockRestore()`
  очищают вызовы и оставляют настройку — так же, как на любом спае, который строит эта библиотека.
  `resetAutoSpy(loadUser)` — или `resetAutoSpy(api)` на пространстве имён — сбрасывает настройку и
  возвращает собственную реализацию мока.
- **Повторный вызов безвреден.** Тот же мок или спай, построенный этой библиотекой, возвращается
  без изменений.
- **`name`** — имя, которым его называет промах `mustBeCalledWith`. По умолчанию — собственное имя
  мока.

Обычная функция отвергается с отсылкой к `assertMocked`: она означает, что мок модуля не применился,
а настройка настоящей функции лишь сдвинула бы тишину на строку ниже.

### Где это работает {#where-it-works}

| Раннер                  | Забирает |                                                                                                                                                                                         |
| ----------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vitest `vi.fn()`        | да       | Настройка переживает `vi.resetAllMocks()`, `mockReset: true` и `mockRestore()`.                                                                                                         |
| Rstest `rstest.fn()`    | да       | То же, через `rstest.resetAllMocks()`.                                                                                                                                                  |
| Bun `mock()`            | да       | `mockReset` у Bun только для чтения, поэтому `jest.resetAllMocks()` сбрасывает настройку — как и на любом спае, который эта библиотека строит на Bun. Сбрасывайте через `resetAutoSpy`. |
| `node:test` `mock.fn()` | нет      | Он не умеет сообщить свою реализацию, а `mock.restoreAll()` молча вернул бы её поверх настройки. Постройте дубль через `createFunctionSpy` и передайте его.                             |

### Спай, который вызывает оригинал {#a-spy-that-calls-through}

`vi.spyOn(obj, 'method')` без реализации и каждый экспорт `vi.mock(path, { spy: true })` выполняют
оригинал, о котором не сообщают: `getMockImplementation()` отвечает `undefined`, как у голого
`vi.fn()`. Забранный, такой мок отвечает `undefined` на ненастроенный вызов. Чтобы записывать
вызовы, выполнять настоящий код и настроить один случай, стройте спаи так с самого начала —
[`passthrough`](#passthrough) для модуля,
[`createSpyFromInstance(obj, { passthrough: true })`](/ru/core/create-spy-from-class#passthrough) для
объекта.

## `vi.doMock`, динамический импорт и `assertMocked` {#vi-domock-a-dynamic-import-and-assertmocked}

`vi.mock` поднимается над импортами — поэтому он и работает, и поэтому же его фабрика не видит
ничего, что объявляет тест. Выход — `vi.doMock`: он не поднимается, поэтому может отличаться от теста
к тесту, — и действует только на то, что импортировано **после** него. Это делает его самым тихим
моком из всех: статический импорт наверху файла уже держит настоящий модуль, и ничего не падает.

```ts
afterEach(() => {
  vi.doUnmock('./api');
  vi.resetModules();
});

it('greets the user it loaded', async () => {
  vi.doMock('./api', () => ({ loadUser: vi.fn() }));

  const api = assertMocked(await import('./api'), { specifier: './api', exports: ['loadUser'] });
  const { greet } = await import('./greeting');

  adoptMock(api.loadUser).calledWith(7).resolveWith({ id: 7, name: 'Ada' });

  await expect(greet(7)).resolves.toBe('Hello, Ada');
});
```

Рецепт держится на трёх вещах:

- **Тестируемый код тоже импортируйте после `doMock`.** `./greeting`, импортированный наверху файла,
  связал настоящий `./api` ещё до запуска теста; `assertMocked` на пространстве имён этого не видит.
- **`vi.resetModules()` в `afterEach`,** чтобы динамический импорт следующего теста заново вычислил
  модуль, а не вернул тот, что замокал этот тест.
- **`assertMocked` на пространстве имён, которое вернул импорт.** Под бандлером `vi.doMock` так же
  молчалив, как `vi.mock`, и именно эта строка об этом скажет.

## Чего это не делает {#what-this-does-not-do}

Хелпер не умеет заставить `vi.mock` всплыть изнутри другой функции, поэтому никакого
`mockModule('x', factory)` здесь нет — Vitest поднимает буквальный вызов `vi.mock`, а обёртка над ним
поднялась бы как вызов функции, которой ещё не существует. Когда фабрике и тестам нужна общая
фикстура, механизм — `vi.hoisted`:

```ts
const stripe = vi.hoisted(() => {
  const charge = vi.fn();

  return { charge, createClient: vi.fn(() => ({ charge })) };
});

vi.mock('stripe', () => moduleNamespace(stripe));
```
