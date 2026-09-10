---
title: Заглушки observer-ов
description: stubIntersectionObserver и его родня — подменить observer, который компонент создаёт сам, на такой, которым управляет спека, и автоматически получить настоящий глобал обратно.
---

# Заглушки observer-ов

::: tip Переехало в 4.0.0
Раньше это экспортировалось из корневой точки входа. Реэкспорт в ESM жадный, и ни один раннер не
делает tree-shaking тестового файла, так что каждая спека в каждом проекте — включая Node-сервисы —
вычисляла DOM-заглушки только ради `createSpyFromClass`. Теперь они живут за
`vitest-auto-spy/dom-stubs`: **−0.159 мс** на каждом файле спеки, который их не импортирует,
**+0.155 мс** на тех, которые импортируют, и 20.3 кБ долой из `dist`.
Те же хелперы, те же сигнатуры; `restoreMockedProps()` и `setupAutoSpy()` из корня по-прежнему
возвращают на место всё, что было пропатчено здесь.
:::

```ts
import { intersectionEntry, stubIntersectionObserver } from 'vitest-auto-spy/dom-stubs';

it('reveals the card once it scrolls into view', async () => {
  const observers = stubIntersectionObserver();
  const fixture = TestBed.createComponent(RevealHost);

  fixture.detectChanges(); // директива создаёт свой observer

  observers.last.emit([intersectionEntry(fixture.nativeElement, true)]);
  await fixture.whenStable();

  expect(fixture.nativeElement.classList).toContain('is-visible');
});
```

У `IntersectionObserver`, `ResizeObserver` и `MutationObserver` общая форма, из-за которой их
неудобно тестировать. Код под тестом создаёт observer сам, держит инстанс приватным, и единственное,
до чего дотягивается спека, — глобальный конструктор. Значит, спеке приходится перехватить создание,
запомнить колбэк и вызвать его с entries, собранными руками, — сорок строк, которые ничего не говорят
о компоненте и которые каждый проект пишет заново.

Две детали превращают самописную версию из просто занудной в неправильную.

## Заглушка, которую никто не снимает {#the-stub-nobody-takes-off}

Спека, которая присваивает `globalThis.IntersectionObserver` напрямую, там его и оставляет. При
`isolate: false` следующий файл в воркере наследует её и падает на чём-то постороннем —
`.observe is not a function` или ассерт, который никогда не срабатывает, — указывая на невиновный код.

Установка здесь идёт через `mockValueProp`, поэтому `restoreMockedProps()` — который
[`setupAutoSpy()`](./setup) и так вызывает после каждого теста — возвращает настоящий конструктор на
место без всякого тирдауна с вашей стороны.

## Инстанс, до которого добираются через статическое поле {#the-instance-reached-through-a-static-field}

`MockObserver.last` — обычный трюк, и это разделяемое изменяемое состояние, переживающее файл ровно
так же, как заглушка: observer, созданный одной спекой, всё ещё лежит там, где его найдёт следующая.

Здесь инстансами владеет хендл, который вернул установщик, поэтому ничто не переживает создавшую его
спеку. Обращение к `last`, когда код под тестом ничего не создал, бросает ошибку и говорит об этом
прямо, вместо того чтобы упасть тремя строками позже на `undefined`:

```text
[vitest-auto-spy] stubObserver('IntersectionObserver'): the code under test has not constructed an
IntersectionObserver. Render the component (or run the effect) before reaching for `last`, and
check that the stub was installed before the construction rather than after it.
```

## Хендл {#the-handle}

```ts
const observers = stubResizeObserver();

observers.instances; // все observer-ы, созданные с момента установки заглушки, по порядку
observers.last; // самый свежий — обычный случай, когда компонент строит ровно один
```

Каждый инстанс отдаёт наружу то, что спека проверяет, и то, чем она управляет:

| Член            | Что это                                                                     |
| --------------- | --------------------------------------------------------------------------- |
| `targets`       | всё, что передали в `observe`, с учётом `unobserve`/`disconnect`            |
| `observe`       | спай — чтобы проверить, _что_ наблюдение вообще началось, и за чем именно   |
| `unobserve`     | спай                                                                        |
| `disconnect`    | спай                                                                        |
| `disconnected`  | отработал ли тирдаун — читаемая форма проверки на `disconnect`              |
| `emit(entries)` | вызвать колбэк одной пачкой, ровно так, как их доставляет браузер           |

`emit` принимает массив, а не одну запись, и это сделано намеренно. Быстрый скролл или шторм ресайзов
доставляет сразу несколько, и код, который считает, что на вызов приходится одна запись, — настоящий
баг, до которого так можно дотянуться:

```ts
observers.last.emit([intersectionEntry(first, false), intersectionEntry(second, true)]);
```

## Построение entries {#building-entries}

`intersectionEntry(target, isIntersecting, overrides?)` заполняет поля, которые никто не читает.
`intersectionRatio` вычисляется, а не принимается снаружи, потому что расхождение между этими двумя —
не то состояние, которое производит браузер: спека, которая разводит их в стороны, проверяет то, чего
не бывает.

```ts
intersectionEntry(element, true);
intersectionEntry(element, true, { boundingClientRect: new DOMRect(0, 0, 200, 100) });
```

Поля с прямоугольниками не заполняются, пока их не попросят. Сочинять четыре `DOMRectReadOnly` ради
ассерта, который смотрит на `isIntersecting`, — это церемония, а не достоверность, а `overrides`
подставит то, что конкретный компонент действительно читает.

Для `ResizeObserver` и `MutationObserver` entries остаются вашими, потому что читаемое из них
компонентом слишком разное, чтобы угадывать:

