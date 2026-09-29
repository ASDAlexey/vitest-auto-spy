---
title: Идиомы Angular Material в переводе на библиотеку
description: Объекты-подмены, которые собственные спеки Angular Material пишут руками, — ScrollStrategy, MAT_ICON_LOCATION, MATERIAL_ANIMATIONS, ScrollDispatcher, — переписанные на createAutoMock, provideAutoSpyForToken и provideAutoSpy, плюс спай на один метод настоящего сервиса.
---

# Идиомы Angular Material в переводе на библиотеку

Многие спеки компонентов списаны со спек самого Angular Material, а там сервисы Material подменяют
объектами, написанными руками: `{ provide: X, useValue: { oneMethod: () => … } }`. `useValue`
принимает что угодно, поэтому такой объект никто не проверяет. Когда компонент начинает вызывать
другой метод, тест падает где-то внутри Material. Здесь для каждого частого случая показана
типизированная замена.

```ts
import { ScrollDispatcher } from '@angular/cdk/scrolling';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/angular';

import { StickyHeaderComponent } from './sticky-header.component';

it('subscribes to scroll events', () => {
  const scrolled = new Subject<void>();

  TestBed.configureTestingModule({
    imports: [StickyHeaderComponent],
    providers: [provideAutoSpy(ScrollDispatcher, { returns: { scrolled } })],
  });
  TestBed.createComponent(StickyHeaderComponent).detectChanges();

  scrolled.next(); // пользователь прокрутил страницу
  expect(injectSpy(ScrollDispatcher).scrolled).toHaveBeenCalled();
});
```

