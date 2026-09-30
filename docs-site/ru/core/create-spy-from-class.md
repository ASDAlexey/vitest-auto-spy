---
title: createSpyFromClass
description: Типизированный Spy<T> из класса - каждый метод становится спаем; опции, спаи аксессоров, спай на настоящем объекте и краевые случаи.
---

# createSpyFromClass

`createSpyFromClass(Class, config?)` принимает класс и возвращает `Spy<T>`: объект с теми же методами,
где каждый метод — спай с хелперами под его тип возврата. Используйте его, чтобы подменить зависимость-
класс в тесте. Конструктор класса не вызывается.

```ts
import { of } from 'rxjs';
import { asInstance, createSpyFromClass } from 'vitest-auto-spy';

const users = createSpyFromClass(UserService, {
  returns: { load: of({ id: 1, name: 'Ann' }) }, // load(): Observable<User>, задано заранее
});
users.save.resolveWith(undefined); // save(user): Promise<void>

const profile = new ProfileStore(asInstance(users)); // код под тестом
await profile.rename('Bob');

expect(users.save).toHaveBeenCalledWith({ id: 1, name: 'Bob' });
```

`returns` задаёт ответ метода заранее, в момент создания спая, поэтому отдельная строка с
`mockReturnValue` не нужна. `asInstance` передаёт спай туда, где ждут настоящий тип; см.
[Мост между `Spy<T>` и `T`](./spy-typing). В Angular [`provideAutoSpy`](/ru/adapters/angular) принимает
те же опции и кладёт спай в `TestBed`.

Что можно делать с каждым методом потом (`calledWith`, `resolveWith`, `nextWith` …) — на странице
[Управляющие хелперы](./control-helpers).

## Настройка {#configuration}

Второй аргумент — объект опций. Все опции необязательны.

