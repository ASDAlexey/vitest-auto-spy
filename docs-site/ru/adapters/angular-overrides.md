---
title: Переопределение провайдеров компонента
description: overrideComponentProvider и overrideAutoSpy — подменяют зависимость, которую компонент объявляет сам, и сообщают, когда оверрайд не применился.
---

# Переопределение провайдеров компонента {#component-provider-overrides}

```ts
import { overrideAutoSpy, overrideComponentProvider } from 'vitest-auto-spy/angular';

const menu = overrideComponentProvider(CatalogPageComponent, NavigationBuilderService); // → Spy<NavigationBuilderService>

menu.build.mockReturnValue([]);

const fixture = TestBed.createComponent(HostComponent); // ← the override is verified here
```

`provideAutoSpy` регистрирует провайдер на тестовом модуле, а провайдер тестового модуля **проигрывает**
тому, что компонент объявляет в собственном `@Component({ providers: [...] })` — route-scoped-сервисам,
сторам на уровне компонента, хелперам `provideX()`. Предыстория этой ловушки и двух способов её
обхода — на [странице Angular-адаптера](/ru/adapters/angular#overriding-a-provider-the-component-declares-for-itself).
Эта страница о том, что идёт следом: **доказать, что оверрайд применился.**

## `overrideComponentProvider(component, Class, config?)` {#overridecomponentprovider-component-class-config}

Делает три вещи, по порядку:

1. ставит `component` в очередь к компилятору TestBed — как элемент `imports`, если компонент
   standalone, иначе как элемент `declarations` — потому что `overrideProvider` применяется в момент
   компиляции компонента, а компонент, который тестовый модуль нигде не упоминает, им не компилируется;
2. вызывает `TestBed.overrideProvider(Class, { useValue: spy })`;
3. ставит в очередь проверку, которая сработает на ближайшем `TestBed.createComponent`.

Он возвращает `Spy<T>` напрямую, так что разворачивать нечего.

**Не** тянитесь здесь к `TestBed.overrideComponent`. Он принуждает к JIT-рекомпиляции, а под AOT-бандлом
тестов эта рекомпиляция разрешает директивы и пайпы компонента из runtime-скоупа, который бандлер
вырезал, — и компонент остаётся без них; см. [`assertNgModuleScopes`](#assertngmodulescopes-modules) ниже.

## Проверка {#the-verification}

Постановка компонента в очередь убирает _обычную_ причину немого no-op. Она не доказывает, что
оверрайд применился, поэтому хелпер проверяет это сам.

**Что попадает в очередь.** Каждый вызов добавляет одну запись — компонент, токен, спай — и **один
раз** оборачивает `TestBed.createComponent`. На следующем фикстуре обёртка прогоняет все записи
очереди, возвращает на место исходный метод и очищает очередь. Она срабатывает на первом фикстуре
и уходит с дороги: проверка принадлежит фикстуре, которую построил именно этот вызов; оставленная
установленной обёртка выполнялась бы против постороннего компонента более поздней спеки.

**Как разрешается токен.** Через _собственный_ инжектор компонента, не через инжектор тестового
модуля:

- если `fixture.debugElement.componentInstance` — инстанс переопределённого компонента, спрашивают
  его инжектор;
- иначе корень фикстуры обходится простым предикатом —
  `element.componentInstance instanceof component` — и отвечает инжектор найденного debug-элемента.

Импорт `@angular/platform-browser` в этом не участвует. `By.directive` был бы идиоматичным
предикатом и добавил бы импорт пакета, который этой входной точке больше ни для чего не нужен;
поверхностный API `DebugElement` читается структурно.

**Почему вложенный случай вообще работает.** На Angular 21.2.17 ребёнок, размещённый шаблоном
родителя, уже инстанцирован к моменту `createComponent` — до всякого `detectChanges()`. Это
измеренный факт, а не вывод: проверка находит инжектор вложенного компонента в фикстуре, которую
возвращает вызов, без единого запущенного между делом change detection.

Ошибка называет всех троих участников:

```
[vitest-auto-spy] overrideComponentProvider(CatalogPageComponent, NavigationBuilderService): the override did not apply.
CatalogPageComponent resolved NavigationBuilderService to a NavigationBuilderService instance, not the spy this call created — so every assertion about that spy is about an object the component never used.
Check that NavigationBuilderService is the token CatalogPageComponent injects (a component that injects a base class or an InjectionToken needs *that* token here, not the implementation class), and that nothing re-configured the testing module with a competing provider afterwards.
Docs: https://asdalexey.github.io/vitest-auto-spy/adapters/angular-overrides
```

Не-объектный ответ печатается как есть (`resolved … to not-a-service`), а инстанс класса
называется по его конструктору.

### Почему она всегда включена {#why-it-is-always-on}

Это проектное решение, и оно же — единственная причина, по которой проверка не входит в
[`enableAngularDiagnostics`](/ru/adapters/angular-diagnostics):

- **Хелпер существует потому, что задокументированная альтернатива отказывает молча.** Оверрайд,
  который не применился, — баг хелпера, а не необязательная опция. Отдать хелпер вместе с его
  собственной проверкой корректности за флагом — значит отгрузить ту самую немую ошибку, ради
  устранения которой хелпер писался.
- **Она не может выстрелить в спеке, которая не вызывала `overrideComponentProvider`.** Очередь
  пуста, значит `createComponent` не оборачивается. Сюита без хелпера не затронута.
- **Она молчит, когда компонент не отрендерился.** Нет инжектора — нет проверки.

Это ровно те два свойства, которых не хватает группе диагностики: та применяется к каждой спеке
сюиты, включая написанные задолго до её появления, — поэтому покраснение проходящей сюиты там
является решением проекта, а не следствием импорта библиотеки.

### Ограничения {#limitations}

- **Только первый `createComponent`.** Обёртка снимает себя после одного фикстура. Спека, создающая
  одноразовый фикстур до того, который рендерит переопределённый компонент, проверяется против
  одноразового — где компонента нет, так что проверка молчит, а не врёт.
- **Отсутствующий компонент — тишина, а не догадка.** Когда фикстура не содержит компонент — за
  `@if`, на ленивом роуте или просто в другом хосте, — проверять ещё нечего, а угадывание
  завалило бы корректную спеку.
- **Более поздний конкурирующий оверрайд всё же побеждает.** `TestBed.overrideProvider(Token, …)`,
  вызванный _после_ этого хелпера, заменяет спай. Проверка об этом сообщает (это как раз показанный
  выше throw), но помешать не может.
- **Нет `createComponent` для перехвата — нет проверки.** На `TestBed` без такого метода в очередь
  не попадает ничего, и хелпер деградирует до «без проверки», а не до устаревшей проверки на каком-то
  позднем фикстуре. Сам оверрайд при этом применяется.

## `overrideAutoSpy(Class, config?)` {#overrideautospy-class-config}

Форма `{ useValue }`, которую ждёт `TestBed.overrideProvider`, с авто-спаем внутри:

```ts
const payments = overrideAutoSpy(PaymentMethodService);

TestBed.configureTestingModule({ imports: [CheckoutComponent] }).overrideProvider(PaymentMethodService, payments);
payments.useValue.charge.resolveWith({ ok: true });
```

Используйте её, когда компонент **уже** есть в тестовом модуле и заменить нужно только провайдер;
`overrideComponentProvider` — когда компонент ещё нужно поставить в очередь. Второй аргумент — тот
же, что у [`createSpyFromClass`](/ru/core/create-spy-from-class).

У `overrideAutoSpy` собственной проверки нет — очередь и обёртка `createComponent` принадлежат
`overrideComponentProvider`.

## `assertNgModuleScopes(...modules)` {#assertngmodulescopes-modules}

Тоже экспортируется из этого модуля и разобран полностью на
[странице Angular-адаптера](/ru/adapters/angular#an-ngmodule-that-contributes-nothing): он падает
раньше, когда у импортированного в TestBed NgModule пустой runtime-скоуп, что под AOT-бандлом
тестов означает — `ɵɵsetNgModuleScope` вырезали, и импорт не приносит ни директив, ни компонентов,
ни пайпов.

```ts
assertNgModuleScopes(DirectivesModule, PipesModule);
TestBed.configureTestingModule({ imports: [DirectivesModule, PipesModule] });
```

Передавайте только модули, которые вы импортируете **ради их declarations** — модуль из одних
провайдеров правомерно пуст и был бы ложным срабатыванием. Диагностика
[`ngModuleScopes`](/ru/adapters/angular-diagnostics#ngmodulescopes) — автоматическая форма, и фильтрует
она куда жёстче именно по этой причине.

## `assertComponentDefIntact(...components)` {#assertcomponentdefintact-components}

Вторая половина той же проблемы бандла. Провайдеры компонента и его скомпилированный скоуп
**запекаются в `ɵcmp` в момент исполнения модуля компонента** — а не читаются в момент
`createComponent`. Когда бандлер разрезает баррель на чанк, который ещё не исполнялся, определение
собирается с `undefined` в этих списках, и Angular обнаруживает это сильно позже, изнутри себя:

```text
TypeError: Cannot read properties of undefined (reading 'provide')
  ❯ resolveProvider render3/di_setup.ts:95
```

Стек не называет ни баррель, ни символ, ни компонент. Хуже: ломается обычно спека, которую никто
не трогал, — границы чанков двигаются вместе с _содержимым_ файлов, так что правки типа в соседнем
файле достаточно, чтобы символ переехал через границу. Оба очевидных лекарства по одной и той же
причине не работают — `await import()` наверху `beforeEach` уже слишком поздний, а статический
импорт в шапке спеки не чинит порядок, в котором этот бандлер эммитит.

```ts
assertComponentDefIntact(HoverMenuComponent);
const fixture = TestBed.createComponent(HoverMenuComponent);
```

```text
[vitest-auto-spy] HoverMenuComponent.ɵcmp.providers[0] is undefined.
A component bakes its providers and its scope into the definition when its module executes, so a
hole there means the chunk holding that symbol had not run at that moment — an uninitialised barrel
chunk.
```

Он обходит `providers`, `viewProviders` и `dependencies`, включая вложенные в них списки и thunk,
который Angular эммитит для forward reference. Тот же вызов отвечает на родственное
`Cannot read properties of undefined (reading 'ɵcmp')` из `imports: [Cmp]`, где не приехала сама
ссылка на класс, — там сообщение называет позицию аргумента. Директивы тоже работают: тип с `ɵdir`
проверяется так же.

Сборку это не чинит; это вопрос конфигурации бандлера. Оно заменяет получасовое расследование
одной строкой и уводит указатель от спеки.

## Смежное {#related}

- [Angular-адаптер](/ru/adapters/angular) — почему провайдер уровня компонента побеждает провайдер
  уровня модуля.
- [Angular-диагностика](/ru/adapters/angular-diagnostics) — опциональная группа и почему эта
  проверка в неё не входит.
