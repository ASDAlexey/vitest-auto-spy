---
title: Диагностика Angular
description: enableAngularDiagnostics превращает пять тихих ошибок в Angular-спеках в падающие тесты - пустые импорты NgModule, бесполезные schemas, настоящий сервис вместо спая, запросы без ответа и спаи, которые перекрывают собственные providers компонента.
---

# Диагностика Angular

`enableAngularDiagnostics()` превращает пять частых ошибок в Angular-спеках в падения тестов. Из-за
каждой такой ошибки тест зелёный, хотя проверяет не то, что задумано, и никто об этом не
предупреждает. Включается
один раз, в setup-файле Vitest. Выберите вариант, который подходит к тому, как вы запускаете тесты.

**Обычный Vitest** (`vitest` и `vitest.config.ts`):

```ts
// src/test-setup.ts
import { getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { enableAngularDiagnostics } from 'vitest-auto-spy/angular/diagnostics';

getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());

enableAngularDiagnostics(); // все пять проверок
```

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { setupFiles: ['src/test-setup.ts'] },
});
```

**Angular CLI** (`ng test`): `initTestEnvironment()` вызывает сам билдер, и `vitest.config.ts` не
нужен. В setup-файле остаются только импорт и вызов, а `angular.json` указывает на этот файл:

```ts
// src/test-setup.ts
import { enableAngularDiagnostics } from 'vitest-auto-spy/angular/diagnostics';

