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

Если код проверяет `instanceof`, передайте класс элемента:

```ts
import { createElementStub } from 'vitest-auto-spy/dom-stubs';

const input = createElementStub({ elementClass: HTMLInputElement, tagName: 'input', overrides: { value: '15' } });

expect(input.element).toBeInstanceOf(HTMLInputElement);
expect(input.element.value).toBe('15'); // тип HTMLInputElement выведен автоматически
```

`elementClass` использует прототип класса, не вызывая его конструктор. TypeScript выводит `T` из переданного класса.
`tagName` задаётся отдельно и по умолчанию равен `'div'`; для заглушки поля ввода укажите `'input'`.
Переданный класс не добавляет реализаций. Недостающие свойства и методы, например `value` или `select`, настройте через `overrides`.
Готовые методы заглушки, например `focus`, продолжают работать. Чтение ненастроенного члена класса бросает ошибку с его именем.

| Опция          | Тип                         | По умолчанию | Смысл                                                                     |
| -------------- | --------------------------- | ------------ | ------------------------------------------------------------------------- |
| `elementClass` | `{ readonly prototype: T }` | нет          | Класс для `instanceof`; из него выводится тип элемента                    |
| `tagName`      | `string`                    | `'div'`      | Тег в нижнем регистре; `tagName` и `nodeName` возвращают его в верхнем    |
| `classes`      | `string[]`                  | нет          | Классы, с которыми элемент создаётся                                      |
| `attributes`   | `Record<string, string>`    | нет          | Атрибуты, с которыми он создаётся                                         |
| `style`        | `Record<string, string>`    | нет          | Инлайн-стили по имени CSS-свойства: `{ 'background-color': 'red' }`       |
| `overrides`    | `Partial<T>`                | нет          | Любой другой член, который читает ваш код: `offsetWidth`, `querySelector` |

### `mockElementRefProp` — элемент для сигнального запроса {#mockelementrefprop-—-an-element-for-a-signal-query}

Подменяет optional или required сигнальный запрос с `ElementRef` и возвращает спаи элемента одним вызовом.
Например, `component.dateTrigger` имеет тип `Signal<ElementRef<HTMLButtonElement> | undefined>`.
Метод `focusTrigger()` вызывает `focus()` на найденном элементе.

```ts
import { mockElementRefProp } from 'vitest-auto-spy/angular/doubles';

const trigger = mockElementRefProp(component, 'dateTrigger', {
  elementClass: HTMLButtonElement,
  tagName: 'button',
});
component.focusTrigger();
expect(trigger.focus).toHaveBeenCalledExactlyOnceWith();
```

Такой вызов заменяет локальную фабрику элемента и последующий `mockSignalProp(component, 'dateTrigger', new ElementRef(element))`.
Тип элемента определяется запросом. Параметры совпадают с `createElementStub` и не меняют этот тип.
Возвращённый объект также содержит `ref` (установленный `ElementRef`) и `query` (записываемый тестовый сигнал).
Вызовите `trigger.query.set(undefined)`, чтобы убрать optional запрос; для required запроса TypeScript запрещает `undefined`.
Для запросов, возвращающих экземпляры компонентов или директив, и для `viewChildren` используйте `mockSignalProp`.

Подменяйте запрос до рендера шаблона, эффекта или `computed`, который читает исходный сигнал.
Подмена уже используемого запроса бросает ошибку. Хелпер не создаёт отрисованный элемент и не разрешает запросы Angular.
`setupAutoSpy()` восстанавливает исходный запрос после каждого теста. Если вы его не используете, добавьте очистку:

```ts
import { afterEach } from 'vitest';
import { restoreMockedProps } from 'vitest-auto-spy';

afterEach(() => restoreMockedProps());
```

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

Сам `createElementStub` ничего не подменяет и не требует очистки. Без DOM-окружения заглушка тоже работает.
Для проверки неизвестных членов нужен `HTMLElement` или переданный `elementClass`, из которого можно взять их список.

## События для прямого вызова обработчиков {#events-for-direct-handler-calls}

`createDomEvent` задаёт readonly цели без приведения типов и `Object.defineProperty` в каждом тесте.
Здесь `component.onBlur()` читает `currentTarget` и удаляет класс `active`.

```ts
import { createDomEvent, createElementStub, createInputEvent } from 'vitest-auto-spy/dom-stubs';

const input = createElementStub({ tagName: 'input', classes: ['active'] });
component.onBlur(createDomEvent('blur', { currentTarget: input.element }));
expect(input.classes()).toEqual([]);

component.onInput(createInputEvent('15'));
expect(component.value()).toBe('15');
```

`createDomEvent(type, init?)` возвращает нативный `Event`. `bubbles` и `cancelable` по умолчанию равны `true`.
Параметры `target` и `currentTarget` фиксируют цели. Для проверки распространения события не задавайте их и отправляйте событие реальному DOM-элементу.

`createInputEvent(value, init?)` возвращает `Event` типа `'input'` с заглушкой поля ввода в `target`.
Заглушка проходит `instanceof HTMLInputElement`, когда этот класс доступен. Переданное значение имеет приоритет над `init.element.overrides.value`.
Параметры заглушки передавайте через `element`, например `{ element: { overrides: { disabled: true } } }`.
Остальные нативные флаги события передавайте прямо в `init`.

**Частая ошибка:** ожидать `data`, `inputType` или прохождения проверки конструктора браузерного события ввода.
Хелпер возвращает `Event`, а не `InputEvent`. Для проверки этих возможностей браузера используйте нативный `InputEvent`.

## Текстовые события вставки и переноса {#text-paste-and-drop-events}

Заменяют локальные фабрики событий буфера обмена и переноса, когда обработчик читает только обычный текст.
Здесь `onPaste` и `onDrop` читают текст и отменяют событие.

```ts
import { createDropEvent, createPasteEvent } from 'vitest-auto-spy/dom-stubs';

const paste = createPasteEvent('15');
component.onPaste(paste);
expect(paste.defaultPrevented).toBe(true);

component.onDrop(createDropEvent('20'));
expect(component.value()).toBe('20');
```

Оба хелпера принимают `(text: string | null, init?: EventInit)` и по умолчанию создают всплывающие, отменяемые события.
`null` задаёт `clipboardData: null` или `dataTransfer: null`, чтобы проверить отсутствие данных.
`getData('text')` и `getData('text/plain')` возвращают переданный текст без учёта регистра; другие форматы возвращают `''`.
`types` — readonly массив `['text/plain']`. Эти события также можно отправить DOM-элементам.

Объект переноса поддерживает только `getData()` и `types`. Чтение `files`, `items`, `setData` или другого члена бросает ошибку.
Это нативные экземпляры `Event` с добавленным свойством переноса текста.
Им не нужны конструкторы `ClipboardEvent`, `DragEvent` и `DataTransfer`; проверку этих конструкторов они не проходят.
Для файлов, координат, записи в объект переноса и браузерного перетаскивания создайте своё событие.

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
