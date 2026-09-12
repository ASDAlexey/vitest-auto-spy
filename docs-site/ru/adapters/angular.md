---
title: Angular
description: provideAutoSpy, injectSpy, extendWithAutoSpies, renderShallow, createWithAutoSpies, ожидание в zoneless-режиме и диагностика TestBed — на Vitest и на bun test.
---

# Angular

Точка входа `vitest-auto-spy/angular` добавляет `provideAutoSpy` — короткую запись для регистрации
auto-spy в `TestBed`, — а вместе с ним `injectSpy`, поверхностный рендер компонентов, создание
объекта через DI, ожидание в zoneless-режиме, матчер для сигналов, диагностику `TestBed` и мокеры
свойств-сигналов и readonly-свойств.

```ts
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/angular';

TestBed.configureTestingModule({
  providers: [
    provideAutoSpy(MyService),
    // принимает тот же второй аргумент, что и createSpyFromClass
    provideAutoSpy(ApiService, { onlyMethodsToSpyOn: ['get', 'post'] }),
  ],
});

let myService: Spy<MyService>;

beforeEach(() => {
  myService = injectSpy(MyService);
});
```

Спаи не зависят от детекции изменений, поэтому работают **и в zoneless-, и в zone.js-проектах** на
Angular — ничто здесь не трогает `NgZone` и детекцию изменений. Обычная обвязка Vitest + Angular
по-прежнему нужна (`@analogjs/vite-plugin-angular` плюс файл настройки TestBed).

::: tip Та же сюита на Bun
`bun test` не запускает ангуляровские спеки из коробки — в Bun нет DOM и он не умеет разрешать
`templateUrl`. [`vitest-auto-spy/bun-angular`](/ru/runtimes/bun-angular) закрывает обе дыры одним
прелоадом и реэкспортирует всё с этой страницы, кроме `registerSignalMatchers` и диагностики
`TestBed`, которым нужны `expect.extend` раннера и хуки уровня сюиты.
:::

## Фикстуры вместо `let` + `beforeEach` — `extendWithAutoSpies` {#fixtures-instead-of-let-beforeeach-—-extendwithautospies}

Vitest 4.1 выводит тип фикстуры из её фабрики, и блок выше становится одной инструкцией: тип не
пишется дважды, и нет `let`, который между тестами равен `undefined`:

```ts
import { test as base } from 'vitest';
import { extendWithAutoSpies } from 'vitest-auto-spy/angular';

const test = extendWithAutoSpies(base, {
  cart: CartService,
  api: [ApiService, { onlyMethodsToSpyOn: ['get', 'post'] }],
  passcode: PASSCODE_TOKEN,
});

test('checks out', async ({ cart }) => {
  cart.checkout.resolveWith(true);

  await expect(cart.checkout(1)).resolves.toBe(true);
});

test('does not build what it does not name', ({ api }) => {
  // `cart` и `passcode` для этого теста не создаются вовсе.
  api.get.mockReturnValue(of([]));
});
```

Каждая запись — это класс, пара `[Class, config]` с тем же конфигом, что принимает `provideAutoSpy`,
или `InjectionToken`: он строится по собственному типу токена, ровно так же, как это делает
`provideAutoSpyForToken`. Всё остальное, что нужно модулю, идёт третьим аргументом и регистрируется
тем же вызовом, после сгенерированных провайдеров, — так что названный там токен побеждает:

```ts
const test = extendWithAutoSpies(base, { cart: CartService }, { providers: [provideHttpClient(), CartComponent] });
```

Фикстура, чей токен назван в этом списке, — `{ provide: CartService, useValue: real }` или просто
класс, — получает то, что даёт список, и читается через `TestBed.inject`, а не `injectSpy`: оставить
настоящий сервис — это решение, а не ошибка конфигурации, поэтому и под `misconfiguration: 'throw'`, и
под `preset: 'strict'` это проходит молча.

::: info Почему вся карта разом, а не цепочка `.extend`
Это правило `TestBed`, а не ограничение типизации. Фикстуры разрешаются лениво и независимо друг от
друга, поэтому в `base.extend('cart', …).extend('api', …)` фикстура `cart` и сконфигурировала бы
тестовый модуль, **и** сделала инъекцию — то есть инстанцировала его, — а `api` дошла бы до
`configureTestingModule` уже после инстанцирования и упала бы с собственным сообщением Angular
_«Cannot configure the test module when the test module has already been instantiated»_. Все
провайдеры должны быть известны до первой инъекции.
:::

`beforeEach`, который донастраивает модуль, по-прежнему сочетается с этим: он выполняется раньше,
чем разрешится любая фикстура, а повторные вызовы `configureTestingModule` сливаются вплоть до
первой инъекции. `beforeEach`, который **делает инъекцию**, — нет, и починить это отсюда нечем: к
этому моменту Angular уже принял решение.

::: warning Нужен Vitest 4.1
Типы выводит именно билдерная форма `test.extend`. На более старом Vitest вызов бросает сразу —
`extendWithAutoSpies needs Vitest 4.1 or newer`, — вместо того чтобы позволить старому `extend`
принять строку, зарегистрировать фикстуры с именами `"0"`, `"1"`, … и раздать каждому тесту
`undefined`. Спросить версию не у кого, поэтому проверка читает арность `extend`: один параметр по
4.0 включительно, три — начиная с 4.1. До обновления держитесь формы `let` + `beforeEach` из начала
этой страницы — всё остальное на ней работает без изменений.
:::

## DI-токен из `abstract class` {#an-abstract-class-di-token}

`abstract class LocalStorage extends AbstractStorage {}`, который в продакшене регистрируется как
`{ provide: LocalStorage, useClass: BrowserLocalStorage }`, — стандартный способ объявить DI-токен в
ангуляровской кодовой базе, и до недавнего времени это была единственная форма, с которой
`provideAutoSpy` не справлялся. Промахивался он дважды: голый вызов компилировался и отдавал пустой
дубль, а конфигурационная форма, которая это чинила, не компилировалась вовсе (`TS2345: Cannot
assign an abstract constructor type to a non-abstract constructor type`).

Теперь работают обе половины.

```ts
abstract class LocalStorage extends AbstractStorage {
  abstract read(key: string): string | null;
  abstract write(key: string, value: string): void;
}

TestBed.configureTestingModule({ providers: [provideAutoSpy(LocalStorage)] });

const storage = injectSpy(LocalStorage);

storage.read.calledWith('token').mockReturnValue('abc');
```

У `ClassType<T>` теперь **abstract**-сигнатура конструктора: библиотека нигде не вызывает `new` на
токене, так что требование конкретного конструктора не покупало никакой безопасности. В рантайме
абстрактные члены стираются, не доходя до прототипа, — обнаруживать нечего; а когда обнаружение
возвращает пустоту, фабрика отдаёт прокси `createAutoMock`, который отвечает на любой метод
объявленного типа. `injectSpy` опознаёт его как auto-spy и молчит, а написанный руками обходной
путь — `{ provide: LocalStorage, useValue: createAutoMock<LocalStorage>() }` — больше не нужен.

Один конкретный член всё меняет, и стоит понимать, по какую сторону границы находится ваш токен:

```ts
abstract class LocalStorage {
  abstract read(key: string): string | null;
  clear(): void {} // обнаружение больше не пустое, поэтому запасной путь не срабатывает
}

const storage = injectSpy(LocalStorage);

storage.clear; // спай
storage.read; // undefined — а `Spy<T>` утверждает, что он на месте
```

`abstract read()` стирается, не дойдя до прототипа, поэтому обнаруживается только `clear`, а
абстрактные члены просто отсутствуют — и вызов падает как `storage.read is not a function` внутри
компонента, а не в спеке. Автоматически это не отследить: TypeScript стирает `abstract`, и в
рантайме такой класс и конкретный — один и тот же объект. Попросите явно:

```ts
providers: [provideAutoSpy(LocalStorage, { fillMissing: true })];
```