| Опция                    | Тип                                                                        | По умолчанию                            | Смысл                                                                                                                                             |
| ------------------------ | -------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `returns`                | `{ метод: значение }`                                                      | нет                                     | что отвечает метод; он остаётся спаем ([подробнее](#returns-—-the-value-where-the-spy-is-built))                                                  |
| `overrides`              | `{ член: значение }`                                                       | нет                                     | заменить член значением ([подробнее](#returns-or-overrides))                                                                                      |
| `returnsUndefined`       | имена методов                                                              | `[]`                                    | эти методы отвечают `undefined` и считаются настроенными ([подробнее](#returns-undefined))                                                        |
| `selfReturning`          | имена методов                                                              | `[]`                                    | эти методы возвращают сам спай, для цепочек ([подробнее](#self-returning))                                                                        |
| `returnsClass`           | `{ метод: Класс }`, `{ метод: [Класс, опции] }` или `{ метод: { build } }` | нет                                     | эти методы возвращают спай этого класса ([подробнее](#returns-class))                                                                             |
| `strict`                 | `boolean`                                                                  | `false`                                 | ненастроенный метод бросает ошибку вместо `undefined` ([подробнее](#strict))                                                                      |
| `onUnstubbedCall`        | `(call) => unknown`                                                        | нет                                     | вызывается вместо возврата `undefined` ([Строгий режим](./strict-mode#onunstubbedcall-—-the-general-form))                                        |
| `onUnstubbedRead`        | `(read) => void`                                                           | нет                                     | получает ненастроенные чтения геттеров ([Строгий режим](./strict-mode#reads-nobody-configured))                                                   |
| `methodsToSpyOn`         | имена методов                                                              | `[]`                                    | спаить эти **в дополнение** к найденным методам                                                                                                   |
| `onlyMethodsToSpyOn`     | имена методов                                                              | нет                                     | спаить **только** эти; поиск методов пропускается                                                                                                 |
| `instanceMethodsToSpyOn` | имена членов                                                               | `[]`                                    | добавить функции, которые живут на экземпляре, а не на прототипе ([подробнее](#instancemethodstospyon-—-callables-that-are-not-on-the-prototype)) |
| `fillMissing`            | `boolean`                                                                  | `false` (`true` для ngrx `signalStore`) | отвечать спаем на любой необъявленный член ([подробнее](#fill-missing))                                                                           |
| `observablePropsToSpyOn` | имена свойств                                                              | `[]`                                    | сделать эти свойства-`Observable` управляемыми через `nextWith` …                                                                                 |
| `gettersToSpyOn`         | имена аксессоров                                                           | `[]`                                    | спаить эти геттеры ([подробнее](#accessor-spies-—-accessorspies))                                                                                 |
| `settersToSpyOn`         | имена аксессоров                                                           | `[]`                                    | спаить эти сеттеры                                                                                                                                |
| `autoSpyAccessors`       | `boolean`                                                                  | `false`                                 | спаить все геттеры и сеттеры в цепочке прототипов                                                                                                 |
| `lazySpies`              | `boolean \| 'proxy'`                                                       | по ширине класса                        | когда строится спай каждого метода ([подробнее](#lazy-spies-—-lazyspies))                                                                         |

«Поиск методов» значит, что библиотека читает все методы на прототипе класса, включая базовые классы.
Каждый найденный метод становится спаем.

```ts
// 1. все найденные методы (по умолчанию)
createSpyFromClass(UserService);

// 2. найденные методы ПЛЮС эти имена (то же, что methodsToSpyOn)
createSpyFromClass(UserService, ['reload', 'count']);

// 3. только эти методы, без поиска
createSpyFromClass(UserService, { onlyMethodsToSpyOn: ['getName', 'getAge'] });

// 4. полный объект опций
createSpyFromClass(UserService, {
  methodsToSpyOn: ['reload'],
  observablePropsToSpyOn: ['users$'],
  gettersToSpyOn: ['userName'],
  settersToSpyOn: ['userName'],
  strict: true,
});
```

**Частая ошибка:** передать массив, чтобы спаить _только_ эти методы. Массив **добавляет** имена к
найденным (как в `jest-auto-spies`), а поиск и так находит все методы прототипа. Чтобы спаить только
список, используйте `onlyMethodsToSpyOn`. Имя в `onlyMethodsToSpyOn`, которого нет в классе, вызывает
предупреждение; добавляющие списки молчат, потому что называть члены, которых нет на прототипе, — их
задача.

### `strict` — метод, который никто не настроил {#strict}

С `strict: true` вызов метода, который тест не настроил, бросает ошибку вместо `undefined`. Ошибка
называет класс, метод и аргументы:

```ts
const users = createSpyFromClass(UserService, { strict: true });

users.load.resolveWith([]);
users.currentTenant(); // throws: UserService.currentTenant() was called; this strict double has nothing configured for it.
```

Без него `undefined` уходит дальше и падает позже, в другом месте. `setupAutoSpy({ strict: true })`
включает режим на весь проект, а `{ strict: false }` на одном спае его исключает. Что считается
настройкой и как записывать вызовы вместо падения через `onUnstubbedCall` — в разделе
[Строгий режим](./strict-mode).

### `instanceMethodsToSpyOn` — вызываемое, чего нет на прототипе {#instancemethodstospyon-—-callables-that-are-not-on-the-prototype}

Поиск читает **прототип**, где живут методы `class`. Функции в _полях экземпляра_ там нет: стрелочное
свойство, поле Angular `signal()` / `computed()`, метод ngrx `signalStore()` (его по умолчанию покрывает
[`fillMissing`](#fill-missing)). Такие члены называйте явно:

```ts
class TaskStore {
  readonly count = signal(0); // поле экземпляра, не на прототипе
  readonly reload = (): void => {}; // стрелочное свойство, то же самое
  load(): void {} // обычный метод, находится сам
}

createSpyFromClass(TaskStore, {
  instanceMethodsToSpyOn: ['count', 'reload'],
});
```

`instanceMethodsToSpyOn` и `methodsToSpyOn` работают одинаково: оба **добавляют** к найденному. В новом
коде берите `instanceMethodsToSpyOn` — имя объясняет, зачем член в списке. Ни один не предупреждает об
имени, которого нет на прототипе.

Классам самого Angular это тоже нужно. `Router.currentNavigation` с Angular 20 — поле экземпляра, поэтому
одного `provideAutoSpy(Router)` мало:

```ts
provideAutoSpy(Router, { instanceMethodsToSpyOn: ['currentNavigation'] });
```

#### Ошибка, которую вы увидите на самом деле {#the-error-you-actually-see}

```
TypeError: Cannot read properties of undefined (reading 'mockReturnValue')
```

**Частая ошибка:** настраивать член из поля экземпляра, не перечислив его. Члена нет на спае, он читается
как `undefined`, и настройка падает с ошибкой выше. Добавьте имя в `instanceMethodsToSpyOn`. (Почему
библиотека не может угадать сама: конструктор не вызывается, и поля экземпляра не появляются. См.
[Подробнее](#in-depth).)

### `fillMissing` — частично абстрактный класс {#fill-missing}

`fillMissing: true` отвечает спаем на любой член, которого класс не объявил во время выполнения. Он нужен
для абстрактного класса, у которого есть хотя бы один конкретный член, — обычная форма DI-токена в
Angular:

```ts
abstract class LocalStorage {
  abstract read(key: string): string | null;
  clear(): void {} // один конкретный член
}

const storage = createSpyFromClass(LocalStorage);
storage.clear; // спай
storage.read; // undefined: `abstract read()` во время выполнения не существует

createSpyFromClass(LocalStorage, { fillMissing: true }).read; // спай
// в Angular: providers: [provideAutoSpy(LocalStorage, { fillMissing: true })]
```

Без него `Spy<T>` типизирует `read` как существующий, но на деле он `undefined`, и рабочий код падает с
`storage.read is not a function`.

- **Полностью** абстрактному классу (без конкретных членов) ничего не нужно: фабрика тогда строит спай по
  типу, как [`createAutoMock`](./auto-mock-by-type), и отвечает каждый метод.
- По умолчанию выключено. TypeScript стирает `abstract` при компиляции, поэтому во время выполнения
  частично абстрактный класс не отличить от конкретного. Заполнять любой неизвестный член по умолчанию
  значило бы прятать настоящие опечатки. Для короткого списка альтернатива — `instanceMethodsToSpyOn`.
- Класс на базе ngrx `signalStore()` получает `fillMissing: true` по умолчанию: его члены `withMethods` /
  `withProps` живут на экземпляре. Библиотека узнаёт базу ngrx по имени `SignalStore` и по её `ɵprov`.
  `fillMissing: false` это отключает.
- Член, который у спая уже есть, читается как обычно.
- Ключи, по которым другой код определяет, что за объект перед ним, никогда не заполняются: `then`,
  `constructor`, `toJSON`, `asymmetricMatch`, `$$typeof`, `nodeType` и все символы. Спай на
  `asymmetricMatch` превратил бы каждый `toEqual` со спаем в вызов матчера, а спай на `toJSON` изменил бы
  каждый снимок.

## `returns` — значение прямо там, где строится спай {#returns-—-the-value-where-the-spy-is-built}

`returns` задаёт, что отвечает метод, в момент создания спая:

```ts
import { of } from 'rxjs';
import { provideAutoSpy } from 'vitest-auto-spy/angular';

providers: [provideAutoSpy(ProductsService, { returns: { getProducts: of([]) } })];
```

Без него каждому тесту нужен `injectSpy(X).m.mockReturnValue(…)` в `beforeEach`. Не заменяйте это
экспортированным `const`-провайдером с готовыми значениями: при `isolate: false` все файлы, которые его
импортируют, делят один набор спаев.

Значение — это **значение метода по умолчанию**:

- цепочка `calledWith(…)`, настроенная позже, всё равно решает ответ для своих аргументов;
- более поздний `resolveWith` / `failWith` его заменяет;
- `undefined` считается настройкой под `strict`;
- `resetAutoSpy` его очищает.

**Частая ошибка:** ключ, который не является спаем метода. Его значение никогда не вернётся, поэтому о
нём сообщается:

- метод, который исключил `onlyMethodsToSpyOn`, так и называется;
- для опечатки предлагается ближайший метод: `returns names 'lod', not a method of CartService — did you mean 'load'?`;
- для имени без похожих вариантов сообщение указывает на `instanceMethodsToSpyOn`, куда относится функция,
  которую присваивает конструктор.

Об опечатке в `onlyMethodsToSpyOn` сообщается так же.

## `returns` или `overrides` {#returns-or-overrides}

`returns` говорит, что отвечает метод-спай, и оставляет его спаем. `overrides` заменяет член (поле,
сигнал, поток) обычным значением, которое уже не спай. Полное сравнение — на странице
[`returns` или `overrides`](./returns-vs-overrides).

## Функция в `overrides` остаётся спаем {#overrides-function}

Обычная функция в `overrides` для метода становится спаем этого метода, а функция — его реализацией.
Используйте это, когда ответ зависит от аргументов:

```ts
import { SecurityContext } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/angular';

providers: [provideAutoSpy(DomSanitizer, { overrides: { sanitize: (_context, value) => String(value) } })];

const sanitizer = injectSpy(DomSanitizer);

sanitizer.sanitize(SecurityContext.URL, 'a'); // 'a': функция выполнилась
expect(sanitizer.sanitize).toHaveBeenCalledOnce(); // и вызов записан
```

- «Метод» здесь — метод прототипа, имя из `methodsToSpyOn`, `instanceMethodsToSpyOn` или
  `onlyMethodsToSpyOn`, либо любой член запасного спая абстрактного класса или спая с `fillMissing`.
- Каждый вызов записывается и выполняет функцию со спаем в качестве `this`, пока тест не настроит метод:
  цепочка `calledWith(…)` решает для своих аргументов, `resolveWith` или `mockReturnValue` заменяют
  функцию для всех вызовов, а `resetAutoSpy` возвращает функцию.
- Под `strict` метод считается настроенным. Функция выполняется и для хука фреймворка вроде
  `ngOnDestroy`.
- Значение из `overrides` сильнее `returns` и `selfReturning` для того же метода.
- Каждый спай получает свою функцию-спай, поэтому функция, зарегистрированная через
  `registerAutoSpyDefaults`, не переносит вызовы из одного теста в другой.

Как есть по-прежнему сохраняются:

- значение, геттер и функция на члене, который не метод (поле-колбэк);
- класс и любая функция со своим API: `vi.fn()`, спай этой библиотеки, сигнал. Ваш `vi.fn()` остаётся
  тем же объектом, поэтому `toBe` на нём проходит.

В `createAutoMock` и `provideAutoSpyForToken` функция в `overrides` сохраняется как написана и спаем не
становится: тип не говорит, какие члены — методы.

## `returnsUndefined` — список `void`-команд {#returns-undefined}

Перечисленные методы отвечают `undefined` и считаются настроенными под `strict`. Это списочная форма
`returns: { m: undefined }` — для стора с несколькими `void`-командами:

```ts
provideAutoSpy(CartStore, { strict: true, returnsUndefined: ['add', 'remove', 'clear'] });
```

Работает для любого метода-спая, включая имена, добавленные через `instanceMethodsToSpyOn`. Метод,
названный ещё и в `returns`, отвечает значением оттуда. Его принимают и `createSpyFromInstance`,
`createAutoMock`, `provideAutoSpyForToken` и `registerAutoSpyDefaults`; регистрации объединяют его, как
любой другой список.

## `returnsClass` — метод, который возвращает спай другого класса {#returns-class}

Перечисленные методы возвращают спай класса, который вы назвали. Это нужно для метода-фабрики, результат
которого тест тоже настраивает:

```ts
import { createSpyFromClass, innerDouble } from 'vitest-auto-spy';

const reports = createSpyFromClass(ReportFactory, { returnsClass: { create: Report } });

innerDouble(reports, 'create').render.mockReturnValue('<p>stub</p>');
```

Это заменяет две инструкции: `const report = createSpyFromClass(Report)` и
`returns: { create: asInstance(report) }`.

- Каждый вызов `create()` возвращает один и тот же спай `Report`. У двух спаев `ReportFactory` будут два разных спая `Report`.
- `innerDouble(reports, 'create')` возвращает этот спай с типом `Spy<Report>` и не вызывает `create`.
  Поэтому `returnsClass` подходит и тесту, который считает вызовы `create`.
  `asSpy(reports.create(…))` тоже достаёт спай, но такое чтение — вызов.
- Метод считается настроенным под `strict`; метод, названный ещё и в `returns`, отвечает значением оттуда.
- Его принимают все фабрики: `createSpyFromClass`, `createSpyFromInstance`, `createAutoMock`,
  `provideAutoSpy`, `provideAutoSpyForToken`, `registerAutoSpyDefaults`. Внутренний спай строится с
  учётом регистрации внутреннего класса.

Чтобы настроить внутренний спай, передайте пару: класс и опции, которые `createSpyFromClass` принимает
для него. Опции проверяются по этому классу.

```ts
provideAutoSpy(MatSnackBar, {
  strict: true,
  returnsClass: { openFromComponent: [MatSnackBarRef, { returnsUndefined: ['dismiss'] }] },
});
```

Когда внутренний двойник строит пресет, а не `createSpyFromClass`, передайте `{ build }`. Функция
вызывается один раз на внешний двойник, и `innerDouble` возвращает то, что она построила:

```ts
import { createMatDialogRef } from 'vitest-auto-spy/angular/doubles';

provideAutoSpy(MatDialog, {
  returnsClass: { open: { build: () => createMatDialogRef(MatDialogRef, { closedWith: 'ok' }).ref } },
});
```

У обобщённого метода вроде `open<C>(component: C): MatDialogRef<C>` параметр `C` читается как
`unknown`: `innerDouble(dialog, 'open')` — это `Spy<MatDialogRef<unknown>>`. Чтобы вернуть тип, назовите
его: `innerDouble<MatDialogRef<SaveDialog>>(dialog, 'open')`. Как и приведение типа, названный тип
не сверяется с методом.

**Частая ошибка:** доставать внутренний спай через `reports.create()` в тесте, который проверяет
`toHaveBeenCalledOnce()` на `create`. Такое чтение — тоже вызов, и счёт сбивается на единицу.
Достаньте спай через `innerDouble(reports, 'create')`.

## `selfReturning` — метод, который отвечает самим двойником {#self-returning}

Перечисленные методы возвращают сам спай. Это нужно для цепочек вызовов вроде
`query.where('a').orderBy('b').run()` или `inject(LOGGER).channel('auth').debug('…')`. Без него первое
ненастроенное звено вернёт `undefined`, и следующий вызов упадёт — часто в конструкторе, ещё до первой
строки теста.

```ts
provideAutoSpy(QueryBuilder, { selfReturning: ['where', 'orderBy'], returns: { run: [] } });
provideAutoSpyForToken(LOGGER, undefined, { selfReturning: ['channel'] });
```

Через `returns` так не написать: когда вы пишете опции, спая ещё нет.

- Это значение по умолчанию, как `returns`: считается настройкой под `strict`, а более поздние
  `calledWith` / `mockReturnValue` всё равно побеждают.
- Метод, названный в обоих, отвечает значением из `returns`. Так один тест убирает звено из цепочки,
  которую задала [регистрация](#registerautospydefaults-—-the-composition-lives-with-the-class).
- Его принимает каждая фабрика: `createSpyFromClass`, `createSpyFromInstance` (там ответ — сам
  экземпляр), `createAutoMock`, `provideAutoSpy`, `provideAutoSpyForToken`. У `mockDeep` есть булев
  `selfReturning` с той же идеей для каждого уровня.

Член, заданный в `overrides`, сильнее обоих. Так одно зарегистрированное звено заменяют собственным
спаем:

```ts
// vitest-setup.ts
registerAutoSpyDefaults(LOGGER, { returns: { info: undefined, err: undefined }, selfReturning: ['channel'] });

// одна спека, которая проверяет канал, а не родителя
provideAutoSpyForToken(LOGGER, { channel: () => asInstance(channelLogger) });
```

В `createAutoMock` и `provideAutoSpyForToken` `returns` и `selfReturning` пропускают член, названный в
`overrides`: значение, обычная функция и `vi.fn()` остаются ровно такими, как переданы.

## Спаи на аксессорах — `accessorSpies` {#accessor-spies-—-accessorspies}

Геттеры и сеттеры — не методы, поэтому их спаи лежат в отдельном объекте `spy.accessorSpies`.
Перечислите их или включите `autoSpyAccessors: true`, чтобы спаить все аксессоры в цепочке прототипов:

```ts
import { createSpyFromClass } from 'vitest-auto-spy';

const settings = createSpyFromClass(SettingsService, {
  gettersToSpyOn: ['theme'],
  settersToSpyOn: ['theme'],
});

settings.accessorSpies.getters.theme.mockReturnValue('dark');
expect(settings.theme).toBe('dark');

settings.theme = 'light';
expect(settings.accessorSpies.setters.theme).toHaveBeenCalledWith('light');
```

- Само свойство читается и пишется как обычно, поэтому `settings.theme` остаётся типа `string`.
- `accessorSpies` неперечислим: его нет в `Object.keys`, spread, `toEqual` и снимках.

### Названная половина тянет за собой пару {#naming-one-half-gets-the-pair}

`gettersToSpyOn: ['theme']` на классе, где объявлены **и** геттер, и сеттер, спаит оба, и наоборот.
Добавляется только то, что есть у класса, поэтому свойство только для чтения таким и остаётся.

### Как задать значение геттеру-спаю {#seeding-a-spied-getter}

Значение в `overrides` для **геттера-спая** задаёт, что этот геттер отвечает. Это работает, где бы геттер
ни попал в спаи: через `gettersToSpyOn`, `autoSpyAccessors` или регистрацию
[`registerAutoSpyDefaults`](#registerautospydefaults-—-the-composition-lives-with-the-class):

```ts
registerAutoSpyDefaults([[FlagsConfigService, { gettersToSpyOn: ['flagsConfig'] }]]); // setup-файл

providers: [provideAutoSpy(FlagsConfigService, { overrides: { flagsConfig: { theme: 'dark' } } })];

injectSpy(FlagsConfigService).flagsConfig; // { theme: 'dark' }, и чтение записано
```

- Геттер остаётся спаем, поэтому более поздний `accessorSpies.getters.flagsConfig.mockReturnValue(…)`
  всё равно заменит значение.
- Значение для члена, у которого есть только спай сеттера, становится обычным значением.
- На спае по типу для полностью абстрактного класса такое значение не добавляет собственных
  `accessorSpies` в `Reflect.ownKeys`, spread, снимки или `explainSpy`.

## `gettersToSpyOn` принимает геттер, возвращающий сигнал {#getterstospyon-accepts-a-signal-valued-getter}

```ts
createSpyFromClass(LayoutStateService, { gettersToSpyOn: ['isCompactMode', 'sectionsLoaded'] });
```

Геттер, который возвращает `Signal<T>`, можно указать, как любой другой. Принимается любой строковый
ключ. Во время выполнения сообщается только об одном случае — если назвать **метод**: поверх него
ставится аксессор-спай, и метод больше нельзя вызвать на спае.

Для сигнала обычно лучше `mockSignalProp` из `vitest-auto-spy/angular`; см.
[Angular](/ru/adapters/angular#patching-a-property-of-a-spy).

## Ленивые спаи — `lazySpies` {#lazy-spies-—-lazyspies}

Спай метода строится, когда тест **впервые его читает** (`spy.method`), и потом переиспользуется.
Методы, которых тест не касается, ничего не стоят. Так по умолчанию, и поведение такое же, как у
построенных сразу спаев: `Object.keys`, `vi.isMockFunction`, `calledWith`, `resetAutoSpy` /
`clearAutoSpy` и перечисление работают одинаково.

```ts
const spy = createSpyFromClass(WideService);
spy.getName.mockReturnValue('Ada'); // getName строится здесь, при первом чтении
// остальные методы не строятся вовсе
```

| Значение  | Когда используется                        | Как метод ждёт                                             |
| --------- | ----------------------------------------- | ---------------------------------------------------------- |
| `true`    | по умолчанию для классов меньше 8 методов | заглушка `get`/`set` на каждый метод                       |
| `'proxy'` | по умолчанию от 8 методов                 | один `Proxy` на весь класс; до чтения ничего не определено |
| `false`   | только если передать                      | все спаи строятся сразу                                    |

Ширина — число методов, которые покрывает спай, после `onlyMethodsToSpyOn`, `methodsToSpyOn` и
`instanceMethodsToSpyOn`. `trackInjections` и `createWithAutoSpies` берут то же умолчание.

**Частая ошибка:** отключать ленивость «на всякий случай». `lazySpies: false` нужен, только если тест
перечисляет сам объект спая, а не вызывает его методы, или трогает каждый метод маленького класса.
Цифры — в разделе [Производительность](/ru/core/performance).

Что стоит знать:

- **У ни разу не прочитанного метода нет записанных вызовов**, поэтому `resetAutoSpy` может его
  пропустить.
- **Замороженный или запечатанный спай работает.** `Object.freeze(cart)` не мешает
  `cart.total.mockReturnValue(3)`: спай хранится рядом с объектом, и каждое чтение возвращает тот же спай.
  Присваивание вроде `cart.total = vi.fn()` хранится так же. После одного `Object.preventExtensions` спай
  ложится на объект как обычно.
- **`vi.spyOn` на ещё не прочитанном методе работает, но не нужен**: член уже спай, и
  `cart.total.mockReturnValue(3)` делает то же за один шаг. На спае с заглушками (меньше 8 методов или
  `lazySpies: true`) `vi.spyOn` возвращает переадресацию: настроенный `mockReturnValue` отвечает,
  ненастроенный вызов доходит до спая (с проверкой `strict`), а `mockRestore()` возвращает этот спай с
  записанными вызовами. Вызов переадресации в отрыве от объекта бросает
  `'total' was called off its double after vi.spyOn`. На proxy-спае (8 методов и больше) `vi.spyOn`
  возвращает сам спай; `mockRestore()` его сбрасывает, и вызов в отрыве работает.
- `Object.create(spy).method` строит спай на новом объекте при `lazySpies: true` и на исходном спае при
  `'proxy'`.

### `lazySpies: 'proxy'` — один объект-ловушка вместо заглушки на каждый метод {#lazyspies-proxy-—-one-trap-object-instead-of-a-placeholder-per-method}

`'proxy'` — умолчание от 8 методов. Передайте его явно, чтобы получить его на более узком классе. Он
держит широкий спай лёгким: до чтения метода на объекте ничего не определено:

```ts
// сгенерированный API-клиент: 400 операций, тест трогает две
const api = createSpyFromClass(GeneratedVenuesClient);

api.findById.resolveWith({ id: 1 }); // строится здесь, как любой ленивый спай
```

Начиная с 8 методов proxy-спай занимает меньше памяти и строится быстрее заглушек; ниже 8 выигрыш
слишком мал, чтобы жертвовать обычным объектом. Замеры — в разделе
[Производительность](/ru/core/performance).

Тест может заметить proxy-спай в таких местах:

- `util.types.isProxy(spy)` — `true`, отладчик показывает `Proxy`;
- `console.log(spy)` / `util.inspect` показывает только уже прочитанные методы (снимки Vitest,
  `toEqual`, `Object.keys` и spread не меняются);
- `Object.getOwnPropertyDescriptor(spy, 'method')` на непрочитанном методе каждый раз возвращает новую
  пару `get`/`set`;
- `vi.spyOn(spy, 'method')` возвращает собственный спай метода (см. выше);
- каждое чтение члена идёт через proxy, что стоит немного времени в очень горячем цикле.

В этих случаях передайте `lazySpies: true` или зарегистрируйте его один раз:
`registerAutoSpyDefaults(Class, { lazySpies: true })`.

Всё остальное ведёт себя так же, как с заглушками: `Object.keys`, spread, `JSON.stringify`, `in`,
`hasOwnProperty`, `Object.getOwnPropertyDescriptor` (та же форма аксессора), `delete`, `Object.freeze`,
порядок ключей, `returns`, `overrides` и `fillMissing`. Чтение дескриптора **не** строит спай: дескрипторы
читают и `Object.keys`, и уборка. [Метод с символьным ключом](#edge-cases) и в этом режиме определяется
на объекте.

## `using` — сброс в конце блока {#using}

У каждого спая этого пакета есть метод `[Symbol.dispose]()`, который вызывает `resetAutoSpy(this)`.
Объявите спай через `using`, и `afterEach` только ради сброса не нужен:

```ts
it('loads', () => {
  using cart = createSpyFromClass(Cart); // сбросится в конце блока
  cart.total.calledWith().mockReturnValue(42);

  expect(cart.total()).toBe(42);
});
// вызовы и настройки исчезли: cart.total() снова undefined
```

- Это полный `resetAutoSpy`: записанные вызовы, цепочки `calledWith` / `mustBeCalledWith`, значения
  `resolveWith` / `nextWith`, обычный `mockReturnValue`, `mockReturnValueOnce` в очереди и настройки
  спаев аксессоров.
- Его можно вызвать вручную: `cart[Symbol.dispose]()`. Ключ при каждом чтении — один и тот же объект,
  как ожидают проверки `Disposable` и `DisposableStack`.
- Ключ неперечислим, поэтому не попадает в spread и снимки.
- `[Symbol.asyncDispose]` нет: `resetAutoSpy` синхронный, а `await using` и так откатывается к
  `Symbol.dispose`.

**Синтаксис `using` должен поддерживать ваш инструментарий.** esbuild и `tsc` его компилируют. Node 24
выполняет его сам; нескомпилированный `.js` на Node 22 падает с `SyntaxError`. Если ваша сборка его не
компилирует, вызывайте `[Symbol.dispose]()` или `resetAutoSpy()` напрямую.

- **Типы:** пакету не нужны ни `@types/node`, ни `lib: ["esnext.disposable"]`. Объявлению `using` в
  вашем коде по-прежнему нужен `lib`, который его знает.
- **Node 22:** пакет определяет `Symbol.dispose` там, где его нет (например, в окружении Vitest `jsdom`
  или `happy-dom`), тем же символом `Symbol.for('nodejs.dispose')`, что и сам Node. Среду, где он уже
  есть, пакет не трогает.

::: warning `createFunctionSpy` сюда не входит
Отдельный `createFunctionSpy` — мок раннера, и Vitest даёт каждому моку свой `[Symbol.dispose]`, который
вызывает `mockRestore()` и **возвращает исходную реализацию**. Это не то же самое, что очистить настройки
библиотеки: цепочки `calledWith` туда не входят. Для функции-спая `using` значит то, что под ним понимает
ваш раннер. Чтобы очистить настройки библиотеки, вызовите `resetAutoSpy(spy)`.
:::

## `registerAutoSpyDefaults` — опции спая хранятся рядом с классом {#registerautospydefaults-—-the-composition-lives-with-the-class}

Некоторые опции относятся к **классу**, а не к одному тесту: `Router` нужен `events` как свойство-
`Observable` и `url` как геттер везде, где его спаят. Зарегистрируйте их один раз в setup-файле, и каждый
спай этого класса их получит:

```ts
// vitest-setup.ts, один раз
import { registerAutoSpyDefaults } from 'vitest-auto-spy';

registerAutoSpyDefaults(Router, { observablePropsToSpyOn: ['events'], gettersToSpyOn: ['url'] });
registerAutoSpyDefaults(AccountService, { gettersToSpyOn: ['isGuest', 'currentProfile'] });
```

```ts
// в каждой спеке дальше
provideAutoSpy(Router);
provideAutoSpy(Router, { instanceMethodsToSpyOn: ['currentNavigation'] }); // добавляет, а не заменяет
```

Без регистрации каждый файл пишет свои опции для одного и того же класса, и они расходятся. Опции-списки
не жалуются на имя, которого не нашли, поэтому файл, забывший `events`, остаётся зелёным, пока рабочий
код не начнёт им пользоваться. Насколько это часто — в разделе [Подробнее](#how-often-the-options-drift).

| Вызов                                        | Что делает                                                                                           |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `registerAutoSpyDefaults(Class, cfg)`        | регистрирует опции одного класса; второй вызов заменяет первый                                       |
| `registerAutoSpyDefaults([[Class, cfg], …])` | регистрирует много сразу ([ниже](#many-at-once))                                                     |
| `clearAutoSpyDefaults(Class)`                | убирает одну регистрацию                                                                             |
| `clearAutoSpyDefaults()`                     | убирает все — для проекта, который регистрирует по проектам, или теста, которому нужен пустой реестр |

**Частая ошибка:** зарегистрировать базовый класс и ждать, что подклассы это получат. Регистрации
совпадают по точному классу, а не по наследованию. Иначе одна регистрация на популярном базовом классе
меняла бы спаи в файлах, на которые никто не смотрел.

### Как сливается {#the-merge}

Регистрация — основа; опции в вызове добавляются к ней:

| Ключ                                                            | Как сливается                                   |
| --------------------------------------------------------------- | ----------------------------------------------- |
| любой список (`gettersToSpyOn`, `observablePropsToSpyOn`, …)    | объединяется, сначала регистрация, без повторов |
| `returns`, `overrides`                                          | по ключам; побеждает вызов                      |
| любое одиночное значение (`lazySpies`, `strict`, `fillMissing`) | побеждает вызов, если он задаёт ключ            |

Сокращение-массив тоже сливается: `createSpyFromClass(X, ['reload'])` — как
`{ methodsToSpyOn: ['reload'] }`.

**`createSpyFromInstance` тоже читает регистрации**: по классу, который называет `constructor` объекта,
и сливает так же.

- Объектный литерал или словарь `Object.create(null)` регистрацию не находят.
- Если вызов перечисляет `onlyMethodsToSpyOn`, остальной объект остаётся настоящим. Регистрация тогда
  добавляет только `strict`, `onUnstubbedCall`, `onUnstubbedRead` и записи `returns` / `selfReturning`
  для перечисленных методов — никогда аксессор, другой метод или значение `overrides`. Поэтому
  `router.url` остаётся настоящим под `createSpyFromInstance(router, { onlyMethodsToSpyOn: ['navigateByUrl'] })`.
- Имя в `returns` или `selfReturning` в вызове для метода, который вызов оставил настоящим, сообщается
  как ошибка настройки и пропускается.

### Много классов сразу {#many-at-once}

Вместо дюжины вызовов передайте таблицу:

```ts
// vitest-setup.ts, один раз
registerAutoSpyDefaults([
  [Router, { observablePropsToSpyOn: ['events'], gettersToSpyOn: ['url'] }],
  [AccountService, { gettersToSpyOn: ['isGuest', 'currentProfile'] }],
  [LocalStorage, { instanceMethodsToSpyOn: ['getItem', 'setItem'] }],
]);
```

- **Каждая строка проверяется типами по своему классу.** Ключ, которого у класса нет, падает на строке
  этого класса, и ошибка перечисляет только его члены:

  ```ts
  registerAutoSpyDefaults([
    // Type '"isGuest"' is not assignable to type '"navigate" | "navigateByUrl" | …'
    [Router, { instanceMethodsToSpyOn: ['isGuest'] }],
    [AccountService, { gettersToSpyOn: ['isGuest'] }],
  ]);
  ```

- **Строки применяются по порядку**, поэтому более поздняя строка для того же класса заменяет раннюю,
  как второй вызов. Таблица и одиночные вызовы пишут в один реестр.
- `AutoSpyDefaultEntry<T>` — тип строки, для строки, собранной вне литерала.

### Зависимость за `InjectionToken` {#token-defaults}

Токены тоже можно регистрировать, через `registerAutoSpyDefaults` из `vitest-auto-spy/angular`. Экспорт
ядра принимает только классы: он не может сослаться на `InjectionToken` из Angular; экспорт `/angular`
добавляет токены в тот же реестр.

```ts
// vitest-setup.ts, один раз
import { registerAutoSpyDefaults } from 'vitest-auto-spy/angular';

registerAutoSpyDefaults(LOGGER, { returns: { info: undefined, err: undefined }, selfReturning: ['channel'] });
registerAutoSpyDefaults(NAVIGATION, { overrides: { activeRow$: of({}) }, returns: { setFocus: undefined } });

// в каждой спеке дальше
providers: [provideAutoSpyForToken(LOGGER), provideAutoSpyForToken(NAVIGATION, { activeRow$: rows$ })];
```

- `provideAutoSpyForToken` сливает свой второй аргумент (значения) и третий (опции) поверх регистрации по
  правилам выше. Зарегистрированный `returns` остаётся значением по умолчанию, которое заменит более
  поздний `calledWith` или `resolveWith`.
- Строка токена принимает `AutoSpyTokenDefaults<T>`: опции [`createAutoMock`](./auto-mock-by-type)
  (`returns`, `selfReturning`, `returnsUndefined`, `observablePropsToSpyOn`, `strict`, `name`) плюс
  `overrides`. Каждый ключ проверяется по `T` токена, а в одной таблице можно смешивать строки классов и
  токенов.

**Частая ошибка:** импортировать `registerAutoSpyDefaults` из `vitest-auto-spy` для токена. Это падает с
`TS2345 … 'InjectionToken<AppLogger>' is not assignable to parameter of type 'ClassType<unknown>'`.
Импортируйте из `vitest-auto-spy/angular`.

## `passthrough` — наблюдать за настоящим объектом, не подменяя его {#passthrough}

`createSpyFromInstance(obj)` превращает методы уже существующего объекта в спаи. По умолчанию каждый спай
отвечает `undefined`. С `passthrough: true` объект продолжает работать: каждый вызов записывается, а
ненастроенный метод вызывает настоящий.

```ts
import { createSpyFromInstance } from 'vitest-auto-spy';

const cart = createSpyFromInstance(new CartStore(), { passthrough: true });

cart.add('apple'); // выполнился настоящий add: cart.items — ['apple']
expect(cart.add).toHaveBeenCalledWith('apple');

cart.checkout.resolveWith('declined'); // дальше подменён только checkout
```

Это режим спаев Vitest (`vi.mock(path, { spy: true })`) для одного объекта, на любом раннере, и замена
`vi.spyOn` на каждый метод по очереди. Есть только у `createSpyFromInstance`: у фабрики класса нет
экземпляра, и настоящему методу выполняться не на чем.

Правила:

- **Настроенный метод перестаёт вызывать настоящий.** `calledWith`, `mustBeCalledWith`, `resolveWith`,
  `nextWith`, `failWith`, `mockReturnValue`, `mockImplementation`, `returns` и `selfReturning` заменяют
  настоящий метод. Цепочка `calledWith(1)` отвечает `undefined` на `load(2)`, как на любом спае; к
  настоящему `load` она не откатывается.
- **`resetAutoSpy` возвращает настоящий метод.** `clearAutoSpy`, как всегда, оставляет настройки. В слое
  jasmine `.and.callThrough()` снова вызывает настоящий метод.
- **Настоящий метод выполняется с объектом в качестве `this`**, поэтому его внутренние вызовы идут через
  спаи и записываются: `cart.add`, вызвавший `this.count()`, виден на `cart.count`.
- **Некоторые члены остаются настоящими.** Хуки жизненного цикла Angular (`ngOnInit`, `ngOnDestroy`, …):
  их вызывает фреймворк, и уборка должна выполниться. Найденная функция со своим API (поле Angular
  `signal()` с `set` и `update`, мок): спай спрятал бы этот API. Чтобы всё же спаить такой член, назовите
  его в `methodsToSpyOn`. Найденный класс тоже остаётся настоящим; названный становится обычным спаем.
- **Названные аксессоры и свойства-`Observable` заменяются.** `gettersToSpyOn`, `settersToSpyOn` и
  `observablePropsToSpyOn` просят замену и получают её.
- **Названный член, которого у объекта нет**, вызвать нечем, и он отвечает как любой спай: `undefined`
  или то, что скажет общий строгий режим.
- **`strict: true` или `onUnstubbedCall` в том же вызове отвергаются**: оба решают, что делает
  ненастроенный вызов. Общий `setupAutoSpy({ strict: true })` или строгий `registerAutoSpyDefaults`
  уступают `passthrough`; см. [Строгий режим](./strict-mode#passthrough).

В Angular это способ проверить взаимодействие, не ломая сервис: возьмите настоящий сервис из
`TestBed.inject` и заспайте его на месте. Его зависимости, сигналы и `ɵprov` остаются настоящими, и
уборка `TestBed` по-прежнему вызывает настоящий `ngOnDestroy`:

```ts
const cart = createSpyFromInstance(TestBed.inject(CartService), { passthrough: true });
const fixture = TestBed.createComponent(CartComponent);

fixture.componentInstance.addOne();

expect(cart.add).toHaveBeenCalledWith(5); // выполнился настоящий CartService со своим PriceFormatter
```

`restoreSpiedInstance(obj)` или `using` возвращают настоящие члены. `setupAutoSpy()` делает это после
каждого теста.

### Один метод — `spyOnOwnMethod` {#spy-on-own-method}

`spyOnOwnMethod(sut, 'method')` следит за **одним** методом объекта под тестом и даёт ему выполниться:

```ts
import { spyOnOwnMethod } from 'vitest-auto-spy';

const seek = spyOnOwnMethod(player, 'seek');

player.seek(1000); // выполнился настоящий seek
expect(seek).toHaveBeenCalledWith(1000);
```

Это `onlyMethodsToSpyOn` плюс `passthrough` в одном вызове: все остальные члены остаются настоящими,
настоящий метод выполняется, пока тест не настроит спай, а `restoreSpiedInstance` / `setupAutoSpy()`
возвращают всё обратно. Он же заменяет обычный `vi.spyOn(component, 'method')` там, где пресет линтера
запрещает `vi.spyOn`.

### Живой DOM-узел — не коллаборатор {#live-dom-node}

**Частая ошибка:** `createSpyFromInstance(el)` на живом DOM-узле. За пределами собственного класса
компонента цепочка прототипов принадлежит DOM-движку. Например, `Node.removeChild` в happy-dom вызывает
на дочернем узле внутренний метод с символьным ключом. Когда этот метод — спай, строгий набор тестов не
может убрать узел из `document.body`, и оставшийся узел роняет последующие тесты в файле.

Поэтому `createSpyFromInstance` предупреждает, ещё ничего не изменив, если получает живой `Node`,
глобальный `window` или другую цель событий от движка (`XMLHttpRequest`, `AbortSignal`, `MediaQueryList`
из happy-dom) без `onlyMethodsToSpyOn`. Ваш собственный класс, расширяющий `EventTarget`, не считается.
`setupAutoSpy({ misconfiguration: 'throw' })` превращает предупреждение в падение до того, как узел
тронут.

Что делать вместо этого:

- `{ onlyMethodsToSpyOn: ['addEventListener'] }` спаит только этот метод. Сокращение-массив
  `createSpyFromInstance(el, ['addEventListener'])` **не** поможет: оно добавляет к поиску
  ([Как сливается](#the-merge)), и весь узел всё равно обходится.
- `mockValueProp(el, 'addEventListener', vi.fn())` заменяет одно свойство, остальной узел остаётся
  настоящим.
- Для встроенного `void`-метода, который должен вызвать обработчик (`preventDefault`, `stopPropagation`,
  `focus`), используйте `spyOnVoidMethod`. Он объединяет `onlyMethodsToSpyOn` и
  `returns: { preventDefault: undefined }`, которое иначе понадобилось бы строгому набору тестов:

```ts
import { spyOnVoidMethod } from 'vitest-auto-spy';

const preventDefault = spyOnVoidMethod(event, 'preventDefault');

handler(event);

expect(preventDefault).toHaveBeenCalledTimes(1);
```

## Одна функция — `createFunctionSpy` {#a-single-function-—-createfunctionspy}

Когда класса нет совсем, `createFunctionSpy<Fn>(name)` строит один спай с теми же хелперами. `name`
видно в сообщениях о падении.

```ts
import { createFunctionSpy } from 'vitest-auto-spy';

const load = createFunctionSpy<(id: number) => Promise<string>>('load');

load.calledWith(1).resolveWith('value');

await expect(load(1)).resolves.toBe('value');
```

## Форма `Spy` {#the-spy-t-shape}

`Spy<T>` — **отображённый тип** над `T`:

- каждый **метод** становится моком плюс хелперами, которые допускает его тип возврата: `calledWith` /
  `mustBeCalledWith` всегда, `resolveWith` / `rejectWith` для `Promise`, `nextWith` / `throwWith` / … для
  `Observable`;
- каждое **свойство-`Observable`** получает хелперы Observable и сохраняет свой тип;
- всё остальное сохраняет объявленный тип;
- добавляется объект `accessorSpies`.

Отображённый тип **теряет члены `#private` и `private`**, поэтому `Spy<T>` нельзя присвоить `T`.
Объявляйте переменную как `Spy<T>` или переводите через [`asInstance` / `asSpy`](./spy-typing):

```ts
let users: Spy<UserService>; // ✅
let users: UserService = createSpyFromClass(UserService); // ❌ нет приватных членов
```

## Метод, чей тип возврата — `never` {#a-method-whose-return-type-is-never}

Обобщённый метод с условным типом возврата, например
`get<K extends keyof T>(k: K): T[K] extends Stringified<infer R> ? R : never` (обычная форма
типизированного сервиса конфигурации), получает рабочий спай. Его хелперы откатываются к синхронному
набору (`mockReturnValue`, `calledWith`, …), и член не превращается в `never`.

## Краевые случаи {#edge-cases}

**Унаследованные методы спаятся.** Поиск читает всю цепочку прототипов, поэтому метод базового класса
спаится так же, как собственный. `Object.prototype` не входит.

**Цепочка, которая не кончается на `Object.prototype`, тоже читается.** Класс, у прототипа которого
родитель `null`, и словарь `Object.create(null)`, переданный в `createSpyFromInstance` (реестр
обработчиков, набор колбэков), обрабатываются как обычно. `Object.prototype` из другой среды
распознаётся и пропускается так же, как свой.

**Методы с символьными ключами спаятся.** Класс с `[SERIALIZE]()` или `[Symbol.for('app.render')]()`
получает спай под этим ключом, с типами и настройкой, как у именованного:

```ts
const envelope = createSpyFromClass(Envelope);

envelope[SERIALIZE].calledWith(payload).mockReturnValue('{}');
```

Собственные символы среды выполнения не трогаются: каждый символ на `Symbol` (`Symbol.iterator`,
`Symbol.toPrimitive`, `Symbol.asyncIterator`, `Symbol.dispose`, …) плюс
`Symbol.for('nodejs.util.inspect.custom')`. Спай там сломал бы объект: `[...spy]` перестал бы работать
на итерируемом классе, приведение к строке вернуло бы `undefined`, а `Symbol.dispose` уже занят
[`using`](#using). Список читается из `Symbol`, поэтому новые символы среды тоже учтены.

**Абстрактные классы работают во время выполнения**: абстрактный класс — всё равно конструктор с
прототипом. Только TypeScript не даёт типизировать его как `ClassType<T>`. Передайте конкретный подкласс,
а абстрактный класс оставьте DI-токеном:

```ts
providers: [{ provide: PaymentGateway, useValue: createSpyFromClass(StripeGateway) }];
```

`injectSpy` принимает абстрактный класс как токен, так что получить спай обратно просто.

**Метод `then()` пропускается.** Спай на нём сделал бы объект «thenable» с `then`, который никогда не
отвечает, и `await spy` или возврат спая из `async`-функции повесил бы тест. Фабрика предупреждает один
раз на класс. Назовите его в `methodsToSpyOn: ['then']`, если тест действительно управляет `then`;
`returns: { then }` без этого сообщается как ошибка, потому что отвечать некому.

**Поиск останавливается на встроенном базовом классе.** `class AppError extends Error` получает спаи
только для своих методов, без `toString`. То же для `extends Array`, `extends EventTarget`,
`extends HTMLElement`. Чтобы спаить встроенный метод, назовите его в `methodsToSpyOn`. Встроенный класс,
переданный напрямую, например `createSpyFromClass(WebSocket)`, обходится целиком.

**Конструктор не вызывается.** Спай строится из прототипа, поэтому конструктор, который открывает сокет
или читает конфиг, не мешает.

**Нет класса?** [`createAutoMock<T>()`](./auto-mock-by-type) строит такой же спай по типу, `mockDeep<T>()`
делает это для вложенных объектов, а `createMock<T>()` возвращает обычный `T` для данных, которые код
только читает.

## Подробнее {#in-depth}

### Почему поле экземпляра не найти {#why-an-instance-field-cannot-be-found}

Поля экземпляра появляются только после конструктора, а эта фабрика его не вызывает. Именно поэтому она
безопасна для сервиса, чей конструктор открывает сокет. Единственная альтернатива — отвечать на любой
неизвестный член _чем-нибудь_. Это «что-нибудь» было бы истинным, и `if (service.optionalThing)` в коде
под тестом ушёл бы не в ту ветку — молча, в другом файле.
[Список запретов для протокольных ключей](/ru/core/auto-mock-by-type#it-answers-everything-so-it-must-not-answer-these)
существует ровно ради этого, и понятный `TypeError` на строке теста — лучший из двух вариантов.

### Как часто расходятся опции {#how-often-the-options-drift}

В одном Angular-проекте 739 из 2 228 вызовов `provideAutoSpy` передавали опции, и один и тот же класс
собирал много разных наборов:

| класс                   | вызовов | файлов | с опциями | **разных наборов опций** |
| ----------------------- | ------: | -----: | --------: | -----------------------: |
| `Router`                |     122 |    109 |        60 |                   **23** |
| `AccountService`        |      70 |     62 |        43 |                   **27** |
| `CheckoutStateService`  |      53 |     52 |        42 |                   **25** |
| `RemoteSettingsService` |      85 |     70 |        47 |                        8 |

Семейство `*FlagsConfigService` — 205 вызовов, 120 из них слово в слово повторяли
`{ gettersToSpyOn: ['flagsConfig'] }`. При 23 разных наборах опций для `Router` большинство файлов вовсе
не спаили `events`, и ни один не заметил бы, когда рабочий код начал бы им пользоваться.

### Как делятся заглушки {#how-the-placeholders-are-shared}

При `lazySpies: true` заглушка, за которой ждёт метод, — одна пара `get`/`set` на **имя** метода, общая
для всех спаев с методом такого имени. Нетронутый спай остаётся маленьким при любой ширине класса. Первое
чтение метода превращает спай в словарь свойств шириной с класс, поэтому широкие классы по умолчанию
получают `'proxy'`.