enableAngularDiagnostics();
```

```jsonc
// angular.json
"test": {
  "builder": "@angular/build:unit-test",
  "options": { "setupFiles": ["src/test-setup.ts"] }
}
```

Спеки остаются как есть. Спека с одной из ошибок ниже теперь
падает с сообщением, в котором написано, как её исправить.

## Пять проверок {#the-five-checks}

| Проверка            | По умолчанию | Тест падает, когда                                                                      |
| ------------------- | ------------ | --------------------------------------------------------------------------------------- |
| `ngModuleScopes`    | `true`       | тестовый модуль импортирует NgModule, который ничего не приносит                        |
| `deadSchemas`       | `true`       | `schemas` стоят рядом со standalone-компонентом, где они не действуют                   |
| `unspiedProviders`  | `true`       | `injectSpy()` получает настоящий сервис вместо спая                                     |
| `pendingRequests`   | `true`       | тест заканчивается, а на HTTP-запросы никто не ответил                                  |
| `shadowedProviders` | `true`       | спай на тестовом модуле не доходит до компонента: побеждают его собственные `providers` |

Передайте `false`, чтобы выключить проверку. `pendingRequests` принимает ещё и объект с единственной
опцией `ignoreCancelled`. Каждый вызов начинает с того, что включены все пять, поэтому проверки, которые
вы не назвали, включены:

```ts
enableAngularDiagnostics({ pendingRequests: false }); // остальные четыре
enableAngularDiagnostics({ pendingRequests: { ignoreCancelled: true } }); // все пять; отменённые запросы не роняют тест
```

| Функция                                   | Что делает                                                                        |
| ----------------------------------------- | --------------------------------------------------------------------------------- |
| `enableAngularDiagnostics(options?)`      | включает проверки; повторный вызов **заменяет** прежний набор, а не дополняет его |
| `disableAngularDiagnostics()`             | выключает все проверки; `injectSpy()` снова только предупреждает                  |
| `assertNoPendingRequests(options?)`       | запускает проверку `pendingRequests` посреди теста                                |
| `assertNoShadowedProviders(cmp, fixture)` | запускает проверку `shadowedProviders` на фикстуре, которую вы собрали сами       |

Все четыре импортируются из `vitest-auto-spy/angular/diagnostics`.

## Вызывайте _после_ настройки тестового окружения Angular {#call-it-after-the-angular-test-environment-is-set-up}

Проверки читают `TestBed`, который строит `initTestEnvironment()`. Поэтому
`enableAngularDiagnostics()` вызывается после него, как в примере для обычного Vitest. С `ng test`
билдер настраивает окружение до ваших setup-файлов, так что порядок уже правильный.

Вызывайте её из setup-файла, а не из спеки. Setup-файл выполняется для каждого файла тестов, и
проверки получает каждый файл. Это верно и с настройкой Vitest `isolate: false`, когда один рабочий
процесс выполняет много файлов тестов.

Вызвать её можно и внутри теста, например `enableAngularDiagnostics({ pendingRequests: false })`. Новый
набор проверок заменяет старый до конца этого файла тестов. Следующий файл снова начинает с набора из
setup-файла, потому что setup-файл выполняется перед каждым файлом.

Порядок хуков `afterEach` не важен. Даже если ваш `afterEach` сбрасывает `TestBed` раньше, проверки
всё равно видят, что оставил тест.

## `ngModuleScopes` {#ngmodulescopes}

Роняет тест, когда тестовый модуль импортирует NgModule, который в рантайме ничего не приносит. Некоторые
сборки для тестов теряют список declarations скомпилированного NgModule. Тогда его директивы молча не рендерятся.

```ts
TestBed.configureTestingModule({ imports: [ProfileComponent, DirectivesModule] }); // падает здесь
```

```text
[vitest-auto-spy] ngModuleScopes: DirectivesModule is imported into the testing module but contributes nothing — this test bundle dropped its ɵɵsetNgModuleScope, so its directives are missing (NG0303/NG0304).
Import the directives it exports directly, or declare them in the TestBed.
Docs: https://asdalexey.github.io/vitest-auto-spy/adapters/angular-diagnostics#ngmodulescopes
```

**Как исправить:** импортируйте сами директивы или объявите их в тестовом модуле.

Автоматическая проверка срабатывает, только когда модуль не приносит _совсем ничего_: ни
declarations, ни exports, ни провайдеров, ни импортов. Модули только с провайдерами, например
`HttpClientTestingModule` или результат `forRoot()`, — это нормально, на них проверка не падает.

**Частая ошибка:** ждать, что она поймает модуль, который потерял declarations, но сохранил
провайдеры. Такой модуль не отличить от модуля только с провайдерами. Для него вызовите в спеке
[`assertNgModuleScopes(DirectivesModule)`](/ru/adapters/angular-overrides#assertngmodulescopes-modules)
сами: там вы говорите, какие модули обязаны принести declarations.

## `deadSchemas` {#deadschemas}

Роняет тест, когда `schemas`, например `NO_ERRORS_SCHEMA`, стоят рядом со standalone-компонентом.
Schemas действуют только на компоненты из `declarations`. У standalone-компонента свои импорты, и
schemas он не читает. Значит, схема ничего не глушит: неизвестный элемент по-прежнему не рендерится,
а спека остаётся зелёной.

```ts
TestBed.configureTestingModule({ imports: [ProfileComponent], schemas: [NO_ERRORS_SCHEMA] }); // падает
```

```text
[vitest-auto-spy] enableAngularDiagnostics({ deadSchemas }): configureTestingModule was given 1 schema(s) that can never apply. The module declares nothing, and ProfileComponent carries its own dependency scope.
Nothing is being silenced here: whatever the schema was added for is still unresolved, and the template renders without it.
Drop the `schemas` entry, then put the missing directive, component or pipe into the standalone component's own `imports` — or render it through a standalone host built with `createDirectiveHost({ template, scope: [...] })`.
Docs: https://asdalexey.github.io/vitest-auto-spy/adapters/angular-diagnostics#deadschemas
```

**Как исправить:** уберите `schemas`. Недостающую директиву, компонент или пайп добавьте в `imports`
самого компонента или отрендерите через `createDirectiveHost({ template, scope: [...] })`.

Проверка срабатывает, только когда выполнены все три условия: `schemas` не пустые, `declarations`
пустые, а в `imports` есть хотя бы один компонент. Она смотрит на модуль целиком, со всеми вызовами
`configureTestingModule()` за тест (например, один в `beforeEach` и один в самом тесте).

**Частая ошибка:** ждать падения, когда `declarations` не пустые. Там схема действует на объявленные
компоненты, поэтому проверка намеренно молчит.

## `unspiedProviders` {#unspiedproviders}

Роняет тест на строке `injectSpy()`, когда в тестовом модуле нет спая для этого сервиса и Angular
создал настоящий. Без диагностики `injectSpy()` только печатает `console.warn`.

```ts
TestBed.configureTestingModule({ imports: [ProfileComponent] }); // нет provideAutoSpy(FeatureFlagService)
const flags = injectSpy(FeatureFlagService); // падает здесь
```

```text
[vitest-auto-spy] injectSpy(FeatureFlagService): got a real FeatureFlagService — nothing in the testing module provides a double, so Angular built it (providedIn: 'root').
Add provideAutoSpy(FeatureFlagService) to providers.
Docs: https://asdalexey.github.io/vitest-auto-spy/adapters/angular#injectspy-says-when-it-got-the-real-thing
```

**Как исправить:** добавьте `provideAutoSpy(FeatureFlagService)` в `providers`.

Предупреждение печатается один раз на сервис и файл тестов. Падение приходит в каждом тесте, где
ошибка есть, чтобы один тест не спрятал её от следующего.

## `pendingRequests` {#pendingrequests}

Роняет тест, который закончился, пока в `HttpTestingController` остались запросы без ответа. Код под
тестом всё ещё ждёт ответа, поэтому то, что он должен сделать после ответа, не выполнилось.

```ts
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