Что [`fillMissing`](../core/create-spy-from-class#fill-missing) заполняет, а что нет — на его
странице.

## Засев дубля прямо в провайдере {#seeding-the-double-in-the-provider}

Обе фабрики принимают обе половины: `returns` — то, что отвечает **метод**-спай, `overrides` — член,
который результатом метода не является: свойство-Observable, обычное поле, сигнал.

```ts
provideAutoSpy(FavoritesService, {
  returns: { load: of([]) },
  overrides: { favoritesCacheUpdated$: of(undefined), favoriteItems: [] },
});

provideAutoSpyForToken(PRODUCTS, undefined, { returns: { getProducts: of([]), getById: of(null) } });
```

До 3.5.0 у каждого хелпера была своя половина — `provideAutoSpyForToken` принимал засев свойств,
`provideAutoSpy` — настройку методов, — так что дубль, которому нужно и то и другое, регистрировался
одной инструкцией, а дописывался другой, в `beforeEach` ниже.

Член, засеянный через `overrides`, сохраняется **дословно и спаем уже не является** — вот граница
между двумя опциями: данные кладите туда, а метод, который должен остаться проверяемым, называйте в
`returns`. Предпочитать любую из них второй инструкции стоит не ради краткости: вместо второй
инструкции обычно берут срезающий путь — экспортированный `const`-провайдер со значениями, — а под
`isolate: false` это один набор спаев на все файлы, которые его импортируют.

### Свойства-Observable за токеном {#observable-properties-behind-a-token}

`observablePropsToSpyOn` — третья опция, которая теперь есть у обеих форм, и на пути через токен она
важнее, чем на пути через класс. Класс сообщает фабрике, какие члены являются методами; тип — нет,
поэтому любой не названный явно ключ дубля, построенного по токену, становится **функциональным**
спаем, включая свойство-`Observable`, на которое код под тестом затем подписывается как на функцию,
а падение всплывает далеко от дубля.

```ts
provideAutoSpyForToken(FAVORITES, undefined, { observablePropsToSpyOn: ['favorites$'] });
// …
injectSpy(FAVORITES).favorites$.nextWith([{ id: 1 }]);
```

Член, названный ещё и в `overrides`, сохраняет свой засев: отдавайте дублю настоящий `Subject` там,
когда спека сама управляет потоком, и называйте его здесь, когда спеке нужен `nextWith`; фабрика по
классу разрешает то же противоречие тем же способом. До 3.5.0 опция существовала только на пути
через класс, так что токен со свойствами-Observable отправлял людей обратно к рукописному дублю —
ровно к тому, от чего уводят `prefer-provide-auto-spy` и `prefer-create-spy-from-class`.

## Не пишите свой локальный `injectSpy` {#do-not-write-a-local-injectspy}

Обёртка вида `TestBed.inject(token as never) as Spy<T>` с типом
`<T>(token: abstract new (...args: never[]) => T)` — частая находка в уже существующем репозитории.
Библиотечная строго шире: она принимает `ClassType<T>`, `InjectionToken<T>` и абстрактный
конструктор, предупреждает, когда инжектор вернул не спай, и не несёт приведения типов, с которым
будут спорить правила линтера проекта. Две функции с одним именем и разными сигнатурами означают,
что в каждом файле выбор решает порядок импортов — удалите локальную или переэкспортируйте под этим
именем библиотечную.

## Ленивые спаи по умолчанию {#lazy-spies-by-default}

Ангуляровские тесты ставят спай на широкий сервис и вызывают пару его методов, поэтому спай строится
при первом обращении, а не заранее и целиком. Всё остальное не меняется: `Object.keys`,
`vi.isMockFunction`, `calledWith`, `resetAutoSpy` / `clearAutoSpy` ведут себя точно так же, потому
что заглушка — перечислимый аксессор.

```ts
provideAutoSpy(WideService); // лениво — по умолчанию
provideAutoSpy(WideService, { lazySpies: false }); // отказ: строить все спаи сразу
```

Это **умолчание ядра, а не добавка этой точки входа** — `createSpyFromClass` ведёт себя так же. До v2
его включал только `provideAutoSpy`, из-за чего ангуляровский путь был незаметно быстрее обычного
без всякой видимой причины. Что это даёт на классе из сорока методов, где тронуто два:
[27 мс и 35 МБ против 257 мс и 425 МБ](../core/performance#memory-not-just-time).

### Достаточно ли это быстро, чтобы вызывать в каждом `beforeEach`? {#is-it-fast-enough-to-call-in-every-beforeeach}

Да, и это самый быстрый из трёх способов построить дубль. Измерено на собственном бенчмарке
репозитория (`npm run bench`, класс из десяти методов):

| Вызов                                             |      оп/сек | на вызов |
| ------------------------------------------------- | ----------: | -------: |
| `provideAutoSpy(Service)` — ленивый, по умолчанию | **118 900** |    ~8 µs |
| `createSpyFromClass(Service)` — жадный            |      34 600 |   ~29 µs |
| `createAutoMock<Service>()` + 4 обращения         |      30 600 |   ~33 µs |

Разрыв даёт `lazySpies`: первая строка идёт со значением по умолчанию, вторая — с выключенным, и на
широком сервисе, где тест трогает два метода, строится два спая вместо двадцати. `provideAutoSpy`
сам по себе тут ничего не добавляет — он наследует умолчание ядра, а оно ленивое. Обнаружение по
прототипу кешируется на класс, поэтому вызов раз в тест не проходит цепочку заново.

При ~8 µs пять провайдеров на две тысячи тестов дают меньше десятой доли секунды на всю сюиту. Если
спека кажется медленной, время уходит в `TestBed` — то самое, что измеряет
[`enableTestBedDiagnostics()`](#where-a-spec-spends-its-time) и что обычно чинит
[`renderShallow`](#shallow-component-rendering).

Три вещи действительно стоят дороже, и всех трёх можно избежать:

- **`{ lazySpies: 'proxy' }`** сохраняет ленивость и убирает заглушку на каждый метод, а это почти
  всё, что удерживает нетронутый широкий дубль: 11,8 кБ против 101,6 кБ на сгенерированном клиенте
  из 400 методов. Опция включается вручную: она облагает каждое чтение ~30 нс навсегда и проигрывает
  примерно до 20 методов. См. [Производительность](/ru/core/performance#where-the-remaining-memory-is-and-lazyspies-proxy).
- **`{ lazySpies: false }`** отказывается от выигрыша выше. Оправдано только когда спека перечисляет
  сам объект-спай, а не вызывает его методы.
- **`autoSpyAccessors: true`** обходит цепочку прототипов в поисках геттеров и сеттеров при каждом
  вызове, и этот обход не кешируется. Если класс спаится в каждом тесте, называйте нужные аксессоры
  поимённо.

## Поверхностный рендер компонента {#shallow-component-rendering}

`renderShallow` — стандартная последовательность вызовов `TestBed`, которую сюита с большим числом
компонентов рано или поздно начинает копировать из файла в файл (`configureTestingModule` +
`NO_ERRORS_SCHEMA` + `overrideComponent` с опустошёнными `imports` и пустым шаблоном), получившая
имя:

```ts
import { provideAutoSpy, renderShallow } from 'vitest-auto-spy/angular';

const { fixture, component } = renderShallow(TaskListComponent, {
  providers: [provideAutoSpy(TaskService), provideHttpClient()],
  inputs: { projectId: 42 }, // проставляется через componentRef.setInput, до первой детекции
});
```

| Опция           | По умолчанию | Что делает                                                                                                                            |
| --------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `providers`     | `[]`         | Провайдеры тестового модуля. `EnvironmentProviders` (`provideHttpClient()`, …) приветствуются                                         |
| `imports`       | `[]`         | Дополнительные импорты тестового модуля (модуль-заглушка, роутинговая обвязка)                                                        |
| `inputs`        | —            | Значения входов компонента — сигнальные входы принимают **значение**, а не сигнал                                                     |
| `keepTemplate`  | `false`      | Оставить настоящий шаблон (для `viewChild`, проекции контента, host-биндингов)                                                        |
| `keepChildren`  | `[]`         | Дочерние компоненты/директивы/пайпы, которые остаются разрешимыми; всё остальное выбрасывается                                        |
| `template`      | `''`         | Подменный шаблон, который рендерится вместо пустого                                                                                   |
| `beforeCreate`  | —            | Выполняется после конфигурации модуля и до появления компонента — шов, чтобы подменить зависимость, которую читает инициализатор поля |
| `detectChanges` | `true`       | Прогнать первую детекцию изменений, а значит и `ngOnInit`                                                                             |

`fixture` — настоящий `ComponentFixture`; ничто здесь не подменяет `@angular/core/testing`.
Обнуление шаблона сохраняет хуки жизненного цикла, входы, сигналы и DI — всё, что реально читает
спека, проверяющая состояние на стороне TypeScript.

### Смена входа посреди теста {#changing-an-input-mid-test}

`inputs` закрывает первые значения, которые получает компонент. Всё, что после, спека пишет руками
в две строки — по одному `componentRef.setInput` на имя, а потом ожидание, потому что zoneless-фикстура
ничего не пересчитывает, пока её об этом не попросят. `setInputs` — это и есть та пара:

```ts
import { setInputs } from 'vitest-auto-spy/angular';

await setInputs(fixture, { projectId: 7, filter: 'open' });
expect(component.visible()).toEqual([openTask]);
```

Ожидание — это [`stable`](#zoneless-waiting), а третий аргумент — его опции: `{ timeout, label }`,
когда спека ведёт больше одной фикстуры. Пропущенное ожидание — ровно та ошибка, ради которой
хелпер и существует: проверка сразу после голого `setInput` читает состояние, которое произвело
**предыдущее** значение, и спека падает на числе, которое было верным один рендер назад.

Имена сверяются со скомпилированным определением до того, как проставлено первое, так что
отклонённый вызов оставляет компонент ровно таким, каким он был. На имя, которого компонент не
объявлял, `componentRef.setInput` отвечает `NG0303` в консоли и никаким изменением — опечатка, вход,
переименованный уже после написания спеки, или обычное поле, принятое за вход, попадают сюда все,
а следующая проверка падает на состоянии, которое никто не двигал. Работает любое написание
алиасного входа: и поле класса, по которому построен тип, и публичное имя, которое биндит Angular.

`model()` проставляется здесь как любой другой вход. Его **выходная** половина эмитит тогда, когда
значение двигает сам компонент, — поэтому подписываемся до вызова, а ждём после:

```ts
const emitted = expectEmission(component.total); // подписались сейчас, пока ничего не сдвинулось

await setInputs(fixture, { step: 3 });

await expect(emitted).resolves.toBe(30); // эффект, который запустил новый step, уже отработал
```

### Сколько это экономит — по замерам {#what-it-saves-measured}

На приватной zoneless-сюите на Angular 22 (784 спеки, AOT-билдер `@angular/build:unit-test`) три
самые дорогие компонентные спеки были переписаны, а пакет из десяти файлов прогнан три раза —
медианы, тот же пакет, та же машина:

| Спека (479 тестов в пакете, все по-прежнему зелёные) | До     | После  | Изменение |
| ---------------------------------------------------- | ------ | ------ | --------- |
| контейнер с глубоким деревом детей (34 теста)        | 129 мс | 61 мс  | **2,1×**  |
| список, рендерящий 58 фикстур                        | 133 мс | 75 мс  | **1,8×**  |
| маленький листовой компонент (20 тестов)             | 29 мс  | 38 мс  | **0,8×**  |
| три вместе                                           | 291 мс | 174 мс | **1,7×**  |

Третья строка — честная половина результата: у листового компонента почти нет поддерева, которое
можно убрать, поэтому `overrideComponent` на каждый тест стоит дороже, чем экономит. **Поверхностный
рендер окупается там, где есть настоящее дерево детей, которое можно пропустить.** Чтобы находить
файлы, которые стоит переписать, а не гадать, пользуйтесь [диагностикой](#where-a-spec-spends-its-time).

Спека, которой нужен настоящий шаблон, из этого не исключена: `keepTemplate: true` всё равно
выбрасывает дочерние компоненты — сохраняя пайпы и директивы, на которых написан шаблон, — и всё
равно даёт 1,29× против полного цикла — см.
[среднюю ступень](/ru/core/performance#the-middle-rung-keeptemplate-true).

## Сборка класса с auto-spy вместо зависимостей {#building-a-class-with-auto-spied-dependencies}

Альтернатива, которую проект пишет руками, — массив `providers`, где каждая зависимость перечислена
с объектом `useValue` из `vi.fn()` и который переписывают при добавлении каждой новой зависимости.
Здесь инжектор сам отвечает на неизвестный токен спаем, поэтому спека называет только то, чем хочет
управлять:

```ts
import { createWithAutoSpies } from 'vitest-auto-spy/angular';

const { instance, spies, injector } = createWithAutoSpies(CartService, {
  providers: [{ provide: TaxService, useValue: realTax }], // явные провайдеры побеждают
});

spies.get(PricingService).total.mockReturnValue(100);
expect(instance.checkout()).toBe(100);
```

Класс строится через собственную ангуляровскую фабрику, поэтому и параметры конструктора, **и**
инициализаторы полей через `inject()` разрешаются как обычно. Незарегистрированный токен получает
спай `createSpyFromClass` (если это класс) или прокси `createAutoMock` (если это `InjectionToken`);
`inject(X, { optional: true })` по-прежнему возвращает `null`, ровно как в приложении.
`spies.get(token)` разрешается через тот же инжектор, которым пользовался экземпляр, — то есть
возвращает явный провайдер, когда он есть, — а `spies.autoSpiedTokens()` перечисляет то, что было
придумано.

`spies.get(token)` **отказывает в токене, который экземпляр никогда не запрашивал**: называет его и
перечисляет те, на которые auto-spy действительно поставлены. Инжектор в конце цепочки отвечает на
что угодно, поэтому раньше неверный токен — базовый класс вместо реализации, сервис, который класс
перестал инжектить после рефакторинга, `PricingService` там, где класс инжектит `PRICING_TOKEN`, —
молча чеканил второй спай: `spies.get(X).m.mockReturnValue(…)` настраивал объект, которого экземпляр
в глаза не видел, и проверка затем падала на настоящем коллабораторе несколькими кадрами стека
вглубь кода под тестом — или проходила, не проверяя ровно ничего. Токен, который экземпляр запросил
**опционально** и получил на него `null`, отклоняется по той же причине: за ним нет дубля, который
можно было бы настроить.

::: warning Только обычные провайдеры
Здесь строится инжектор через `Injector.create()`, а он не принимает `EnvironmentProviders`, которые
возвращают `provideHttpClient()` и ему подобные. Классу, которому они нужны, место в `TestBed` —
[`renderShallow`](#shallow-component-rendering) или обычный `configureTestingModule`.
:::

## Ожидание в zoneless-режиме {#zoneless-waiting}

```ts
import { flushEffects, stable } from 'vitest-auto-spy/angular';

component.filter.set('open');
await stable(fixture); // прогнать эффекты, затем дождаться фикстуру
expect(component.visible()).toEqual([openTask]);

flushEffects(); // половина без фикстуры: сервисы, сторы, код внутри runInInjectionContext
```

`fixture.detectChanges()` прогоняет один проход детекции изменений и **не** сбрасывает отложенные
эффекты, поэтому проверка сразу после него читает состояние, которое ещё не досчиталось. В
zoneless-приложении значимое состояние выводится из сигналов, а вперёд его двигают именно эффекты.
`stable` делает и то и другое, в правильном порядке; `flushEffects` предпочитает `TestBed.tick()`
(Angular ≥ 20) и откатывается к `ApplicationRef.tick()`.

### В zoneless-режиме `autoDetect` уже включён {#autodetect-is-already-on-under-zoneless}

Старые советы — включая эту страницу до сегодняшнего дня — описывают автоматическую детекцию
изменений как то, что спека должна организовать сама. Это описание эпохи зон. Начиная с Angular
19.0.0 умолчание фикстуры условное, а на `@angular/core@21.2.17` оно выглядит так:

```ts
// @angular/core/fesm2022/testing.mjs:164-167, переносы строк наши
autoDetectDefault = this.zonelessEnabled ? true : false;
autoDetect = inject(ComponentFixtureAutoDetect, { optional: true }) ?? this.autoDetectDefault;
```

То есть в zoneless-сюите он **включён по умолчанию**: не нужно ни регистрировать
`ComponentFixtureAutoDetect`, ни вызывать `autoDetectChanges()`. За спекой по-прежнему остаётся
_когда_ — autoDetect планирует проход, а не выполняет его в точке записи, поэтому проверка на строке
после записи в сигнал всё ещё читает состояние до неё. Поставить проход и эффекты перед проверкой
умеет `await stable(fixture)`; ещё один `detectChanges()` — нет.

Две связанные пометки об устаревании в той же версии, обе указывают в одну сторону:

| `@angular/core@21.2.17`                  |                                                                                                     |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `autoDetectChanges(autoDetect: boolean)` | `@deprecated` в `types/testing.d.ts:112` — используйте `autoDetectChanges()` без аргументов, `:121` |
| `TestBed.flushEffects()`                 | `@deprecated` на `:498` в пользу `TestBed.tick()` на `:506`                                         |

`flushEffects()` из этого пакета уже предпочитает `TestBed.tick()` и откатывается к
`ApplicationRef.tick()` только на Angular < 20, так что сюита, которая им пользуется, уже сидит на
выжившем вызове.

### У ожидания есть предел {#the-wait-is-bounded}

`stable` даёт фикстуре **2000 мс**, а затем бросает исключение с причиной. Фикстура, которая никогда
не стабилизируется — настоящий запрос `HttpClient`, который никто не завершил, запись в
`PendingTasks`, которую никто не отпустил, `setInterval` на настоящих таймерах, — раньше висела
здесь, пока Vitest не сообщал о таймауте в 5 с _на уровне файла_, не называя ни хелпер, ни фикстуру,
то есть винил файл за состояние одного компонента.

Один сценарий, о котором сообщали как о дедлоке, таковым не является: висящий запрос `HttpClient`
под `provideHttpClientTesting`. Перепроверено на Angular 21.2.17 — тестовый бэкенд отвечает без
настоящего запроса, поэтому `whenStable()` завершается и `stable` возвращает управление. Если ваша
фикстура всё-таки виснет здесь, причина в другом: запись в `PendingTasks`, настоящий таймер или
запрос, который тест так и не сбросил через `HttpTestingController`.

```ts
await stable(fixture, { timeout: 5000, label: 'the products fixture' });
```

Передавайте `label`, когда спека ждёт больше одной фикстуры, — тогда падение скажет, какую именно.
Передайте `{ timeout: 0 }`, чтобы отключить сторожевой таймер и ждать бесконечно: оправдано только
для нарочно долгого теста на настоящих таймерах. Сторож работает на таймере, захваченном при
импорте, поэтому `vi.useFakeTimers()` его не остановит: сторож, которого код под тестом может
заморозить, — не сторож.

## Ресурсы: `httpResource()` и `resource()` {#resources-httpresource-and-resource}

Ресурсным примитивам Angular нужно **каждому своё ожидание**, и ни одно из них не то, к которому
тянется спека. Измерено на Angular 21.2.17, zoneless TestBed:

| Что                                                | Что нужно, чтобы устаканилось   |
| -------------------------------------------------- | ------------------------------- |
| `httpResource()`, после того как его ответ сброшен | один тик + один микротаск       |
| `resource()` с асинхронным загрузчиком             | два круга того же               |
| только что созданный `httpResource()`              | тик, иначе **запроса не будет** |

Ошибка здесь не падает громко. Проверка выполняется против _значения по умолчанию_ ресурса —
зелёный тест, который ничего не доказывает, ровно до того дня, когда умолчание изменится.
`settleResource` — цикл, под которым сходятся оба случая:

```ts
import { flushEffects, settleResource } from 'vitest-auto-spy/angular';

const products = TestBed.runInInjectionContext(() => httpResource<Product[]>(() => '/api/products'));

flushEffects(); // запрос уходит здесь — не в момент создания ресурса
TestBed.inject(HttpTestingController).expectOne('/api/products').flush([product]);
await settleResource(products, { label: 'the product resource' });

expect(products.value()).toEqual([product]);
```

**Этот `flushEffects()` не опционален, и `settleResource` его не заменяет.** `httpResource` не
отправляет запрос, пока что-нибудь не тикнет, так что до этого момента `expectOne` попросту нечего
искать, — а если сначала подождать, весь бюджет уйдёт на ресурс, который остаётся в `loading` по
причине, которую никаким ожиданием не исправить. Один тик, чтобы выпустить запрос, ваш сброс, затем
одно ожидание, чтобы принять доставку. Обычному `resource()` сброс не нужен, а значит не нужен и
тик: `await settleResource(data)` — это всё.

Ожидание завершается на `resolved` и на `error`: запрос, который упал, уже закончился, и проверка
для него — `toHaveResourceError`. Каждый круг — это тик плюс микротаск, а с третьего круга ещё и
оборот цикла событий, так что загрузчик, который разрешается от настоящего таймера, от полифилла
`fetch` или от `rxResource` поверх `timer(0)`, тоже доезжает; всё, что устаканивается за обычные
один-два круга, за это не платит. `{ turns }` — это бюджет, и он тратится ровно так, как о нём потом
сообщает падение, поэтому `{ turns: 0 }` — это форма «проверить и упасть». По истечении срока
ожидание называет ресурс и тот сброс, которого не хватает.

`idle` теперь падает, а не проходит молча, потому что это и есть та самая ловушка значения по
умолчанию во плоти: вычисление `params()` вернуло `undefined`, загрузчик ни разу не выполнился,
`value()` — всё ещё умолчание, и каждая проверка после ожидания прочитает это умолчание и пройдёт.

```ts
const productId = signal<string | undefined>(undefined); // спека его так и не выставила
const product = TestBed.runInInjectionContext(() =>
  resource({ params: () => productId(), loader: loadProduct, defaultValue: EMPTY_PRODUCT }),
);

await settleResource(product, { label: 'the product resource' });
// [vitest-auto-spy] settleResource: the product resource never started — its status is 'idle', so
// the loader has not run and `value()` is still the default every assertion below is about to read.
```

Передайте `{ allowIdle: true }`, когда состояние `idle` — это и есть то, что проверяет спека.

::: tip Три из этих строк — одна, `vitest-auto-spy/angular-http`
Сниппет выше — общая форма, и за ней стоит тянуться, когда ожидание не привязано к одному запросу.
Когда привязано, [`expectRequest()`](/ru/adapters/angular-http) сворачивает тик, контроллер,
`expectOne`, сброс и устаканивание в одну строку:

```ts
import { expectRequest, provideHttpTesting } from 'vitest-auto-spy/angular-http';

await expectRequest('/api/products').flush([product]);

expect(products.value()).toEqual([product]);
```

Он живёт за собственным подпутём, потому что это единственная часть пакета, которая импортирует
`@angular/common` — опциональную peer-зависимость, за которую платят те сюиты, что её попросили.
`settleResource` остаётся ровно тем же — для `resource()`, `rxResource()`, перезагрузок и всего, что
не движется по HTTP.
:::

::: tip Не `flushEventLoopUntil`
`flushEventLoopUntil` крутит настоящие обороты цикла событий и никогда не тикает. Ресурс, которого
ждут через него, вырабатывает весь бюджет, не отправив ни одного запроса, а затем падает с
сообщением, что условие так и не выполнилось. Его docstring когда-то обещал ровно этот сценарий; он
никогда не работал.
:::

### `httpResource()`, который живёт на компоненте {#an-httpresource-that-lives-on-a-component}

Всё выше создаёт ресурс через `TestBed.runInInjectionContext`, потому что это самая короткая форма
записи. В реальном коде это поле компонента, и меняется ровно одно — откуда берётся контекст
инъекции: его выдаёт `renderShallow`, первая проверка изменений отправляет запрос, а ожидание всё то
же самое:

```ts
@Component({
  selector: 'app-product-list',
  template: `
    @for (product of products.value(); track product.id) {
      <li class="product">{{ product.name }}</li>
    }
  `,
})
export class ProductListComponent {
  readonly query = signal('');
  readonly products = httpResource<Product[]>(() => `/api/products?q=${this.query()}`, { defaultValue: [] });
}
```

```ts
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { flushEffects, registerResourceMatchers, renderShallow, settleResource, stable } from 'vitest-auto-spy/angular';

registerResourceMatchers(); // один раз, в setup-файле

it('renders what it loaded, and re-requests when the query changes', async () => {
  const { fixture, component } = renderShallow(ProductListComponent, {
    providers: [provideHttpClient(), provideHttpClientTesting()],
    keepTemplate: true,
  });
  const httpTesting = TestBed.inject(HttpTestingController);

  // первая проверка изменений внутри renderShallow и есть тик — запрос уже ушёл
  expect(component.products).toBeLoading();

  httpTesting.expectOne('/api/products?q=').flush([{ id: 1, name: 'Anvil' }]);
  await settleResource(component.products, { label: 'the product list' });

  expect(component.products).toHaveResourceValue([{ id: 1, name: 'Anvil' }]);

  await stable(fixture); // до этой строки вьюха отстаёт от значения на кадр
  expect(fixture.nativeElement.querySelectorAll('.product')).toHaveLength(1);

  component.query.set('anv');
  flushEffects(); // здесь читается новый params(), и уходит второй запрос

  httpTesting.expectOne('/api/products?q=anv').flush([]);
  await settleResource(component.products, { label: 'the product list' });

  expect(component.products).toHaveResourceValue([]);
});
```

Отсюда стоит вынести две вещи: `renderShallow` уже тикнул, так что первый запрос существует ещё до
первой проверки, и каждому последующему изменению сигнала, который читает вычисление `params()`,
нужен свой `flushEffects()` перед следующим `expectOne` — запрос отправляет проверка изменений, а не
`set()`. С [`expectRequest()`](/ru/adapters/angular-http) обе строки каждой пары сворачиваются в
одну:

```ts
await expectRequest('/api/products?q=').flush([{ id: 1, name: 'Anvil' }]);

expect(component.products).toHaveResourceValue([{ id: 1, name: 'Anvil' }]);
```

### Пропустить запрос целиком — `mockResourceProp` {#skipping-the-request-entirely-—-mockresourceprop}

Всё выше — ответ на случай, когда запрос и _есть_ суть проверки. Часто это не так: спека про
собственную логику компонента, `HttpTestingController` ей никогда не был нужен, а значение, которое
ей требуется, она выбрала заранее. `mockResourceProp` подменяет свойство дублем, которым спека
управляет напрямую.

```ts
import { mockResourceProp } from 'vitest-auto-spy/angular';

const service = injectSpy(ProductService);
const products = mockResourceProp(service, 'products', []);

expect(component.emptyState()).toBe(true);

products.set([product]); // status → 'resolved'
expect(component.emptyState()).toBe(false);

products.loading(); // status → 'loading', значение остаётся прежним
expect(component.spinner()).toBe(true);

products.fail('offline'); // status → 'error', error() → Error('offline'), hasValue() → false
expect(component.errorMessage()).toBe('offline');

products.idle(); // status → 'idle', снова начальное значение
expect(component.placeholder()).toBe(true);
```

Ничто никогда не находится в полёте, поэтому и ждать нечего — ни тика, ни сброса, ни бюджета, ни
возможности случайно пройти проверку против значения по умолчанию. Ресурс стартует в `'resolved'` с
начальным значением, потому что именно это состояние нужно большинству проверок и именно его иначе
пришлось бы организовывать. Второе частое начало — ресурс на `params`, который ещё не стартовал, и
это аргумент, а не первая строка спеки:
`mockResourceProp(service, 'products', [], { status: 'idle' })`. Назвать там можно любой статус,
кроме `'error'`: ошибке нужна причина, а её принимает `fail()`.

Реактивность настоящая: дубль построен на настоящих `signal()`, поэтому `computed()`, читающий
`products.value()`, пересчитывается, а `effect()`, наблюдающий за `products.status()`, выполняется —
ровно как против настоящего `httpResource`. Обычный объект с теми же ключами удовлетворил бы любое
чтение и не уведомил бы никого.

| Член          | Что это                                                           |
| ------------- | ----------------------------------------------------------------- |
| `set(value)`  | разрешить со значением; сбрасывает ошибку                         |
| `fail(error)` | уронить с `Error` или строкой-сообщением                          |
| `loading()`   | вернуть в полёт, значение не трогая                               |
| `idle()`      | вернуть в состояние «ещё не запускался», к начальному значению    |
| `reload`      | спай на `reload()` — проверяйте вызов, ничего не переотправляется |
| `resource`    | установленный дубль, чтобы проверять его напрямую                 |

Дубль на свойстве — это целый `ResourceRef`, а не его читающая половина, потому что вторую половину
вызывает как раз код под тестом: сервис отдаёт наружу `readonly products = this.#products.asReadonly()`,
а оптимистичное обновление пишет прямо в ресурс. Каждый из этих членов делает то же, что и у
настоящего Angular, включая то, что происходит со статусом.

| У дубля                 | Что делает                                                                          |
| ----------------------- | ----------------------------------------------------------------------------------- |
| `value`                 | writable-сигнал; `value.set` / `value.update` переводят статус в `'local'`          |
| `set(v)` / `update(fn)` | та же запись, записанная так, как её пишет Angular                                  |
| `hasValue()`            | `true`, если статус не `'error'` и значение не `undefined`                          |
| `snapshot()`            | `{ status, value }` или `{ status: 'error', error }` — то, что читает `@switch`     |
| `asReadonly()`          | тот же самый дубль                                                                  |
| `destroy()`             | назад в `'idle'` с начальным значением; последующие записи из кода ничего не делают |
| `reload()`              | спай — `true`, пока спека не скажет иначе, и ничего не переотправляется             |

`hasValue()` стоит перечитать дважды. С Angular v20 он опирается на значение, а не на статус: у
ресурса, объявленного с `defaultValue`, значение определено с момента создания, поэтому `hasValue()`
возвращает `true` и в `loading`, и в `reloading`, и в `idle`, а `false` — только в состоянии `error`
или над `undefined`. Шаблон вида `@if (products.hasValue()) { … } @else { <spinner/> }` поэтому
продолжает показывать список, пока грузится следующая страница, — а дубль, отвечавший по старому
правилу от статуса, показывал вместо него спиннер.

Откатывается через `restoreMockedProps()`, как и любая другая заплата на свойство, так что сюите с
`setupAutoSpy()` собственная уборка не нужна.

## Проверки на ресурсе {#asserting-a-resource}

`registerResourceMatchers()` добавляет три матчера, которые читают и значение, **и** статус, потому
что каждое из них по отдельности вводит в заблуждение.

```ts
registerResourceMatchers(); // один раз, в файле настройки

expect(component.products).toBeLoading();

httpTesting.expectOne('/api/products').flush([product]);
await settleResource(component.products);

expect(component.products).toHaveResourceValue([product]);
expect(other.products).toHaveResourceError(/503/);
```

Своё место оправдывает `toHaveResourceValue`: он **валит ресурс, который ещё не разрешился, даже
когда значение по умолчанию совпало**. Это ровно та проверка, ради прекращения которой это семейство
и существует: `expect(products.value()).toEqual([])` одинаково доволен и ресурсом, который всё ещё
грузится со своим умолчанием `[]`, и тем, который честно разрешился в пустоту. Падение называет
статус, в котором ресурс был на самом деле, и недостающий сброс.

Типизация утиная — по `{ status, value, error }` с опциональным `error`, поэтому подходят
`httpResource`, `resource`, `rxResource` и дубль от `mockResourceProp`. Если передать не ресурс,
каждый матчер так и скажет, а не бросит `TypeError`: попасть сюда можно двумя путями — передать
`products.value()` вместо `products` или передать свойство, которое ресурсом никогда не было, — и
оба в остальном молчаливы.

## Запуск одного эффекта по требованию {#running-one-effect-on-demand}

`flushEffects()` просит планировщик выполнить всё, что сейчас грязное. Иногда спеке нужно, чтобы
один конкретный эффект выполнился _прямо сейчас_ — обычно потому, что его триггер подменён
статическим сигналом и сам он грязным уже не станет:

```ts
import { mockReadonlyProp, runEffect } from 'vitest-auto-spy/angular';

mockReadonlyProp(component, 'state', signal(State.Selected));

runEffect(component.highlightEffect);

expect(component.icon()).toBe('starFilled');
```

`runEffect` выполняет тело с текущими значениями сигналов и не помечает эффект чистым — более
поздний сброс ведёт себя как обычно. Сначала он выполняет очистку, зарегистрированную предыдущим
прогоном, ровно там же, где её выполняет собственный планировщик Angular, — так спека и наблюдает
колбэк `onCleanup`:

```ts
runEffect(component.subscription); // здесь срабатывает очистка, зарегистрированная прошлым прогоном

expect(component.unsubscribed).toBe(true);
```

Поэтому после двух вызовов на эффекте остаётся одна зарегистрированная очистка, а не две. Это важно
для очистки, которая не идемпотентна, — `queue.pop()`, декремент счётчика, `unsubscribe` на общем
сабджекте: раньше каждый вызов оставлял ещё одно замыкание, и все они срабатывали разом на
`fixture.destroy()`.

::: warning Прежде чем тянуться вместо этого к `vi.mock('@angular/core')`
Первый порыв — подменить `effect()` функцией тождества, чтобы колбэк стал чем-то, что спека держит в
руках. Такой мок можно заставить работать под ангуляровским unit-test-билдером, но только если его
фабрика избегает одной конкретной конструкции, а относительный путь не работает вообще никогда.
Прежде чем такое писать, прочитайте
[моки модулей под unit-test-билдером](#module-mocks-under-the-unit-test-builder); проверять результат
эффекта в любом случае остаётся более долговечной формой.
:::

Уничтоженный эффект не выполняется, а отклоняется. После `fixture.destroy()` или после
`effectRef.destroy()` Angular больше никогда не выполнил бы тело, поэтому спека, которая получает
здесь прогон, проверяет то, чего продакшен произвести не может, — а проверяют в этот момент обычно
как раз поведение при уничтожении. Сообщение называет починку: перенесите вызов выше `destroy()` или
посмотрите, что осталось после уничтожения.

Он читает реактивный узел Angular с `EffectRef`, то есть завязан на деталь, внутреннюю по
договорённости. Если будущий Angular перенесёт тело эффекта, `runEffect` бросит исключение с
сообщением, что проверять надо **результат** эффекта: выставьте сигналы, которые он читает, сделайте
`await stable(fixture)` и посмотрите, что получилось. Это более долговечная форма везде, где она
практична.

## Подсчёт пересчётов и прогонов эффекта {#counting-recomputations-and-effect-runs}

`computed()` возвращает одно и то же значение независимо от того, был он взят из кэша или пересчитан,
поэтому «это не пересчиталось» — не та проверка, которую спека может написать, если только само
вычисление не несёт в себе счётчик, то есть если ради теста не править продакшен-код.
`trackRecomputations` и `trackEffectRuns` считают снаружи:

```ts
import { trackEffectRuns, trackRecomputations } from 'vitest-auto-spy/angular';

const recomputed = trackRecomputations(component.total);
const synced = trackEffectRuns(component.syncEffect);

component.unrelatedFilter.set('open');
await stable(fixture);

expect(component.total()).toBe(42);
expect(recomputed.count).toBe(0);
expect(synced.count).toBe(0);
```

Оба возвращают `{ count, stop() }`. `count` живой — читайте его столько раз, сколько нужно спеке, —
а `stop()` возвращает узлу его собственный член. То же делает `restoreMockedProps()`, а значит и
`setupAutoSpy()` после каждого теста, так что спека, которая до `stop()` не дошла, всё равно ничего
за собой не оставляет.

`trackRecomputations` считает **вычисление**, а не чтения: `computed()`, прочитанный десять раз без
изменения входов, пересчитывается один раз. Он принимает `computed()` или `linkedSignal()`; обычный
`signal()` хранит значение, а не вычисляет его, и отклоняется с указанием на подходящий хелпер.
`trackEffectRuns` считает каждый прогон, кто бы его ни запросил: сброс планировщика,
`stable(fixture)`, `runEffect()` того же эффекта.

## `window` и `document`, не теряя настоящих {#window-and-document-without-losing-the-real-one}

Это два самых рукописных провайдера, какие бывают в ангуляровской сюите: 95 штук на `window` и 70 на
`document` в двух приватных сюитах — и написаны они тремя способами. `useValue: window` не изолирует
ничего: всё, что тест записал, остаётся там до конца воркера. Срез — `{ screen: { width: 1280, height: 720 } }`.
И `mockDocument` с одним написанным вручную `querySelector`. У последних двух общая беда: компонент
читает `screen.colorDepth` или вызывает `document.createElement` и получает `undefined` — дубль знает
только те члены, о которых подумал его автор, и спека падает там, где к проверяемому нет никакого
отношения.

`provideWindowDouble` / `provideDocumentDouble` вместо этого накладывают переопределения **поверх
настоящего jsdom-объекта**:

```ts
import { provideDocumentDouble, provideWindowDouble } from 'vitest-auto-spy/angular';

TestBed.configureTestingModule({
  providers: [provideWindowDouble(WINDOW, { screen: { width: 1920, height: 1080 } }), provideDocumentDouble({ visibilityState: 'hidden' })],
});
```

`screen.colorDepth`, `location.href`, `getComputedStyle`, `addEventListener`,
`document.createElement` и всё остальное, чего переопределения не назвали, отвечают ровно так, как
отвечает jsdom.

| Вызов                                                                 | Что делает                                                               |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `provideWindowDouble(token, overrides?)`                              | `FactoryProvider` под собственный оконный токен приложения               |
| `provideDocumentDouble(overrides?, token?)`                           | то же самое под ангуляровским `DOCUMENT` — или под своим токеном         |
| `createWindowDouble(overrides?)` / `createDocumentDouble(overrides?)` | те же дубли без `TestBed` — для `new LayoutProbe(win)` или голой функции |

Четыре вещи, которые стоит знать:

- **Оконный хелпер принимает ваш токен, документному токен не нужен.** Angular поставляет `DOCUMENT`,
  начиная с v20 — прямо из `@angular/core`. А `WINDOW` он не поставлял никогда: каждое приложение
  объявляет свой `InjectionToken<Window>`, поэтому `provideWindowDouble` этот токен надо передать.
  Хелпер обобщён по типу токена, так что у `InjectionToken<AppWindow>` в переопределениях проверятся
  и собственные члены этого интерфейса.
- **Простой `{ … }` вливается в член, всё остальное его заменяет.** `{ screen: { width: 1920 } }`
  оставляет `screen.colorDepth` настоящим, а `vi.fn()`, массив, `URL` или экземпляр заглушки
  становятся членом целиком: это вещи, которые спека собрала вместо члена, а не его описания.
- **Восстанавливать нечего.** Настоящие `window` и `document` не патчатся вовсе: дубль — это вид на
  них, и всякая запись и всякое удаление из проверяемого кода попадают в этот вид. Так же спека
  двигает значение по ходу теста: `Object.assign(TestBed.inject(WINDOW), { scrollY: 40 })` — именно
  `Object.assign`, а не присваивание, потому что в lib.dom почти весь `Window` объявлен `readonly`.
  Никакой ручки запоминать не надо, и `restoreMockedProps()` вспоминать тоже.
- **Фабрика, а не `useValue`.** Каждый инжектор собирает свой дубль, поэтому массив провайдеров,
  поднятый в константу модуля, не может перенести записи одного теста в следующий.

::: warning `provideDocumentDouble` отдаёт дубль и самому Angular
Переопределение `DOCUMENT` для тестового модуля означает, что его инжектит и рендерер. Подмена
`createElement` или `body` поэтому меняет не только то, что читает компонент, но и то, как собирается
фикстура, — подменяйте их только там, где спека этого и добивается.
:::

## Диалог Material — без Material в зависимостях {#the-material-dialog-without-material-as-a-dependency}

Три провайдера, 36 штук на две приватные сюиты, и каждый раз это одни и те же три формы: объект
(или `null`) на `MAT_DIALOG_DATA`, самодельный `{ close: vi.fn() }` на `MatDialogRef` и спай на сам
`MatDialog`.

Ломается именно тот, что про ref, причём дважды. `close` — единственный член, который кто-либо
пишет, поэтому компонент, подписанный на `afterClosed()`, падает с «is not a function»; а починка,
которую дописывают рядом, `afterClosed: () => of('saved')`, отдаёт результат ещё до того, как диалог
кто-то закрыл, — и спека проходит независимо от того, звали `close()` вообще или нет.

```ts
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { expectEmission, injectMatDialogRef, provideMatDialogData, provideMatDialogRef } from 'vitest-auto-spy/angular';

TestBed.configureTestingModule({
  providers: [provideMatDialogData<EditUserData>(MAT_DIALOG_DATA, { id: 7, name: 'Ada' }), provideMatDialogRef(MatDialogRef)],
});

const dialog = injectMatDialogRef(MatDialogRef);

TestBed.createComponent(EditUserDialog).componentInstance.save();

expect(dialog.close).toHaveBeenCalledWith('saved');
await expect(expectEmission(dialog.ref.afterClosed())).resolves.toBe('saved');
```

::: info `@angular/material` не зависимость этого пакета и ею не станет
Библиотека не тянет за собой ни одной рантайм-зависимости, а диалог — форма одной библиотеки
компонентов, а не Angular. Поэтому токен и класс ref передаются **аргументами**, а не импортируются
здесь: `MatDialogRef` — это и DI-токен, и форма, по которой меряется дубль, и тип, из которого
читается результат, так что импорт в вашей же спеке остаётся единственным местом, где Material
назван.
:::

| Вызов                                     | Что делает                                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `provideMatDialogData(token, data)`       | типизированный `{ provide, useValue }` — назовите тип-аргумент, и данные будут проверены по нему |
| `provideMatDialogRef(RefClass, init?)`    | `FactoryProvider` — свой ref на каждый инжектор; `init`: `closedWith`, `disableClose`            |
| `injectMatDialogRef(RefClass, injector?)` | ручка: `.ref`, `.close` (спай), `emitClose(result?)`                                             |
| `createMatDialogRef(RefClass, init?)`     | та же ручка без `TestBed` — и тот самый ref, который отдаёт заспаенный `MatDialog.open()`        |

### Как его открыть: `MatDialog` не нужна отдельная обёртка {#opening-one-matdialog-needs-no-helper-of-its-own}

`provideAutoSpy(MatDialog)` уже делает из него спай. В рецепте не хватало ref, который возвращает его
`open()`, — а это и есть дубль, засеянный тем результатом, который пользователь сейчас выберет:

```ts
TestBed.configureTestingModule({ providers: [provideAutoSpy(MatDialog)] });

injectSpy(MatDialog).open.mockReturnValue(createMatDialogRef(MatDialogRef, { closedWith: 'saved' }).ref);

fixture.componentInstance.edit(); // открывает, пропускает afterClosed() через pipe, получает 'saved'
```

Обёртки `openDialogReturning()` нет намеренно: она сказала бы `mockReturnValue` другими словами и при
этом была бы обязана знать тип самого `MatDialog` — ровно то, что эта конструкция и выносит наружу.

Четыре вещи, которые стоит знать:

- **`close` — это спай, и это та же самая функция, которую несёт ref.** `expect(dialog.close)` и
  `expect(TestBed.inject(MatDialogRef).close)` — одна и та же проверка, так что компонент, который
  проверяли по-старому, читается ровно так же. `emitClose(result?)` — вторая половина: пользователь
  закрывает диалог снаружи, потоки двигаются, а спай не записывает ничего; и это единственный способ
  закрыть с `undefined` — то есть отменой, чего `closedWith` выразить не может.
- **`afterClosed()` реплеится, тогда как у Material это обычный `Subject`.** Единственное
  сознательное расхождение: в спеке проверка обычно подписывается _после_ того, как компонент уже
  закрыл диалог, а `Subject` к этому моменту сказать уже нечего. `beforeClosed()` — тот же поток
  (дубль закрывается мгновенно, промежутка между ними нет), а `afterOpened()` уже отдал значение и
  завершился.
- **Material объявляет `MAT_DIALOG_DATA` как `InjectionToken<any>`** — потому-то `useValue: null` и
  компилируется для компонента, который читает `data.name`. `provideMatDialogData<EditUserData>(…)`
  проверяет объект по названному типу; свой `InjectionToken<EditUserData>` проверяет его, ничего не
  называя. Значение отдаётся как есть, поэтому собирайте его на каждый тест, а не поднимайте в
  константу модуля.
- **Всё остальное, что объявляет класс ref, бросает по имени.** `backdropClick`, `keydownEvents`,
  `updateSize`, `updatePosition` и `getState` — это работа самого диалога: дубль называет член в
  сообщении об ошибке вместо того, чтобы вернуть `undefined`, а ответ на такое — настоящий
  `MatDialogModule` и `MatDialog`, который по-настоящему его открывает.

## Моки модулей под unit-test-билдером {#module-mocks-under-the-unit-test-builder}

Эта страница когда-то утверждала, что `@angular/core` «вообще невозможно замокать» под
`@angular/build:unit-test` и что причина — общие чанки, которые выпускает многовходовая сборка.
**Это было неверно**, и из-за этого люди переписывали спеки, которые переписывать не требовалось.
Измерено 29.08.2026 на фикстуре из 11 файлов спек, всегда собираемых одним прогоном, на
`@angular/build` 21.2.16 и 22.1.6:

> `vi.mock('@angular/core')` **работает** — и с `TestBed` в графе, и с кодом приложения в графе, и
> когда все спеки собраны вместе.

Настоящее правило уже, и это правка в одну строку в спеке, а не повод отказываться от подхода.

### Правило: в фабрике `vi.mock` нельзя пользоваться спредом объекта {#the-rule-a-vi-mock-factory-must-not-use-object-spread}

Ангуляровский билдер безусловно выставляет `'object-rest-spread': false` в `getFeatureSupport`
(`@angular/build/src/tools/esbuild/utils.js:172`) — сознательный обход дефекта производительности
V8, [crbug/v8/11536](https://bugs.chromium.org/p/v8/issues/detail?id=11536). Поэтому `{ ...actual, x }`
никогда не доживает спредом: он даунлевелится в хелпер `__spreadValues` уровня бандла. Фабрики
`vi.mock` поднимаются выше собственной инициализации бандла, поэтому фабрика добирается до этого
хелпера раньше, чем он появляется.

```ts
// ❌ спред компилируется в хелпер, который поднятая фабрика вызывает до его инициализации
vi.mock('@angular/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@angular/core')>();

  return { ...actual, effect: (fn: () => void) => fn };
});

// ✅ тот же самый мок, без спреда
vi.mock('@angular/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@angular/core')>();

  return Object.assign({}, actual, { effect: (fn: () => void) => fn });
});
```

Современный `.browserslistrc` от этого не спасает — флаг не выводится из таргета. А разделение кода
решает лишь, в какой формулировке вы получите ошибку, — именно поэтому общие чанки выглядели
причиной:

| Разделение | Что говорит прогон                                                                   |
| ---------- | ------------------------------------------------------------------------------------ |
| включено   | `Cannot access '__vi_import_1__' before initialization` — хелпер лежит в общем чанке |
| выключено  | `__spreadValues is not a function` — хелпер объявлен как `var` уровня модуля         |

Ни одно из сообщений не упоминает спред, и ни одно не упоминает фабрику.

### Относительный путь заблокирован, и навсегда {#a-relative-path-is-blocked-permanently}

`vi.mock('./thing')` — не случайность бандлинга: билдер отвергает его намеренно. Он подставляет
виртуальную точку входа `angular:vitest-mock-patch`
(`@angular/build/src/builders/unit-test/runners/vitest/build-options.js`), которая патчит `vi.mock`,
`vi.doMock`, `vi.importMock`, `vi.unmock` и `vi.doUnmock` так, чтобы они бросали исключение, когда
спецификатор подходит под `/^[./]/`:

```text
The "vi.mock" and related methods are not supported for relative imports with the Angular
unit-test system. Please use Angular TestBed for mocking dependencies.
```

Ни один флаг сборки этого не меняет. Мокайте через провайдеры `TestBed` — о чём и вся остальная
страница.

::: danger Алиас пути из tsconfig проскакивает мимо защиты и не делает ничего
`@app/thing` не начинается ни с `.`, ни с `/`, поэтому регулярка выше не срабатывает. Исключения
**нет**: используется настоящий модуль, мок молча игнорируется, а спека падает позже на проверке,
которая читается как баг в коде под тестом. Алиас — худший из трёх случаев именно потому, что
выглядит как тот, который работает.
:::

### Чего этот замер не покрывает {#what-the-measurement-does-not-cover}

Стоит сказать прямо, потому что утверждение, которое он заменяет, однажды уже было сформулировано
слишком широко. Фикстура была игрушечной: ни компонентов, ни шаблонов, ни бочек-реэкспортов, ни
записей в `externalDependencies`, и jsdom вместо happy-dom. Замер говорит, что
`vi.mock('@angular/core')` не заблокирован категорически и что фабрику ломает именно спред; он не
говорит, что любой мок любого модуля заработает в сюите настоящего приложения. Опция `splitting`,
которая обсуждается ниже, против этой фикстуры не прогонялась вовсе, потому что ни один
опубликованный `@angular/build` её пока не содержит.

## Когда в unit-test-сборке выключено разделение кода {#when-the-unit-test-build-has-code-splitting-off}

`npx vitest-auto-spy doctor` сообщает `angular-build-splitting-off`, когда установленный
`@angular/build` попадает в `[22.1.5, 22.1.7)`. Сюда приходят и с другой стороны: CI-джоб, который
ещё на прошлой неделе был в порядке, убивают под `--coverage`, и билдер ничего не говорит о причине.

В этом окне версий unit-test-бандл собирается с **выключенным** разделением кода esbuild, и
включить его обратно нечем. Выигрыш от этого настоящий — ради него апстрим и отключил разделение,
чтобы убрать класс падений с живыми биндингами и неопределёнными экспортами, — но размен не тот,
каким его обычно считают:

- **Для мокинга модулей это не даёт ничего.** `vi.mock` ведёт себя одинаково в обоих режимах;
  разделение меняет лишь формулировку ошибки со спредом выше.
- **Это стоит целого графа бандлов.** Каждая спека становится самодостаточным бандлом: **791 чанк /
  596 МБ** на сюите из 784 спек, и под `--coverage` объём растёт сотнями мегабайт без выхода на
  плато, пока прогон не убьют. **Ни в одном из режимов билдер не выдаёт предупреждения.**

PR #33961 возвращает опцию `splitting` с разделением, **включённым** по умолчанию, так что 22.1.7
закрывает окно: обновитесь и выставьте `"splitting": true` на тестовом таргете.

Ни доктор, ни эта страница не то место, где падение замечают, поэтому
[`setupAutoSpy()`](/ru/utilities/setup#_13-the-builder-version-that-eats-memory-named-in-the-run)
говорит об этом прямо в прогоне: когда процесс — воркер unit-test-билдера, а установленный
`@angular/build` попадает в окно, файл настройки пишет одну строку в stderr — по разу на воркер,
поскольку билдер вычисляет его однократно, — называя версию, оба выхода и способ отключения. Ради
этого он читает один `node_modules/@angular/build/package.json`, и от этого чтения больше ничего не
зависит. `setupAutoSpy({ angularBuildHint: false })` его заглушает.

### Запасной ход и почему его здесь нет {#the-escape-hatch-and-why-it-is-not-shipped-here}

До тех пор единственный рычаг — пропатчить установленный билдер на месте. Форма такой заплаты —
`postinstall` с проверкой версии, который переписывает `disableCodeSplitting: true,` внутри
`node_modules`, — копируется как есть и с момента вставки принадлежит вам: этот репозиторий её не
запускает и не тестирует, а держится она целиком на том, что тот литерал всё ещё на месте.

```js
// scripts/patch-angular-build.cjs — удалите, как только перейдёте на @angular/build 22.1.7
const { readdirSync, readFileSync, statSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..', 'node_modules', '@angular', 'build');
const { version } = require(join(root, 'package.json'));
const [major, minor, patch] = version.split('.').map(Number);
const affected = major === 22 && minor === 1 && patch >= 5 && patch < 7;

if (!affected) {
  process.stdout.write(`@angular/build ${version} needs no patch\n`);
  process.exit(0);
}

const NEEDLE = 'disableCodeSplitting: true,';
let patched = 0;

const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);

    if (statSync(full).isDirectory()) {
      walk(full);
    } else if (full.endsWith('.js')) {
      const source = readFileSync(full, 'utf8');

      if (source.includes(NEEDLE)) {
        writeFileSync(full, source.split(NEEDLE).join('disableCodeSplitting: false,'));
        patched += 1;
      }
    }
  }
};

walk(join(root, 'src'));

// Падать громко, а не молча ничего не делать: переезд литерала — ожидаемый способ это сломать.
if (patched === 0) {
  throw new Error(`@angular/build ${version}: "${NEEDLE}" not found — the patch needs revisiting`);
}
```

**Пакет сознательно этого не поставляет** и не принял бы PR, который бы это добавил. Сделать
автоматическим — значит завести `postinstall`, который переписывает файлы чужого пакета внутри
`node_modules`, а это самое тревожное, что тестовая библиотека может сделать с точки зрения аудита
цепочки поставок, — та же позиция, из-за которой собственные бандлы этого пакета остаются
неминифицированными и читаемыми. К тому же это хирургия по строкам против литерала, у которого нет
фиксированного пути, так что рефакторинг в апстриме ломает её молча, а это худший режим отказа для
пакета, весь смысл которого в том, что падения сами называют свою причину. И живёт она недели.
Разменивает ли рабочее пространство граф бандлов на 596 МБ хоть на что-то — решение команды
приложения, а не библиотеки тестовых дублей: диагноз — здесь, мутация — нет.

## Покрытие под unit-test-билдером {#coverage-under-the-unit-test-builder}

Две настройки в этой области читаются как конфигурация и не конфигурируют ничего. `npx
vitest-auto-spy doctor` сообщает про обе — `coverage-all-removed` и
`coverage-include-misses-bundle`, — потому что ни одна из них ничего не роняет: прогон зелёный,
отчёт получен, просто это не тот отчёт, который описывает настройка.

**Покрытие сопоставляется дважды, и первый проход видит чанки.** `@vitest/coverage-v8` вызывает
`isIncluded` на URL каждого выполненного скрипта до всякого ремапа и — когда включён
`excludeAfterRemap` — ещё раз на переотображённом пути исходника. `@angular/build` сам выставляет
`excludeAfterRemap: true`, так что под этим билдером оба прохода идут по одному и тому же списку.
Сюита выполняется поверх бандла, поэтому первый проход сравнивает ваши глобы с `spec-*.js` /
`chunk-*.js`, а не с `.ts`-файлами: список глобов по исходникам выбрасывает там все счётчики, и
отчёт выходит **пустым**.

Для списка, которым владеет он сам, билдер это учитывает: подставляет `spec-*.js` и `chunk-*.js` в
начало опции `coverageInclude` таргета. Со списком, написанным внутри конфига раннера Vitest, он
этого не делает и не может. Поэтому под этим билдером список include живёт на таргете:

```jsonc
// angular.json — список, который билдер может починить за вас
"test": {
  "builder": "@angular/build:unit-test",
  "options": {
    "runnerConfig": "tools/vitest-runner.config.ts",
    "coverageInclude": ["libs/**/*.ts", "apps/**/*.ts"]
  }
}
```

**Провайдер здесь не только вопрос скорости.** Когда задан `coverage.include`, проход по файлам,
которые не импортировал ни один тест, разрешает их сам, и `@vitest/coverage-istanbul` делает это
через резолвер Vite, а не через алиасы, которые раздаёт билдер: в рабочем пространстве с алиасами
путей из tsconfig первый же алиасный импорт завершает весь прогон.

```text
Error: Failed to resolve import "@workspace/api" from
"apps/app/src/main.server.ts?cache=…&vitest-uncovered-coverage=true". Does the file exist?
```

Названный там пакет меняется от прогона к прогону — это первый неразрешённый импорт, а не виноватый
файл. `v8` на том же проходе деградирует мягко: файлы, которые он не смог разобрать, отбрасываются с
предупреждением, и прогон остаётся зелёным. Из одного ангуляровского монорепозитория, по одной серии
прогонов: так отброшено 184 файла из 4969, а `v8` оказался на 28 % быстрее istanbul при одинаковых
настройках (81 с против 113 с).

**`coverage.all` больше не существует.** В Vitest 4 его нет в `coverageConfigDefaults`, а проход по
файлам, которые не импортировал ни один тест, запускается теперь наличием `coverage.include`.
Конфиг, перенесённый из Vitest 3 с `all: true` и без `include`, отчитывается только по файлам,
которых прогон коснулся, — без ошибки и без предупреждения. Проверено на 4.1.9 на фикстуре, второй
модуль которой никто не импортирует: с `all: true` его в отчёте нет, а стоит объявить `include` —
появляется.

## Сопоставление покрытия стоит дороже самого покрытия {#coverage-matching-costs-more-than-coverage}

Сужение области через `coverage.include` должно делать отчёт меньше, а прогон быстрее. На большом
рабочем пространстве оно делает прогон **медленнее**, и причина не в вашем конфиге.

`@vitest/coverage-v8` решает, попадает ли файл в отчёт, вызовом `isIncluded`, который зовёт
`picomatch` со всем массивом шаблонов. Его `globCache` запоминает **вердикт** по имени файла — но
никогда не скомпилированный матчер. Поэтому каждое имя файла заново компилирует все шаблоны.

::: tip Починено в Vitest 5
`BaseCoverageProvider.getGlobMatchers()` собирает оба матчера при первом обращении и держит их, так
что на Vitest 5 наценки ниже нет и обёртка не нужна. Всё от этого места до конца раздела относится к
Vitest 4 и старше — их пакет по-прежнему поддерживает, его peer-диапазон `>=2.1.0`. Там, где апгрейд
возможен, он дешевле обёртки.
:::

Профилировано на одном шарде ангуляровской сюиты из 1 725 файлов при области из 124 include-глобов
плюс 304 отрицания:

| Фаза `Generate coverage`, всего 224,2 с |       время |
| --------------------------------------- | ----------: |
| чтение файлов покрытия 432 воркеров     |       2,6 с |
| до первой конвертации                   |      54,3 с |
| ремап 1 958 покрытых файлов             |      50,5 с |
| проход по 458 непротестированным файлам |  **0,35 с** |
| финальный `coverageMap.filter`          | **114,1 с** |

Проход по непротестированным файлам — то, на что обычно списывают суженную область, — занимает треть
секунды. Фильтр, цикл, всё тело которого — один вызов `isIncluded` на файл, — это половина прогона.
Замер операция за операцией против матчера, скомпилированного один раз, на тех же глобах:

| Операция                                  |   как есть | скомпилировано один раз |
| ----------------------------------------- | ---------: | ----------------------: |
| `isIncluded`, 8 000 вызовов               | 167 853 мс |                1 808 мс |
| `coverageMap.filter`                      |  81 393 мс |                  713 мс |
| проход по 1 816 непротестированным файлам |  69 779 мс |                9 439 мс |

### Лечится обёрткой над провайдером в вашем собственном конфиге {#the-fix-is-a-provider-wrapper-in-your-own-config}

`coverage.provider: 'custom'` — поддерживаемый шов, а провайдер, который он возвращает, — обычный
объект. Переэкспортируйте `@vitest/coverage-v8` и замените один метод:

```ts
// tools/coverage-provider.ts
import * as v8 from '@vitest/coverage-v8';
import { cleanUrl, slash } from '@vitest/utils/helpers';
import pm from 'picomatch';

export * from '@vitest/coverage-v8';

export async function getProvider() {
  const provider = await v8.getProvider();
  const original = provider.isIncluded.bind(provider);
  let match;

  provider.isIncluded = (filename) => {
    const { include, exclude, allowExternal } = provider.options ?? {};

    // Прогон с `--changed` отбирает по собственному списку файлов, а конфигу без `include` нечего
    // компилировать: единственные два вопроса, на которые эта обёртка честно ответить не может.
    if (!include) {
      return original(filename);
    }

    match ??= pm(include, { contains: true, dot: true, ignore: exclude });

    const path = slash(cleanUrl(filename));

    // Проверка прямо здесь, НЕ делегируется — см. врезку ниже.
    if (!allowExternal && !path.startsWith(workspaceRoot) && !path.startsWith(projectRoot)) {
      return false;
    }

    return match(path);
  };

  return provider;
}
```

```ts
// vitest.config.ts
coverage: {
  provider: 'custom',
  customProviderModule: './tools/coverage-provider.ts',
}
```

Измерено на том же настоящем шарде, с теми же репортерами: фаза Vitest падает с **229,59 с до
22,88 с**, 432/432 файла в обоих случаях, отчёт cobertura на 8,0 МБ в обоих случаях, и числа не
двигаются — `Statements 41.77 %`, 27 292/65 325 до и 27 289/65 325 после: тот же знаменатель и три
инструкции обычного дрейфа общего окружения. На файл, на 200 различных путях: 1,13 мс как есть
против 0,018 мс со скомпилированным матчером, с одинаковыми вердиктами на каждом пути.

::: danger Единственная ошибка, из-за которой правильная обёртка меряется в ноль
**Не** делегируйте случай `allowExternal: false` обратно оригинальному методу «на всякий случай».
`@angular/build:unit-test` эту опцию включает, поэтому по медленному пути пошёл бы каждый вызов:
первая попытка дала 227,6 с против базовых 229,6 с, а читается это как «идея не работает», а не как
«в быстрый путь ни разу не зашли». Делайте проверку прямо на месте, двумя `startsWith` против корня
рабочего пространства и корня проекта.
:::

Ещё две механики, которые не стоит открывать заново. `getProvider()` выполняется **до** того, как
Vitest вызовет `initialize()`, поэтому в момент подмены `provider.options` ещё не существует и
матчер приходится строить лениво, на первом вопросе. И имя файла надо нормализовать ровно так же,
как это делает оригинал, — `slash(cleanUrl(filename))`, оба хелпера из `@vitest/utils/helpers`, —
иначе вердикты разойдутся на тех путях, о которых эти две формы спорят. Собственный `globCache`
провайдера остаётся кешем и продолжает работать.

### Сужение области — не только про скорость {#narrowing-the-scope-is-not-only-about-speed}

В той же серии отчёт cobertura весил **10,78 МБ** без `include` и 8,89 МБ с ним — при лимите разбора
у GitLab в **10 МБ**. Сверх лимита отчёт отбрасывается **молча**: джоб зелёный, проценты в логе
есть, а подсветки строк в merge request нет вовсе. Это падение не называет ничего — потому и стоит
знать это число.

`npx vitest-auto-spy doctor` сообщает `coverage-include-recompiles-globs`, когда видит область
достаточно большую, чтобы двадцать строк выше окупились, и только на Vitest старше пятого — на пятом
он молчит, потому что говорить больше не о чем. Это находка уровня `info` — ничего не сломано, и
отчёт, который получается, верен.

## Проверка сигнала {#asserting-a-signal}

```ts
import { registerSignalMatchers } from 'vitest-auto-spy/angular';

registerSignalMatchers(); // один раз, в вашем файле настройки

expect(component.total).toHaveSignalValue(3);
expect(component.items).toHaveSignalValue([{ id: 1 }]);
```

`expect(component.total).toBeTruthy()` проходит для любого когда-либо созданного сигнала — сигнал
есть функция. Матчер читает его, глубоко сравнивает собственным равенством раннера и отвергает всё,
что не является геттером без аргументов, — так что ошибка с забытыми скобками падает, а не проходит
втихую.

Спай — тоже вызываемое значение без аргументов, поэтому матчер распознаёт его и отвергает **не
читая**: иначе `expect(service.load).toHaveSignalValue(undefined)` прошёл бы по `undefined`, который
возвращает ненастроенный спай, и оставил бы после себя лишний вызов, на котором споткнётся
следующий `toHaveBeenCalledTimes`. Отказ бросает исключение, а не проваливает проверку мягко, так
что и `.not` его не спрячет; если имелся в виду сигнал — положите настоящий сигнал в свойство через
`mockSignalProp`. Обычный геттер без аргументов по-прежнему читается.

## Мокирование свойств-сигналов и readonly-свойств {#signal-readonly-property-mocking}

```ts
import { mockAccessorsProp, mockReadonlyProp, mockReadonlyPropGetter, mockValueProp, restoreMockedProps } from 'vitest-auto-spy/angular';

mockReadonlyProp(service, 'isReady', true); // статическое значение (включая сигналы)
mockReadonlyPropGetter(service, 'label', () => 'A'); // динамический геттер
mockValueProp(service, 'retries', 3); // обычное записываемое значение
mockAccessorsProp(service, 'theme'); // get и set под спаями
```

Каждый хелпер запоминает дескриптор, который перезаписал, поэтому один `restoreMockedProps()`
возвращает на место все — а ещё каждый возвращает отмену _собственной_ заплаты, на случай заглушки,
которую надо снять внутри одного теста. Это важно, когда пропатченный объект переживает файл спеки
(глобальный объект, прототип класса, синглтон), а под `isolate: false` в Vitest так всегда:
[`setupAutoSpy()`](../utilities/setup) подключает `afterEach` за вас.

**Журнал этот состоит из сильных ссылок — и это memory-половина того же правила.** Каждая запись
держит и пропатченный объект, и дескриптор, который был заменён, а запись, чью заплату уже отменили,
помечается, а не вырезается: вырезание сделало бы сюиту с тысячами заплат квадратичной. Поэтому
список опустошается только целиком — вызовом `restoreMockedProps()`. Под `isolate: true` он лежит на
пофайловом `globalThis` и умирает вместе с файлом, так что ничего не накапливается. Под
`isolate: false` он принадлежит воркеру, и без `restoreMockedProps()` между тестами каждый объект,
который пропатчила любая спека, остаётся достижимым весь прогон — это ровно тот случай, который
закрывает `setupAutoSpy()`, и причина запускать его, а не помнить про отмену руками.

Ничего ангуляровского в этих хелперах нет: они экспортируются и из **основной** точки входа, а
`vitest-auto-spy/angular` продолжает реэкспортировать их без изменений. `countMockedProps()`
сообщает, сколько заплат ещё наложено.

### Управление сигналом {#driving-a-signal}

`createSpyFromClass` обходит прототип, а поля `signal()` / `computed()` там нет — оно присваивается
экземпляру. Перечислить его в `methodsToSpyOn` тоже не помогает: так оно становится функциональным
спаем, а функциональный спай до настройки отвечает `undefined`, и компонент, читающий
`service.count()`, получает пустоту там, где ждёт значение.

Спеке нужен настоящий записываемый сигнал, чтобы компонент реагировал так же, как в приложении. Это
та самая пара строк, которую в итоге пишет каждая сюита: записываемая ручка для теста, readonly —
для сервиса:

```ts
const count = signal(0);
mockReadonlyProp(service, 'count', count);
```

`mockSignalProp` — та же пара, только ручка возвращается, а не объявляется:

```ts
import { mockSignalProp } from 'vitest-auto-spy/angular';

const service = injectSpy(CounterService);
const count = mockSignalProp(service, 'count', 0);

expect(component.label()).toBe('0 items');

count.set(42);
await fixture.whenStable();

expect(component.label()).toBe('42 items');
```

Сигнал берётся из `@angular/core`, поэтому реактивность настоящая: `computed()` ниже по потоку
пересчитывается, `effect()` выполняется, биндинг в шаблоне обновляется. Подделка с методом `set`
удовлетворила бы `service.count()` и молча никого не уведомила — ровно то падение, которого этот
хелпер призван избежать, а не породить.

Возврат ручки заодно снимает соблазн взять `service.count` и позвать на нём `.set`: у `Signal<T>`
нет `set`, так что это проходит проверку типов только через приведение.

**Что он подменяет, а что нет.** Angular связывает потребителя с тем сигналом, который тот прочитал,
а не со свойством, через которое прочитал. Спека, которая сперва рендерит, а потом патчит, оставила
бы каждый `computed()`, `effect()` и биндинг в шаблоне на старом сигнале до конца теста — вместе с
закэшированным значением и без единого слова об этом. Поэтому член, который и так записываемый —
`signal()`, `model()`, `linkedSignal()`, — не подменяется: хелпер пишет в тот сигнал, который у
класса уже есть, и возвращает именно его. Порядок перестаёт иметь значение, у `model()` остаётся
живой выходная половина, а `restoreMockedProps()` нечего возвращать на место — значение просто
остаётся там, куда его поставила спека, и заметно это только на объекте, который живёт дольше теста.

Подмена осталась для двух форм, писать в которые некуда: объявленного классом `computed()` и члена,
которого у спая ещё нет. Их по-прежнему надо патчить **до того, как их кто-нибудь прочитает** — до
первого `detectChanges()` / `stable(fixture)`, — и хелпер это проверяет, а не предполагает.
Readonly-сигнал, который уже прочитал живой потребитель, он назовёт по имени и откажется подменять
там, где подмены никто бы не заметил.

От `input()` он отказывается сразу. Angular выставляет вход через узел входа, а не через свойство,
поэтому подменённый вход ломает следующую запись со стороны хоста сообщением
`inputSignalNode.applyValueToInputSignal is not a function`. Управляйте им штатно:
`fixture.componentRef.setInput('mode', value)` по ходу теста или
`renderShallow(Component, { inputs: { … } })` для начального значения.

## На что спека тратит время {#where-a-spec-spends-its-time}

```ts
// vitest.setup.ts
import { enableTestBedDiagnostics } from 'vitest-auto-spy/angular';

if (process.env['SPEC_TIMING']) {
  enableTestBedDiagnostics();
}
```

```
[vitest-auto-spy] src/app/…/layer-editor.component.spec.ts — TestBed 353ms of 661ms (53%), logic 308ms, 155 component(s), 132 module config(s)
```

По одной строке на файл спеки: сколько её астрономического времени ушло в `TestBed` (конфигурация
модуля, компиляция шаблонов, создание компонентов), а сколько — в обычную логику, и сколько
компонентов она создала. Это и список кандидатов на переписывание, и число, которое говорит,
помогло ли переписывание.

| Опция          | По умолчанию        | Примечания                                             |
| -------------- | ------------------- | ------------------------------------------------------ |
| `report`       | одна строка на файл | Получает объект `SpecTiming` — собирайте тайминги сами |
| `minTestBedMs` | `0`                 | Молчать о файлах, которые дешевле этого порога         |

`disableTestBedDiagnostics()` возвращает нетронутый `TestBed`; `instrumentTestBed()`,
`getTestBedTiming()`, `formatSpecTiming()` и `reportSpecTiming()` — детали под капотом, для сюиты,
которой нужны числа без построчного вывода на каждый файл. Часы захватываются в момент импорта,
поэтому спека с `vi.useFakeTimers()` всё равно измеряется честно, а не числится бесплатной, и отчёт
идёт в `process.stdout`, а не в `console.info`, который
[`vitest-auto-spy/console`](../utilities/console) подменяет молчаливым моком.

## Подмена провайдера, который компонент объявляет сам {#overriding-a-provider-the-component-declares-for-itself}

`provideAutoSpy` регистрируется на тестовом модуле, а провайдер тестового модуля **проигрывает**
тому, который компонент объявил в собственном `@Component({ providers: [...] })`, — сервисам в
области маршрута, сторам на компонент, хелперам `provideX()`. О проигрыше никто не сообщает: спека
настраивает спай, компонент остаётся с настоящим сервисом, а проверка падает в двух шагах от
причины.

Насколько далеко — стоит расписать, потому что это одна из самых часто сообщаемых ловушек во всей
библиотеке. `@Component({ providers: [DeleteAccountService] })` вместе с
`provideAutoSpy(DeleteAccountService)` на уровне модуля строит **настоящий** сервис, и падает то, к
чему этот сервис обращается первым: в одном наблюдавшемся случае — логгер, с
`TypeError: Cannot read properties of undefined (reading 'pipe')`. Это сообщение не называет ни
компонент, ни провайдер, ни спай.

Починок две, и выбор — про намерение. Берите `overrideComponentProvider`, когда спеке нужен дубль на
уровне компонента; берите `TestBed.overrideComponent(..., { remove: { providers } })`, когда модуль
уже предоставляет спай, а собственное объявление компонента просто мешает:

```ts
TestBed.overrideComponent(ProfileComponent, { remove: { providers: [DeleteAccountService] } });
```

```ts
import { overrideAutoSpy, overrideComponentProvider } from 'vitest-auto-spy/angular';

// компонент создаётся через шаблон родителя, поэтому его ещё нет в `imports`
const menu = overrideComponentProvider(CatalogPageComponent, NavigationBuilderService); // → Spy<NavigationBuilderService>

// или, когда компонент уже в тестовом модуле
TestBed.configureTestingModule({ imports: [CheckoutComponent] }).overrideProvider(
  PaymentMethodService,
  overrideAutoSpy(PaymentMethodService),
);
```

`overrideProvider(X, provideAutoSpy(X))` **не** сломан, что бы эта страница ни утверждала раньше.
`provideAutoSpy` возвращает `{ provide, useValue }`; `overrideProvider` читает с него `useValue` и
игнорирует лишний `provide`, так что спай устанавливается. Предпочитать `overrideAutoSpy` стоит
потому, что он говорит, что делает, и отдаёт спай напрямую, а не потому, что вторая форма ничего не
делает.

Настоящий молчаливый провал другой: `overrideProvider` достаёт только до компонента, о котором знает
компилятор TestBed. Standalone-компонент, создаваемый через шаблон родителя, в `imports` тестового
модуля не значится, поэтому подмена к нему не применяется никогда, а чтобы это выяснить, надо знать,
как устроен `TestBedCompiler.queueType`. `overrideComponentProvider` ставит компонент в очередь —
как импорт, если он standalone, и как declaration в остальных случаях.

**Не** тянитесь здесь к `TestBed.overrideComponent`. Он вынуждает JIT-перекомпиляцию, а под
AOT-бандлом теста эта перекомпиляция разрешает директивы и пайпы компонента из рантайм-области,
которую вырезал бандлер, — и компонент остаётся вообще без них, см. следующий раздел.

`overrideComponentProvider` заодно проверяет на следующем `TestBed.createComponent`, что собственный
инжектор компонента действительно отвечает спаем, — см.
[Подмену провайдеров компонента](/ru/adapters/angular-overrides).

## NgModule, который ничего не привносит {#an-ngmodule-that-contributes-nothing}

Под AOT-бандлом теста — тем, что производит `@angular/build:unit-test` и что начинает получать
Jest-сюита, переехавшая на нативный билдер, — `ɵɵsetNgModuleScope` вырезается, потому что его читает
только TestBed. В рантайме у каждого NgModule тогда пустые `ɵmod.declarations` / `ɵmod.exports`.

Пока всем заправляет AOT, этого никто не замечает: плоский список зависимостей уже запечён в каждый
`ɵcmp`. Но в тот момент, когда TestBed разрешает область сам — через `imports: [SomeModule]` или
через JIT-перекомпиляцию после `overrideComponent`, — он разрешает её из пустоты и сообщает об этом
четырьмя разными способами, ни один из которых не упоминает модуль:

```
NG0303: Can't bind to 'appTruncate' since it isn't a known property of 'div'
NG0301: Export of name 'focusable' not found!
NG0304: 'ui-smart-row' is not a known element
(вообще ничего — атрибутивная директива просто никогда не создаётся)
```

```ts
import { assertNgModuleScopes } from 'vitest-auto-spy/angular';

assertNgModuleScopes(DirectivesModule, PipesModule);
TestBed.configureTestingModule({ imports: [DirectivesModule, PipesModule] });
```

Ошибка называет модуль и причину, а лечится это объявлением всего, что нужно спеке, прямо в модуле
TestBed. Передавайте только те модули, которые вы импортируете **ради их declarations**: модуль с
одними провайдерами законно пуст и был бы отмечен как ложное срабатывание.

[`enableAngularDiagnostics({ ngModuleScopes })`](/ru/adapters/angular-diagnostics#ngmodulescopes)
применяет это автоматически к каждому тестовому модулю, за куда более строгим фильтром, который
модуль с одними провайдерами проходит.

## Компонент, в собственном определении которого дыра {#a-component-whose-own-definition-has-a-hole-in-it}

Тот же бандл, уровнем ниже. `providers`, `viewProviders` и скомпилированная область компонента
**запекаются в `ɵcmp` в момент выполнения его модуля**, а не читаются во время `createComponent`.
Поэтому, когда бандлер уносит barrel-модуль с реэкспортами в чанк, который ещё не выполнялся, определение
собирается с `undefined` там, где должен быть провайдер или зависимость области, и Angular узнаёт об
этом сильно позже, изнутри себя:

```
TypeError: Cannot read properties of undefined (reading 'provide')
  ❯ resolveProvider render3/di_setup.ts:95
```

Стек не называет ни barrel-модуль, ни символ, ни компонент. Хуже того, ломается обычно та спека, которую
никто не трогал: границы чанков двигаются вместе с _содержимым_ файлов, так что правки типа в
соседнем файле достаточно, чтобы символ переехал через одну из них. Оба очевидных лекарства
проваливаются по одной причине: `await import('@scope/lib')` в начале `beforeEach` уже опоздал, а
статический импорт в шапке спеки не чинит тот порядок, в котором этот бандлер всё выпускает.

```ts
import { assertComponentDefIntact } from 'vitest-auto-spy/angular';

assertComponentDefIntact(HoverMenuComponent);
const fixture = TestBed.createComponent(HoverMenuComponent);
```

```
[vitest-auto-spy] HoverMenuComponent.ɵcmp.providers[0] is undefined.
```

Он обходит три списка, включая вложенные массивы и тот thunk, который Angular выпускает для forward
reference. Тот же вызов отвечает и на родственное
`Cannot read properties of undefined (reading 'ɵcmp')` из `imports: [Cmp]`, где до места так и не
доехала сама ссылка на класс, — там сообщение вместо этого называет позицию аргумента. Директива
читается так же, через `ɵdir`.

Ни это, ни `assertNgModuleScopes` не чинит сборку — это вопрос конфигурации бандлера. Оба заменяют
стек внутри `@angular/core` строкой, называющей то, чего не хватает, и отводят взгляд от спеки.
Полный справочник — на
[странице подмены провайдеров компонента](/ru/adapters/angular-overrides#assertcomponentdefintact-components).

## Проверки фокуса {#focus-assertions}

```ts
import { registerFocusMatchers } from 'vitest-auto-spy/setup';

registerFocusMatchers(); // один раз, в файле настройки

expect(fixture.nativeElement.querySelector('.play')).toHaveFocus();
```

Тесты на фокус пишут в одной из двух форм, и обе не сообщают ничего полезного.
`expect(document.activeElement).toBe(button)` печатает два громадных дампа DOM без видимой разницы;
`expect(activeFocus() === getElement(row)).toEqual(value)` схлопывает сравнение в булево ещё до
того, как его увидит `expect`, и падает с `expected false to deeply equal true` — сообщением,
совместимым с любой возможной причиной.

Три причины, которые стоит различать: ожидаемого элемента вообще нет (случай, безусловно, самый
частый), фокус всё ещё на `<body>`, потому что его никто не забрал, и фокус на другом элементе.
`toHaveFocus` называет, какая из трёх случилась, и описывает оба узла тегом, id и классом, а не
вываливает их поддеревья.

## `injectSpy` и токены {#injectspy-and-tokens}

`injectSpy` принимает не только класс, но и `InjectionToken`, а это важно в кодовой базе, где
половина зависимостей живёт за токенами (`LIST_DATA_PROVIDER_TOKEN`, `ROOT_MEDIA_ELEMENT`).

Для **обобщённого** класса указывайте аргумент типа. `TestBed.inject` выводит из конструктора
`Service<any>`, а не объявленное умолчание, и этот `any` всплывает много позже как несовпадение
`AddPromiseSpyMethods<unknown>` и `WithMockReturnValue<…>` — на восьмом уровне вложенности, причём в
сообщении о параметрах типа не будет ни слова:

```ts
const config = injectSpy<FeatureFlagService>(FeatureFlagService);
```

## Zone и zoneless в одном прогоне {#zone-and-zoneless-in-the-same-run}

```ts
// vitest-setup.ts
import { setupZoneTestEnv, setupZonelessTestEnv } from 'jest-preset-angular/setup-env';
import { setupAngularTestEnv } from 'vitest-auto-spy/angular';

setupAngularTestEnv({
  zoneless: (testPath) => testPath.includes('/libs/catalog/') || testPath.includes('/apps/storefront/'),
  initZone: setupZoneTestEnv,
  initZoneless: setupZonelessTestEnv,
});
```

`TestBed.initTestEnvironment` можно вызвать один раз на платформу, а под `isolate: false` платформа
живёт всё время жизни воркера. Репозиторий, который переезжает на zoneless постепенно — несколько
библиотек переключены, остальные всё ещё на zone.js, — поэтому вообще не может выразить себя файлами
настройки: второй файл, который воркер подхватит в другом режиме, падает с `Cannot set base
providers because it has already been called`, и сообщение не называет ни один из файлов.

Собственный ответ Vitest, `test.projects`, это тоже не решает. Никто не обещает, что воркер
обслуживает файлы одного проекта, и воркер, которому подсунули файл другого режима, падает точно так
же.

Работает вот что: определять режим по файлу, который вот-вот запустится, и, когда он отличается от
установленного, сносить окружение перед инициализацией другого. Режим запоминается на воркер,
поэтому серия файлов в одном режиме платит за одну инициализацию и ни за один сброс.

Инициализаторы остаются вашими: какая платформа, какие провайдеры и какая политика `teardown` нужны
проекту — не то, что должна решать эта библиотека, а пакеты, которые их поставляют
(`@analogjs/vitest-angular`, `jest-preset-angular`, рукописный `initTestEnvironment`), её
зависимостями не являются.

## Хост для директивы под тестом {#a-host-for-a-directive-under-test}

```ts
import { createDirectiveHost, registerDirectiveMatchers } from 'vitest-auto-spy/angular';

const Host = createDirectiveHost({
  template: `<div [appTruncate]="enabled" [truncateText]="text"></div>`,
  scope: [DirectivesModule],
  props: { enabled: false, text: 'hello' },
});

TestBed.configureTestingModule({ imports: [Host] });

const fixture = TestBed.createComponent(Host);
fixture.componentInstance.enabled = true; // тип берётся из `props`
```

Под нативным билдером две половины Angular расходятся в том, где разрешается `imports`, и одна и та
же строка в одном месте жива, а в другом мертва:

| Где                                           | Кем разрешается                          | `NgModule` там                                                                 |
| --------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------ |
| `@Component({ imports })`                     | AOT-компилятором, на этапе сборки        | **работает** — плоский список запечён в `ɵcmp`                                 |
| `TestBed.configureTestingModule({ imports })` | `TestBedCompiler`, в рантайме, из `ɵmod` | **не привносит ничего** — `ɵɵsetNgModuleScope` в тестовый бандл не выпускается |

Поэтому хост обязан быть **standalone** и обязан нести модуль в _собственных_ `imports`. Хост,
написанный со `standalone: false` внутри спеки, ещё хуже: он компилируется вообще вне какой-либо
области — ни `NgClass`, ни `AsyncPipe`, ничего. `createDirectiveHost` — это знание в применении:
хост всегда standalone, `scope` становится импортами компонента, а `props` типизирует
`fixture.componentInstance`.

### `toHaveDirectiveApplied` {#tohavedirectiveapplied}

```ts
registerDirectiveMatchers(); // один раз, в файле настройки

expect(fixture).toHaveDirectiveApplied(TruncateDirective, 'div');
```

О директиве вне области Angular сообщает тремя разными неверными способами: `NG0303` отправляет
читателя в тот `@NgModule`, где директива как раз объявлена правильно; `NG0304` докладывает об
отсутствующей **директиве** как об отсутствующем **компоненте**; а директива, использованная голым
атрибутом, без биндинга, не сообщает _вообще ничего_ — зелёный тест, проверяющий директиву, которая
никогда не выполнялась.

Матчер проверяет сам факт, а его падение называет причину и способ починки, включая тот, который
выглядит починкой и ею не является: `schemas: [NO_ERRORS_SCHEMA]` действует на `declarations`
тестового модуля и никогда — на standalone-компонент, так что рядом со standalone-компонентом это
мёртвая запись, которая читается так, будто что-то намеренно приглушили.

## Заглушка вместо дочернего компонента — `createComponentStub` {#a-stand-in-for-a-child-createcomponentstub}

Рукописная заглушка — это класс в спеке, повторяющий селектор, входы и выходы дочернего компонента, и
копию никто не проверяет: переименуйте вход у настоящего ребёнка — и биндинг родителя уйдёт в свойство,
которого никто не объявлял, а спека останется зелёной или упадёт с `NG0303`, указывающим на заглушку.
`createComponentStub` берёт копию из скомпилированного определения настоящего класса — `ɵcmp`, `ɵdir`
или `ɵpipe`, — поэтому разойтись им не с чего:

```ts
import { createComponentStub } from 'vitest-auto-spy/angular';

const ChartStub = createComponentStub(ChartComponent); // директива или пайп — точно так же

TestBed.configureTestingModule({ imports: [DashboardComponent] });
TestBed.overrideComponent(DashboardComponent, {
  remove: { imports: [ChartComponent] },
  add: { imports: [ChartStub] },
});

const fixture = TestBed.createComponent(DashboardComponent);
fixture.detectChanges();

const chart = fixture.debugElement.query(By.directive(ChartStub)).componentInstance;
expect(chart.series()).toEqual([1, 2, 3]); // сигнальный вход остаётся сигнальным входом
chart.pointSelected.emit(2); // выход, который слушает родитель
```

| Копируется из определения                                                        | Не копируется                                                                      |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| селектор — компилируется обратно в тот же список селекторов                      | шаблон: заглушка рендерит по одному `<ng-content>` на слот проекции                |
| каждый вход под публичным именем, с алиасом и трансформом                        | хост-биндинги и хост-директивы                                                     |
| `input()` как сигнальный вход, `model()` как модель, вход-декоратор как свойство | провайдеры, так что ничего из предоставляемого ребёнком до его контента не доходит |
| каждый выход, как `EventEmitter`                                                 | хуки жизненного цикла и запросы                                                    |
| `exportAs`; у пайпа — имя и чистота                                              | всё, что не засеяно вторым аргументом                                              |

Второй аргумент засевает члены каждого экземпляра, копируя их на каждый экземпляр отдельно, — метод,
который родитель зовёт через `viewChild`, или `transform` пайпа, по умолчанию тождественный:
`createComponentStub(TranslatePipe, { transform: (key) => key })`. Третий принимает `{ template }`, чтобы
рендерить что-то кроме спроецированного контента.

Это не замена [`renderShallow`](#shallow-component-rendering): тот выбрасывает детей, и это правильно,
когда шаблон никто не читает. Заглушка — для спеки, которая шаблон читает и хочет видеть в нём место
ребёнка без самого ребёнка, и эти двое сочетаются — оставьте шаблон и назовите заглушку единственным
ребёнком, которого надо сохранить:

```ts
const { fixture } = renderShallow(DashboardComponent, { keepTemplate: true, keepChildren: [ChartStub] });
```

Настоящий `ChartComponent` выбрасывается вместе с остальными дочерними компонентами, а заглушка с тем же
селектором встаёт на его место.

## Заплата на свойство спая {#patching-a-property-of-a-spy}

```ts
const playback = injectSpy(PlaybackStateService);

mockSignalProp(playback, 'navigationState', 'idle'); // настоящий, записываемый сигнал
mockReadonlyProp(playback, 'currentItem', signal(item));
```

Хелперы `mock*Prop` принимают `Spy<T>`, который возвращают `injectSpy` / `asSpy`, и проверяют
значение против **собственного** типа члена, а не украшенного спаем. Без этого член со
значением-сигналом на спае типизирован как `Signal<T> & Mock & …`, настоящий сигнал в него не
записать, и спеке приходится держать экземпляр под вторым именем исключительно ради заплаты.

Для геттера со значением-сигналом предпочитайте `mockSignalProp`, а не `gettersToSpyOn`: геттер под
спаем до настройки возвращает `undefined`, а настоящий сигнал сохраняет реактивность всех
`computed()` и `effect()` ниже по потоку.

## Зависимость за `InjectionToken` {#a-dependency-behind-an-injectiontoken}

```ts
TestBed.configureTestingModule({ providers: [provideAutoSpyForToken(PASSCODE_SERVICE_TOKEN)] });

const passcode = injectSpy(PASSCODE_SERVICE_TOKEN); // Spy<PasscodeService>
```

У токена, типизированного _интерфейсом_, нет класса, который можно прочитать, — отсюда и обычный
обходной путь: написанный в спеке `PasscodeServiceMock`, на который ставят спай и который
регистрируют, — после чего `Spy<Mock>` и `Spy<PasscodeService>` расходятся во взглядах на
`calledWith`, и кто-нибудь тянется за приведением типа (а чаще — за `TestBed.inject<any>(TOKEN)` с
`eslint-disable` в шапке файла). `provideAutoSpyForToken` читает тип с самого токена, а `injectSpy`
токен и так принимает. Обратите внимание на имя: `provideAutoSpy` читает _прототип класса_, которого
у токена нет, так что здесь работает не он.

Второй аргумент нужен чаще, чем кажется. Спай отвечает `undefined`, пока ему не сказали иначе, и это
смертельно в тот момент, когда код под тестом строит от него **цепочку**: конструктор с
`inject(LOGGER).channel('auth').debug('…')` умирает на `.debug` от `undefined` ещё до первой строки
спеки, потому что в продакшене никто не писал там `?.`. Назовите то звено, которое возвращает объект:

```ts
provideAutoSpyForToken(LOGGER, undefined, { selfReturning: ['channel'] });
```

[`selfReturning`](/ru/core/create-spy-from-class#self-returning) оставляет `channel` спаем — на нём
можно проверять вызовы, и для `strict` он настроен, — а отвечает он самим двойником. Когда один и тот
же двойник нужен каждому файлу, скажите это один раз в сетап-файле: `registerAutoSpyDefaults(LOGGER,
{ … })` из `vitest-auto-spy/angular` читает каждый следующий `provideAutoSpyForToken(LOGGER)`
([зависимость за `InjectionToken`](/ru/core/create-spy-from-class#token-defaults)).

Для цепочки длиннее одного звена дубль, который отвечает на каждом уровне, —
[`mockDeep<T>()`](/ru/core/auto-mock-by-type#recursive-deep-mocks-%E2%80%94-mockdeep).

## `injectSpy` говорит, когда получил настоящий объект {#injectspy-says-when-it-got-the-real-thing}

```text
[vitest-auto-spy] injectSpy(DeviceRegistryService): the injector returned a plain instance, not an
auto-spy. Register it with provideAutoSpy(DeviceRegistryService) …
```

Провайдер, который спека забыла зарегистрировать, иначе обнаруживается много позже — когда
`.mockReturnValue(…)` вызывают на настоящем методе, а если у класса нет приватных членов, из-за
которых типы разошлись бы, то и никогда. Предупреждение печатается один раз на токен.
