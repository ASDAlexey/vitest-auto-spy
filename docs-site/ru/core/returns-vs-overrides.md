---
title: returns или overrides
description: Две опции, которые задают значения спая заранее, при создании; returns задаёт ответ метода, overrides заменяет член обычным значением.
---

# `returns` или `overrides`

Обе опции задают значения спая заранее, в момент создания. Тесту не нужен `beforeEach`, полный
`mockReturnValue`. `returns` — для метода: метод остаётся спаем. `overrides` — для всего остального
(сигнал, поток, поле): член становится ровно тем значением, которое вы передали.

```ts
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/angular';

beforeEach(() => {
  TestBed.configureTestingModule({
    imports: [LayoutComponent],
    providers: [
      provideAutoSpy(LayoutService, {
        returns: { load: of([]) }, // load() остаётся спаем и отвечает of([])
        overrides: { isCompact: signal(true) }, // isCompact — этот сигнал, а не спай
      }),
    ],
  });
});

it('loads the layout once', () => {
  TestBed.createComponent(LayoutComponent).detectChanges();
  expect(injectSpy(LayoutService).load).toHaveBeenCalledOnce();
});
```

Обе опции есть у каждой фабрики: `createSpyFromClass`, `provideAutoSpy`, `provideAutoSpyForToken` и
`createAutoMock`. Обе настраивают один и тот же спай: каждый ключ задаёт один его член.

## Бок о бок {#side-by-side}

|                                                   | `returns`                                                                             | `overrides`                                                          |
| ------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Что принимает                                     | имя метода                                                                            | любой член: поле, сигнал, свойство-`Observable`, объект конфигурации |
| Значение — это                                    | то, что отвечает метод                                                                | сам член                                                             |
| Потом                                             | по-прежнему спай; `toHaveBeenCalled` работает                                         | значение как написано, не спай                                       |
| То же, что написать                               | `spy.m.mockReturnValue(x)` в `beforeEach`                                             | `spy.p = x` в `beforeEach`                                           |
| Настройка позже                                   | более поздний `calledWith`, `mockReturnValue` или `resolveWith` заменяет это значение | настраивать нечего; присвойте новое значение                         |
| Под `strict` (метод без настройки бросает ошибку) | метод настроен, даже если значение `undefined`                                        | метод настроен, если для него передана функция                       |
| Ключ, который не метод                            | при создании спая выводится предупреждение: значение никогда не вернётся              | так и задумано: `overrides` ровно для этого                          |

`strict` — опция, с которой метод спая бросает ошибку, если тест вызвал его, ничего не настроив. См.
[Строгий режим](./strict-mode).

## Что выбрать {#which-one}

Метод — в `returns`. Всё остальное — в `overrides`.

```ts
import { signal } from '@angular/core';
import { Subject, of } from 'rxjs';
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/angular';

// метод: его по-прежнему можно проверить
provideAutoSpy(CartService, { returns: { total: 0, load: of([]) } });
expect(injectSpy(CartService).load).toHaveBeenCalledOnce();

// состояние: сигнал, поток, поле
provideAutoSpy(LayoutService, { overrides: { isCompact: signal(true), resize$: new Subject<void>() } });
```

**Частая ошибка:** писать `returns: { m: undefined }` без `strict`. Ненастроенный метод и так отвечает
`undefined`, поэтому без `strict` такая строка ничего не меняет. С `strict` всё иначе: там эта строка
нужна, чтобы вызов `m()` не бросал ошибку.

## Функция в `overrides` {#a-function-in-overrides}

Метод кладут в `overrides`, когда его ответ зависит от аргументов. В `createSpyFromClass` и
`provideAutoSpy` переданная функция [остаётся спаем](./create-spy-from-class#overrides-function). Она
работает как реализация метода, и вызовы по-прежнему записываются:

```ts
import { DomSanitizer } from '@angular/platform-browser';
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/angular';

provideAutoSpy(DomSanitizer, { overrides: { sanitize: (_context, value) => String(value) } });
expect(injectSpy(DomSanitizer).sanitize).toHaveBeenCalledOnce();
```

Это касается `createSpyFromClass` и `provideAutoSpy`. `createAutoMock` и `provideAutoSpyForToken`
устроены иначе: они строят спай по типу TypeScript, а не по классу. Во время
выполнения класса нет, и отличить метод от свойства им не по чему. Поэтому там обычная функция
сохраняется как написана и спаем не становится. `vi.fn()` сохраняется как
есть в любой фабрике.

## Член, названный в обеих {#a-member-named-in-both}

Побеждает `overrides`. `returns` этот член пропускает, что бы ни лежало в `overrides`: обычное
значение, функция или `vi.fn()`.

То же правило действует между
[зарегистрированным значением по умолчанию](./create-spy-from-class#registerautospydefaults-—-the-composition-lives-with-the-class)
и вызовом, который создаёт спай: значение из вызова заменяет зарегистрированные `returns` или
`selfReturning` (список методов, которые возвращают сам спай, для цепочек вызовов).