it('loads the user', () => {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  const http = TestBed.inject(HttpTestingController);

  TestBed.inject(UserService).load().subscribe();

  http.expectOne('/api/user').flush({ id: 1, name: 'Ada' }); // уберите эту строку — и тест упадёт
});
```

Без строки с `flush` тест падает так:

```text
[vitest-auto-spy] GET /api/user was never answered (end of "loads the user").
The code under test is still waiting on it, so nothing after that call ran; left open, the next test would match it.
Answer it in the spec: controller.expectOne('/api/user').flush(body).
Docs: https://asdalexey.github.io/vitest-auto-spy/adapters/angular-diagnostics#pendingrequests
```

**Как исправить:** ответьте в спеке на каждый запрос. С `provideHttpClientTesting()` или
`HttpClientTestingModule` это `controller.expectOne(url).flush(body)`. С
[`provideHttpTesting()`](/ru/adapters/angular-http) сообщение предложит
`await expectRequest('/api/user').flush(body)`.

Проверка находит `HttpTestingController` в ваших `providers` и `imports` на любой глубине. Проект без
HTTP-тестирования она не затрагивает, и ставить ничего дополнительно не нужно.

**Частая ошибка:** падает тест, который отменяет запрос намеренно. Используйте `ignoreCancelled`, см.
ниже.

### `ignoreCancelled` {#ignorecancelled}

Отменённый запрос тоже считается запросом без ответа. Когда код отписывается, Angular оставляет запрос
в контроллере с пометкой `cancelled`, и по умолчанию тест падает. Так бывает с `httpResource()` уничтоженного компонента, с `takeUntil` или со
`switchMap`, который переключился дальше. Если ваш код отменяет запросы намеренно, передайте объект в
setup-файле. Настройка действует на весь проект:

```ts
enableAngularDiagnostics({ pendingRequests: { ignoreCancelled: true } });
```

| Опция             | Тип       | По умолчанию | Смысл                                   |
| ----------------- | --------- | ------------ | --------------------------------------- |
| `ignoreCancelled` | `boolean` | `false`      | отменённый запрос больше не роняет тест |

Отменённый запрос всё равно удаляется из контроллера и не попадёт в следующий тест. Запрос, который
всё ещё ждёт ответа, роняет тест, как и раньше. У `HttpTestingController.verify()` из Angular есть
опция с тем же именем и смыслом.

### `assertNoPendingRequests()` {#assertnopendingrequests}

Та же проверка посреди теста, обычно после подготовки данных:

```ts
import { assertNoPendingRequests } from 'vitest-auto-spy/angular/diagnostics';

facade.load();
controller.expectOne('/api/users').flush([]);
assertNoPendingRequests(); // → падает, если ушло что-то ещё
```

| Опция             | Тип       | По умолчанию                           | Смысл                        |
| ----------------- | --------- | -------------------------------------- | ---------------------------- |
| `ignoreCancelled` | `boolean` | значение из `enableAngularDiagnostics` | переопределить на один вызов |

Она смотрит только на запросы, которые ещё не нашёл ни один `expectOne(...)`, поэтому вызывайте её
после этих строк. Найденные запросы удаляются из контроллера, и проверка в конце теста не сообщит о них
второй раз. Она ничего не делает, когда диагностика выключена или тест не настраивал HTTP-тестирование.

## `shadowedProviders` {#shadowedproviders}

Роняет тест, когда спай на тестовом модуле не доходит до компонента, потому что компонент указал тот
же сервис в собственных `providers`. Компонент работает с настоящим сервисом. Спай ничего не
записывает, и проверка вида «метод _не_ вызывали» проходит не по той причине.

```ts
@Component({ selector: 'app-promo', providers: [PromoService], template: '…' })
export class PromoComponent {}

