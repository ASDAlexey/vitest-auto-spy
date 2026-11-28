---
title: Переопределение провайдеров компонента
description: overrideComponentProvider и overrideAutoSpy — подменяют зависимость, которую компонент объявляет сам, и сообщают, если подмена не применилась.
---

# Переопределение провайдеров компонента {#component-provider-overrides}

Используйте `overrideComponentProvider`, если компонент объявляет сервис в своём массиве
`providers`. Хелпер подменяет сервис спаем и проверяет, что компонент его получил. В этом тесте
`ProfileComponent` объявляет `UserService` и вызывает `load()` в `ngOnInit`.

```ts
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { expect, it } from 'vitest';
import { overrideComponentProvider } from 'vitest-auto-spy/angular';

import { ProfileComponent } from './profile.component';
import { UserService } from './user.service';

it('loads the user', () => {
  TestBed.configureTestingModule({ imports: [ProfileComponent] });
  const users = overrideComponentProvider(ProfileComponent, UserService, {
    returns: { load: of({ name: 'Ada' }) },
  });

  const fixture = TestBed.createComponent(ProfileComponent);
  fixture.detectChanges();

  expect(users.load).toHaveBeenCalledTimes(1);
});
```

Собственный `@Component({ providers: [...] })` имеет приоритет над `provideAutoSpy` в тестовом
модуле. Вызывайте `overrideComponentProvider` после `configureTestingModule`, но до `TestBed.inject`,
`injectSpy` или `createComponent`. Angular читает инжектор при этих вызовах, а не при настройке
модуля. Хелпер проверяет подмену в первой фикстуре, в которой появляется компонент. Если вместо
подмены хотите убрать провайдер у компонента, см. [страницу Angular](/ru/adapters/angular#overriding-a-provider-the-component-declares-for-itself).

## `overrideComponentProvider(component, Class, config?)` {#overridecomponentprovider-component-class-config}

Заменяет провайдер `Class`, который `component` объявляет сам, на авто-спай и возвращает этот спай.
Нужен для сервиса из собственных `providers` компонента.

```ts
const menu = overrideComponentProvider(CatalogPageComponent, NavigationBuilderService, {
  returns: { build: [] },
});

const fixture = TestBed.createComponent(AppShellComponent); // CatalogPageComponent рендерится внутри
```

Компонент не обязан быть в `imports`; если он там тоже есть, это не мешает. Хелпер сам добавит
его в тестовый модуль: в `imports`,
если он standalone, иначе в `declarations`. Поэтому он работает и для дочернего компонента, который
рендерит только шаблон родителя.

| Аргумент    | Тип                                      | Смысл                                                    |
| ----------- | ---------------------------------------- | -------------------------------------------------------- |
| `component` | класс компонента                         | компонент, который объявляет провайдер                   |
| `Class`     | класс сервиса                            | провайдер, который нужно заменить                        |
| `config`    | как второй аргумент `createSpyFromClass` | объект опций, например `{ returns: { load: of(user) } }` |
| результат   | `Spy<Class>`                             | спай, который получит компонент                          |

**Частая ошибка:** вызов после того, как инжектор уже прочитали. После этого Angular не принимает
подмен, и хелпер так и говорит:

```text
[vitest-auto-spy] overrideComponentProvider(ProfileComponent, DeleteAccountService) ran after the testing module was instantiated, and Angular accepts no override past that point. Something read the injector first — a `TestBed.inject`, an `injectSpy`, a `createComponent` — earlier in this test or in the same `beforeCreate`. Override first, then inject.
```

(`beforeCreate` — опция `renderShallow`, хук, который выполняется до создания компонента.)

Перенесите вызов выше первого `TestBed.inject`, `injectSpy` или `createComponent`. Правило линтера
[`no-inject-before-override`](/ru/utilities/eslint-rules#no-inject-before-override) находит неверный
порядок ещё до запуска теста.

Не используйте для этого `TestBed.overrideComponent`. Он перекомпилирует компонент во время теста, и
в тестовом бандле, собранном заранее (AOT, как у `@angular/build:unit-test`), перекомпилированный компонент теряет свои директивы и
пайпы (см. [`assertNgModuleScopes`](#assertngmodulescopes-modules)).

## Проверка {#the-verification}

Когда `TestBed.createComponent` впервые создаёт фикстуру с нужным компонентом, хелпер запрашивает
сервис у инжектора этого компонента. Если инжектор вернёт не тот спай, тест завершится ошибкой. В ней
будут указаны компонент, сервис и причина:

```text
[vitest-auto-spy] overrideComponentProvider(CatalogPageComponent, NavigationBuilderService): the override did not apply — CatalogPageComponent resolved NavigationBuilderService to a NavigationBuilderService instance, not the spy this call returned.
It got the real service because something configured NavigationBuilderService again after this call — a later TestBed.overrideProvider or configureTestingModule. Keep overrideComponentProvider as the last word on it.
```

Подмену ломает только более поздний вызов с **тем же сервисом**: `TestBed.overrideProvider(UserService, …)`
или `configureTestingModule`, где `UserService` есть в `providers`. Уберите его или поставьте
`overrideComponentProvider` после него.

Проверка включена всегда и настройки не требует. Она работает только в тесте, который вызвал
`overrideComponentProvider`, и другие спеки не затрагивает.

Что она проверяет и чего нет:

- **Одна проверка на подмену.** Если в фикстуре нет нужного компонента, хелпер ждёт следующую.
  Он проверяет первую фикстуру, где нужный компонент есть — корневой или дочерний.
- **Только при создании фикстуры.** К моменту возврата из `createComponent` дочернего компонента
  за `@if` или на ленивом маршруте может ещё не быть. После `detectChanges()` или навигации хелпер
  не проверяет ту же фикстуру повторно.
- **Более позднюю подмену она замечает, но не отменяет.** `TestBed.overrideProvider(Class, …)` после
  вызова всё равно заменит спай; тогда проверка упадёт с сообщением выше.
- **Между тестами ничего не переносится.** Тест, который вызвал хелпер, но ничего не отрендерил, не
  оставляет следующему тесту отложенной проверки.
- `getTestBed().createComponent(…)` проверяется так же, как `TestBed.createComponent(…)`.

## `overrideAutoSpy(Class, config?)` {#overrideautospy-class-config}

Возвращает объект `{ useValue: spy }`, который ждёт `TestBed.overrideProvider`. В отличие от
`providers` в `configureTestingModule`, `TestBed.overrideProvider` заменяет и собственный провайдер
компонента. `overrideAutoSpy` подходит, когда компонент уже есть в тестовом модуле и проверка не
нужна; иначе берите `overrideComponentProvider`.

```ts
import { TestBed } from '@angular/core/testing';
import { overrideAutoSpy } from 'vitest-auto-spy/angular';

const payments = overrideAutoSpy(PaymentMethodService);

TestBed.configureTestingModule({ imports: [CheckoutComponent] }).overrideProvider(PaymentMethodService, payments);
payments.useValue.charge.resolveWith({ ok: true });
```

Второй аргумент — тот же, что у [`createSpyFromClass`](/ru/core/create-spy-from-class). Сам спай —
`payments.useValue`.

В обоих хелперах можно задать начальное значение свойства через `overrides`. Если у свойства есть
только сеттер, добавьте его в `settersToSpyOn`, чтобы сохранить спай. При чтении свойство возвращает
начальное значение, пока в него не запишут новое. Установка начального значения не считается вызовом
сеттера.

```ts
const { useValue: settings } = overrideAutoSpy(SettingsService, {
  settersToSpyOn: ['theme'],
  overrides: { theme: 'dark' },
});

expect(settings.theme).toBe('dark');
settings.theme = 'light';
expect(settings.accessorSpies.setters.theme).toHaveBeenCalledExactlyOnceWith('light');
expect(settings.theme).toBe('light');
```

**Частая ошибка:** ждать от него проверки. `overrideAutoSpy` не проверяет, применилась ли подмена;
это делает только `overrideComponentProvider`. `overrideProvider(X, provideAutoSpy(X))` тоже
работает, но `overrideAutoSpy` понятнее по названию.

## `assertNgModuleScopes(...modules)` {#assertngmodulescopes-modules}

Падает сразу и называет модуль, если `NgModule`, импортированный в `TestBed`, не приносит ни
компонентов, ни директив, ни пайпов. Нужен, когда спека импортирует модуль ради его объявлений, а
шаблон падает с `NG0303` или `NG0304`.

```ts
import { TestBed } from '@angular/core/testing';
import { assertNgModuleScopes } from 'vitest-auto-spy/angular';

assertNgModuleScopes(DirectivesModule, PipesModule);
TestBed.configureTestingModule({ imports: [DirectivesModule, PipesModule] });
```

Почему так бывает: тестовый бандл `@angular/build:unit-test` скомпилирован заранее (AOT), и из него
выброшена запись о том, что модуль объявляет. `TestBed` читает именно эту запись, поэтому
импортированный модуль для него пуст. Angular сообщает об этом так, что модуль нигде не назван:

```text
NG0303: Can't bind to 'appTruncate' since it isn't a known property of 'div'
NG0301: Export of name 'focusable' not found!
NG0304: 'ui-smart-row' is not a known element
(или вообще ничего — атрибутная директива просто не запускается)
```

Исправление — импортировать нужные спеке компоненты, директивы и пайпы напрямую или объявить их в
`TestBed`.

**Частая ошибка:** передать модуль, в котором только провайдеры. Он намеренно ничего не объявляет,
поэтому тоже попадёт в ошибку; не передавайте его. [Диагностика
`ngModuleScopes`](/ru/adapters/angular-diagnostics#ngmodulescopes) делает ту же проверку для каждого
тестового модуля автоматически и такие модули пропускает.

## `assertComponentDefIntact(...components)` {#assertcomponentdefintact-components}

Падает сразу и называет компонент и список, если компонент скомпилирован с `undefined` в
`providers`, `viewProviders` или скомпилированных `imports`. Нужен, когда `createComponent` падает с
`Cannot read properties of undefined (reading 'provide')`, а стек ведёт внутрь Angular.

```ts
import { TestBed } from '@angular/core/testing';
import { assertComponentDefIntact } from 'vitest-auto-spy/angular';

assertComponentDefIntact(HoverMenuComponent);
const fixture = TestBed.createComponent(HoverMenuComponent);
```

```text
[vitest-auto-spy] HoverMenuComponent.ɵcmp.providers[0] is undefined.
HoverMenuComponent baked that list in when its file ran, before the chunk holding the symbol had run — an uninitialised barrel chunk, which Angular reports later as "Cannot read properties of undefined (reading 'provide')".
In HoverMenuComponent's source, import the symbol at that position from its own file rather than through the barrel.
```

Почему так бывает: Angular фиксирует списки компонента в момент, когда выполняется его файл. Если
бандлер положил импортированный символ в чанк, который ещё не выполнился, — обычно это импорт через
barrel-файл (`index.ts`), — в списке на его месте оказывается `undefined`. Правка соседнего файла
может сдвинуть границы чанков, поэтому ломается часто спека, которую никто не трогал.

Исправлять надо в исходнике компонента: импортируйте этот символ из его собственного файла, а не
через barrel. Более ранний импорт в спеке не помогает.

Тот же вызов ловит и `Cannot read properties of undefined (reading 'ɵcmp')` из `imports: [Cmp]`,
когда сам класс пришёл как `undefined`; тогда сообщение называет номер аргумента. Директивы
проверяются так же.

## Смежное {#related}

- [Angular](/ru/adapters/angular) — `provideAutoSpy`, `injectSpy` и почему собственный провайдер
  компонента важнее провайдера модуля.
- [Диагностика Angular](/ru/adapters/angular-diagnostics) — проверки, которые включаются по желанию
  и работают на каждом тестовом модуле.
