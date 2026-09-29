---
title: Заглушка элемента и недостающие DOM API
description: createElementStub даёт HTMLElement для ElementRef, чьи спаи хранят состояние, а fillMissingDomApis один раз из setup-файла добавляет то, чего нет в jsdom и happy-dom.
---

# Заглушка элемента и недостающие DOM API

Два хелпера из `vitest-auto-spy/dom-stubs`:

- `createElementStub()` даёт поддельный элемент, чтобы проверить директиву или сервис через
  `ElementRef`, ничего не рендеря;
- `fillMissingDomApis()` один раз в setup-файле добавляет члены DOM, которых нет в jsdom и
  happy-dom, например `PointerEvent` или `scrollIntoView`.

```ts
import { ElementRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { createElementStub } from 'vitest-auto-spy/dom-stubs';

it('highlights on enter', () => {
  const host = createElementStub({ classes: ['card'] });

  TestBed.configureTestingModule({ providers: [{ provide: ElementRef, useValue: new ElementRef(host.element) }] });
  const directive = TestBed.runInInjectionContext(() => new HighlightDirective());

  directive.onEnter();

  expect(host.classList.add).toHaveBeenCalledWith('highlighted');
  expect(host.classes()).toEqual(['card', 'highlighted']);
});
```

## Элемент для `ElementRef` — `createElementStub` {#an-element-for-elementref-—-createelementstub}

Возвращает поддельный `HTMLElement`, чьи методы — спаи, хранящие состояние: `classList.contains`
отвечает то, что положил `classList.add`, `getAttribute` возвращает то, что записал `setAttribute`, а `dispatchEvent`
доходит до слушателей.

| Опция        | Тип                      | По умолчанию | Смысл                                                                     |
| ------------ | ------------------------ | ------------ | ------------------------------------------------------------------------- |
| `tagName`    | `string`                 | `'div'`      | Тег в нижнем регистре; `tagName` и `nodeName` возвращают его в верхнем    |
| `classes`    | `string[]`               | нет          | Классы, с которыми элемент создаётся                                      |
| `attributes` | `Record<string, string>` | нет          | Атрибуты, с которыми он создаётся                                         |
| `style`      | `Record<string, string>` | нет          | Инлайн-стили по имени CSS-свойства: `{ 'background-color': 'red' }`       |
| `overrides`  | `Partial<HTMLElement>`   | нет          | Любой другой член, который читает ваш код: `offsetWidth`, `querySelector` |

Что есть у возвращённого объекта:

| Член                                                                                 | Что это                                                                       |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `element`                                                                            | Сам элемент; передайте его в `new ElementRef(…)`                              |
| `classList.add` / `remove` / `toggle` / `contains` / `replace`                       | Спаи                                                                          |
| `style.setProperty` / `getPropertyValue` / `removeProperty`                          | Спаи                                                                          |
| `setAttribute`, `getAttribute`, `removeAttribute`, `hasAttribute`, `toggleAttribute` | Спаи                                                                          |
| `addEventListener`, `removeEventListener`, `dispatchEvent`, `focus`, `blur`, `click` | Спаи                                                                          |
| `classes()`, `attributes()`, `styles()`                                              | Текущее состояние; `styles()` видит и `setProperty`, и `style.width = '10px'` |
| `listenerCount(type)`                                                                | Сколько слушателей зарегистрировано на `type`                                 |
| `emit(event)`                                                                        | Отправляет событие слушателям, не записывая вызов в спай `dispatchEvent`      |

```ts
host.emit('mouseleave'); // вызывает слушателей; в dispatchEvent ничего не записывается
```

`emit` доходит до слушателей, добавленных через `addEventListener` на заглушке. Без рендера Angular
не подключает обработчики `@HostListener`, поэтому такой обработчик вызывайте напрямую, как
`directive.onEnter()` выше.

Самописная альтернатива, `{ nativeElement: { classList: { add: vi.fn() } } }`, типизирована как
`any`, знает только те члены, о которых подумал автор, и на остальные отвечает `undefined`.

**Частая ошибка:** ваш код читает член, которого у заглушки нет. Она бросает ошибку с именем члена:

```text
[vitest-auto-spy] createElementStub: the code under test read <div>.offsetWidth, which the stub does not implement. Pass it in: createElementStub({ overrides: { offsetWidth: … } }).
```

Передайте этот член в `overrides: { offsetWidth: 120, querySelector: vi.fn() }`.

Глобальные объекты не патчатся, поэтому после теста откатывать нечего. Без DOM-окружения заглушка тоже работает; не
работает только проверка неизвестных членов, потому что нет `HTMLElement`, из которого взять их
список.

## Члены, которых нет в DOM-окружении, — `fillMissingDomApis` {#the-members-the-dom-environment-leaves-out-—-fillmissingdomapis}

Добавляет члены DOM, которых нет в jsdom и happy-dom. Вызовите один раз в setup-файле, до
`setupAutoSpy()`:

```ts
// vitest.setup.ts
import { fillMissingDomApis } from 'vitest-auto-spy/dom-stubs';
import { setupAutoSpy } from 'vitest-auto-spy/setup';

fillMissingDomApis();
setupAutoSpy();
```

Что она добавляет:

- `PointerEvent`;
- `ResizeObserver`, который ничего не делает;
- `scrollTo` / `scrollBy` / `scrollIntoView` у элементов и `scroll` / `scrollTo` / `scrollBy` у
  `window`, которые ничего не делают (собственные версии jsdom только пишут «Not implemented»);
- `getComputedStyle`, если его нет;
- `document.doctype`.

| Опция                | Тип       | По умолчанию | Смысл                                                                   |
| -------------------- | --------- | ------------ | ----------------------------------------------------------------------- |
| `cheapComputedStyle` | `boolean` | `false`      | Заменить `getComputedStyle` версией, которая читает только инлайн-стиль |

Как она работает:

- Добавляет только то, чего нет. Если окружение реализует член, остаётся его собственный.
- Каждое добавленное можно по-прежнему подменить через `vi.stubGlobal` или `mockValueProp`.
- Возвращает имена добавленного. Повторный вызов безопасен и возвращает пустой список.
- Без `document` ничего не делает.
- `cheapComputedStyle: true` работает быстро и не пишет в лог для псевдоэлемента. Но правила из
  таблиц стилей в ответ больше не попадают, поэтому по умолчанию опция выключена.

**Частая ошибка:** вызывать её после `setupAutoSpy()` или добавлять эти глобалы руками внутри файла
спеки. Тогда [охрана глобалов](/ru/utilities/setup#_20-globals-put-back-at-the-file-boundary) винит
тест в глобале, который поставил setup-файл. Добавленные до `setupAutoSpy()`, они считаются частью
окружения.
