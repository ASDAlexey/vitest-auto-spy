---
title: Как это устроено
description: Две идеи, на которых стоит vitest-auto-spy, — обход цепочки прототипов в рантайме и условные типы, выбирающие хелперы по типу возврата метода.
---

# Как это устроено

Вся библиотека сводится к двум идеям. Одна работает в рантайме, вторая существует только в системе
типов. Всё остальное в репозитории — работа, которая заставляет эти две оставаться честными на
настоящих кодовых базах.

## Зачем это нужно {#why-it-exists}

Вы тестируете компонент, который вызывает `UserService`. Настоящий сервис в тест не возьмёшь — он полезет
в сеть. Значит, подделку пишут руками:

```ts
const userService = {
  getUser: vi.fn(),
  saveUser: vi.fn(),
  deleteUser: vi.fn(),
  refresh: vi.fn(),
  // …по строке на метод, и так до бесконечности
};
```

Три проблемы, и все молчаливые:

- добавили метод в сервис — надо не забыть добавить его и сюда;
- переименовали метод — а тест продолжает «проходить», просто перестаёт наблюдать за вызовом;
- типов нет вовсе: `getUser: vi.fn()` ничего не знает о настоящей сигнатуре.

Та же подделка, собранная за вас:

```ts
const userService = createSpyFromClass(UserService);
```

## Идея первая — спросить у класса его методы {#idea-one-—-ask-the-class-for-its-methods}

**Одной фразой:** у класса можно спросить, какие у него методы, и этого списка достаточно, чтобы собрать
объект, где каждое имя — мок.

Методы класса живут не на экземплярах, а на прототипе:

```ts
class UserService {
  getUser(id: number) {
    /* … */
  }
  saveUser(user: User) {
    /* … */
  }
}

Object.getOwnPropertyNames(UserService.prototype);
// → ['constructor', 'getUser', 'saveUser']
```

Выкинуть `constructor`, разложить по оставшимся именам по моку — вот и весь движок:

```ts
function createSpyFromClass(SomeClass) {
  const spy = {};

  for (const name of Object.getOwnPropertyNames(SomeClass.prototype)) {
    if (name === 'constructor') continue;

    spy[name] = vi.fn();
  }

  return spy;
}
```

```ts
const service = createSpyFromClass(UserService);
service.getUser; // vi.fn()
service.saveUser; // vi.fn()
```

В этом вся идея. Никакой генерации кода, никакого плагина к компилятору — спросить имена методов и
собрать из них объект.

### Что добавляет настоящая реализация {#what-the-real-implementation-adds}

Идея маленькая, работа — по краям. Каждый пункт ниже — случай, когда наивный цикл выше вернёт спай,
который выглядит правильно, а ведёт себя неправильно.

**Наследование.** `getOwnPropertyNames` видит только один уровень: для `class Admin extends UserService`
не появится ни один метод `UserService`. Поэтому настоящая версия идёт вверх по цепочке прототипов и
останавливается на последнем прототипе, у которого ещё есть родитель:

```ts
let current = SomeClass.prototype;

while (Object.getPrototypeOf(current)) {
  // ← у Object.prototype родителя нет; на этом и останавливаемся
  collectNamesFrom(current);
  current = Object.getPrototypeOf(current);
}
```

Именно условие остановки не пускает в ваш спай `toString`, `hasOwnProperty` и всё остальное из
`Object.prototype`.

**Геттеры.** Если в классе объявлен `get isReady()`, чтение свойства выполнило бы геттер — а на классе,
который никогда не конструировали, это обычно кончается исключением. Поэтому имена собираются из
_дескрипторов_ свойств, а не чтением:

```ts
const descriptors = Object.getOwnPropertyDescriptors(current);

// дескриптор с `.get` — это аксессор, у него свой путь
Object.keys(descriptors).filter((name) => !descriptors[name]?.get);
```

