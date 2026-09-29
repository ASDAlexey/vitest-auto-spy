---
title: Тесты без DOM
description: Спеки Angular-компонентов, которые не читают разметку - проверки по сигналам, выходам и спаям, рендер через renderShallow и правило линта с опцией templates 'never'.
---

# Тесты без DOM

Некоторые команды оставляют разметку end-to-end-тестам (e2e). Тогда юнит-тест вызывает методы
компонента и проверяет его состояние, выходы и вызовы сервисов. Элементы он не читает. На этой
странице — как выглядит такая спека и как правило линтера следит, чтобы все спеки были такими.

```ts
// cart-page.spec.ts
import { describe, expect, it, vi } from 'vitest';
import { injectSpy, provideAutoSpy, renderShallow } from 'vitest-auto-spy/angular';

import { CartPage } from './cart-page';
import { CartService } from './cart.service';

describe('CartPage', () => {
  const items = [{ id: 7, price: 42 }];

  it('shows the total and removes an item', async () => {
    const { component, fixture } = renderShallow(CartPage, {
      providers: [provideAutoSpy(CartService)],
      detectChanges: false,
    });
    const cart = injectSpy(CartService);
    cart.load.nextWith(items); // load(): Observable<Item[]>
    cart.remove.resolveWith(); // remove(id): Promise<void>
    fixture.detectChanges(); // запускает ngOnInit, который подписывается на load()

    expect(component.total).toHaveSignalValue(42);

    const removed = vi.fn();
    component.removed.subscribe(removed);
    await component.remove(items[0]);

    expect(component.total).toHaveSignalValue(0);
    expect(removed).toHaveBeenCalledWith(items[0]);
    expect(cart.remove).toHaveBeenCalledWith(7);
  });
});
```

Компонент подписывается на `CartService.load()` в `ngOnInit`. У него есть вычисляемый сигнал
`total`, выход `removed` и асинхронный метод `remove(item)`, который вызывает `CartService.remove(id)`.

