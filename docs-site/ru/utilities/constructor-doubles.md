---
title: Подмены конструкторов
description: mockConstructor и stubConstructor создают подмену, которую проверяемый код может вызвать через new, а vi.fn() со стрелочной функцией так не умеет.
---

# Подмены конструкторов

Эти хелперы нужны, когда ваш код вызывает `new` для того, что вы хотите подменить: `new Image()` для
пикселя трекинга, `new Worker()`, `new WebSocket()`, платёжный виджет или SDK плеера. `vi.fn()` со
стрелочной функцией не может заменить конструктор, а они могут.

```ts
import { stubConstructor } from 'vitest-auto-spy';

it('fires the tracking pixel', () => {
  const Image = stubConstructor(globalThis, 'Image', () => ({ src: '' }));

  tracker.ping();

  expect(Image).toHaveBeenCalledTimes(1);
  expect(Image.instances[0].src).toBe('https://tns.example/hit');
});
```

## Какую ошибку это заменяет {#the-mistake-this-replaces}

В Jest `jest.fn().mockImplementation(() => instance)` работал с `new`. Vitest при `new` вызывает
реализацию мока, только если эту реализацию можно вызвать через `new`. Стрелочную функцию нельзя. Вызов
записывается, тело не выполняется, и `new` возвращает пустой объект. Vitest печатает предупреждение
в stderr («the mock did not use 'function' or 'class' in its implementation»), но далеко от места
падения.

Вместо этого вы видите одно из двух, и ни то, ни другое не указывает на спеку:

- `TypeError: (cb) => {…} is not a constructor` со стеком в коде приложения;
- тест, который проходит не по той причине. У пустого объекта нет методов, и вызов на нём бросает
  ошибку внутри `try`. `catch` пишет её в лог, и проверка
  `expect(logger.err).toHaveBeenCalledWith(expect.any(Error))` проходит.

## `mockConstructor(factory, name?)` {#mockconstructor-factory-name}

Возвращает мок, который работает и с `new`. Всё обычное для мока по-прежнему работает
(`toHaveBeenCalledWith`, `mockClear`, `mock.calls`), а `new` вызывает вашу фабрику.

```ts
import { mockConstructor, mockValueProp } from 'vitest-auto-spy';

const LicenseClient = mockConstructor<LicenseClient>(() => ({ prepareRequest: vi.fn() }));

mockValueProp(shaka.net, 'LicenseClient', LicenseClient);
player.load(url);

expect(LicenseClient).toHaveBeenCalledWith('widevine');
expect(LicenseClient.instances[0].prepareRequest).toHaveBeenCalled();
```

| Параметр  | Тип              | По умолчанию        | Смысл                                              |
| --------- | ---------------- | ------------------- | -------------------------------------------------- |
| `factory` | `(...args) => T` | —                   | Создаёт один экземпляр; получает аргументы `new`   |
| `name`    | `string`         | `'mockConstructor'` | Показывается в выводе проверок и в ошибках хелпера |

- **`instances`** (например, `Image.instances`) хранит то, что создала фабрика, в порядке создания.
  `mockClear()` его не очищает, так что объекты можно проверять и после очистки вызовов. Это
  собственный список хелпера; `mock.instances` раннера — отдельный и очищается как обычно.
- **Вызов без `new` бросает ошибку** и называет файл и строку вызова, где потерялся `new`.
- **Фабрика должна вернуть объект.** `new` выбрасывает примитивное возвращаемое значение, поэтому
  фабрика, вернувшая примитив, сразу падает с подсказкой: верните экземпляр из фабрики.

**Частая ошибка:** `vi.fn(() => instance)` в роли конструктора. Вызов записывается, но `new`
возвращает пустой объект. Используйте `mockConstructor(() => instance)`.

## `stubConstructor(target, property, factory)` {#stubconstructor-target-property-factory}

Та же подмена, поставленная на глобал (или на любой объект) и снятая после теста.

```ts
import { stubConstructor } from 'vitest-auto-spy';

const Widget = stubConstructor(window, 'PaymentSdk', (params: PayParams) => ({ render: vi.fn() }));
```

