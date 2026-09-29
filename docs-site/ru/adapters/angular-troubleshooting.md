---
title: 'Angular: решение проблем'
description: Ошибки, на которых Angular-спека может упасть раньше вашего кода - две копии Angular testing, уже созданный тестовый модуль, NG0101, пустые NgModule, сломанные определения компонентов.
---

# Angular: решение проблем

Найдите своё сообщение об ошибке ниже. В каждом разделе — отчего она возникает и что поменять.
Большинство этих ошибок идут от настройки сборки или от самого Angular, а не от вашего теста.

| Ошибка или симптом                                                                                        | Раздел                                                                                                      |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `TypeError: cache.has is not a function` при запуске                                                      | [Analog старше билдера](#analog-is-older-than-the-builder)                                                  |
| `Need to call TestBed.initTestEnvironment() first`, `Cannot read properties of null (reading 'ngModule')` | [Две копии `@angular/core/testing`](#two-copies-of-angular-core-testing)                                    |
| `the testing module was already instantiated`, `Cannot configure the test module…`                        | [Тестовый модуль уже создан](#the-testing-module-was-already-instantiated)                                  |
| `NG0101: ApplicationRef.tick is called recursively`                                                       | [NG0101](#ng0101-applicationref-tick-is-called-recursively)                                                 |
| `Cannot set base providers because it has already been called`                                            | [Файлы zone и zoneless в одном прогоне](#zone-and-zoneless-files-in-one-run)                                |
| `stable: the fixture was still unstable after 2000 ms`                                                    | [Фикстура никак не успокоится](#a-fixture-never-becomes-stable)                                             |
| `NG0303`, `NG0301`, `NG0304` для объявленной директивы или пайпа                                          | [NgModule, который ничего не привносит](#an-ngmodule-that-contributes-nothing)                              |
| `Cannot read properties of undefined (reading 'provide')` внутри Angular                                  | [Компонент, в собственном определении которого дыра](#a-component-whose-own-definition-has-a-hole-in-it)    |
| `@angular/core … no longer carries …, which this package reads`                                           | [Когда внутренняя структура Angular меняется](#when-an-angular-internal-moves)                              |
| `__spreadValues is not a function`, ошибка `vi.mock` с относительным путём                                | [Билдер unit-test в Angular](/ru/guides/angular-unit-test-builder#module-mocks-under-the-unit-test-builder) |

## Analog старше билдера {#analog-is-older-than-the-builder}

```text
TypeError: cache.has is not a function
```

На `@angular/build` 22.2 пакеты Analog `@analogjs/vite-plugin-angular` и `@analogjs/vitest-angular`
должны быть **версии 2.7.5 или новее**. Более старые падают при запуске с этой ошибкой. Обновите оба.

`npx vitest-auto-spy doctor` сообщает это как
[`analog-behind-angular-build`](/ru/utilities/cli#analog-behind-angular-build).

## Две копии `@angular/core/testing` {#two-copies-of-angular-core-testing}

```text
Need to call TestBed.initTestEnvironment() first
Cannot read properties of null (reading 'ngModule')
```

Если `injectSpy` или `renderShallow` падает с одной из этих ошибок, хотя ваш setup-файл вызывает
`initTestEnvironment`, в проекте две копии `@angular/core/testing`. Setup-файл инициализировал одну,
а библиотека обращается к другой.

Как так выходит: Vite-плагин Analog обрабатывает Angular вместе с вашим кодом, а пакет `vitest-auto-spy`
Vitest загружает из `node_modules` без обработки ([выносит из обработки](/ru/glossary)). Тогда библиотека
импортирует свою копию Angular. Скажите Vitest обрабатывать библиотеку вместе с вашим кодом, чтобы
копия была одна. Добавьте её в `server.deps.inline` в том файле, где лежат настройки Vitest (в
проекте на Analog это `vite.config.ts`); уже существующие записи оставьте:

```ts
// vite.config.ts
import angular from '@analogjs/vite-plugin-angular';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [angular()],
  test: {
    server: { deps: { inline: ['vitest-auto-spy'] } },
  },
});
```

Когда это случается, библиотека бросает свою ошибку с этим объяснением, а исходная ошибка Angular
лежит в её `cause`. `npx vitest-auto-spy doctor` читает ваш конфиг и
сообщает о раздвоении ещё до прогона, как
[`angular-testbed-split`](/ru/utilities/cli#angular-testbed-split).

**Или одна копия, загруженная дважды.** `vi.resetModules()` загружает `@angular/core/testing` заново,
и при `isolate: false` все следующие файлы воркера получают новую копию. Setup, который запоминает в
`globalThis`, что уже выполнился (например, `setupTestBed()` из `@analogjs/vitest-angular`),
пропускает её, и новый `TestBed` так и не инициализируется. Сообщение библиотеки называет этот случай,
когда она видела в воркере больше одного `TestBed`. В setup-файле инициализируйте заново, когда
`getTestBed().platform` равен `null`, или уберите сброс:

```ts
// vitest.setup.ts
import { destroyPlatform } from '@angular/core';
import { getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';

if (!getTestBed().platform) {
  // старая платформа ещё живёт в @angular/core — сначала уничтожьте её
  destroyPlatform();
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
}
```

## Тестовый модуль уже создан {#the-testing-module-was-already-instantiated}

```text
[vitest-auto-spy] renderShallow(TaskListComponent): the testing module was already instantiated, so it can no longer be configured. Something read the injector first — TestBed.inject or injectSpy in a beforeEach, or an earlier render in the same test.
```

У Angular та же ошибка звучит как _«Cannot configure the test module when the test module has
already been instantiated»_. Первый `TestBed.inject`, `injectSpy` или `createComponent` создаёт
тестовый модуль, и после этого настроить его уже нельзя. Частые причины:

- `injectSpy` в `beforeEach`, а потом `renderShallow` в тесте. Перенесите вызов `injectSpy` в опцию
  `beforeCreate` у `renderShallow`. Это функция, которая выполняется после настройки модуля и до
  создания компонента: настраивать там уже нечего, поэтому чтение ничего не ломает:

  ```ts
  import { of } from 'rxjs';
  import { injectSpy, provideAutoSpy, renderShallow } from 'vitest-auto-spy/angular';

  const ada = { id: 1, name: 'Ada' };

  const { fixture } = renderShallow(ProfileComponent, {
    providers: [provideAutoSpy(UserService)],
    beforeCreate: () => {
      injectSpy(UserService).load.mockReturnValue(of(ada));
    },
  });
  ```

  После рендера снова вызвать `injectSpy(UserService)` для проверки можно: читать созданный модуль
  разрешено, нельзя только его настраивать. Подробнее:
  [`renderShallow`](/ru/adapters/angular#shallow-component-rendering).

- `overrideComponentProvider` после `injectSpy`. Ставьте подмену первой; правило линтера
  [`no-inject-before-override`](/ru/utilities/eslint-rules#no-inject-before-override) это ловит.
- Фикстуры Vitest собраны цепочкой вызовов `test.extend(...)`, по одному спаю на вызов. Первая
  фикстура создаёт модуль раньше остальных. Передайте все спаи одним вызовом
  [`extendWithAutoSpies`](/ru/adapters/angular#fixtures-instead-of-let-beforeeach-—-extendwithautospies).
- Второй рендер в том же тесте (`renderShallow` или `create()` из
  [`prepareShallow`](/ru/adapters/angular#the-same-options-in-every-test-—-prepareshallow)). Сначала
  вызовите `TestBed.resetTestingModule()`.

## NG0101: ApplicationRef.tick is called recursively {#ng0101-applicationref-tick-is-called-recursively}

```text
NG0101: ApplicationRef.tick is called recursively
```

В проекте на zone.js тик обнаружения изменений, запущенный из тела теста, может зайти сам в себя,
если `effect()` компонента в этот момент «грязный». Angular отдаёт эту ошибку в `ErrorHandler`, а не
бросает, поэтому тест может остаться зелёным с недоделанным обнаружением изменений.

Используйте [`stable`, `flushEffects` и `setInputs`](/ru/adapters/angular#zoneless-waiting). Они
выполняют тик внутри `NgZone`, и ошибки не возникает. Голый `TestBed.tick()` или
`componentRef.setInput` с последующим собственным тиком могут на неё нарваться.

Она проявляется, только когда сходится всё это:

- проект загружает zone.js (тогда билдер CLI добавляет `provideZoneChangeDetection()`);
- компонент регистрирует `effect()`;
- этот эффект «грязный» в момент тика, чаще всего при первом рендере фикстуры.

## Файлы zone и zoneless в одном прогоне {#zone-and-zoneless-files-in-one-run}

```text
Cannot set base providers because it has already been called
```

`TestBed.initTestEnvironment` можно вызвать один раз на платформу, а под `isolate: false` платформа
живёт весь воркер. Тогда второй файл в другом режиме падает. Выбирайте режим для каждого файла
через [`setupAngularTestEnv`](/ru/adapters/angular#zone-and-zoneless-in-the-same-run).

## Фикстура никак не успокоится {#a-fixture-never-becomes-stable}

```text
[vitest-auto-spy] stable: the fixture was still unstable after 2000 ms. …
```

Что-то держит Angular занятым. Сообщение называет вероятную причину:

- колбэки ждут фейковые таймеры: сначала `await advanceTimers(ms)` из
  [`vitest-auto-spy/setup`](/ru/utilities/fake-timers);
- запрос `HttpClient`, который никто не завершил:
  `TestBed.inject(HttpTestingController).expectOne(url).flush(body)`;
- запись `PendingTasks`, которую ничто не сняло, или настоящий `setInterval`, запущенный компонентом.

Незавершённый запрос под одним лишь `provideHttpClientTesting` сам по себе `whenStable()` не
вешает. Если фикстура висит там, причина в чём-то из остального. Опции:
[У ожидания есть предел](/ru/adapters/angular#the-wait-is-bounded).

## NgModule, который ничего не привносит {#an-ngmodule-that-contributes-nothing}

```text
NG0303: Can't bind to 'appTruncate' since it isn't a known property of 'div'
NG0301: Export of name 'focusable' not found!
NG0304: 'ui-smart-row' is not a known element
(или ничего: атрибутная директива просто не запускается)
```

В AOT-сборке тестов, которую делает `@angular/build:unit-test`, у каждого `NgModule` во время
выполнения пустые объявления и экспорты. Компонентам, скомпилированным заранее, это не мешает: их
зависимости уже встроены. Но `TestBed` сам разбирает область видимости, когда модуль стоит в
`imports: [SomeModule]` или когда `TestBed.overrideComponent` перекомпилирует компонент. Тогда он
ничего не находит, а ошибки выше модуль не упоминают.

Проверьте модули, которые вы импортируете ради их объявлений:

```ts
import { TestBed } from '@angular/core/testing';
import { assertNgModuleScopes } from 'vitest-auto-spy/angular';

assertNgModuleScopes(DirectivesModule, PipesModule);
TestBed.configureTestingModule({ imports: [DirectivesModule, PipesModule] });
```

Ошибка называет модуль. Исправление — положить то, что нужно спеке, прямо в тестовый модуль или
взять standalone-хост через [`createDirectiveHost`](/ru/adapters/angular#a-host-for-a-directive-under-test).

**Частая ошибка:** передать модуль, в котором только провайдеры. Он пуст намеренно и попадёт в
ложное срабатывание. [`enableAngularDiagnostics({ ngModuleScopes })`](/ru/adapters/angular-diagnostics#ngmodulescopes)
запускает эту проверку на каждом тестовом модуле, с фильтром, который пропускает модули только с
провайдерами. Полный справочник:
[`assertNgModuleScopes`](/ru/adapters/angular-overrides#assertngmodulescopes-modules).

## Компонент, в собственном определении которого дыра {#a-component-whose-own-definition-has-a-hole-in-it}

```text
TypeError: Cannot read properties of undefined (reading 'provide')
  ❯ resolveProvider render3/di_setup.ts:95
```

`providers`, `viewProviders` и скомпилированная область видимости компонента фиксируются, когда
выполняется его файл. Если бандлер положил баррель в чанк, который ещё не выполнился, компонент
получает `undefined` в этих списках. Angular падает гораздо позже, и в стеке нет ни барреля, ни
компонента. Ломается часто спека, которую никто не трогал: правка соседнего файла может перенести
символ в другой чанк.

Проверьте компонент перед созданием:

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

Исправление — в исходнике компонента: импортируйте этот символ из его собственного файла, а не
через баррель.

- Проверяются все три списка, включая вложенные массивы и forward-ссылки. Директива проверяется так
  же.
- Та же проверка объясняет `Cannot read properties of undefined (reading 'ɵcmp')` из
  `imports: [Cmp]`, когда не пришёл сам класс. Тогда сообщение называет позицию аргумента.
- `await import('@scope/lib')` в `beforeEach` или статический импорт в начале спеки порядок не
  исправят.

Полный справочник:
[`assertComponentDefIntact`](/ru/adapters/angular-overrides#assertcomponentdefintact-components).

## Когда внутренняя структура Angular меняется {#when-an-angular-internal-moves}

```text
[vitest-auto-spy] @angular/core 23.0.0 no longer carries ReactiveNode#consumers / #kind, which this
package reads.
`mockSignalProp()` can no longer see whether a signal has been read, nor write through a read-only
one, so a patch applied after the first read would be accepted and quietly change nothing.
Nothing here is fixable from a spec: report the Angular version above, and pin the previous one
until a release of this package reads the new shape.
```

Некоторые хелперы читают внутренности Angular, у которых нет публичного API: незавершённые запросы
тестового модуля, входы скомпилированного компонента, читал ли кто-то сигнал. Если новая версия
Angular поменяет одну из них, библиотека громко падает и называет версию и проверку, которая
перестала работать. Иначе проверка молча ничего бы не находила, и тест проходил бы, проверяя меньше.

Что делать: закрепите предыдущую версию Angular и сообщите о новой в issue. Из спеки это не
исправить.

Структуры проверяются один раз на воркер, когда хелпер впервые в них нуждается: `mockSignalProp`,
`enableAngularDiagnostics()` и `provideHttpTesting()`. Проект, который ими не пользуется, ничего не
платит. `setInputs`, `renderShallow` и `createComponentStub` бросают ту же ошибку, когда встречают
изменившуюся структуру.