TestBed.configureTestingModule({ imports: [PromoComponent], providers: [provideAutoSpy(PromoService)] });
const fixture = TestBed.createComponent(PromoComponent); // падает здесь
```

```text
[vitest-auto-spy] PromoComponent declares its own providers, so 1 double on the testing module never reached it: PromoService → a PromoService instance.
The component's own providers are asked before the module's, so it runs against the real service while the spec asserts on a double that records nothing.
Replace the module-level registration with overrideComponentProvider(PromoComponent, PromoService).
Docs: https://asdalexey.github.io/vitest-auto-spy/adapters/angular-diagnostics#shadowedproviders
```

**Как исправить:** положите спай в собственные провайдеры компонента:

```ts
import { overrideComponentProvider } from 'vitest-auto-spy/angular';

const promo = overrideComponentProvider(PromoComponent, PromoService); // → Spy<PromoService>
```

Третий аргумент — необязательная конфигурация спая. Для `InjectionToken`, который
`overrideComponentProvider` не принимает, используйте
`TestBed.overrideProvider(TOKEN, provideAutoSpyForToken(TOKEN))`.

Проверка молчит, когда компонент уже получает спай: через `TestBed.overrideProvider`,
`overrideComponentProvider` или спай в `viewProviders`. Она сообщает только о **настоящем**
экземпляре. Молчит она и тогда, когда спай модуля заменили позже: другим провайдером или через `TestBed.overrideProvider`.

**Частая ошибка:** добавить `provideAutoSpy(PromoService)` в модуль и ждать, что компонент его
получит. Собственные `providers` компонента всегда побеждают провайдеры модуля.

### `assertNoShadowedProviders(component, fixture)` {#assertnoshadowedproviders-component-fixture}

Та же проверка на фикстуре, которую вы собрали сами, например своим хелпером рендера:

```ts
import { assertNoShadowedProviders } from 'vitest-auto-spy/angular/diagnostics';

const fixture = renderThroughOurHelper(CartComponent);