У аксессоров своя обработка — см.
[спаи на аксессорах](/ru/core/create-spy-from-class#accessor-spies-—-accessorspies).

**Сам мок.** В настоящей версии значение — не голый `vi.fn()`, а `createFunctionSpy(name)`, который
навешивает `calledWith`, `resolveWith`, `nextWith` и прочие
[управляющие хелперы](/ru/core/control-helpers). Шаг сборки при этом не меняется.

**Цена.** Список методов класса за прогон не меняется, но один и тот же класс обычно подменяют спаями заново на
каждый `beforeEach`. Результат обхода кэшируется в `WeakMap` по прототипу, поэтому обход случается один
раз на класс и сильной ссылки на него не держит.

### Следствие: ваш класс не выполняется никогда {#the-consequence-your-class-never-runs}

Библиотека смотрит на класс только снаружи. Экземпляр не создаётся, конструктор не вызывается. Сервис,
которому для конструирования нужны пять зависимостей и живое соединение, подделывается без единого мока
на них.

Обратная сторона: всё, что живёт **на экземпляре**, а не на прототипе, обходу прототипов не видно —
поля-стрелки (`handle = () => {}`), ангуляровские свойства `signal()`, методы ngrx-овского
`signalStore()`. Для них есть `instanceMethodsToSpyOn` (имена перечисляются явно), а когда класса нет
вовсе — только интерфейс — [`createAutoMock<T>()`](/ru/core/auto-mock-by-type), `Proxy`, который чеканит
спай при первом же обращении к ключу.

## Идея вторая — типы читают тип возврата {#idea-two-—-types-read-the-return-type}

**Одной фразой:** TypeScript смотрит, что метод возвращает, и предлагает подходящие к этому хелперы.

```ts
userService.getUser.resolveWith(user); // возвращает Promise    → resolveWith
userService.items$.nextWith([1, 2]); // возвращает Observable → nextWith
userService.getName.calledWith(1).mockReturnValue('Ann'); // обычный → mockReturnValue
```

Рантайма тут нет вообще — одни типы. Инструмент — условный тип:

```ts
type ChooseHelpers<Method> = Method extends (...args: any[]) => Promise<infer P> // возвращает Promise<P>?
  ? { resolveWith(value: P): void; rejectWith(err: unknown): void }
  : Method extends (...args: any[]) => Observable<infer O> // Observable<O>?
    ? { nextWith(value: O): void; complete(): void }
    : { mockReturnValue(value: ReturnType<Method>): void }; // обычный метод
```

Читается как `if / else if / else`: _если метод возвращает Promise — дать ему эти хелперы, иначе если
Observable — эти, а во всех прочих случаях — те._ `infer P` означает «запомнить, чем был параметризован
Promise», поэтому `resolveWith` принимает нужный тип, а не `any`.

Вторая половина раскладывает это по всем ключам класса:

```ts
type Spy<T> = {
  [K in keyof T]: T[K] extends Func
    ? T[K] & ChooseHelpers<T[K]> // метод: он сам плюс его хелперы
    : T[K]; // не метод: не трогаем
};
```

`T[K] & ChooseHelpers<T[K]>` — это пересечение: спай по-прежнему вызывается ровно как исходный
метод **и** несёт на себе управляющие хелперы.

```ts
const service: Spy<UserService> = createSpyFromClass(UserService);

service.getUser.resolveWith(user); // ✅ getUser возвращает Promise<User>
service.getUser.nextWith(user); // ❌ такого хелпера нет — автодополнение его не предложит
```

## Где эти двое встречаются {#where-the-two-meet}

Одна строка, в самом конце `createSpyFromClass`:

```ts
return autoSpy as Spy<T>;
```

В рантайме собрали обычный объект из моков. TypeScript в сборке не участвовал — ему выдают обещание, что
у полученного форма `Spy<T>`.

Это единственное приведение типа в ядре, и оно неустранимо: объект строится из имён, известных только в
рантайме, а `Spy<T>` компилятор вычисляет из типа класса. Проверить друг друга они не могут. Корректность
держится на том, что обход прототипа и маппед-тип смотрят на **один и тот же класс** и потому дают
одинаковый набор ключей.

## Чем является всё остальное в репозитории {#what-the-rest-of-the-repository-is}

Всё прочее — обвязка вокруг этих двух идей:

| Слой                                               | Что делает                                                                                                                                    |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `createFunctionSpy`                                | реализует в рантайме то, что обещают типы: `calledWith`, `resolveWith`, `nextWith`, `mustBeCalledWith`                                        |
| `ArgsMap`                                          | сопоставление аргументов: `calledWith(1, 'a')` разрешается за O(1) через map без прототипа, с веткой предиката для `expect.any(…)` и компании |
| `MockAdapter`                                      | ядро никогда не импортирует тест-раннер напрямую — тот спрятан за интерфейсом, поэтому одна библиотека идёт на Vitest, Bun и `node:test`      |
| `/rxjs`                                            | хелперы для Observable — отдельная точка входа; не импортируете её — и в бандл не попадёт ни байта rxjs                                       |
| `resetAutoSpy`                                     | сбрасывает все спаи объекта одним вызовом (конфиги `calledWith` живут в замыканиях, куда `mockClear` не достаёт)                              |
| `/angular`, `/nestjs`, `/react`, `/vue`, `/svelte` | тонкие обёртки под каждый фреймворк — `provideAutoSpy` для ангуляровского TestBed и так далее                                                 |

## Одно замечание про совместимость {#one-compatibility-note}

API — прямая замена `jest-auto-spies`: миграция сводится к смене импорта, и это касается в том числе
`methodsToSpyOn`, который здесь дополняет список ровно так же, как и там. Ограничение списком — отдельная
опция, `onlyMethodsToSpyOn`, так что совместимое имя не может втихую означать противоположное тому, чего
ждёт перенесённая спека. См. [Миграцию](/ru/migrating).

## Дальше {#next}

- [`createSpyFromClass`](/ru/core/create-spy-from-class) — полный набор настроек
- [Управляющие хелперы](/ru/core/control-helpers) — что на самом деле делают хелперы, выбранные по типу возврата
- [Мост между `Spy<T>` и `T`](/ru/core/spy-typing) — почему `Spy<T>` не присваивается к `T`
- [Автомок по типу](/ru/core/auto-mock-by-type) — когда обходить нечего
