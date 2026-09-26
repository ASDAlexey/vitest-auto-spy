---
title: Строгий режим
description: strict и onUnstubbedCall — падать на методе, который никто не настроил, называя класс, метод и аргументы вместо возврата undefined.
---

# Строгий режим

Дубль отвечает на каждый свой метод. Метод, который никто не настроил, отвечает `undefined` — а это
допустимое значение, поэтому в этом месте ничего не падает. Падает там, где `undefined` в конце концов
используют, — а на широком коллабораторе это несколько кадров стека спустя и в другом файле:

```ts
const users = createSpyFromClass(UserService); // 40 методов

users.load.resolveWith([]); // настроили один
// … а компонент под тестом ещё зовёт users.currentTenant()
// TypeError: Cannot read properties of undefined (reading 'id')   ← в продакшен-коде
```

Единственным инструментом на этот случай раньше был
[`onlyMethodsToSpyOn`](/ru/core/create-spy-from-class#configuration), а он отвечает на другой вопрос:
он _убирает_ все методы, которых нет в списке, поэтому падение читается как
`users.currentTenant is not a function` и винит спай, а не спеку. Строгий режим оставляет метод на месте
и заставляет пропуск сказать о себе:

```ts
const users = createSpyFromClass(UserService, { strict: true });

users.load.resolveWith([]);
users.currentTenant(); // бросает — прямо на строке вызова
```

## Сообщение {#the-message}

Дословно, от `Cart`, у которого `checkout(id, when)` никто не настроил, при вызове из `cart.component.ts`:

```
[vitest-auto-spy] Cart.checkout(1, 'now') was called; this strict double has nothing configured for it.
Called from src/app/cart.component.ts:41:12
Configure it in the test: cart.checkout.calledWith(1, 'now').mockReturnValue(…) for these arguments, or .mockReturnValue(…) for any — .resolveWith(…) / .nextWith(…) when it returns a Promise / Observable.
Docs: https://asdalexey.github.io/vitest-auto-spy/core/strict-mode#the-message
```

Печатается сам вызов, а не только имя, потому что на широком сервисе один и тот же метод зовут несколько
раз с разными аргументами, и _какой именно_ вызов — это половина диагноза. `Called from` — первый кадр
вызывающего кода, мимо дубля, самой библиотеки и всего, что лежит в `node_modules`, с путём от корня
проекта; если такого кадра в стеке нет, строки нет. Предложенный `calledWith(…)` повторяет аргументы
вызова, так что его можно вставить как есть; для вызова без аргументов предлагается только
`.mockReturnValue(…)`. Имя перед ним (`cart`) — имя класса в lower camel case, догадка о переменной, в
которой спека держит дубль; дубль, чьё имя не идентификатор, получает `double`.

Простые данные печатаются целиком, до 200 символов на аргумент; экземпляр класса или DOM-узел — только
именем класса, `[HTMLDivElement]`, `[Session]`: полная отрисовка обходит всё, до чего такой объект
дотягивается, и прогон с сотнями строгих падений мог исчерпать кучу воркера одними строками сообщений.

**У дубля, построенного из типа, класса для имени нет**, поэтому его называет строка, где он построен, —
`createAutoMock(users.spec.ts:12).getName(1) was called`, — и так два безымянных дубля одного файла не
путаются. Имя заменяет это: `createAutoMock<T>(undefined, { strict: true, name: 'USERS' })`, а
`provideAutoSpyForToken` сам передаёт описание токена (`InjectionToken CAROUSEL_RESIZE_OBSERVER.observe(…)
was called`). Запасной путь для **полностью абстрактного класса** в `createSpyFromClass`, который
возвращает тот же прокси, когда прототип не назвал ничего, уносит в него имя класса — `Storage.read('k')
was called` — и строгий режим: DI-токен, у которого все члены `abstract`, и есть ровно тот широкий
коллаборатор, ради которого всё это существует.

## Что считается настройкой {#what-counts-as-configured}

Всё, что настраивает метод **хоть как-нибудь**. Охранник задаёт вопрос про _метод_, один раз на вызов и
до всякого сопоставления аргументов:

| Чем настроено                                                                | Доходит до охранника |
| ---------------------------------------------------------------------------- | -------------------- |
| `calledWith(…)` / `mustBeCalledWith(…)` — **любая** цепочка, любые аргументы | нет                  |
| `resolveWith` / `rejectWith` / `resolveWithPerCall`                          | нет                  |
| `nextWith` / `throwWith` / `complete` / `returnSubject`                      | нет                  |
| опция `returns:` — значение по умолчанию в контейнере самого спая            | нет                  |
| `mockReturnValue` / `mockImplementation` — собственные средства раннера      | никогда — см. ниже   |
| `overrides` у `createAutoMock` — затравка, уже не спай                       | никогда — см. ниже   |
| ничем                                                                        | **да**               |

Неочевидная половина — пятая и шестая строки. `mockReturnValue` и `mockImplementation` не
_регистрируют_ настройку — они **подменяют диспетчеризацию библиотеки** на моке раннера. Спай,
настроенный так, вообще не выполняет код, в котором живёт охранник, — так что дело не в том, что строгий
режим делает для них исключение; делать исключение попросту не в чем. Заодно это значит, что
`calledWith`, добавленный после них, никогда не читается.

Один видимый край у этого есть. `mockReturnValueOnce` ставит одноразовую реализацию, которую _снимают с
очереди_, и, когда очередь пустеет, Vitest откатывается к постоянной реализации — то есть к
диспетчеризации библиотеки. Поэтому вызов после последнего `Once` доходит до охранника и объявляется
ненастроенным:

```ts
const cart = createSpyFromClass(Cart, { strict: true });

cart.total.mockReturnValueOnce(5);
cart.total(); // 5
cart.total(); // бросает: Cart.total() was called; this strict double has nothing configured for it.
```

Задавайте заодно и постоянное значение (`cart.total.mockReturnValue(0)`), когда последовательность `Once`
по замыслу должна исчерпаться.

С `returns:` иначе — он больше так не делает: значение становится ответом спая по умолчанию, поэтому
`calledWith`, настроенный позже, побеждает для своих аргументов, `resolveWith` или `failWith` позже
заменяют его, а `returns: { save: undefined }` — это способ объявить `void`-вызов ожидаемым.

Сброс возвращает метод в ненастроенное состояние, поэтому охранник снова срабатывает после
`resetAutoSpy(users)` или в конце [блока `using`](./create-spy-from-class#using) — и это верный ответ,
а не шероховатость: настройки действительно больше нет.

## Чего он намеренно не делает {#what-it-deliberately-does-not-do}

**Цепочка `calledWith`, настроенная на другие аргументы, его не поднимает.**

```ts
const cart = createSpyFromClass(Cart, { strict: true });

cart.checkout.calledWith(1, 'now').mockReturnValue('one');

cart.checkout(9, 'later'); // undefined — без исключения
```

`calledWith(1, 'now')` — это заявление, что метод застаблен. У строгости на уровне аргументов уже есть
своё имя — [`mustBeCalledWith`](./control-helpers#what-a-mustbecalledwith-failure-prints), который бросает
исключение, печатая ожидаемое рядом с фактическим. Если бы `strict` бросал при несовпадении аргументов,
это молча переквалифицировало бы каждый существующий в сюите `calledWith` в `mustBeCalledWith` — и
печатало бы сообщение хуже, чем инструмент, который эту работу уже делает. Строгий режим отвечает на
_«этот метод никто не настроил»_ и никогда — на _«этот вызов никто не настроил»_.

**Хуки жизненного цикла Angular его не задевают.** `ngOnDestroy`, `ngOnInit`, `ngOnChanges`, `ngDoCheck`
и четыре хука `ngAfter…` на строгом дубле отвечают `undefined`, настроены они или нет. Angular сам
вызывает `ngOnDestroy` у каждого предоставленного значения, у которого он есть, когда разбирает
тестовый модуль, — у прокси `createAutoMock` есть любой член, так что у дубля токена он есть всегда, —
и ни одна спека этого вызова не просила. Бросок в этом месте ломал разборку, пропускал все
последующие `afterEach` и валил тесты после него; под `strict: true` на всю сюиту это были сотни
падений из одного источника. Вызовы по-прежнему записываются: `expect(double.ngOnDestroy).toHaveBeenCalled()`
работает.

## `onUnstubbedCall` — общая форма {#onunstubbedcall-—-the-general-form}

`strict: true` — это сахар над обработчиком, который бросает исключение. Опцией является сам обработчик,
и всё, что он вернёт, становится возвращаемым значением вызова:

```ts
type UnstubbedCallHandler = (call: { className: string | undefined; method: string; args: unknown[] }) => unknown;
```

Оправданных применений два. **Записывать, а не падать** — чтобы понять размер дыры до того, как включать
исключения на всю сюиту:

```ts
const unstubbed: string[] = [];

const users = createSpyFromClass(UserService, {
  onUnstubbedCall: ({ className, method }) => void unstubbed.push(`${className}.${method}`),
});
```

И **общее значение по умолчанию** — то же, что `fallbackMockImplementation` у `vitest-mock-extended`,
только под другим именем:

```ts
createAutoMock<Api>(undefined, { onUnstubbedCall: () => null }); // никогда не undefined и никогда не исключение
```

`className` на дубле, построенном от типа, равен `undefined` по той же причине, по которой сообщение там
короче: класса никто не читал, и написать туда правду нечего.

## Как включить его на всю сюиту {#turning-it-on-for-a-whole-suite}

```ts
// vitest.setup.ts
import { setupAutoSpy } from 'vitest-auto-spy/setup';

setupAutoSpy({ strict: true });
```

Любой дубль, собранный после этого, строгий, так что переход — одна строка, а не правка на каждый вызов
фабрики. Значение по умолчанию взводится, только если опцию действительно передали, и снимается в
`afterAll` того файла, который его взвёл: при `isolate: false` модуль, где оно лежит, общий для всех
файлов воркера, и оставленное взведённым умолчание завалило бы спеку, которая ни на что не
подписывалась. См. [Гигиена тестового прогона → строгие дубли](/ru/utilities/setup#_10-strict-doubles-for-the-whole-suite).

### Бросок, который не дошёл до теста {#a-throw-that-never-reached-the-test}

Строгий бросок громок ровно настолько, насколько позволяет код между ним и тестом. `try`/`catch` в
тестируемом коде превращает его в ветку ошибки этого кода; оператор RxJS без обработчика ошибок
перебрасывает его через `setTimeout`, который фейковые часы так и не запускают. В обоих случаях тест идёт
дальше без ответа, от которого зависел, и вполне может пройти.

Поэтому `setupAutoSpy({ strict: true })` ещё и записывает каждый строгий бросок и после каждого теста
валит тест теми из них, о которых раннер так и не узнал (`swallowedStrictCalls`: по умолчанию `'throw'`
при `strict: true` и строгом пресете, `'warn'`, `'off'`). Тест, который вызывает такой бросок нарочно,
забирает его — это заодно и проверка:

```ts
expect(() => cart.total()).toThrow('Cart.total() was called');
expect(takeStrictViolations()).toHaveLength(1); // из 'vitest-auto-spy/setup'
```

### Приоритет {#precedence}

Сначала самое частное, и разбор останавливается на первом, что задано:

1. собственный `onUnstubbedCall` дубля
2. явный **`strict: false`** дубля — единственный способ вывести одного коллаборатора из-под
   общесюитного умолчания, будь то `strict: true` или обработчик
3. глобальный `onUnstubbedCall` из `setupAutoSpy`
4. собственный `strict: true` дубля
5. глобальный `strict`

```ts
setupAutoSpy({ strict: true });

createSpyFromClass(Cart).total(); // бросает
createSpyFromClass(Cart, { strict: false }).total(); // undefined — отключили явно
```

Обработчик побеждает `strict: true` на любом уровне, поэтому `{ strict: true, onUnstubbedCall: record }`
на одном дубле записывает и не бросает; `strict: false` побеждает любой обработчик, кроме собственного.

### `passthrough` стоит выше всех пяти {#passthrough}

[`createSpyFromInstance(obj, { passthrough: true })`](./create-spy-from-class#passthrough) даёт
ненастроенному вызову третий ответ: выполнить настоящий метод. Для каждого члена, у которого настоящий
метод есть, он побеждает весь список выше — общесюитный `strict: true`, глобальный обработчик,
строгую регистрацию `registerAutoSpyDefaults` для класса. Иначе сюита, включившая строгий режим, молча
превратила бы каждый passthrough-дубль в бросающий.

```ts
setupAutoSpy({ strict: true });

createSpyFromInstance(new Cart(), { passthrough: true }).total(); // настоящий total
createSpyFromInstance(new Cart()).total(); // бросает: Cart.total() was called; …
```

Молча ничего не перебивается, и держится это на двух правилах:

- **Оба на одном вызове — ошибка.** `{ passthrough: true, strict: true }` и
  `{ passthrough: true, onUnstubbedCall }` отклоняются при сборке дубля: каждый решает, что делает
  ненастроенный вызов, и одна из настроек оказалась бы мёртвой. `strict: false` рядом с ним допустим —
  он говорит то же самое.
- **Член, за которым нет ничего настоящего, остаётся под списком.** Имени из `methodsToSpyOn`, которого
  у объекта нет, нечего выполнять, поэтому общесюитный `strict` для него по-прежнему бросает.

## Чтения, которые никто не настроил {#reads-nobody-configured}

Охранник выше срабатывает на **вызове**. Шпионский геттер строгого дубля, который никто не настроил,
по-прежнему отвечает `undefined`, а observable-свойство, которое никто не накормил, — поток, который
ничего не присылает. Класс ошибки тот же, ради которого строгий режим и существует: код под тестом
уходит в ветку «данных нет», а тест остаётся зелёным. Регистрация делает это массовым:
`registerAutoSpyDefaults(Router, { gettersToSpyOn: ['url'], observablePropsToSpyOn: ['events'] })`
кладёт оба члена на каждый дубль `Router` в сюите, и в сюите одного потребителя (~1 760 спек-файлов) из
119 файлов с дублем `Router` 77 ни разу не настроили `url`, а 100 ни разу не накормили `events`.

Бросать на чтении нельзя: когда дубль попадает в дифф упавшей проверки, его читает форматтер, и бросок
сломал бы то самое сообщение, частью которого он стал. Поэтому чтения считаются, пока идёт тест, а
отчёт выходит после него:

```ts
setupAutoSpy({ strict: true, unconfiguredReads: 'throw' }); // 'off' (по умолчанию) | 'warn' | 'throw'
```

```
[vitest-auto-spy] Router.url was read 3 times on a strict double and nothing configured it, so the code under test got undefined.
Configure it in the test: accessorSpies.getters.url.mockReturnValue(…), or mockReturnValue(undefined) when undefined is the answer meant.
[vitest-auto-spy] Router.events was subscribed to 1 time on a strict double and never emitted.
Feed it in the test: events.nextWith(…), or seed overrides: { events: new Subject() } and drive that Subject; overrides: { events: NEVER } when this test never fires it.
Docs: https://asdalexey.github.io/vitest-auto-spy/core/strict-mode#reads-nobody-configured
```

- **Что считается.** Чтение геттера из `gettersToSpyOn` / `settersToSpyOn` / `autoSpyAccessors`,
  дошедшее до заглушки, которую никто не заменил, и подписка на поток из `observablePropsToSpyOn`,
  который никто не накормил **к концу теста**: подписаться в `beforeEach` и вызвать `nextWith` в тесте —
  обычный способ вести поток, и находкой это не считается. Чтение геттера судится в момент чтения:
  настроить геттер после того, как код под тестом его прочитал, чтение не отменяет.
- **Когда.** От `beforeEach` из `setupAutoSpy`, который идёт раньше любого хука спек-файла, до его
  `afterEach`, который идёт после них. Собственный `beforeEach` спеки внутри намеренно — именно там
  большинство сюит запускает код под тестом; сбор, `beforeAll` и `afterAll` — снаружи.
- **Под `test.concurrent`.** У каждого concurrent-теста своё окно, поэтому стартующий сосед больше
  не стирает то, что прочёл другой. Чтение не несёт ничего, что говорило бы, какой тест его сделал:
  сделанное, пока в полёте был один тест, записывается на него, а сделанное, пока их было несколько,
  ждёт последнего из них, оценивается один раз — поток, который кто-то из них к тому времени
  накормил, находкой не считается — и называет всех:

  ```text
  [vitest-auto-spy] Router.url was read 1 time on a strict double and nothing configured it, so the code under test got undefined.
  Configure it in the test: accessorSpies.getters.url.mockReturnValue(…), or mockReturnValue(undefined) when undefined is the answer meant.
  It happened while 2 concurrent tests were in flight ("Cart > loads", "Cart > saves"), and a read does not say which test made it; it is reported once, as the last of them finishes.
  ```

  При `'throw'` падает последний из них.

- **Настраивают** `accessorSpies.getters.x.mockReturnValue(…)` / `mockImplementation(…)`
  (`mockReturnValueOnce` считается, пока не кончится его очередь, как у метода), `overrides: { x: … }` —
  на месте вызова или в строке `registerAutoSpyDefaults` — и `mockReadonlyProp(double, 'x', …)`; поток —
  `nextWith`, `nextOneTimeWith`, `nextWithValues` хотя бы с одной записью, `throwWith`, `complete`,
  `returnSubject` или настоящий поток, засеянный через `overrides`. Один только зарегистрированный
  _список_ ничего не настраивает. Если `undefined` и есть задуманный ответ, это говорится вслух, как
  `returns: { save: undefined }` у метода: `accessorSpies.getters.x.mockReturnValue(undefined)`.
- **Какие дубли.** Строгие — `strict: true` на дубле или на всю сюиту — от `createSpyFromClass`,
  `provideAutoSpy`, `createSpyFromInstance`, а также `createAutoMock` / `provideAutoSpyForToken` для их
  observable-свойств. `strict: false` на дубле выводит его из-под отчёта. Узлы `mockDeep` не
  охвачены — по причине, описанной [ниже](#where-it-does-not-reach).
- **Не входит в `preset: 'strict'`.** Это продолжение `strict` — решения о том, как сюита пишет дубли, —
  а не степень реакции на то, что уже сломано; включение на существующей сюите начинается с обследования.

### Сначала обследовать — `onUnstubbedRead` {#surveying-first-—-onunstubbedread}

```ts
const unread = new Map<string, number>();

setupAutoSpy({
  onUnstubbedRead: ({ className, member, kind, count }) => {
    const key = `${className}.${member} (${kind})`;

    unread.set(key, (unread.get(key) ?? 0) + count);
  },
});
```

Обработчик получает ровно то, что напечатал бы отчёт, от **каждого** дубля, собранного не со
`strict: false`, — строгого или нет, — поэтому его числа предсказывают, что уронит включённый отчёт. Он
вызывается после каждого теста, по разу на член, и забирает эти находки вместо отчёта. У дубля может
быть свой: `createSpyFromClass(X, { onUnstubbedRead })`. Приоритет повторяет `onUnstubbedCall`:
собственный обработчик дубля, его `strict: false`, общесюитный обработчик, затем `strict`. Обоим
обработчикам нужен `setupAutoSpy` в setup-файле — границы теста размечает именно он, — а само чтение
по-прежнему отвечает `undefined`.

## Куда он не дотягивается {#where-it-does-not-reach}

Охранника несут на себе спаи-функции, которые строят две фабрики — от класса и от типа, — и получают
они его в момент сборки. Всё перечисленное ниже строит свои спаи иначе и строгим не бывает **никогда**,
что бы ни настроили:

| Дубль                                                 | Почему                                                                                     |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **спаи на аксессорах** (`gettersToSpyOn`, …)          | чтение не может бросать — вместо этого отчёт после теста, [выше](#reads-nobody-configured) |
| **спаи на observable-свойствах**                      | то же — подписка, которую никто не накормил, попадает в отчёт после теста                  |
| **узлы `mockDeep<T>()`**                              | `mockDeep` вообще не принимает настройки строгого режима                                   |
| **`console-spy`** и **`reload` у `mockResourceProp`** | внутренние спаи, а не дубли вашего коллаборатора                                           |
| **отдельный `createFunctionSpy(name)`**               | охранник — его необязательный второй аргумент, и никто из вызывающих его не передаёт       |

Члены от `fillMissing` — то исключение, которое пришлось закрыть, а не описать: член, которого прототип
никогда не называл, по определению никем и не настроен, так что оставить его снисходительным значило бы
простить ровно тот случай, ради которого строгий режим и существует. Охранник туда протянут, и
`createSpyFromClass(X, { strict: true, fillMissing: true })` бросает на дозаполненном члене ровно так же,
как бросает на объявленном.

Первые две строки стоит сказать дважды, потому что они сидят на дубле, который _и есть_ строгий:
`createSpyFromClass(X, { strict: true, gettersToSpyOn: ['theme'], observablePropsToSpyOn: ['items$'] })`
бросает на ненастроенном **методе** и по-прежнему отвечает `undefined` на ненастроенные `theme` или
`items$` — о чём `setupAutoSpy({ unconfiguredReads })` сообщает, когда тест закончится.

## Как это сделано у других {#prior-art}

У `vitest-mock-extended` есть `fallbackMockImplementation`, у `@golevelup` — `{ strict: true }`, а
testdouble строгий по умолчанию. Здесь режим по умолчанию выключен: сюита, уже написанная под дубли,
возвращающие `undefined`, повалилась бы целиком в день обновления, а метод часто не настроен ровно
потому, что ничего под тестом его не зовёт.
