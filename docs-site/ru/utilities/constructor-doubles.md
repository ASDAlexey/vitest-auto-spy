---
title: Дубли-конструкторы
description: mockConstructor и stubConstructor — дубль, который тестируемый код может позвать через `new`, потому что vi.fn() так не умеет.
---

# Дубли-конструкторы

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

`jest.fn().mockImplementation(() => instance)` обслуживал `new` под Jest, поэтому любая сюита,
достаточно старая, чтобы успеть замокать глобальный конструктор, носит в себе эту форму:
`new Image()` для трекинг-пикселя, `new Worker()`, `new WebSocket()`, `new Audio()`, платёжный
виджет или SDK плеера, опубликованный как глобальный класс.

Vitest пробрасывает `new` только в такую реализацию, которая **сама конструируема**, а стрелочная
функция — нет. Вызов записывается, тело не исполняется, и `new` отдаёт пустой объект. Vitest печатает
предупреждение в stderr — «the mock did not use 'function' or 'class' in its implementation» — но
оно не рядом с падением, а в прогоне по монорепозиторию это одна строка среди тысяч.

Вместо этого приходит одно из двух, и ни то, ни другое не показывает на спеку:

- `TypeError: (cb) => {…} is not a constructor`, со стеком **в продакшен-коде** и с текстом стрелки
  в сообщении, но без единого слова о том, что проблема именно в стрелке;
- зелёный тест по неверной причине: у пустого объекта нет методов, вызов бросает внутри `try`,
  `catch` логирует, и `expect(logger.err).toHaveBeenCalledWith(expect.any(Error))` доволен.

## `mockConstructor(factory, name?)` {#mockconstructor-factory-name}

Возвращает мок раннера, который заодно является конструктором. Всё, что мок умел, работает
по-прежнему — `toHaveBeenCalledWith`, `mockClear`, `mock.calls` — а `new` доходит до фабрики.

```ts
import { mockConstructor } from 'vitest-auto-spy';

const LicenseClient = mockConstructor<LicenseClient>(() => ({ prepareRequest: vi.fn() }));

mockValueProp(shaka.net, 'LicenseClient', LicenseClient);
player.load(url);

expect(LicenseClient).toHaveBeenCalledWith('widevine');
expect(LicenseClient.instances[0].prepareRequest).toHaveBeenCalled();
```

- **`instances`** собирает то, что произвела фабрика, в порядке конструирования. Этим владеет хелпер,
  а не раннер, поэтому `mockClear()` его не опустошает — очистить запись вызовов и забыть объекты,
  на которые спека ещё пишет ассерты, это разные желания, и первое закрывает собственный
  `mock.instances` раннера.
- **Вызванный без `new`, он бросает по имени.** Сегодня единственный способ узнать, что дубль
  использовали неправильно, — `TypeError` несколькими кадрами вглубь чужого кода.
- **Фабрика обязана вернуть объект.** JavaScript выбрасывает примитив, возвращённый из `new`, поэтому
  фабрика, отдающая примитив, вручила бы тестируемому коду нечто, чего спека не настраивала; вместо
  этого о таком сообщается сразу.

## `stubConstructor(target, property, factory)` {#stubconstructor-target-property-factory}

Тот же дубль, но поставленный на глобал (или на любой объект) и снятый оттуда за вас.

```ts
const Widget = stubConstructor(window, 'MTSPay', (params: PayParams) => ({ render: vi.fn() }));
```

Установка идёт через [`mockValueProp`](/ru/utilities/setup), так что `restoreMockedProps()` —
который `setupAutoSpy()` и так гоняет после каждого теста — возвращает настоящий конструктор на
место. В этом и отличие от написанного руками `vi.stubGlobal`: при `isolate: false` заглушка,
которую никто не снял, наследуется следующим файлом в том же воркере и падает уже там.

Это обобщение [заглушек обсерверов](/ru/utilities/observer-stubs) на всё остальное, что платформа
публикует как класс, а продакшен-код конструирует напрямую.

## Который из трёх {#which-of-the-three}

| Что у вас есть                        | Что использовать                                |
| ------------------------------------- | ----------------------------------------------- |
| настоящий класс в рантайме            | `createSpyClass(Foo)` — экземпляры авто-спаи    |
| только тип или собранная руками форма | `mockConstructor<T>(() => shape)`               |
| конструктор лежит на глобале          | `stubConstructor(globalThis, 'Image', factory)` |
| это один из трёх DOM-обсерверов       | `stubIntersectionObserver()` и компания         |
| это `AbortController`                 | `stubAbortController()`                         |

Две нижние строки с 4.0.0 импортируются из `vitest-auto-spy/dom-stubs`, а не из корня — см.
[Заглушки обсерверов](./observer-stubs). `mockConstructor`, `stubConstructor` и `createSpyClass`
остались в корне: они про `new`, а не про DOM.

## `stubAbortController()` {#stubabortcontroller}

`element.addEventListener('pointerdown', handler, { signal })` — рекомендованный с Angular 16 способ
отцеплять слушатели, и в прогоне на jsdom он падает с сообщением, которое не называет ни одну из трёх
виноватых сторон:

```
TypeError: 'addEventListener' called on an object that is not a valid instance of EventTarget
```

Vitest кладёт семейство fetch из Node поверх глобалов jsdom, поэтому сигнал — это _нодовый_
`EventTarget`; zone.js регистрирует слушателя abort через собственный `addEventListener` из jsdom, а
получателем идёт этот сигнал; jsdom проверяет бренд получателя и отказывает. Бросает jsdom, причина —
Node, спусковой крючок — zone.js, а виноватым назначают тестируемый компонент.

```ts
import { stubAbortController } from 'vitest-auto-spy/dom-stubs';

beforeEach(() => {
  stubAbortController();
});
```

Замена наследуется от того `EventTarget`, который принадлежит текущему realm, — единственного, о чём
все три стороны договорились. Ставится она как патч свойства, поэтому снимается вместе со всем
остальным.
