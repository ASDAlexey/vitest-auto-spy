---
title: Моки модулей, которые ничего не сделали
description: assertMocked проверяет, что vi.mock() применился, moduleNamespace даёт фабрике мока форму, которую ждут библиотеки, а adoptMock добавляет calledWith и resolveWith к мокам, которые она построила.
---

# Моки модулей, которые ничего не сделали

`vi.mock()` может не сработать молча: если бандлер уже встроил модуль, мок ничего не делает и не
печатает предупреждений. Три хелпера делают моки модулей надёжными:

- `assertMocked` роняет тест, если `vi.mock()` не применился;
- `moduleNamespace` даёт фабрике мока форму, которую ждут библиотеки (`default`, `__esModule`);
- `adoptMock` добавляет `calledWith`, `resolveWith` и другие хелперы к моку, который построила
  фабрика.

```ts
import { adoptMock, assertMocked } from 'vitest-auto-spy';

import * as api from './api';
import { greet } from './greeting';

vi.mock('./api', () => ({ loadUser: vi.fn() }));

beforeEach(() => {
  assertMocked(api, { specifier: './api', exports: ['loadUser'] });
});

it('greets the user it loaded', async () => {
  adoptMock(api.loadUser).calledWith(7).resolveWith({ id: 7, name: 'Ada' });

  await expect(greet(7)).resolves.toBe('Hello, Ada');
});
```

## `assertMocked(namespace, options?)` {#assertmocked-namespace-options}

Проверяет, что мок модуля применился, а если нет — падает на этой строке и называет модуль.
Возвращает namespace. Вызывайте в `beforeEach` или сразу после динамического импорта, чтобы падение
было падением теста.

```ts
import * as engine from '@app/pricing-engine';

vi.mock('@app/pricing-engine');

beforeEach(() => {
  assertMocked(engine, { specifier: '@app/pricing-engine', exports: ['createEngine'] });
});
```

| Опция       | Тип        | По умолчанию               | Смысл                                                       |
| ----------- | ---------- | -------------------------- | ----------------------------------------------------------- |
| `specifier` | `string`   | —                          | Путь, который вы передали в `vi.mock`; попадает в падение   |
| `exports`   | `string[]` | хотя бы один экспорт — мок | Каждый из перечисленных экспортов должен быть моком раннера |

Без `exports` проверяется, что хотя бы один экспорт — мок. Перечисляйте `exports`, когда фабрика
мокает часть модуля, а остальное реэкспортирует. Иначе фабрика, которая забыла замокать нужный тесту
экспорт, всё равно пройдёт проверку.

Падение называет экспорт, оставшийся настоящим, и вероятную причину:

```text
[vitest-auto-spy] assertMocked('./api'): loadUser is the real function — the `vi.mock('./api')` for
this file did not apply. The code under test reaches the module through another path (a barrel, an
alias, a bundled entry) — `vi.mock` the specifier it imports, or pass the dependency in as an argument
or a provider.
Docs: https://asdalexey.github.io/vitest-auto-spy/utilities/module-mocks#the-two-ways-vi-mock-becomes-a-no-op
```

**Частая ошибка:** `exports: []`. Такое часто получается из пустого `Object.keys(stubs)`. Пустой
список ничего бы не проверил, поэтому он отклоняется с ошибкой.

### Два способа для `vi.mock` стать no-op {#the-two-ways-vi-mock-becomes-a-no-op}

- **Бандлер уже встроил модуль.** Так бывает под Angular-билдером `@angular/build:unit-test` и в
  `vite-node` с заранее собранной точкой входа. Workspace-алиас (`@scope/lib`) или barrel-файл
  (`index.ts`, который реэкспортирует соседей) там уже внутри бандла. Моку нечего заменять, и
  предупреждения нет.
- **`isolate: false`, и модуль уже загружен в воркере.** Встроенный модуль вроде `node:fs` сохраняет
  мок из того файла спеки, который замокал его первым. Одна и та же спека проходит или падает в зависимости от
  порядка файлов. Прогон, зелёный локально и красный в CI, каждый раз на другом файле, — это оно.