`@angular/material` и `@angular/cdk` не входят в зависимости пакета. Каждый пример импортирует их в
вашей собственной спеке. Для `MatDialog`, `MatDialogRef` и `MAT_DIALOG_DATA` есть
[подмены диалога](/ru/adapters/angular#the-material-dialog-without-material-as-a-dependency).

| Объект из спек Material                                             | Замена                                                                    |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `ScrollStrategy`, где один метод — спай, остальные ничего не делают | [`createAutoMock<ScrollStrategy>()`](#a-scrollstrategy) за токеном        |
| `MAT_ICON_LOCATION` в виде `{ getPathname: () => fakePath }`        | [`provideAutoSpyForToken`](#mat-icon-location) с `returns`                |
| `MATERIAL_ANIMATIONS` в виде `{ animationsDisabled: true }`         | [типизированное значение](#material-animations) с проверкой по токену     |
| `ScrollDispatcher` из трёх методов, `scrolled()` отдаёт `Subject`   | [`provideAutoSpy(ScrollDispatcher)`](#scrolldispatcher) с `returns`       |
| `spyOn(realService, 'method')`                                      | [`createSpyFromInstance`](#a-partial-double-one-method-of-a-real-service) |

## `ScrollStrategy` {#a-scrollstrategy}

`ScrollStrategy` (`@angular/cdk/overlay`) — интерфейс, класса для построения спая нет.
[`createAutoMock`](/ru/core/auto-mock-by-type) строит его по типу. Компоненты Material получают
**фабрику** стратегии через токен вроде `MAT_MENU_SCROLL_STRATEGY`, поэтому провайдер отдаёт функцию,
которая возвращает мок.

```ts
import { type ScrollStrategy } from '@angular/cdk/overlay';
import { TestBed } from '@angular/core/testing';
import { MAT_MENU_SCROLL_STRATEGY } from '@angular/material/menu';
import { createAutoMock } from 'vitest-auto-spy';

const strategy = createAutoMock<ScrollStrategy>();

TestBed.configureTestingModule({
  providers: [{ provide: MAT_MENU_SCROLL_STRATEGY, useValue: () => strategy }],
});

// … открыть меню
expect(strategy.enable).toHaveBeenCalled();
```

Каждый член интерфейса — спай с типом из `ScrollStrategy`. Создавайте мок внутри теста или в его
`beforeEach`, чтобы каждый тест получал новый.

Если код просит стратегию у `Overlay` (`overlay.scrollStrategies.reposition()`), используйте
[подмену overlay](/ru/adapters/angular#platform-sanitizer-change-detector-and-cdk-overlay-doubles).

## `MAT_ICON_LOCATION` {#mat-icon-location}

`MAT_ICON_LOCATION` (`@angular/material/icon`) — токен, типизированный интерфейсом. `MatIcon`
вызывает его единственный метод `getPathname`, чтобы поправить ссылки `url(#…)` в SVG-иконках.
[`provideAutoSpyForToken`](/ru/adapters/angular#a-dependency-behind-an-injectiontoken) строит спай
по типу токена. Его аргументы — токен, значения свойств интерфейса, которые не являются методами (здесь
`undefined`: таких нет) и опции; `returns` в опциях заранее задаёт ответ метода, а метод остаётся спаем.

```ts
import { TestBed } from '@angular/core/testing';
import { MAT_ICON_LOCATION } from '@angular/material/icon';
import { injectSpy, provideAutoSpyForToken } from 'vitest-auto-spy/angular';

TestBed.configureTestingModule({
  providers: [provideAutoSpyForToken(MAT_ICON_LOCATION, undefined, { returns: { getPathname: '/fake-path' } })],
});

// тест, которому нужен другой путь, переопределяет ответ:
injectSpy(MAT_ICON_LOCATION).getPathname.mockReturnValue('/another-path');
```

## `MATERIAL_ANIMATIONS` {#material-animations}

`MATERIAL_ANIMATIONS` (`@angular/material/core`) хранит настройки, `{ animationsDisabled: true }`, а
не сервис. Следить тут не за чем, поэтому оставьте обычное значение. Не хватает только проверки
типа: `useValue` принимает что угодно. Её добавляет хелпер в две строки с типом от токена:

```ts
import { type InjectionToken, type ValueProvider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';

function provideValue<T>(provide: InjectionToken<T>, useValue: T): ValueProvider {
  return { provide, useValue };
}

TestBed.configureTestingModule({
  providers: [provideValue(MATERIAL_ANIMATIONS, { animationsDisabled: true })],
});
```

Теперь опечатка в ключе не компилируется. Без проверки анимации молча остаются включёнными, и каждый
тест идёт медленнее.

## `ScrollDispatcher` {#scrolldispatcher}

`ScrollDispatcher` (`@angular/cdk/scrolling`) — класс, поэтому `provideAutoSpy` берёт из него все
методы. Методу, который слушает компонент, передайте `Subject` под управлением теста. Полный пример —
в начале страницы.

- Компонент, который слушает `ancestorScrolled()`, настраивается так же:
  `returns: { ancestorScrolled: scrolled }`.
- С подключённой [точкой входа rxjs](/ru/runtimes/rxjs) спай умеет отдавать значение сам:
  `injectSpy(ScrollDispatcher).scrolled.nextWith()`. Тогда `Subject` не нужен.

## Спай на один метод настоящего сервиса {#a-partial-double-one-method-of-a-real-service}

Спеки Material оставляют настоящий сервис и следят за одним методом:
`spyOn(liveAnnouncer, 'announce')`, `spyOn(errorHandler, 'handleError')`. Здесь это
[`createSpyFromInstance`](/ru/adapters/angular#spying-a-real-service-without-replacing-it) с
`passthrough: true`. Он меняет экземпляр сервиса на месте, поэтому вызывайте его после
`configureTestingModule` и до `createComponent`. С `passthrough: true` все методы
по-прежнему выполняются по-настоящему и записывают вызовы. Метод, которому вы задали ответ
(`resolveWith`, `mockReturnValue`), перестаёт вызывать настоящий код. Без `passthrough` каждый метод
возвращает `undefined`, пока вы не зададите ему ответ.

```ts
import { LiveAnnouncer } from '@angular/cdk/a11y';
import { TestBed } from '@angular/core/testing';
import { createSpyFromInstance } from 'vitest-auto-spy';

const announcer = createSpyFromInstance(TestBed.inject(LiveAnnouncer), { passthrough: true });

announcer.announce.resolveWith(undefined); // необязательно; с этой строкой настоящий announce не выполняется
component.save();

expect(announcer.announce).toHaveBeenCalledWith('Saved');
```

Компонент держит тот же экземпляр, который вы изменили, так что больше ничего провайдить не нужно.
[`setupAutoSpy()`](/ru/utilities/setup), вызванный один раз в setup-файле Vitest, восстанавливает
экземпляр после каждого теста. Без него вызовите `restoreSpiedInstance(TestBed.inject(LiveAnnouncer))`
из `vitest-auto-spy` в `afterEach`.

`createSpyFromInstance`, `createAutoMock` и `restoreSpiedInstance` импортируются из `vitest-auto-spy`;
Angular-хелперы (`provideAutoSpy`, `provideAutoSpyForToken`, `injectSpy`) — из
`vitest-auto-spy/angular`.

**Что выбрать:**

- Объект руками заменяет весь сервис → [`provideAutoSpy`](/ru/adapters/angular) или
  `provideAutoSpyForToken`.
- Нужно следить за одним методом настоящего сервиса → `createSpyFromInstance`.

Правило линтера [`prefer-provide-auto-spy`](/ru/utilities/eslint-rules#prefer-provide-auto-spy)
находит провайдеры с объектом-подменой, написанным руками, — то есть первый случай.
