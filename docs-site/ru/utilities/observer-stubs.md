---
title: Заглушки observer-ов
description: stubIntersectionObserver и родственные подменяют observer, который компонент создаёт сам, на тот, которым управляет спека, и после теста возвращают настоящий глобал.
---

# Заглушки observer-ов

Эти заглушки нужны, чтобы протестировать компонент, который сам создаёт `IntersectionObserver`,
`ResizeObserver` или `MutationObserver`. Заглушка запоминает каждый observer, который создал
компонент, и даёт спеке вызвать его колбэк. После каждого теста настоящий глобал возвращается.

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

Всё на этой странице импортируется из `vitest-auto-spy/dom-stubs`. Ничего специфичного для Angular
здесь нет: спаи берутся из зарегистрированного [адаптера раннера](../runtimes/vitest), поэтому
заглушки работают и в Bun, и в `node:test`.

::: tip Zoneless Angular
`emit` сразу вызывает колбэк компонента, но change detection, который он запланировал, ещё не
выполнен. После него вызовите `await fixture.whenStable()` или
[`stable(fixture)`](../adapters/angular#zoneless-waiting).
:::

## Установщики {#the-installers}

| Функция                      | Какой глобал подменяет  |
| ---------------------------- | ----------------------- |
| `stubIntersectionObserver()` | `IntersectionObserver`  |
| `stubResizeObserver()`       | `ResizeObserver`        |
| `stubMutationObserver()`     | `MutationObserver`      |
| `stubObserver(name)`         | любой из трёх, по имени |

Каждая возвращает [хендл](#the-handle). Вызывайте её в `beforeEach` или в самом тесте; см.
[ниже](#install-it-in-beforeeach-never-in-beforeall).

## Хендл {#the-handle}

```ts
const observers = stubResizeObserver();

observers.instances; // все observer-ы, созданные после установки заглушки, по порядку
observers.last; // последний; обычный случай, когда компонент создаёт ровно один
```

У каждого экземпляра есть то, что спека проверяет, и то, чем она управляет:

| Член            | Что это                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------- |
| `targets`       | всё, что передали в `observe`, с учётом `unobserve` / `disconnect`                                            |
| `observe`       | спай — проверить, что наблюдение началось и с чем                                                             |
| `unobserve`     | спай                                                                                                          |
| `disconnect`    | спай                                                                                                          |
| `disconnected`  | было ли отключение; читается проще, чем проверка `disconnect`                                                 |
| `emit(entries)` | вызывает колбэк компонента с одной пачкой, как это делает браузер                                             |
| `options`       | опции, переданные конструктору; см. [ниже](#options-—-what-the-constructor-was-given)                         |
| `host`          | объект observer-а, который держит ваш код (не хост-элемент); см. [ниже](#the-observer-the-callback-is-handed) |

`emit` принимает массив: быстрая прокрутка или изменение размера приносят несколько записей сразу.
Код, который рассчитывает на одну запись за вызов, содержит настоящий баг, и так его можно
воспроизвести:

```ts
observers.last.emit([intersectionEntry(first, false), intersectionEntry(second, true)]);
```

**Частая ошибка:** обращаться к `last` раньше, чем компонент создал observer. Он бросает ошибку, а
не возвращает `undefined`:

```text
[vitest-auto-spy] stubObserver('IntersectionObserver'): the stub is installed, but the code under test
has not constructed a IntersectionObserver yet. Render the component (or run the effect) before
reaching for `last`.
Docs: https://asdalexey.github.io/vitest-auto-spy/utilities/observer-stubs#the-handle
```

Сначала отрендерите компонент (`fixture.detectChanges()`), потом берите `last`.

## Построение entries {#building-entries}

Хелперы, которые строят записи для `emit`:

```ts
import { intersectionEntry, mutationRecord, resizeEntry } from 'vitest-auto-spy/dom-stubs';

observers.last.emit([intersectionEntry(element, true)]);
observers.last.emit([mutationRecord(host, { addedNodes: [span] })]);
observers.last.emit([resizeEntry(host, { width: 320, height: 200 })]);
```

| Хелпер                                                  | Что строит                  |
| ------------------------------------------------------- | --------------------------- |
| `intersectionEntry(target, isIntersecting, overrides?)` | `IntersectionObserverEntry` |
| `resizeEntry(target, rect)`                             | `ResizeObserverEntry`       |
| `mutationRecord(target, init)`                          | `MutationRecord`            |

Почему не писать записи руками:

- У `IntersectionObserverEntry` семь обязательных полей, а код обычно читает одно. Без хелпера в
  каждой спеке нужно двойное приведение типа.
- `MutationRecord` нельзя записать объектным литералом: `addedNodes` и `removedNodes` — это
  `NodeList`. Привычный приём (добавить узлы в `DocumentFragment` и взять `childNodes`)
  **перемещает** узлы из вашей фикстуры. `mutationRecord()` строит список с индексами, `item()`,
  `forEach`, `for…of` и `entries` / `keys` / `values` и ничего не перемещает.

`intersectionEntry` сам заполняет поля, которые код обычно не читает. `intersectionRatio` вычисляется из
`isIntersecting`: браузер никогда не отдаёт их несогласованными. Прямоугольники не заполняются, пока
вы их не передадите в `overrides`: `boundingClientRect`, `intersectionRect` и `rootBounds` принимают
`DOMRect` или числа `{ x, y, width, height }`.

```ts
intersectionEntry(element, true);
intersectionEntry(element, true, { boundingClientRect: new DOMRect(0, 0, 200, 100) });
observers.last.emit([intersectionEntry(tooltip, true, { boundingClientRect: { x: 10, y: 20, width: 200, height: 100 } })]);
```

Запись `ResizeObserver` можно по-прежнему написать самому, если компонент читает что-то
необычное:

```ts
observers.last.emit([{ contentRect: { width: 320 } } as ResizeObserverEntry]);
```

## Observer, который передают в колбэк {#the-observer-the-callback-is-handed}

Второй аргумент колбэка — объект, который вернул `new IntersectionObserver(…)`, тот самый, что
сохранил ваш код. Код часто им пользуется:

```ts
new IntersectionObserver((entries, observer) => {
  observer.disconnect(); // или observer.takeRecords(), или `if (observer !== this.observer) return;`
});
```

У этого объекта:

- `takeRecords()` — спай, который возвращает пустой список;
- `root`, `rootMargin` и `thresholds` берутся из опций, которые получил конструктор;
- `rootMargin` по умолчанию `'0px 0px 0px 0px'`, а `thresholds` — `[0]`, как в браузере; `threshold`
  одним числом превращается в массив из одного элемента.

`instances[i].host` (и `last.host`) — тот же объект, чтобы сравнить его с тем, что держит компонент:

```ts
expect(observers.last.host).toBe(component.observer);
```

## `options` — с чем позвали конструктор {#options-—-what-the-constructor-was-given}

`options` — второй аргумент, который компонент передал конструктору. Нужен, когда компонент создаёт
по observer-у на каждую конфигурацию, например по одному на каждый root margin.

```ts
new IntersectionObserver(callback, { rootMargin: '-20% 0px -70% 0px' });

expect(observers.last.options).toEqual({ rootMargin: '-20% 0px -70% 0px' });
```

## `autoEmit` — всё видно, и сразу {#autoemit-—-everything-is-visible-immediately}

С `autoEmit: true` заглушка вызывает колбэк с `isIntersecting: true`, как только компонент вызвал
`observe()`. Нужно для набора тестов, перенесённого с Jest, где глобальный мок делал именно так, и
ленивые секции загружались во время `detectChanges()`.

```ts
stubIntersectionObserver({ autoEmit: true });
```

Заглушка по умолчанию молчит, пока вы не вызовете `emit`, — это правильно, когда момент пересечения
выбирает спека. Без `autoEmit` перенесённая спека проверяет компонент, который ничего не загрузил, и
падает с ошибкой, не связанной с пересечением.

`stubObserver` принимает вместо этого функцию, и запись строите вы:

```ts
stubObserver<ResizeObserverEntry, Element>('ResizeObserver', {
  autoEmit: (target) => resizeEntry(target, { width: 320 }),
});
```

## Ставьте её в `beforeEach`, никогда в `beforeAll` {#install-it-in-beforeeach-never-in-beforeall}

Vitest выполняет `beforeAll` файла один раз, раньше любого `beforeEach`. Поэтому корневой
`beforeEach` общего setup-файла выполняется **после** этого `beforeAll`. Если setup-файл ставит там
свою заглушку observer-а по умолчанию, она ещё до первого теста заменяет заглушку из `beforeAll`. Симптом —
`expected "vi.fn()" to be called 2 times, but got 0 times`, хотя заглушка стоит десятью строками
выше проверки.

Чтобы один и тот же observer был в каждом тесте файла, используйте
[`installPerTest`](./setup#reinstalling-a-stub-for-every-test).

## Заглушка, которую никто не снимает {#the-stub-nobody-takes-off}

Заглушка ставится через `mockValueProp`, поэтому `restoreMockedProps()` после каждого теста
возвращает настоящий конструктор. [`setupAutoSpy()`](./setup) и так это делает; своей уборки писать
не нужно.

Спека, которая сама присваивает `globalThis.IntersectionObserver`, оставляет его на месте. При
`isolate: false` его наследует следующий файл воркера и падает на чём-то постороннем, например
`.observe is not a function`.

## Экземпляр, до которого добираются через статическое поле {#the-instance-reached-through-a-static-field}

Самописный мок часто хранит последний экземпляр в статическом поле (`MockObserver.last`). Это поле
остаётся после конца файла, как и заглушка: следующая спека находит observer предыдущей. Здесь экземплярами
владеет хендл, и ничто не переживает спеку, которая его создала.

## Замена рукописной заглушки глобала {#replacing-a-hand-rolled-global-stub}

```ts
// было — приведение типа и уборка, о которой надо помнить
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

Одна строка даёт три вещи: заглушку, которой спека управляет (`observer.emit(...)`), автоматический
возврат глобала и правильные типы без `as unknown as`.

Правило линтера [`prefer-observer-stub`](./eslint-rules#prefer-observer-stub)
находит самописную форму во всех трёх вариантах: присваивание выше,
`vi.stubGlobal('IntersectionObserver', Fake)` и `vi.spyOn(globalThis, 'ResizeObserver')`. Оно называет
хелпер для замены и в `configs.recommended` имеет уровень `error`.
