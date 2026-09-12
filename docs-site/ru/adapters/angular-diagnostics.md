---
title: Диагностика Angular
description: enableAngularDiagnostics — пять молчаливых провалов Angular-тестов (мёртвые импорты NgModule, мёртвые schemas, неспаенные провайдеры, недофлашенные HTTP-запросы, двойник, которого перебивают собственные providers компонента) становятся громкими.
---

# Диагностика Angular

```ts
// vitest.setup.ts — после инициализации тестового окружения Angular
import { enableAngularDiagnostics } from 'vitest-auto-spy/angular';

enableAngularDiagnostics(); // все пять
enableAngularDiagnostics({ pendingRequests: false }); // или выборочно
```

Пять проверок, одно решение. У каждого члена одна и та же форма: что-то, что написала спека, не
делает ничего, никто об этом не сообщает, и тест проходит по причине, которой автор не задумывал.
Они едут одной группой, а не пятью хелперами, потому что перевод сюиты из «проходит» в «проходит
по заявленной причине» — решение, принимаемое один раз, в setup-файле, — и потому что четыре из пяти
висят на том же хуке `TestBed.configureTestingModule`, который уже ставит
[диагностика таймингов](/ru/adapters/angular#where-a-spec-spends-its-time).

| Член               | По умолчанию | Падает, когда                                                                      |
| ------------------ | ------------ | ---------------------------------------------------------------------------------- |
| `ngModuleScopes`   | `true`       | тестовый модуль импортирует NgModule, который не приносит вообще ничего            |
| `deadSchemas`      | `true`       | `schemas` стоят рядом со standalone-компонентом, где они не могут примениться      |
| `unspiedProviders` | `true`       | `injectSpy` получает настоящий инстанс — сегодня `console.warn`, под группой throw |
| `pendingRequests`  | `true`       | тест заканчивается с недофлашенными запросами `HttpTestingController`              |

Каждый член по умолчанию `true`; передайте `false`, чтобы исключить один. Повторный вызов
`enableAngularDiagnostics` **заменяет** предыдущий набор, а не дополняет его, и потестовые хуки
регистрируются один раз на модуль — так что второй вызов безопасен откуда угодно, включая изнутри
теста, где регистрация хука была бы ошибкой.

`disableAngularDiagnostics()` выключает группу: больше никакого разбора конфигурации, а `injectSpy`
снова предупреждает вместо падения. Инструментацию таймингов `TestBed` она оставляет на месте — ею
может пользоваться `enableTestBedDiagnostics`, а убирает её `disableTestBedDiagnostics()`.

## Вызывайте _после_ настройки тестового окружения Angular {#call-it-after-the-angular-test-environment-is-set-up}

Vitest выполняет хуки `afterEach` в **обратном порядке регистрации**. Хук `pendingRequests`,
зарегистрированный здесь, должен выполниться _до_ teardown TestBed, который он разбирает, а значит —
быть зарегистрированным _после_ него:

```ts
// vitest.setup.ts
import { getTestBed } from '@angular/core/testing';
import { enableAngularDiagnostics } from 'vitest-auto-spy/angular';

getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());

enableAngularDiagnostics(); // ← последним, чтобы его afterEach шёл первым
```

Неверный порядок не отключает проверку молча: `resetTestingModule` обёрнут так, чтобы снять снимок
открытых запросов до teardown, поэтому падение всё равно придёт — просто из снимка, а не из живого
инжектора. Правильный порядок — это две строки и на одну косвенность меньше в стеке.

## `ngModuleScopes` {#ngmodulescopes}

Автоматически применяет [`assertNgModuleScopes`](/ru/adapters/angular-overrides#assertngmodulescopes-modules)
к каждой записи `imports` каждого тестового модуля — но только к тем записям, которые сперва прошли
куда более строгий фильтр.

**Почему фильтр вообще нужен.** Пустая рантайм-область подозрительна, когда модули для проверки вы
выбираете руками, потому что туда вы передаёте те, что импортированы _ради своих declarations_.
Автоматическая проверка видит каждый импорт каждого тестового модуля, а там **модуль только с
провайдерами** законно пуст по области: `HttpClientTestingModule`, любой результат `forRoot()`,
десятки штук на реальную сюиту. Без фильтра группа уронила бы на первом же прогоне все файлы
проекта, и проект выключил бы её целиком.

Поэтому автоматическая проверка срабатывает на модуле, у которого в рантайме:

- нет `ɵmod.declarations` и нет `ɵmod.exports`, **и**
- нет `ɵinj.providers`, **и**
- нет `ɵinj.imports`.

Пустота проверяется через уплощение, а не через `length === 0`: компилятор вкладывает структуры, и
`ɵinj.imports` у `@NgModule({})` — это `[[], []]` (собственные imports и exports модуля, оба
пустые), что простая проверка длины прочитает как две записи и сочтёт вкладом.

```
[vitest-auto-spy] NgModule(s) with an empty runtime scope: DirectivesModule.
Either they declare nothing (a providers-only module — do not pass those here), or `ɵɵsetNgModuleScope` was not emitted into this test bundle, in which case importing them into the TestBed contributes no directives, components or pipes at all. Declare what the spec needs in the TestBed module directly.
Docs: https://asdalexey.github.io/vitest-auto-spy/adapters/angular
```

**Ограничение, сказанное прямо.** Область, вырезанная AOT-бандлом, и область, которая всегда была
пустой, в рантайме неразличимы. Поэтому автоматическая проверка срабатывает только тогда, когда
модуль не приносит _вообще ничего_, — а значит, ловит случай вырезанного бандла только для модулей,
которые заодно ничего не провайдят. Модуль, который вырезали, но у которого остались провайдеры,
проходит этот фильтр молча. Ручной вызов `assertNgModuleScopes(DirectivesModule, PipesModule)` в
спеке остаётся строгой формой, потому что там вы сами сказали, что модуль должен был принести.

## `deadSchemas` {#deadschemas}

`NO_ERRORS_SCHEMA` рядом со standalone-компонентом — мёртвая запись. Schemas — свойство
`declarations` тестового модуля; standalone-компонент несёт собственную область зависимостей и
никогда к ним не обращается. Значит, конфигурация, которая ничего не объявляет и импортирует
standalone-компоненты, настроила пустышку: элемент или атрибут, ради которого схему добавляли,
по-прежнему не разрешён, а спека зеленеет над шаблоном, который так и не отрендерил то, что должен
был.

```ts
// падает
TestBed.configureTestingModule({ imports: [CatalogPageComponent], schemas: [NO_ERRORS_SCHEMA] });
```

Проверка срабатывает, когда выполняются все три условия: `schemas` непустые, `declarations` пустые,
а в `imports` есть хотя бы один класс компонента (запись с `ɵcmp`).

```
[vitest-auto-spy] enableAngularDiagnostics({ deadSchemas }): configureTestingModule was given 1 schema(s) that can never apply. The module declares nothing, and CatalogPageComponent carries its own dependency scope.
Nothing is being silenced here: whatever the schema was added for is still unresolved, and the template renders without it.
Drop the `schemas` entry, then put the missing directive, component or pipe into the standalone component's own `imports` — or render it through a standalone host built with `createDirectiveHost({ template, scope: [...] })`.
Docs: https://asdalexey.github.io/vitest-auto-spy/adapters/angular-diagnostics
```

**Что она пропускает намеренно.** Она не срабатывает, когда `declarations` непустые, даже если рядом
импортированы standalone-компоненты. Там схема жива для declarations, а ложное падение на корректной
спеке стоит дороже пропуска — этот размен настроен у каждого члена группы.

## `unspiedProviders` {#unspiedproviders}

`injectSpy(X)` и так сообщает, когда инжектор возвращает обычный инстанс вместо авто-спая; без
группы это сообщение — `console.warn`. Этот член поднимает его до брошенного падения на строке
`injectSpy`, то есть на той строке, которая рассчитывала на спай.

```
[vitest-auto-spy] injectSpy(FeatureFlagService): the injector returned a plain instance, not an auto-spy. Register it with provideAutoSpy(FeatureFlagService) (or { provide: TOKEN, useValue: createAutoMock<T>() } for a token), or read it with TestBed.inject() if the real implementation is what this spec wants. As it stands, the control helpers are typed but absent, and `.mockReturnValue(…)` will throw on the real method.
Docs: https://asdalexey.github.io/vitest-auto-spy/adapters/angular
```

Форма-предупреждение дедуплицируется по токену, поэтому `beforeEach` не печатает одну и ту же строку
на каждый тест. **В режиме падения эта дедупликация отключена**: throw по определению виден один раз
за тест, и подавление второго вхождения только скрыло бы падение от теста, который шёл следом.

## `pendingRequests` {#pendingrequests}

Роняет тест, который заканчивается, пока настроенный им `HttpTestingController` всё ещё держит
запросы.

```
[vitest-auto-spy] enableAngularDiagnostics({ pendingRequests }): the test ended with 2 unflushed HttpTestingController request(s): GET /api/users, POST /api/orders.
Nothing answered them and nothing asserted them, so the code under test is still waiting on a response it never received — everything the spec expected to happen after that call did not happen here.
Flush each one (`controller.expectOne('/url').flush(body)`), or call `controller.verify()` in the spec where the absence of a request is the thing being asserted.
Docs: https://asdalexey.github.io/vitest-auto-spy/adapters/angular-diagnostics
```

### Как это работает без второй пир-зависимости {#how-it-works-without-a-second-peer-dependency}

`@angular/common/http/testing` этим пакетом **никогда не импортируется** и его пиром не является.
Этого и не нужно, потому что токен приезжает внутри конфигурации, которую группа и так видит:

- `provideHttpClientTesting()` возвращает обёртку `EnvironmentProviders` — свойство `ɵproviders`
  вокруг обычного списка провайдеров, — и один из этих провайдеров называет
  `HttpTestingController`.
- `HttpClientTestingModule` держит тот же список в своих `ɵinj.providers`.

Хук уплощает `providers` (вложенные массивы и `ɵproviders` любой обёртки `EnvironmentProviders`),
затем ищет провайдер, у которого `provide` — функция с именем `HttpTestingController`; если
`providers` ничего не дали, он обходит `imports` и точно так же читает `ɵinj.providers` каждой
записи. Токен, таким образом, читается из **собственной конфигурации вызывающего**, а инстанс
приходит через `TestBed.inject(token, null)`.

Проект, который не настраивает ни одну из форм, молча инертен: токен не найден, проверка ничего не
сообщает, и ничего не пришлось устанавливать, чтобы это было так. Именно такую форму и должна иметь
необязательная интеграция.

### Ловушка порядка хуков и как она обработана {#the-hook-ordering-hazard-and-how-it-is-handled}

Vitest выполняет `afterEach` в обратном порядке регистрации, поэтому сюита, у которой teardown
TestBed зарегистрирован позже, уничтожила бы инжектор раньше, чем `afterEach` этой группы успел бы
его о чём-то спросить, — и диагностика тихо сообщила бы, что всё в порядке, а это ровно тот режим
отказа, ради устранения которого она существует.

Поэтому `resetTestingModule` обёрнут так, чтобы снять снимок открытых запросов, пока тестовый модуль
ещё существует, и `afterEach` сообщает из этого снимка, если снимок есть. Чтение **одноразово** в
обе стороны: запросы читаются через `match(() => true)`, что одновременно перечисляет и забирает их,
а снимок очищается по мере чтения. Два хука, которые оба посмотрели, не могут сообщить об одном и
том же запросе дважды.

Если у работающего `TestBed` вообще нет `resetTestingModule`, обёртка не ставится и проверка
откатывается к чтению живого инжектора.

### `assertNoPendingRequests()` {#assertnopendingrequests}

Та же проверка, экспортированная для вызова в середине теста — после подготовки, до проверок,
которые от неё зависят:

```ts
import { assertNoPendingRequests } from 'vitest-auto-spy/angular';

facade.load();
controller.expectOne('/api/users').flush([]);
assertNoPendingRequests(); // больше наружу ничего не ушло
```

Поскольку чтение забирает запросы, за собственный вызов вы не платите дважды: `afterEach` группы не
сообщит повторно о том, что вы уже разобрали. Она ничего не делает, когда группа выключена, и ничего
не делает, когда тест вообще не настраивал HTTP-тестирование.

## `shadowedProviders` {#shadowedproviders}

```ts
// компонент объявляет собственные провайдеры
@Component({ selector: 'app-promo', providers: [PromoService], template: '…' })
export class PromoComponent {}

// спека регистрирует двойника уровнем выше
TestBed.configureTestingModule({ imports: [PromoComponent], providers: [provideAutoSpy(PromoService)] });
const fixture = TestBed.createComponent(PromoComponent); // ← падает здесь, под группой
```

Провайдер уровня компонента резолвится его **узловым** инжектором, а модульный спрашивают только
тогда, когда у узлового ничего нет. Поэтому `provideAutoSpy(X)` на тестовом модуле не доходит до
компонента, который объявляет `X` сам: компонент работает с настоящим сервисом, двойник не
записывает ничего, и проверка «двойника не звали» проходит по неверной причине.

Замер на одной Angular-сюите: из 71 спеки компонента, чей испытуемый объявляет собственные
`providers`, 43 дублируют тот же токен на уровне модуля. 22 из них обходят это через
`TestBed.overrideComponent({ set: { providers } })`, 14 — через `TestBed.overrideProvider`, 4 читают
обратно из инжектора компонента, а **7 не делают ничего** — это и есть отказ.

Починка в одну строку:

```ts
overrideComponentProvider(PromoComponent, PromoService, provideAutoSpy(PromoService));
```

[`overrideComponentProvider`](/ru/adapters/angular-overrides) есть в библиотеке с 3.1.0 и имеет в том
репозитории **ноль** применений — это довод в пользу проверки, а не против хелпера: по симптому он не
находится, потому что симптома нет. Ничего не падает, ничего не предупреждает, и спека читается ровно
как рабочая.

**Молчит, когда ответ компонента сам является двойником.** Спека, которая взяла
`TestBed.overrideProvider`, `overrideComponentProvider` или двойника в `viewProviders`, этот вопрос
уже решила, и её ответ выигрывает сознательно — отмечается только **настоящий** инстанс. Это же
держит проверку в стороне от тех 40 спек, которые так или иначе уже с этим разобрались.

### `assertNoShadowedProviders(component, fixture)` {#assertnoshadowedproviders-component-fixture}

Та же проверка, вызываемая руками. `shadowedProviders` зовёт её на каждом фикстуре, который строит
TestBed; спека, которая рендерит своим хелпером, может спросить сама:

```ts
const fixture = renderThroughOurHelper(CartComponent);

assertNoShadowedProviders(CartComponent, fixture); // двойники и правда те, что в деле
```

Ничего не делает, если этот компонент фикстурой не отрисован.

## Чего в этой группе нет {#what-this-group-does-not-include}

Здесь нет хелперов `provideHttpTesting()` / `expectRequest()`, и их здесь не будет. Это другая
фича — обёртка над API HTTP-тестирования, а не диагностика над тем, что спека уже написала, — и она
вообще потребовала бы второй необязательной пир-зависимости (`@angular/common/http/testing`).
`pendingRequests` читает токен из вашей конфигурации именно затем, чтобы эта страница осталась при
нуле новых зависимостей.

## Смотрите также {#related}

- [Адаптер Angular](/ru/adapters/angular) — `provideAutoSpy`, `injectSpy`, `renderShallow` и
  диагностика таймингов TestBed, которая делит с этой группой один хук.
- [Переопределение провайдеров компонента](/ru/adapters/angular-overrides) —
  `overrideComponentProvider` и его собственная проверка, которая **всегда включена**, а не является
  членом этой группы.