`vi.mock` не исправит ни то, ни другое. Перестаньте мокать модуль: передайте зависимость (провайдер
`TestBed`, аргумент конструктора, параметр функции) и подмените это значение. См.
[Дайте коду точку подмены](#provide-a-real-seam).

В случае «зелёный локально, красный в CI» падение винит более ранний файл, который загрузил модуль
первым. Иначе оно указывает на путь, по которому ваш код импортирует модуль.

## Дайте коду точку подмены {#provide-a-real-seam}

Когда `vi.mock` ничего не сделал, следующей попыткой обычно становится `vi.spyOn` на модуле. Это
падает громко:

```ts
import * as appMetrics from '@app/domain-metrics';

vi.spyOn(appMetrics, 'injectAppMetrics'); // TypeError: Cannot redefine property: injectAppMetrics
```

Причина та же. Когда бандлер встроил модуль, его экспорты — живые привязки (live bindings): ссылки
на переменные модуля только для чтения, а не обычные свойства объекта. Их не заменит ни одна
библиотека спаев: ни `vi.spyOn`, ни `jest.spyOn`, ни `Object.defineProperty`.

Если переопределение идёт через эту библиотеку (спаи аксессоров вроде `observablePropsToSpyOn` или
хелперы `mock*Prop`), вместо голого `TypeError` вы получите полное объяснение:

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

`mockValueProp` / `mockReadonlyProp` начинают с
`Cannot mock the property 'x': it is not configurable, so it cannot be redefined.`, а дальше текст
тот же. Отклонённый патч не оставляет `restoreMockedProps()` ничего, что пришлось бы откатывать.

**Исправляется проверяемый код, а не тест.** Три способа, от самого дешёвого:

```ts
// 1. Внедрите. Код берёт зависимость из DI, и спека подставляет спай.
readonly #metrics = inject(AppMetrics);
// spec: TestBed.configureTestingModule({ providers: [provideAutoSpy(AppMetrics)] });

// 2. Передайте аргументом. Функции, которая получает зависимость параметром, мок не нужен вовсе.
export function priceBasket(items: Item[], rate: RateLookup): number { … }
// spec: priceBasket(items, () => 1.2);

// 3. Заведите свою прослойку. Вызывайте стороннюю функцию через свой класс,
//    и пусть все вызывающие (и все спеки) идут через него.
@Injectable({ providedIn: 'root' })
export class MetricsGateway {
  track(event: string): void {
    injectAppMetrics().track(event);
  }
}
```

Все три переживают бандлер. `vi.mock` и `vi.spyOn` на модуле опираются на границу модуля, которую
сборка может убрать. Точку подмены, которую вы написали сами, сборка обязана сохранить.

Когда зависимость внедряется, [`trackInjections`](/ru/utilities/track-injections) может проверить,
какие зависимости код на самом деле запросил.

## `moduleNamespace(exports, options?)` {#modulenamespace-exports-options}

Оборачивает экспорты фабрики мока в `{ ...exports, default, __esModule: true }`. Используйте в
каждой фабрике `vi.mock` для библиотеки, которая работает и как CommonJS, и как ESM: такие
библиотеки читают `mod.default ?? mod`.

```ts
import { mockConstructor, moduleNamespace } from 'vitest-auto-spy';

vi.mock('shaka-player', () => moduleNamespace({ Player: mockConstructor(() => playerStub) }));
```

`default` — это весь namespace, если фабрика не задала свой `default`.

| Опция         | Тип                         | По умолчанию | Смысл                                                                          |
| ------------- | --------------------------- | ------------ | ------------------------------------------------------------------------------ |
| `lenient`     | `boolean`                   | `false`      | Экспорт, которого нет в фабрике, читается как `undefined`, а не бросает ошибку |
| `passthrough` | `boolean` или `'unmatched'` | `false`      | Оборачивает функции модуля в спаи, которые могут вызывать оригинал             |

**Частая ошибка:** фабрика, которая возвращает голые именованные экспорты. Тогда Vitest бросает
`No "default" export is defined on the mock` изнутри библиотеки, и стек называет библиотеку, а не
вашу фабрику.

### Модуль, чей дефолтный экспорт _и есть_ зависимость {#a-module-whose-default-export-is-the-dependency}

Многие пакеты экспортируют одну функцию по умолчанию: библиотека дат, плеер, сгенерированный
клиент. Задайте `default` в фабрике, и namespace его сохранит:

```ts
const format = vi.fn(() => 'Monday');

vi.mock('dayjs', () => moduleNamespace({ default: vi.fn(() => ({ format })) }));
```

`ModuleNamespace<T>` типизирует `default` как тот, что объявила фабрика, а иначе — как namespace.

### `lenient` {#lenient}

Экспорт, которого нет в фабрике, читается как `undefined`, а не бросает ошибку. Нужно, чтобы
сначала перенести набор тестов с Jest, а фабрики уточнить потом.

```ts
vi.mock('shaka-player', () => moduleNamespace({ Player }, { lenient: true }));
```

Строгий режим по умолчанию лучше: он ловит фабрику, которая разошлась со своим модулем. Но Jest не
бросал ошибок, и перенесённый набор тестов может читать экспорты, которые никто не подменил. Тогда
ошибка появляется глубоко в коде приложения, далеко от теста.

`then` и ключи-символы всегда читаются как отсутствующие, в любом режиме: namespace с `then`
выглядел бы для `await import(…)` как промис, который никогда не завершится.

### `passthrough` {#passthrough}

В обоих режимах `passthrough` оборачивает функции модуля в спаи, которые записывают все вызовы.
Передайте оригинальный модуль:

```ts
vi.mock('./api', async (importOriginal) => moduleNamespace(await importOriginal<typeof import('./api')>(), { passthrough: 'unmatched' }));
```

- **`true`** вызывает оригинал, пока вы не настроите спай. Если задать только `calledWith(7)`, то
  `loadUser(1)` вернёт `undefined`.
- **`'unmatched'`** сохраняет вызов оригинала, если ни одна настройка для этих аргументов не
  сработала. Это касается и случаев, когда ответ `once()` или `times(n)` исчерпан. Подходящий ответ
  `calledWith` имеет приоритет, даже если возвращает `undefined`.
- **`mustBeCalledWith` и ответ по умолчанию имеют приоритет над оригиналом.** Если ни один ответ
  `calledWith` не подошёл, спай проверяет `mustBeCalledWith`: использует заданный ответ или
  выбрасывает ошибку. Если правила `mustBeCalledWith` нет, спай использует ответ по умолчанию
  (например, `resolveWith(fallbackUser)`). Оригинал вызывается только если и такого ответа нет.
- **`resetAutoSpy(api)` удаляет настройки, и спаи снова вызывают оригинальные функции.**
- **Настоящая функция получает `this` вызывающего.** Метод, вызванный как `api.load()` или через
  `.call(owner)`, видит этот `this`.
- **Классы и значения остаются как есть.** Классу нужен `new`; для него есть
  [`mockConstructor`](/ru/utilities/constructor-doubles). Вложенные объекты не обходятся.

Экспорты сохраняют типы функций самого модуля. Чтобы добраться до хелперов, оберните экспорт в
[`adoptMock`](#adoptmock-mock-options) — он возвращает спай библиотеки без изменений:

```ts
import { loadUser } from './api';

adoptMock(loadUser).calledWith(7).resolveWith({ id: 7, name: 'Ada' });
```

## `adoptMock(mock, options?)` {#adoptmock-mock-options}

Берёт мок, построенный фабрикой `vi.mock`, и даёт ему хелперы библиотеки (`calledWith`,
`resolveWith`, `mustBeCalledWith`, …). `vi.fn()` из фабрики приходит в спеку с типом настоящей
функции, и без этого у вас есть только `mockResolvedValue`.

```ts
import { adoptMock } from 'vitest-auto-spy';

import { loadUser } from './api';
import { greet } from './greeting';

vi.mock('./api', () => ({ loadUser: vi.fn() }));

it('greets the user it loaded', async () => {
  adoptMock(loadUser).calledWith(7).resolveWith({ id: 7, name: 'Ada' });

  await expect(greet(7)).resolves.toBe('Hello, Ada');
});
```

| Опция         | Тип           | По умолчанию    | Смысл                                                            |
| ------------- | ------------- | --------------- | ---------------------------------------------------------------- |
| `name`        | `string`      | имя самого мока | Имя в сообщении об ошибке `mustBeCalledWith`                     |
| `passthrough` | `'unmatched'` | —               | Сохраняет прежнюю реализацию для вызовов без ответа `calledWith` |

Укажите `passthrough: 'unmatched'`, чтобы подменить ответ для одних аргументов и сохранить прежнюю
реализацию мока для остальных:

```ts
const format = adoptMock(
  vi.fn((id: number) => `User ${id}`),
  { passthrough: 'unmatched' },
);
format.calledWith(7).mockReturnValue('Ada');

format(7); // 'Ada'
format(1); // 'User 1'
```

Как и в [режиме `passthrough` для модуля](#passthrough), ответ по умолчанию имеет приоритет над
прежней реализацией. Если вызов не проходит проверку `mustBeCalledWith`, спай выбрасывает ошибку и
не использует ни ответ по умолчанию, ни прежнюю реализацию.

- **Это тот же объект, а не копия.** Ваш код держит этот мок через замоканный модуль, и настройка
  копии ничего бы не дала. Уже записанные вызовы остаются. Возвращается спай с сигнатурой самого
  экспорта.
- **Без `passthrough` настройка `calledWith` отключает прежнюю реализацию.** До настройки мок
  вызывает прежнюю реализацию, если она есть. После настройки вызов без подходящего ответа
  `calledWith` вернёт `undefined`, если нет ответа по умолчанию или правила `mustBeCalledWith`.
- **Сбросы раннера сохраняют настройку.** В отличие от обычного `vi.fn()`, здесь
  `vi.resetAllMocks()`, `mockReset: true` и `mockRestore()` очищают только вызовы и оставляют
  настройку, как у любого спая библиотеки. `resetAutoSpy(loadUser)` или
  `resetAutoSpy(api)` на namespace сбрасывают настройку.
- **Повторный `adoptMock` ничего не меняет.** Хелпер возвращает тот же мок или спай библиотеки.
  Задайте `passthrough` при первом вызове `adoptMock` или в `moduleNamespace`, если спай создал он.

**Частая ошибка:** передать обычную функцию. Она отклоняется с подсказкой про `assertMocked`: обычная
функция значит, что мок модуля не применился.

### Где это работает {#where-it-works}

| Раннер                  | Принимает | Примечание                                                                                                                                           |
| ----------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vitest `vi.fn()`        | да        | Настройка переживает `vi.resetAllMocks()`, `mockReset: true` и `mockRestore()`.                                                                      |
| Rstest `rstest.fn()`    | да        | То же, через `rstest.resetAllMocks()`.                                                                                                               |
| Bun `mock()`            | да        | `mockReset` в Bun только для чтения, поэтому `jest.resetAllMocks()` сбрасывает настройку, как у любого спая в Bun. Сбрасывайте через `resetAutoSpy`. |
| `node:test` `mock.fn()` | отклоняет | Он не сообщает свою реализацию, а `mock.restoreAll()` молча перезапишет настройку. Создайте спай через `createFunctionSpy` и передайте его.          |

### Спай, который вызывает оригинал {#a-spy-that-calls-through}

`vi.spyOn(obj, 'method')` без реализации и каждый экспорт `vi.mock(path, { spy: true })` вызывают
настоящую функцию, но библиотеке её не показывают. После `adoptMock` такой мок отвечает `undefined`
на ненастроенный вызов.

Если нужен спай, который записывает вызовы, выполняет настоящий код и позволяет настроить один
случай, создавайте его так с самого начала: [`passthrough`](#passthrough) для модуля,
[`createSpyFromInstance(obj, { passthrough: true })`](/ru/core/create-spy-from-class#passthrough) для
объекта.

## `vi.doMock`, динамический импорт и `assertMocked` {#vi-domock-a-dynamic-import-and-assertmocked}

`vi.doMock` не поднимается наверх файла, поэтому может отличаться от теста к тесту. Он действует
только на модули, импортированные **после** него. Статический импорт в начале файла уже держит
настоящий модуль, и ничего не падает. Используйте такой рецепт:

```ts
import { adoptMock, assertMocked } from 'vitest-auto-spy';

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

1. **Проверяемый код тоже импортируйте после `vi.doMock`.** Импорт `./greeting` в начале файла уже
   привязал настоящий `./api`, и `assertMocked` этого не увидит.
2. **Вызывайте `vi.resetModules()` в `afterEach`,** чтобы импорт в следующем тесте загрузил модуль
   заново.
3. **Вызывайте `assertMocked` на namespace, который вернул импорт.** Под бандлером `vi.doMock` так
   же молчалив, как `vi.mock`, и эта строка вам об этом скажет.

## Чего это не делает {#what-this-does-not-do}

Хелпера `mockModule('x', factory)` нет. Vitest поднимает наверх буквальный вызов `vi.mock`, а обёртка
вокруг него поднялась бы как вызов функции, которой ещё нет. Чтобы фабрика и тесты делили общую
фикстуру, используйте `vi.hoisted`:

```ts
const stripe = vi.hoisted(() => {
  const charge = vi.fn();

  return { charge, createClient: vi.fn(() => ({ charge })) };
});

vi.mock('stripe', () => moduleNamespace(stripe));
```