```ts
observers.last.emit([{ contentRect: { width: 320 } } as ResizeObserverEntry]);
```

## Замена рукописной заглушки глобала {#replacing-a-hand-rolled-global-stub}

Форма, которую это заменяет, — встречается в поле и пишется руками чаще, чем нужно:

```ts
// было — девятнадцать строк, каст и восстановление, о котором надо помнить
const original = global.IntersectionObserver;

global.IntersectionObserver = class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
} as unknown as typeof IntersectionObserver;

afterEach(() => {
  global.IntersectionObserver = original;
});
```

```ts
// стало
const observer = stubIntersectionObserver();
```

Одной строкой приезжает три вещи: заглушка — настоящий дубль, которым спека управляет
(`observer.emit(...)`); присваивание регистрируется как патч свойства, поэтому `restoreMockedProps()`
(а значит и `setupAutoSpy()`) возвращает глобал сам; и `as unknown as` исчезает, потому что заглушка
типизирована тем же типом, что и глобал, который она подменяет.

Рукописную форму не оставляют на ревью — о ней сообщает
[`prefer-observer-stub`](./eslint-plugin#the-observer-stub-everybody-writes-again): оно ловит все три
написания — присваивание выше, `vi.stubGlobal('IntersectionObserver', Fake)` и
`vi.spyOn(globalThis, 'ResizeObserver')` — и называет хелпер, который его заменяет. В
`configs.recommended` это `error`, как и все остальные правила плагина.

## Установщики {#the-installers}

| Функция                      | Какой глобал подменяет   |
| ---------------------------- | ------------------------- |
| `stubIntersectionObserver()` | `IntersectionObserver`    |
| `stubResizeObserver()`       | `ResizeObserver`          |
| `stubMutationObserver()`     | `MutationObserver`        |
| `stubObserver(name)`         | любой из трёх, по имени   |

Все четыре экспортируются из основной точки входа — ничто здесь не привязано к Angular, а спаи
приходят от того [рантайм-адаптера](../runtimes/vitest), который зарегистрирован, так что всё это
работает и на Bun, и на `node:test`.

::: tip Angular без зоны
`emit` выполняет колбэк компонента синхронно; запланированный им change detection — нет.
Добавьте следом `await fixture.whenStable()` или [`stable(fixture)`](../adapters/angular#zoneless-waiting).
:::

## Ставьте её в `beforeEach`, никогда в `beforeAll` {#install-it-in-beforeeach-never-in-beforeall}

Корневой `beforeEach` из общего сетап-файла выполняется **после** `beforeAll` файла. Значит, заглушку,
поставленную в `beforeAll`, перезатрёт дефолтный observer из сетап-файла ещё до старта первого теста,
а симптомом будет `expected "vi.fn()" to be called 2 times, but got 0 times` в файле, где мок-класс
лежит десятью строками выше ассерта.

Поэтому правило, парное к «не присваивайте `globalThis.IntersectionObserver` руками», звучит так: и
не ставьте её в `beforeAll` тоже.

## `autoEmit` — всё видно, и сразу {#autoemit-—-everything-is-visible-immediately}

```ts
stubIntersectionObserver({ autoEmit: true });
```

Заглушка по умолчанию инертна, и это правильно, когда спека хочет сама выбрать момент пересечения. Это
неправильно для сюиты, перенесённой с Jest, где глобальный мок дёргал свой колбэк с
`isIntersecting: true` синхронно из `observe()`, так что лениво загружаемые секции и карточки тянули
свои данные прямо во время `detectChanges()`. Против инертного observer-а такие спеки тихо проверяют
компонент, который ничего не загрузил, и падают на чём-то, не имеющем отношения к пересечению, — вот
одна опция вместо переписывания каждой спеки.

`stubObserver` принимает общую форму, где запись вы строите сами:

```ts
stubObserver<ResizeObserverEntry, Element>('ResizeObserver', {
  autoEmit: (target) => resizeEntry(target, { width: 320 }),
});
```

## `options` — с чем позвали конструктор {#options-—-what-the-constructor-was-given}

```ts
new IntersectionObserver(callback, { rootMargin: '-20% 0px -70% 0px' });

expect(observers.last.options).toEqual({ rootMargin: '-20% 0px -70% 0px' });
```

Компонент, который строит по одному observer-у на конфигурацию, утверждает контракт — «один observer
на уникальный root margin», — и без этого единственное, что спека может посчитать, — количество
созданий, а это более слабое утверждение и вообще про другое.

## Построение entries {#building-entries-1}

```ts
import { intersectionEntry, mutationRecord, resizeEntry } from 'vitest-auto-spy/dom-stubs';

observers.last.emit([intersectionEntry(element, true)]);
observers.last.emit([mutationRecord(host, { addedNodes: [span] })]);
observers.last.emit([resizeEntry(host, { width: 320, height: 200 })]);
```

У `IntersectionObserverEntry` семь обязательных полей, из которых продакшен-код обычно читает одно, и
типы не сузить — этому мешает контравариантность параметров, так что альтернатива — двойное приведение
типа в каждой спеке.

С `MutationRecord` хуже: его вообще нельзя записать объектным литералом, потому что `addedNodes` и
`removedNodes` — это `NodeList`. Очевидная конструкция — добавить узлы в `DocumentFragment` и взять
его `childNodes` — как раз та, которой надо избегать, потому что добавление **перемещает** узел: спека,
передающая только что отрендеренный элемент, молча вырывает его из фикстуры, и следующий ассерт падает
на DOM, который сломал сам тест. `mutationRecord()` строит список, поддерживающий индексацию, `item()`,
`forEach`, `for…of`, `entries`/`keys`/`values`, — и ничего не перемещает.