assertNoShadowedProviders(CartComponent, fixture); // → падает, если спай модуля не дошёл до CartComponent
```

Ничего не делает, если фикстура этот компонент не рендерила.

## Чего в этой группе нет {#what-this-group-does-not-include}

Диагностика только проверяет то, что спека уже написала. Отвечать на HTTP-запросы за вас она не
умеет. Для этого есть [`provideHttpTesting()` и `expectRequest()`](/ru/adapters/angular-http) из
`vitest-auto-spy/angular-http`. Эта точка входа не импортирует `@angular/common/http/testing` и
новых зависимостей не добавляет.

## Подробнее {#in-depth}

### Видны оба способа добраться до `TestBed` {#both-ways-of-reaching-the-testbed-are-seen}

Спека настраивает модуль через класс `TestBed` или через `getTestBed()`. Это один и тот же объект:
каждый статический метод вызывает метод экземпляра. Проверки стоят на экземпляре, поэтому проверяются
оба способа:

```ts
getTestBed().configureTestingModule({ imports: [CatalogPageComponent] }); // проверяется
const fixture = getTestBed().createComponent(CatalogPageComponent); // и это тоже
```

Это касается `ngModuleScopes`, `deadSchemas`, `shadowedProviders` и
[проверки `overrideComponentProvider`](/ru/adapters/angular-overrides). Каждый вызов считается один
раз. `TestBed.overrideTemplate` проходит через `overrideComponent`, поэтому попадает в замеряемое
[время `TestBed`](/ru/adapters/angular).

### Зачем `ngModuleScopes` фильтрует модули {#why-ngmodulescopes-filters-modules}

Когда вы вызываете `assertNgModuleScopes()` сами, вы передаёте модули, которые импортируете ради их
declarations, и пустой список — настоящая проблема. Автоматическая проверка видит все импорты подряд.
Многие из них — модули только с провайдерами, и пустые они законно. Без фильтра проверка уронила бы
все файлы тестов на первом же прогоне.

Вырезанный список и изначально пустой в рантайме выглядят одинаково. Поэтому автоматическая проверка
срабатывает, только когда модуль не приносит совсем ничего.

Пустота проверяется разворачиванием вложенных массивов, а не через `length === 0`. У `@NgModule({})`
скомпилированный `ɵinj.imports` равен `[[], []]`: два пустых списка, которые проверка длины сочла бы
двумя записями.

### Как `deadSchemas` читает конфигурацию {#how-deadschemas-reads-the-configuration}

Тест может вызвать `configureTestingModule()` несколько раз, например в `beforeEach` и ещё раз в
самом тесте. Angular складывает вызовы, и проверка судит по общей конфигурации, а не по одному вызову. Поэтому
схема из одного вызова рядом с declarations из другого считается рабочей. Общая конфигурация сбрасывается перед
каждым тестом и при каждом `resetTestingModule()`.

### Как это работает без второй пир-зависимости {#how-it-works-without-a-second-peer-dependency}

Этот пакет никогда не импортирует `@angular/common/http/testing`, и в пир-зависимостях его нет. Токен
`HttpTestingController` берётся из вашей же конфигурации:

- `provideHttpClientTesting()` возвращает обёртку `EnvironmentProviders`. В её списке `ɵproviders`
  есть провайдер для `HttpTestingController`.
- `HttpClientTestingModule` хранит тот же список в `ɵinj.providers`.

Проверка разворачивает `providers`, включая вложенные массивы и `ɵproviders` любой обёртки
`EnvironmentProviders`. Она ищет провайдер, у которого `provide` — функция с именем
`HttpTestingController`. Если в `providers` такого нет, она обходит `imports` и так же читает
`ɵinj.providers` каждой записи. Экземпляр она получает через `TestBed.inject(token, null)` и только
пока тестовый модуль существует. Запрос к сброшенному `TestBed` построил бы новый модуль, и следующий
`configureTestingModule()` отказался бы работать.

Обход `imports` идёт на всю глубину, поэтому общий тестовый модуль с `HttpClientTestingModule` внутри
тоже работает:

```ts
TestBed.configureTestingModule({ imports: [SharedTestingModule] }); // HttpClientTestingModule внутри
```

Каждый модуль обходится один раз и кешируется. Вложенные массивы и результат в стиле `forRoot()`
(`{ ngModule, providers }`) понимаются. Цикл в импортах не обходится дважды. Обход останавливается на
первом найденном токене.

### Ловушка порядка хуков и как она обработана {#the-hook-ordering-hazard-and-how-it-is-handled}

Ваш `afterEach(() => getTestBed().resetTestingModule())` или хук очистки Angular может уничтожить
тестовый модуль раньше, чем диагностика на него посмотрит. Это верно для обоих порядков хуков:
`sequence: { hooks: 'stack' }` и `'list'`.

Поэтому диагностика оборачивает `resetTestingModule()` у экземпляра `TestBed`. Перед каждым сбросом
обёртка сохраняет открытые запросы, пока модуль ещё существует. Обёрнут именно экземпляр: статический
`TestBed.resetTestingModule()` вызывает его, а `getTestBed().resetTestingModule()` и хук очистки
Angular зовут его напрямую. Затем `afterEach` сообщает о сохранённых запросах **и** о тех, что открыты
сейчас. Тест, который сбросил модуль дважды, построил два модуля, и сообщается про оба.

Та же обёртка забывает спаи, которые `shadowedProviders` запомнила для модуля, и общую конфигурацию для `deadSchemas`.

Чтение забирает запросы: `match(() => true)` и перечисляет, и удаляет их, а сохранённый список
очищается при чтении. Поэтому два хука никогда не сообщат об одном запросе дважды.

Сохранить запросы обёртка пытается, но сброс выполняется в любом случае. Если сохранение бросает ошибку, например потому что
Angular уже уничтожил инжектор, ошибка глотается, а `resetTestingModule()` всё равно выполняется.

Если у `TestBed` вообще нет `resetTestingModule()`, обёртка не ставится, и проверка читает живой
инжектор. Обёртка ставится один раз на экземпляр `TestBed` и ничего не делает, пока диагностика
выключена.

### Как сравнивает `shadowedProviders` {#how-shadowedproviders-compares}

Она читает собственный инжектор компонента с `{ self: true }`. Поэтому она не ищет выше сервис,
которого компонент не объявляет. Она не может создать настоящий корневой сервис, о котором тест не
просил, и не может упасть на его недостающих зависимостях (`NG0201`). Спаи, с которыми она сравнивает,
забываются перед каждым тестом и при каждом сбросе.

## Смотрите также {#related}

- [Адаптер Angular](/ru/adapters/angular): `provideAutoSpy`, `injectSpy`, `renderShallow` и замер
  времени `TestBed`, который делит с этой группой один хук.
- [Переопределение провайдеров компонента](/ru/adapters/angular-overrides): `overrideComponentProvider`
  и его собственная проверка, которая **всегда включена** и в эту группу не входит.
- [Angular HTTP](/ru/adapters/angular-http): `provideHttpTesting()` и `expectRequest()`.

`disableAngularDiagnostics()` не убирает замер времени `TestBed`, которым пользуется и
`enableTestBedDiagnostics()` из [адаптера Angular](/ru/adapters/angular). Для этого вызовите
`disableTestBedDiagnostics()`.