Она ставится через [`mockValueProp`](/ru/utilities/setup), поэтому `restoreMockedProps()` возвращает
настоящий конструктор. `setupAutoSpy()` и так вызывает `restoreMockedProps()` после каждого теста. В этом отличие от
самописного `vi.stubGlobal`: когда файлы спек делят одно окружение (`isolate: false`), заглушку,
которую никто не снял, получает следующий файл спеки и падает на ней.

Для `IntersectionObserver`, `ResizeObserver` и `MutationObserver` есть готовые
[заглушки observer-ов](/ru/utilities/observer-stubs).

## Который из трёх {#which-of-the-three}

| Что у вас                               | Что использовать                                | Откуда импорт               |
| --------------------------------------- | ----------------------------------------------- | --------------------------- |
| настоящий класс во время выполнения     | `createSpyClass(Foo)`; экземпляры — авто-спаи   | `vitest-auto-spy`           |
| только тип или объект, собранный руками | `mockConstructor<T>(() => shape)`               | `vitest-auto-spy`           |
| конструктор лежит на глобале            | `stubConstructor(globalThis, 'Image', factory)` | `vitest-auto-spy`           |
| один из трёх DOM-observer-ов            | `stubIntersectionObserver()` и родственные      | `vitest-auto-spy/dom-stubs` |
| `AbortController`                       | `stubAbortController()`                         | `vitest-auto-spy/dom-stubs` |

`createSpyClass(Foo)` подменяет только конструктор. Если код читает с класса ещё и статические члены
(`Foo.isSupported()`, `Foo.create()`, `Foo.VERSION`), передайте `{ statics: true }` третьим
аргументом. Во что превращается каждый вид статического члена —
[Мост между `Spy<T>` и `T`](/ru/core/spy-typing).

### Конструктор — член подмены {#a-constructor-that-is-a-member-of-a-double}

Ни один из трёх не нужен, когда код добирается до класса **через зависимость**, которую спека уже
подменила, как в `new this.sdk.Client(key)`. Спай на месте этого члена работает с `new`: вызов записывается, а код
получает новый экземпляр или то, что вы настроили для этих аргументов.

```ts
import { createAutoMock } from 'vitest-auto-spy';

const sdk = createAutoMock<Sdk>();

service.connect(); // внутри `new this.sdk.Client(key)`

expect(sdk.Client).toHaveBeenCalledWith(key);
```

Три хелпера выше — для конструктора, до которого код добирается **напрямую**: глобал, который он
называет, импорт, который он вызывает, или настоящий класс, чьи экземпляры должны быть авто-спаями.

## `stubAbortController()` {#stubabortcontroller}

Подменяет `AbortController` и `AbortSignal` версиями, которые работают под jsdom. Нужен, когда
компонент использует `addEventListener(…, { signal })`, а тест под jsdom падает с:

```
TypeError: 'addEventListener' called on an object that is not a valid instance of EventTarget
```

```ts
import { stubAbortController } from 'vitest-auto-spy/dom-stubs';

beforeEach(() => {
  stubAbortController();
});
```

У этой ошибки три участника, и она не называет ни одного. Vitest кладёт `AbortController` из Node
поверх глобалов jsdom, и сигнал оказывается `EventTarget` из Node. Затем zone.js вызывает
`addEventListener` из jsdom с этим сигналом, и jsdom его отвергает. Подмена наследует `EventTarget`
текущего окружения, и его принимают все трое. Она ставится как патч свойства и снимается после теста
вместе со всем остальным.

**Частая ошибка:** ставить её в `beforeAll`. После первого теста её снимут; ставьте в `beforeEach`.

### И статические методы {#the-statics-too}

`AbortSignal.abort()`, `AbortSignal.timeout()` и `AbortSignal.any()` тоже работают на подмене:

```ts
vi.useFakeTimers();
stubAbortController();

const request = client.load(); // fetch(url, { signal: AbortSignal.timeout(5_000) })

vi.advanceTimersByTime(5_000);

await expect(request).rejects.toMatchObject({ name: 'TimeoutError' });
```

`timeout()` срабатывает через `setTimeout`, поэтому фейковые таймеры управляют им, как настоящим.
Таймаут завершает сигнал с `DOMException` по имени `TimeoutError`; любая другая отмена — с
`AbortError`. Ваш код может ветвиться по этому имени, как и на настоящей платформе.