- **`renderShallow`** создаёт компонент в обычном `TestBed`. Дочерние компоненты отбрасываются,
  шаблон пустой. Сигналы, входы, хуки жизненного цикла и DI работают как обычно. Входы задаёт
  опция `inputs`, например `renderShallow(ProfileComponent, { inputs: { userId: 1 } })`; они
  ставятся до первой проверки изменений. Возвращает компонент и привычный `ComponentFixture` в поле `fixture`. Все опции — в разделе
  [Поверхностный рендер компонента](/ru/adapters/angular#shallow-component-rendering).
- **`detectChanges: false`** не даёт `renderShallow` запустить первую проверку изменений (а с ней
  `ngOnInit`). Так у вас появляется момент задать ответы спая. Затем `fixture.detectChanges()`
  запускает `ngOnInit`. Без этой опции `ngOnInit` уже выполнен к моменту, когда `renderShallow`
  возвращает результат.
- **`provideAutoSpy(CartService)`** кладёт в DI спай `CartService`. **`injectSpy(CartService)`**
  возвращает этот спай с типами.
- **`nextWith(items)`** заставляет `load()` вернуть `Observable`, который выдаёт `items`. Для этого
  нужна точка входа [RxJS](/ru/runtimes/rxjs), один раз импортированная в сетап-файле ниже.
  **`resolveWith()`** заставляет `remove()` успешно завершиться.

## Настроить сетап-файл {#set-up-the-test-file}

Спеке нужны две глобальные строки: точка входа RxJS для `nextWith` и сигнальные матчеры для
`toHaveSignalValue`. Положите их в один сетап-файл:

```ts
// src/test-setup.ts
import { registerSignalMatchers } from 'vitest-auto-spy/angular/matchers';

import 'vitest-auto-spy/rxjs';

registerSignalMatchers();
```

С Angular CLI (`ng test`) укажите файл в `angular.json`:

```jsonc
"test": {
  "builder": "@angular/build:unit-test",
  "options": {
    // keep the options already here and add this line
    "setupFiles": ["src/test-setup.ts"]
  }
}
```

Со своим `vitest.config.ts` (например, с Analog) укажите его в `test.setupFiles`.

## Включить правило линтера {#turn-the-lint-policy-on}

Добавьте этот блок в `eslint.config.js` или перенесите часть `rules` в блок, который уже подключает
[плагин](/ru/utilities/eslint-plugin) к вашим спекам:

```js
// eslint.config.js
import autoSpy from 'vitest-auto-spy/eslint-plugin';

export default [
  {
    files: ['**/*.spec.ts'],
    ...autoSpy.configs.recommended,
    rules: {
      ...autoSpy.configs.recommended.rules,
      'vitest-auto-spy/prefer-render-shallow': ['warn', { templates: 'never' }],
    },
  },
];
```

Пока переводите существующие спеки, оставьте `'warn'`. Когда они станут чистыми, переключите на
`'error'`, чтобы CI не пропускал новые чтения DOM.

С этой опцией [`prefer-render-shallow`](/ru/utilities/eslint-rules#prefer-render-shallow) сообщает о:

- каждом `TestBed.createComponent`;
- каждом `keepTemplate: true`;
- каждом чтении DOM: `nativeElement`, `debugElement`, `By.*`, `querySelector*`, `classList`,
  `getComputedStyle`, `textContent`, `document`, `inject(DOCUMENT)` и подобных;
- `@Component` с разметкой (`template` или `templateUrl`), объявленном прямо в спеке;
- `template:`, переданном в `renderShallow`.

Каждое такое сообщение ведёт на эту страницу.

**Часть тестов придётся переписать.** В одном проекте переписали 18 из 40 тестов в спеке
компонента, а покрытие упало со 100 % до 95,7 %. Код, до которого доходил только шаблон, больше не
выполняется. Например, метод, который начинается с `if (!this.table()) return;`, где
`table = viewChild(MatTable)`, теперь всегда выходит сразу: в пустом шаблоне нет `MatTable`. Эти
строки действительно больше не проверяются. Покрыть их снова может только спека с настоящим
шаблоном или e2e-тест.

## Проверять компонент, а не DOM {#assert-on-the-component-instead-of-the-dom}

| Вместо проверки                            | Проверяйте                                                                                          |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| текста строки                              | сигнал или `computed`, к которому привязана строка: `expect(component.total).toHaveSignalValue(42)` |
| клика по кнопке                            | вызовите обработчик из `(click)`: `component.remove(item)`                                          |
| события, которое видит родитель            | выход: `const removed = vi.fn(); component.removed.subscribe(removed)`                              |
| класса на хост-элементе                    | сигнал или вход, который его задаёт                                                                 |
| входа, который получает дочерний компонент | значение, которое компонент для него вычисляет: `expect(component.chartData()).toEqual([42])`       |
| сервиса, вызванного после клика            | спай: `expect(injectSpy(CartService).remove).toHaveBeenCalledWith(item.id)`                         |

## Проверить директиву {#test-a-directive}

Директива прикрепляется к элементу, поэтому элемент кто-то должен отрендерить.
[`createDirectiveHost({ template, scope })`](/ru/adapters/angular#a-host-for-a-directive-under-test) —
единственный хост, который разрешает правило.

В файле, который вызывает `createDirectiveHost`, правило не сообщает о чтении DOM, разметке
`@Component` и `template:`. Поэтому спека может читать элемент, к которому прикреплена директива.

## Когда шаблон всё-таки нужен {#when-you-still-need-the-template}

`viewChild`, `contentChild`, проекция контента и `@defer` работают только при настоящей разметке.
Есть два пути:

- проверить это поведение в e2e;
- оставить один файл спеки на `renderShallow(X, { keepTemplate: true })` и в начале файла выключить
  правило комментарием с причиной:

```ts
/* eslint-disable vitest-auto-spy/prefer-render-shallow -- the table reads its rows through viewChild */
```
