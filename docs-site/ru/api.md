---
title: Справочник API
description: Все экспорты vitest-auto-spy по путям импорта, по одной строке на каждый, со ссылкой на страницу с подробностями.
---

# Справочник API

Здесь собраны все экспорты пакета, по путям импорта. В каждой строке одной фразой сказано, что делает
экспорт, и дана ссылка на страницу с примерами и опциями. Если библиотека вам в новинку, начните с
[введения](/ru/core/introduction); незнакомые слова объяснены в [глоссарии](/ru/glossary).

## Первый пример {#a-first-example}

Соберите из класса объект со [спаями](/ru/glossary), задайте ответ одного метода и проверьте результат.

```ts
import 'vitest-auto-spy/rxjs';

import { expect, it } from 'vitest';
import { createSpyFromClass, expectEmission } from 'vitest-auto-spy';

import { UserService } from './user.service';

it('answers with the user', async () => {
  const users = createSpyFromClass(UserService); // load(id: number): Observable<User>
  users.load.nextWith({ id: 1, name: 'Ada' });

  const user = await expectEmission(users.load(1));

  expect(user).toEqual({ id: 1, name: 'Ada' });
  expect(users.load).toHaveBeenCalledWith(1);
});
```

`createSpyFromClass` берётся из ядра. `nextWith` — [хелпер управления](#control-helpers-by-return-type),
его вызывают на методе-спае. `expectEmission` ждёт первое значение потока.

`import 'vitest-auto-spy/rxjs'` включает `nextWith` и остальные хелперы для Observable. Без него
`nextWith` бросает `Observable spies require rxjs`. Импорт вынесен отдельно, чтобы проекты без rxjs
его не загружали. Поставьте его в начало каждой спеки, где он нужен, или один раз в
[setup-файл](/ru/glossary) (`setupFiles` в конфиге Vitest).

В спеке с Angular `TestBed` спай подставляет `provideAutoSpy`, а `injectSpy` достаёт его обратно с типом
`Spy<UserService>`. Оба берутся из `vitest-auto-spy/angular`:

```ts
import 'vitest-auto-spy/rxjs';

import { TestBed } from '@angular/core/testing';
import { expect, it } from 'vitest';
import { injectSpy, provideAutoSpy, stable } from 'vitest-auto-spy/angular';

import { ProfileComponent } from './profile.component';
import { UserService } from './user.service';

it('loads the user', async () => {
  TestBed.configureTestingModule({
    imports: [ProfileComponent],
    providers: [provideAutoSpy(UserService)],
  });
  const users = injectSpy(UserService);
  users.load.nextWith({ id: 1, name: 'Ada' });

  const fixture = TestBed.createComponent(ProfileComponent);
  await stable(fixture);

  expect(users.load).toHaveBeenCalledTimes(1);
});
```

`stable` ждёт, пока компонент отрисуется, и с zone.js, и без него. Ответ можно задать и прямо в
провайдере: `provideAutoSpy(UserService, { returns: { load: of({ id: 1, name: 'Ada' }) } })`, где `of` берётся из `rxjs`.
Метод в обоих случаях остаётся спаем, так что `nextWith` может поменять ответ позже.

## Какой путь импорта выбрать {#pick-an-import-path}

Каждый путь импорта — это [точка входа](/ru/glossary). Выберите строку своего раннера:

| Вы тестируете на                 | Спаи импортируйте из                                    | Для фреймворка добавьте                                         |
| -------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------- |
| Vitest                           | `vitest-auto-spy`                                       | `/angular`, `/nestjs`, `/vue`, `/react`, `/svelte`              |
| Bun                              | `vitest-auto-spy/bun`                                   | `/bun-angular` для Angular                                      |
| `node:test`                      | `vitest-auto-spy/node`                                  | `/nestjs`                                                       |
| Rstest                           | `vitest-auto-spy/rstest`                                | `/nestjs`                                                       |
| Методы или свойства с Observable | ещё `vitest-auto-spy/rxjs` (см. выше)                   | —                                                               |
| Angular, помимо спаев            | `/angular` и `/angular/matchers`, `/angular/doubles`, … | [другие точки входа Angular](#vitest-auto-spy-angular-matchers) |

На Bun, `node:test` и Rstest импортируйте точку входа раннера раньше любого другого импорта из
`vitest-auto-spy`: чья мок-функция достанется спаям, решает первая импортированная точка входа. На
Vitest порядок не важен.

Откуда можно импортировать `createSpyFromClass` и другие фабрики ядра:

- **Ещё из этих точек входа:** `/bun`, `/node`, `/rstest`, `/react`, `/svelte`, `/vue`, `/bun-angular`.
  В них есть всё, что экспортирует `vitest-auto-spy`, поэтому хватает одной строки импорта.
- **Ни из какой другой точки входа**, включая `/angular` и `/nestjs`. Спеке, которая берёт `provideAutoSpy` из
  `/angular`, импорт `vitest-auto-spy` не нужен. Если спека ещё и вызывает `createSpyFromClass`, строк
  импорта будет две. Кое-что из ядра `/angular` всё же реэкспортирует: тип `Spy<T>`, хелперы
  `mock*Prop` и проверки Observable.

## `vitest-auto-spy` {#vitest-auto-spy}

Ядро. Импорт подключает спаи к мок-функции Vitest ([адаптер раннера](/ru/glossary)).

### Собрать спай или подмену {#build-a-spy-or-a-double}

| Экспорт                                             | Что делает                                                                                               | Где подробно                                                                                                            |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `createSpyFromClass(Class, methodsOrConfig?)`       | Собирает типизированный `Spy<T>`: каждый метод класса становится спаем                                   | [Спаи из класса](/ru/core/create-spy-from-class)                                                                        |
| `createSpyFromInstance(instance, methodsOrConfig?)` | Превращает в спаи методы уже существующего объекта, прямо на нём                                         | [Спаи на живом объекте](/ru/core/create-spy-from-class#passthrough)                                                     |
| `restoreSpiedInstance(instance)`                    | Возвращает этому объекту настоящие методы                                                                | там же                                                                                                                  |
| `spyOnOwnMethod(instance, method)`                  | Записывает вызовы одного метода тестируемого объекта и по-прежнему вызывает настоящий; замена `vi.spyOn` | [Один метод](/ru/core/create-spy-from-class#spy-on-own-method)                                                          |
| `spyOnVoidMethod(target, method)`                   | Записывает вызовы одного нативного void-метода (`preventDefault`, `focus`) без броска строгого режима    | [Спаи из класса](/ru/core/create-spy-from-class)                                                                        |
| `createAutoMock<T>(overrides?, config?)`            | Собирает `Spy<T>` по типу или интерфейсу, без класса                                                     | [По типу](/ru/core/auto-mock-by-type#from-a-type-—-createautomock)                                                      |
| `autoMocked<T>(overrides?, config?)`                | То же, но с типом сразу `T` и `Spy<T>`, для `let`, который задают в `beforeEach`                         | [Один объект, два типа](/ru/core/auto-mock-by-type#automocked-—-one-object-typed-as-both-t-and-spy-t)                   |
| `createMock<T>(partial?)`                           | Собирает обычный `T` без спаев — для данных, а не для зависимостей                                       | [По типу, без спаев](/ru/core/auto-mock-by-type#from-a-type-without-spies-—-createmock)                                 |
| `mockDeep<T>(overrides?, options?)`                 | Подмена, где `a.b.c` — спай на любой глубине, без настройки                                              | [Глубокие подмены](/ru/core/auto-mock-by-type#recursive-deep-mocks-—-mockdeep)                                          |
| `createFunctionSpy(name, unstubbed?)`               | Один отдельный спай-функция со всеми хелперами; тип — `FunctionSpy<Fn>`                                  | [Одна функция](/ru/core/create-spy-from-class#a-single-function-—-createfunctionspy)                                    |
| `createSpyClass(Class, config?, options?)`          | Спай, который можно вызвать через `new`; записывает `calls` и `instances`                                | [Вызов через `new`](/ru/core/spy-typing#a-spy-you-can-call-with-new)                                                    |
| `mockConstructor(factory, name?)`                   | Подмена конструктора для класса, который тестируемый код создаёт через `new`                             | [Подмены конструкторов](/ru/utilities/constructor-doubles)                                                              |
| `stubConstructor(target, property, factory)`        | Ставит такую подмену вместо глобального или модульного класса и снимает её после теста                   | там же                                                                                                                  |
| `registerAutoSpyDefaults(Class, config)`            | Один раз регистрирует обычную настройку класса; с неё начинается каждый спай этого класса                | [Настройка по умолчанию](/ru/core/create-spy-from-class#registerautospydefaults-—-the-composition-lives-with-the-class) |
| `clearAutoSpyDefaults(Class?)`                      | Снимает одну регистрацию или все сразу                                                                   | там же                                                                                                                  |
| `clearAutoSpy(spy)`                                 | Очищает записанные вызовы у всех спаев объекта; заданные ответы остаются                                 | [Сброс](/ru/core/control-helpers#resetting-spies-—-clearautospy-resetautospy)                                           |
| `resetAutoSpy(spy)`                                 | Очищает и вызовы, и настройку, как `vi.resetAllMocks()`                                                  | там же                                                                                                                  |

### Хелперы управления по типу возврата {#control-helpers-by-return-type}

Спай метода получает те хелперы, которые допускает его тип возврата. Это методы самого спая
(`users.load.nextWith(...)`), а не отдельные экспорты. Хелперы для Observable работают после
`import 'vitest-auto-spy/rxjs'`.

| Метод                      | Хелперы                                                                                                        | Где подробно                                                                             |
| -------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| возвращает значение        | `mockReturnValue` и родной API моков раннера, `calledWith(...)`, `mustBeCalledWith(...)`, `once()`, `times(n)` | [Синхронные методы](/ru/core/control-helpers#synchronous-methods)                        |
| любой метод                | `failWith(error)`: бросает на каждом вызове или только для аргументов цепочки `calledWith`                     | [Бросить ошибку](/ru/core/control-helpers#making-a-call-throw-—-failwith)                |
| возвращает `Promise<T>`    | `resolveWith`, `rejectWith`, `resolveWithPerCall`; исходы попадают в `mock.settledResults`                     | [Методы с Promise](/ru/core/control-helpers#promise-returning-methods-—-resolvewith)     |
| возвращает `Observable<T>` | `nextWith`, `nextOneTimeWith`, `nextWithValues`, `nextWithPerCall`, `throwWith`, `complete`, `returnSubject`   | [Методы с Observable](/ru/core/control-helpers#observable-methods-properties-—-nextwith) |

`calledWith` принимает
асимметричные матчеры вроде `expect.any(Number)` на любой глубине; см.
[что считается тем же аргументом](/ru/core/control-helpers#what-counts-as-the-same-argument).

### Свойства {#properties}

| Экспорт                                            | Что делает                                                                   | Где подробно                                                                                                   |
| -------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `mockReadonlyProp(object, property, value)`        | Задаёт `readonly`-свойство на один тест                                      | [Подмена свойств](/ru/adapters/angular#signal-readonly-property-mocking)                                       |
| `mockReadonlyPropGetter(object, property, getter)` | То же, через функцию-геттер                                                  | там же                                                                                                         |
| `mockValueProp(object, property, value)`           | Задаёт записываемое свойство на один тест                                    | [Записываемые свойства](/ru/core/spy-typing#readonly-survives-onto-the-double-and-mockvalueprop-is-the-answer) |
| `mockAccessorsProp(object, property, accessors?)`  | Подменяет пару геттер и сеттер                                               | [Подмена свойств](/ru/adapters/angular#signal-readonly-property-mocking)                                       |
| `restoreMockedProps()`                             | Откатывает все патчи `mock*Prop` (и заглушки, которые с ними регистрируются) | [Гигиена прогона](/ru/utilities/setup)                                                                         |
| `countMockedProps()`                               | Сколько патчей ещё стоит                                                     | там же                                                                                                         |
| `reportPropsOutsideHooks(reaction)`                | Сообщает о патче вне теста или хука, без `setupAutoSpy`                      | там же                                                                                                         |

### Проверки Observable {#observable-assertions}

Каждая сама подписывается на поток и падает с понятным сообщением, если поток молчит.

| Экспорт                                     | Что делает                                                | Где подробно                                                                                              |
| ------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `expectEmission(source$, options?)`         | Ждёт одно значение и возвращает его                       | [Проверки Observable](/ru/core/observable-assertions)                                                     |
| `expectEmissions(source$, count, options?)` | Ждёт `count` значений и возвращает их                     | там же                                                                                                    |
| `expectAllEmissions(source$, options?)`     | Возвращает все значения, когда поток завершится           | там же                                                                                                    |
| `expectNoEmission(source$, options?)`       | Проходит, если за время ожидания ничего не пришло         | там же                                                                                                    |
| `expectNoEmissionSync(source$, options?)`   | Та же проверка, но без `await`                            | [Тишина без await](/ru/core/observable-assertions#expectnoemissionsync-—-silence-in-a-spec-with-no-await) |
| `expectCompletion(source$, options?)`       | Проходит, если поток завершился, со значением или без     | [Проверка завершения](/ru/core/observable-assertions#expectcompletion-—-when-the-value-is-not-the-point)  |
| `expectError(source$, options?)`            | Проходит, если поток упал с ошибкой, и возвращает её      | [Проверка ошибки](/ru/core/observable-assertions#expecterror-—-when-the-failure-is-the-subject)           |
| `setEmissionTimeout(milliseconds)`          | Меняет время ожидания по умолчанию для всех этих проверок | [Проверки Observable](/ru/core/observable-assertions)                                                     |

### Типизация, фикстуры и аргументы {#typing-fixtures-and-arguments}

| Экспорт                                  | Что делает                                                                                                                            | Где подробно                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `asInstance(spy)` / `asSpy(instance)`    | Показывает `Spy<T>` как `T` или `T` как `Spy<T>` вместо `as any`                                                                      | [Типизация спаев](/ru/core/spy-typing)                                               |
| `asInstances(...spies)`                  | `asInstance` для целого списка аргументов                                                                                             | [Список аргументов](/ru/core/spy-typing#asinstances-—-a-whole-argument-list-at-once) |
| `innerDouble(double, method)`            | Спай, которым отвечает метод из `returnsClass`, без вызова этого метода                                                               | [`returnsClass`](/ru/core/create-spy-from-class#returns-class)                       |
| `outOfType<T>(value)`                    | Намеренно чужое для `T` значение (`null`, который шлёт бэкенд), с типом `T`                                                           | [Типизация спаев](/ru/core/spy-typing)                                               |
| `createFixture<T>(defaults, overrides?)` | Свежий `T` из полного значения по умолчанию и правок этого теста                                                                      | [Фикстуры](/ru/utilities/fixtures)                                                   |
| `createFixtureFactory<T>(defaults)`      | Возвращает `(overrides?) => T` поверх одного значения по умолчанию                                                                    | там же                                                                               |
| `withOverrides(model, overrides?)`       | Фикстура из экземпляра модели; её геттеры читаются один раз, как данные                                                               | там же                                                                               |
| `narrow(value, predicate)`               | Ветка объединения, которую ждёт тест; при промахе показывает настоящую форму; есть `.byKey`, `.defined`, `.observable`, `.instanceOf` | там же                                                                               |
| `captureArg<T>(options?)`                | Ловит аргумент, который собрал тестируемый код, чтобы проверить его потом                                                             | [Рецепты](/ru/recipes#an-argument-the-spec-cannot-spell)                             |
| `createLog<T>()`                         | Один журнал порядка вызовов, в который пишут несколько зависимостей                                                                   | [Журнал вызовов](/ru/utilities/call-log)                                             |

### Модули и цикл событий {#modules-and-the-event-loop}

| Экспорт                                 | Что делает                                                                  | Где подробно                               |
| --------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------ |
| `assertMocked(namespace, options?)`     | Падает, если `vi.mock()`, на который рассчитывает спека, не сработал        | [Моки модулей](/ru/utilities/module-mocks) |
| `moduleNamespace(exports, options?)`    | Объект, который должна вернуть фабрика `vi.mock` (`default` + `__esModule`) | там же                                     |
| `adoptMock(mock, options?)`             | Превращает мок раннера из фабрики `vi.mock` в типизированный спай-функцию   | там же                                     |
| `flushEventLoop(turns?)`                | Прокручивает настоящие обороты цикла событий, даже под фейковыми таймерами  | [Цикл событий](/ru/utilities/event-loop)   |
| `flushEventLoopUntil(isDone, options?)` | Крутит обороты, пока условие не выполнится, с лимитом вместо зависания      | там же                                     |
| `settleDynamicImport(load, turns?)`     | Дожидается `import()`, который запустил тестируемый код                     | там же                                     |

### Диагностика в ядре {#diagnostics-in-the-core}

| Экспорт                                            | Что делает                                                                        | Где подробно                                                                          |
| -------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `errorHandler`                                     | Объект, чей `throwArgumentsError` собирает сообщение о провале `mustBeCalledWith` | [Хелперы управления](/ru/core/control-helpers#what-a-mustbecalledwith-failure-prints) |
| `describeDuplicateCopies()` / `getPackageCopies()` | Называют копии этого пакета, загруженные в один процесс                           | [Гигиена прогона](/ru/utilities/setup)                                                |

## Точки входа раннеров {#runner-entry-points}

Они реэкспортируют всё ядро и регистрируют адаптер своего раннера вместо адаптера Vitest.

| Импорт                   | Что добавляет                                                                                                             | Где подробно                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `vitest-auto-spy/bun`    | `createNestUnit` (из `/nestjs`)                                                                                           | [Bun](/ru/runtimes/bun)                         |
| `vitest-auto-spy/node`   | `createNestUnit`; `trackNodeMocks()`, `pruneNodeMocks()`, `countNodeMocks()` освобождают спаи, которые держит `node:test` | [`node:test`](/ru/runtimes/node#tracknodemocks) |
| `vitest-auto-spy/rstest` | ничего                                                                                                                    | [Rstest](/ru/runtimes/rstest)                   |
| `vitest-auto-spy/react`  | ничего; те же экспорты, что у `vitest-auto-spy`, под именем для React                                                     | [React](/ru/adapters/react)                     |
| `vitest-auto-spy/svelte` | ничего; то же самое под именем для Svelte                                                                                 | [Svelte](/ru/adapters/svelte)                   |
| `vitest-auto-spy/vue`    | `provideAutoSpy` для `global.provide` и спаи сторов Pinia                                                                 | [Vue](/ru/adapters/vue)                         |

## `vitest-auto-spy/rxjs` {#vitest-auto-spy-rxjs}

Импортируйте его в каждой спеке, где он нужен, или один раз в setup-файле. Импорт включает хелперы для Observable и
`observablePropsToSpyOn`, а в типах превращает результат `returnSubject()` в `Subject<T>` из rxjs.

| Экспорт                                         | Что делает                                  | Где подробно                                            |
| ----------------------------------------------- | ------------------------------------------- | ------------------------------------------------------- |
| `createObservableWithValues(configs, options?)` | Собирает Observable из списка `ValueConfig` | [rxjs](/ru/runtimes/rxjs#standalone-observable-builder) |

## `vitest-auto-spy/angular` {#vitest-auto-spy-angular}

Хелперы для Angular `TestBed` на Vitest. Импорт `import { … } from 'vitest-auto-spy'` рядом с ним не нужен;
`import 'vitest-auto-spy/rxjs'` для `nextWith` всё равно нужен. Обычная спека
импортирует
`import { injectSpy, provideAutoSpy, type Spy } from 'vitest-auto-spy/angular';`.

| Экспорт                                                                                                                                 | Что делает                                                                                                        | Где подробно                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `provideAutoSpy(Class, methodsOrConfig?)`                                                                                               | Провайдер `TestBed`, который выдаёт спай вместо сервиса                                                           | [Подменить сервис](/ru/adapters/angular#replace-a-service-provideautospy-and-injectspy)                                 |
| `injectSpy(token)`                                                                                                                      | Получает этот спай из `TestBed` с типом `Spy<T>`                                                                  | там же                                                                                                                  |
| `provideAutoSpyForToken(token, overrides?, config?)`                                                                                    | То же для `InjectionToken`; спай собирается по типу токена                                                        | [Токены](/ru/adapters/angular#a-dependency-behind-an-injectiontoken)                                                    |
| `registerAutoSpyDefaults` / `clearAutoSpyDefaults`                                                                                      | Регистрация из ядра, которая принимает и `InjectionToken`                                                         | [Настройка по умолчанию](/ru/core/create-spy-from-class#registerautospydefaults-—-the-composition-lives-with-the-class) |
| `extendWithAutoSpies(test, spec, options?)`                                                                                             | Типизированные фикстуры `test` для набора зависимостей (Vitest 4.1+)                                              | [Фикстуры теста](/ru/adapters/angular#fixtures-instead-of-let-beforeeach-—-extendwithautospies)                         |
| `createWithAutoSpies(Class, options?)`                                                                                                  | Создаёт класс через DI, подменяя спаями все зависимости без провайдера                                            | [Зависимости-спаи](/ru/adapters/angular#building-a-class-with-auto-spied-dependencies)                                  |
| `renderShallow(Component, options?)`                                                                                                    | Рендерит компонент без дочерних компонентов ([поверхностный рендер](/ru/glossary))                                | [Поверхностный рендер](/ru/adapters/angular#shallow-component-rendering)                                                |
| `prepareShallow(Component, options?)`                                                                                                   | `renderShallow` с общими для всех тестов опциями; `.create(overrides?)` в каждом тесте                            | [Общие опции рендера](/ru/adapters/angular#the-same-options-in-every-test-—-prepareshallow)                             |
| `createComponentStub(Class, overrides?, options?)`                                                                                      | Standalone-заглушка дочернего компонента, директивы или пайпа                                                     | [Заглушка дочернего компонента](/ru/adapters/angular#a-stand-in-for-a-child-createcomponentstub)                        |
| `createDirectiveHost(options)`                                                                                                          | Standalone-хост для тестируемой директивы                                                                         | [Хост директивы](/ru/adapters/angular#a-host-for-a-directive-under-test)                                                |
| `setInputs(fixture, inputs, options?)`                                                                                                  | Задаёт инпуты по алиасу или имени поля и ждёт стабильности фикстуры                                               | [Смена инпута](/ru/adapters/angular#changing-an-input-mid-test)                                                         |
| `hostElement(fixture, Type?)` / `queryElement(fixture, selector, Type?)`                                                                | Элемент-хост или найденный элемент, типизированный и проверенный через `instanceof`                               | [Типизированные элементы](/ru/adapters/angular#typed-elements-under-a-strict-lint)                                      |
| `stable(fixture, options?)` / `flushEffects()`                                                                                          | Ждёт компонент: прогоняет эффекты и ждёт, пока у фикстуры не останется незавершённой работы; с zone.js и без него | [Ожидание в zoneless](/ru/adapters/angular#zoneless-waiting)                                                            |
| `settleResource(resource, options?)`                                                                                                    | Ждёт, пока `resource()` или `httpResource()` выйдет из `loading`                                                  | [Ресурсы](/ru/adapters/angular#resources-httpresource-and-resource)                                                     |
| `mockResourceProp(object, property, initial, options?)`                                                                                 | Подменяет свойство-ресурс подменой `ResourceRef`, которой управляет спека                                         | [Ресурс без запроса](/ru/adapters/angular#skipping-the-request-entirely-—-mockresourceprop)                             |
| `mockSignalProp(object, property, initial)`                                                                                             | Управляет свойством-сигналом через настоящий записываемый сигнал                                                  | [Управление сигналом](/ru/adapters/angular#driving-a-signal)                                                            |
| `mockSignalProps(object, values)`                                                                                                       | Задаёт несколько сигналов подмены стора одним вызовом                                                             | там же                                                                                                                  |
| `runEffect(effectRef)`                                                                                                                  | Выполняет тело одного `effect()` прямо сейчас                                                                     | [Один эффект](/ru/adapters/angular#running-one-effect-on-demand)                                                        |
| `trackRecomputations(signal)` / `trackEffectRuns(effectRef)`                                                                            | Считает пересчёты `computed()` или запуски `effect()`                                                             | [Подсчёт запусков](/ru/adapters/angular#counting-recomputations-and-effect-runs)                                        |
| `overrideAutoSpy(Class, methodsOrConfig?)`                                                                                              | Подменяет провайдер во всём `TestBed`, включая провайдеры компонентов                                             | [Переопределения](/ru/adapters/angular-overrides)                                                                       |
| `overrideComponentProvider(Component, Class, methodsOrConfig?)`                                                                         | Подменяет провайдер, который компонент объявил для себя                                                           | там же                                                                                                                  |
| `assertNgModuleScopes(...modules)` / `assertComponentDefIntact(...components)`                                                          | Проверяют, что определение модуля или компонента пережило компиляцию                                              | там же                                                                                                                  |
| `trackInjections(tokens, options?)`                                                                                                     | Записывает, какие зависимости тестируемый код запросил у DI                                                       | [Отслеживание инъекций](/ru/utilities/track-injections)                                                                 |
| `setupAngularTestEnv(options)`                                                                                                          | Запускает zone- и zoneless-спеки в одном воркере                                                                  | [Zone и zoneless вместе](/ru/adapters/angular#zone-and-zoneless-in-the-same-run)                                        |
| `Spy`, хелперы `mock*Prop`, `restoreMockedProps`, `countMockedProps`, семейство `expect*Emission*`, `expectError`, `setEmissionTimeout` | Реэкспорт из ядра                                                                                                 | [Ядро](#vitest-auto-spy)                                                                                                |

## `vitest-auto-spy/angular/matchers` {#vitest-auto-spy-angular-matchers}

Только Vitest. Вызовите каждую регистрацию один раз в [setup-файле](/ru/glossary). Ядро не реэкспортирует.

| Экспорт                            | Добавляет матчер                                                              | Где подробно                                                    |
| ---------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `registerSignalMatchers(options?)` | `toHaveSignalValue(value)`; `{ strict: true }` сравнивает как `toStrictEqual` | [Проверка сигнала](/ru/adapters/angular#asserting-a-signal)     |
| `registerResourceMatchers()`       | `toBeLoading`, `toHaveResourceValue`, `toHaveResourceError`                   | [Проверка ресурса](/ru/adapters/angular#asserting-a-resource)   |
| `registerDirectiveMatchers()`      | `toHaveDirectiveApplied(Directive, selector?)` на фикстуре                    | [Матчер директивы](/ru/adapters/angular#tohavedirectiveapplied) |

## `vitest-auto-spy/angular/doubles` {#vitest-auto-spy-angular-doubles}

Готовые подмены сервисов Angular и Material. Регистрирует адаптер Vitest; ядро не реэкспортирует.
`@angular/material` и `@angular/cdk` не становятся зависимостями: их классы вы передаёте сами.

| Экспорт                                                                                                                    | Что делает                                                                     | Где подробно                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `provideWindowDouble(token, overrides?)` / `createWindowDouble(overrides?)`                                                | `window` с вашими правками поверх настоящего; `create*` работает без `TestBed` | [Window и document](/ru/adapters/angular#window-and-document-without-losing-the-real-one)                     |
| `provideDocumentDouble(overrides?, token?)` / `createDocumentDouble(overrides?)`                                           | То же для `document`                                                           | там же                                                                                                        |
| `provideMatDialogData(token, data)`                                                                                        | Данные диалога для DI с типом по токену                                        | [Диалог Material](/ru/adapters/angular#the-material-dialog-without-material-as-a-dependency)                  |
| `provideMatDialogRef(RefClass, init?)` / `injectMatDialogRef(RefClass, injector?)` / `createMatDialogRef(RefClass, init?)` | Ссылка на диалог: спай `close`, `emitClose(result?)`, `afterClosed()`          | там же                                                                                                        |
| `providePlatform(platform, flags?)`                                                                                        | `PLATFORM_ID` и ваши флаги платформы, согласованные между собой                | [Платформа и другие подмены](/ru/adapters/angular#platform-sanitizer-change-detector-and-cdk-overlay-doubles) |
| `provideDomSanitizerDouble()` / `createDomSanitizerDouble()`                                                               | `DomSanitizer`, чьи bypass-спаи возвращают настоящие безопасные значения       | там же                                                                                                        |
| `provideChangeDetectorRefDouble()` / `createChangeDetectorRefDouble()`                                                     | `ChangeDetectorRef` из четырёх спаев                                           | там же                                                                                                        |
| `provideOverlayDouble(Overlay, init?)` / `injectOverlayDouble(Overlay, injector?)` / `createOverlayDouble(Overlay, init?)` | CDK `Overlay`, чьими ссылками можно управлять                                  | там же                                                                                                        |

## `vitest-auto-spy/angular/diagnostics` {#vitest-auto-spy-angular-diagnostics}

Только Vitest. Ядро не реэкспортирует и адаптер не регистрирует.

| Экспорт                                                                                             | Что делает                                                       | Где подробно                                                                                          |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `enableAngularDiagnostics(options?)` / `disableAngularDiagnostics()`                                | Превращает пять тихих ошибок в `TestBed` в падающие тесты        | [Диагностика Angular](/ru/adapters/angular-diagnostics)                                               |
| `assertNoPendingRequests(options?)`                                                                 | Падает на HTTP-запросах, на которые никто не ответил             | [Запросы без ответа](/ru/adapters/angular-diagnostics#assertnopendingrequests)                        |
| `assertNoShadowedProviders(component, fixture)`                                                     | Падает, если собственные провайдеры компонента прячут ваш спай   | [Спрятанные провайдеры](/ru/adapters/angular-diagnostics#assertnoshadowedproviders-component-fixture) |
| `enableTestBedDiagnostics(options?)` / `disableTestBedDiagnostics()`                                | Показывает, сколько времени каждого файла спек ушло на `TestBed` | [Куда уходит время спеки](/ru/adapters/angular#where-a-spec-spends-its-time)                          |
| `instrumentTestBed()`, `getTestBedTiming()`, `formatSpecTiming(timing)`, `reportSpecTiming(timing)` | Части этого отчёта, для своего репортера                         | там же                                                                                                |

## `vitest-auto-spy/angular-http` {#vitest-auto-spy-angular-http}

`HttpClient` и `httpResource()` в спеке. Нужен `@angular/common`. Ядро не реэкспортирует.

| Экспорт                               | Что делает                                                                     | Где подробно                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `provideHttpTesting(options?)`        | HTTP-клиент и тестовый бэкенд одним провайдером, с проверкой при завершении    | [Настройка HTTP](/ru/adapters/angular-http#providehttptesting)                         |
| `expectRequest(matcher, options?)`    | Находит единственный подходящий запрос и отвечает на него, дожидаясь обработки | [Ответ на запрос](/ru/adapters/angular-http#expectrequest-matcher-options)             |
| `expectNoRequest(matcher?, options?)` | Проверяет, что подходящего запроса не было                                     | [Проверка, что запроса нет](/ru/adapters/angular-http#expectnorequest-matcher-options) |
| `verifyNoPendingRequests(options?)`   | Проверяет, что ни один запрос не остался без ответа                            | [Все запросы отвечены](/ru/adapters/angular-http#verifynopendingrequests-options)      |
| `injectHttpTesting()`                 | `HttpTestingController` для `expectOne` и похожих вызовов                      | [Контроллер HTTP-тестов](/ru/adapters/angular-http#injecthttptesting)                  |

## `vitest-auto-spy/angular-router` {#vitest-auto-spy-angular-router}

Подмены роутера. Нужен `@angular/router`. Ядро не реэкспортирует.

| Экспорт                                                                                  | Что делает                                                                 | Где подробно                                                              |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `provideActivatedRoute(init?)`                                                           | Настоящий `ActivatedRoute`, чьи потоки и снимок собраны из одной записи    | [Роутер Angular](/ru/adapters/angular-router)                             |
| `injectActivatedRoute(injector?)` / `createActivatedRoute(init?)`                        | Его хэндл: сеттеры двигают потоки и снимок вместе                          | там же                                                                    |
| `provideRouterDouble(init?)`                                                             | `Router` на одном URL; `navigate` и `navigateByUrl` — спаи                 | [Подмена роутера](/ru/adapters/angular-router#the-router-double)          |
| `injectRouterDouble(injector?)` / `createRouterDouble(init?)`                            | Его хэндл: `setUrl`, `emitNavigation`, `setCurrentNavigation`              | там же                                                                    |
| `collectRouterEvents(events)`                                                            | Записывает события роутера парами «класс и URL» для проверки в одну строку | [События роутера](/ru/adapters/angular-router#collectrouterevents-events) |
| `provideLocationDouble()` / `injectLocationDouble(injector?)` / `createLocationDouble()` | `SpyLocation` и `MockLocationStrategy` из Angular одним вызовом            | [Подмена Location](/ru/adapters/angular-router#the-location-double)       |

## `vitest-auto-spy/signal-forms` {#vitest-auto-spy-signal-forms}

Сигнальные формы Angular. Нужны `@angular/forms` и Angular 22. Ядро не реэкспортирует.

| Экспорт                                | Что делает                                                          | Где подробно                                  |
| -------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------- |
| `createForm(model, schema?, options?)` | `form()` из Angular, созданная в контексте внедрения `TestBed`      | [Сигнальные формы](/ru/adapters/signal-forms) |
| `registerFormMatchers()`               | Добавляет `toHaveFieldErrors(['required'])`: весь набор ошибок поля | там же                                        |

## `vitest-auto-spy/bun-angular` {#vitest-auto-spy-bun-angular}

Angular `TestBed` под `bun test`. Реэкспортирует `/bun` (всё ядро) и большую часть `/angular`:
`provideAutoSpy`, `injectSpy`, `renderShallow`, `prepareShallow`, `setInputs`, `hostElement`,
`queryElement`, `createWithAutoSpies`, `stable`, `flushEffects`, `settleResource`, `runEffect`,
`trackRecomputations`, `trackEffectRuns`. Не входят: матчеры, диагностика и хелперы `mock*Prop`.
См. [Bun + Angular](/ru/runtimes/bun-angular).

| Экспорт                                                                       | Что делает                                                                     |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `registerDomGlobals(options?)`                                                | Ставит DOM в рантайм, где его нет; возвращает использованный регистратор       |
| `createJsdomRegistrar(options)` / `createGlobalRegistratorRegistrar(options)` | Две стратегии DOM, которые он пробует, — для своего preload-файла              |
| `copyWindowGlobals(source, target)`                                           | Копирует свойства window на глобальный объект, не трогая встроенные в рантайм  |
| `inlineAngularResources(source, path, options?)`                              | Переписывает `templateUrl` и `styleUrl(s)` во встроенные `template` и `styles` |

## `vitest-auto-spy/nestjs` {#vitest-auto-spy-nestjs}

Хелперы для `Test.createTestingModule` в NestJS. Работает на любом раннере: берёт адаптер, который
зарегистрировала точка входа раннера, а на Vitest собирает его из `vi`. Ядро не реэкспортирует.

| Экспорт                                   | Что делает                                                               | Где подробно                                                            |
| ----------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `provideAutoSpy(Class, methodsOrConfig?)` | Провайдер `{ provide, useValue }` со спаем                               | [NestJS](/ru/adapters/nestjs)                                           |
| `injectSpy(moduleRef, token)`             | Получает этот спай из тестового модуля с типом `Spy<T>`                  | там же                                                                  |
| `createNestUnit(Class, options?)`         | Собирает провайдер по его DI-метаданным, подменяя спаями все зависимости | [Сборка юнита](/ru/adapters/nestjs#building-the-unit-from-its-metadata) |
| `trackInjections(tokens, options?)`       | Записывает, какие зависимости код запросил у DI                          | [Отслеживание инъекций](/ru/utilities/track-injections)                 |

## `vitest-auto-spy/setup` {#vitest-auto-spy-setup}

Порядок во всём прогоне одним вызовом, плюс таймеры и сеть. `setupAutoSpy()` ставят в setup-файл.

| Экспорт                                                                                                                                                                            | Что делает                                                                                              | Где подробно                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `setupAutoSpy(options?)`                                                                                                                                                           | Одним вызовом включает откат свойств, защиту от утечек и общий `strict`                                 | [Гигиена прогона](/ru/utilities/setup)                                          |
| `takeStrictViolations()`                                                                                                                                                           | Забирает броски строгого режима, которые тест вызвал намеренно                                          | [Строгий режим](/ru/core/strict-mode)                                           |
| `setupFakeTimers(config?, options?)` / `advanceTimers(ms?)`                                                                                                                        | Ставит фейковые таймеры с парным откатом; двигает время и доводит микрозадачи                           | [Фейковые таймеры](/ru/utilities/fake-timers)                                   |
| `withFakeTimers(fn, config?)`                                                                                                                                                      | Выполняет одно тело на фейковых таймерах                                                                | там же                                                                          |
| `mockSystemTime(time)` / `withSystemTime(time, body)` / `mockNow(source)` / `useCountingClock(options?)`                                                                           | Управляют тем, что говорит `Date`                                                                       | [Часы](/ru/utilities/event-loop#the-clock)                                      |
| `restoreTimerGlobals()` / `getWatchedTimerGlobals()`                                                                                                                               | Возвращает глобальные таймеры, удалённые фейками / называет отслеживаемые                               | [Гигиена прогона](/ru/utilities/setup)                                          |
| `blockNetwork(options?)`                                                                                                                                                           | Закрывает `fetch`, XHR и `sendBeacon` и называет, что запросили                                         | там же                                                                          |
| `stubResponse(init?)`                                                                                                                                                              | Настоящий `Response` для заглушённого `fetch`, без приведения типа                                      | [Ответ для fetch](/ru/utilities/setup#answering-a-stubbed-fetch-—-stubresponse) |
| `BLOCKED_FETCH_MESSAGE` / `BLOCKED_XHR_MESSAGE`                                                                                                                                    | Неизменное начало сообщения об отклонённом запросе, для сравнения                                       | [Гигиена прогона](/ru/utilities/setup)                                          |
| `trackStrayTimers(host?, options?)`, `countStrayTimers`, `cancelStrayTimers`, `describeStrayTimers`                                                                                | Находят и отменяют таймеры, пережившие свой файл                                                        | там же                                                                          |
| `withoutStrayTimerTracking(work, host?)`                                                                                                                                           | Выполняет подготовку, таймеры которой трекер должен пропустить                                          | там же                                                                          |
| `flushUnhandledObservableErrors(host?)` / `expectUnhandledObservableErrors(expected?, host?)`                                                                                      | Показывают ошибки Observable, которые никто не обработал                                                | там же                                                                          |
| `trackStrayRejections`, `countStrayRejections`, `flushStrayRejections`                                                                                                             | Достают отклонения промисов, которые проглотил zone.js                                                  | там же                                                                          |
| `trackStrayListeners`, `baselineStrayListeners`, `countStrayListeners`, `describeStrayListeners`, `removeStrayListeners`                                                           | Находят и снимают слушатели `window` и `document`, оставленные файлом                                   | там же                                                                          |
| `captureGlobalBaseline(host?)` / `restoreGlobals(host?)`                                                                                                                           | Один снимок `globalThis`; на границе файла возвращает каждую изменённую глобаль                         | там же                                                                          |
| `guardGlobalPatches(reaction)`                                                                                                                                                     | Называет тест, который сделал глобальное свойство неконфигурируемым                                     | там же                                                                          |
| `guardPrototypePollution(reaction)`                                                                                                                                                | Называет и убирает ключ, оставленный на `Object.prototype`                                              | там же                                                                          |
| `guardDocumentPollution(option)`                                                                                                                                                   | Называет и убирает атрибут, оставленный на `<html>`, `<head>` или `<body>`                              | там же                                                                          |
| `guardStrayConsole(option)`                                                                                                                                                        | Роняет тест, который написал в консоль и не забрал вывод                                                | там же                                                                          |
| `restoreWebStorage(options?)` / `restoreStorageSpies()`                                                                                                                            | Рабочие `localStorage` / `sessionStorage`; снимает спаи, которые не снимает `mockRestore()`             | там же                                                                          |
| `installPerTest(install)`                                                                                                                                                          | Заново ставит заглушку перед каждым тестом и возвращает текущий хэндл                                   | там же                                                                          |
| `trackMockRegistry()`, `keepMockRegistered(mock)`, `keepRegisteredMocks()`, `pruneMockRegistry()`, `getMockRegistrySize()`, `captureMockRegistry()`, `resetMockRegistryTracking()` | Оставляют в реестре моков Vitest только моки, которые живут дольше файла                                | там же                                                                          |
| `restoreLongLivedImplementations()`                                                                                                                                                | Возвращает реализацию, которую снял `vi.resetAllMocks()` из другого файла                               | там же                                                                          |
| `setSpyEngine(engine)` / `getSpyEngine()`                                                                                                                                          | Спаи методов из собственного мока библиотеки (`'auto-spy'`, по умолчанию) или из `vi.fn()` (`'runner'`) | [Движок спаев](/ru/core/performance#the-spy-engine)                             |
| `registerFocusMatchers()`                                                                                                                                                          | Добавляет `toHaveFocus()`, который говорит, почему фокус не там                                         | [Проверка фокуса](/ru/adapters/angular#focus-assertions)                        |
| `isAngularUnitTestBuilder()`                                                                                                                                                       | Говорит, идёт ли прогон под билдером unit-test Angular                                                  | [Гигиена прогона](/ru/utilities/setup)                                          |
| `describeDuplicateCopies()` / `getPackageCopies()`                                                                                                                                 | Реэкспорт из ядра                                                                                       | [Ядро](#diagnostics-in-the-core)                                                |

## `vitest-auto-spy/dom-stubs` {#vitest-auto-spy-dom-stubs}

Заглушки браузерных API, которые тестируемый код создаёт сам. Регистрирует адаптер Vitest, только если
этого не сделала точка входа раннера. Заглушки снимает `restoreMockedProps()`.

| Экспорт                                                                                                                                | Что делает                                                     | Где подробно                                               |
| -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------- |
| `stubIntersectionObserver(options?)`, `stubResizeObserver(options?)`, `stubMutationObserver(options?)`, `stubObserver(name, options?)` | Подменяют глобальный observer тем, которым управляет спека     | [Заглушки observer](/ru/utilities/observer-stubs)          |
| `intersectionEntry(target, isIntersecting, overrides?)`, `resizeEntry(target, rect?)`, `mutationRecord(target, init?)`                 | Собирают одну запись observer без лишних полей                 | там же                                                     |
| `stubMediaElement(options?)`                                                                                                           | `<video>` или `<audio>`, который играет и шлёт события медиа   | [Медиаэлемент](/ru/utilities/media-element)                |
| `stubAnimationFrame(options?)`                                                                                                         | `requestAnimationFrame` сразу или по `flush(timestamp?)`       | [Кадры и размеры](/ru/utilities/frame-and-rect)            |
| `stubElementRect(element, rect?)`                                                                                                      | `getBoundingClientRect()`, отвечающий настоящим `DOMRect`      | там же                                                     |
| `stubAbortController()`                                                                                                                | `AbortController`, чей `signal` работает со слушателями jsdom  | [Подмены конструкторов](/ru/utilities/constructor-doubles) |
| `stubWebStorage(key?, options?)`                                                                                                       | `localStorage` или `sessionStorage` в памяти, с `snapshot()`   | [Мок localStorage](/ru/guides/mocking-local-storage)       |
| `stubWorker(options?)`                                                                                                                 | `Worker`, чей скрипт — это спека                               | [Заглушка Worker](/ru/utilities/worker-stub)               |
| `createElementStub(options?)`                                                                                                          | `HTMLElement` для `ElementRef`, чьи спаи хранят состояние      | [Заглушка элемента](/ru/utilities/element-stub)            |
| `fillMissingDomApis(options?)`                                                                                                         | Один раз дописывает члены DOM, которых нет в jsdom и happy-dom | там же                                                     |

## `vitest-auto-spy/diagnostics` {#vitest-auto-spy-diagnostics}

Обычные функции, ничего не регистрируют; работают и из Node-скрипта.

| Экспорт                                                                                                               | Что делает                                                          | Где подробно                                                            |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `explainSpy(spy, method?)`                                                                                            | Показывает каждый заданный список аргументов рядом с каждым вызовом | [explainSpy](/ru/utilities/explain-spy)                                 |
| `compareTestRuns(baseline, current, root?)`, `summarizeTestRun(report, root?)`, `formatTestRunComparison(comparison)` | Отвечают, не потеряла ли миграция тест                              | [Не потерян ли тест](/ru/migrating#did-the-migration-lose-a-test)       |
| `diffByField(actual, expected)`                                                                                       | Какое поле в списке записей отличается и в скольких элементах       | [Рецепты](/ru/recipes#find-the-field-that-differs-in-a-list-of-records) |

## `vitest-auto-spy/console` {#vitest-auto-spy-console}

Тихие типизированные спаи поверх глобального `console`. См. [Спаи консоли](/ru/utilities/console).

| Экспорт                                                                                                                                             | Что делает                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `consoleLogSpy`, `consoleInfoSpy`, `consoleWarnSpy`, `consoleErrorSpy`, `consoleDebugSpy`, `consoleTraceSpy`, `consoleTimeSpy`, `consoleTimeEndSpy` | Сами спаи; ставятся при импорте                          |
| `useConsoleSpies()`                                                                                                                                 | Ставит спаи перед каждым тестом блока и откатывает после |
| `installConsoleSpies()` / `resetConsoleSpies()` / `restoreConsole()`                                                                                | Поставить, очистить, откатить                            |
| `consoleOutput()`                                                                                                                                   | Всё написанное, по каналам                               |
| `consoleLines()`                                                                                                                                    | Всё написанное одним списком в порядке вызовов           |

## Другие точки входа {#other-entry-points}

| Импорт                           | Экспорты                                                                                                                                                                                              | Где подробно                                                                    |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `vitest-auto-spy/jasmine`        | `createSpyObj`, пространство имён `jasmine`, `registerJasmineMatchers`, `enableJasmineCompat`, а также `createSpyFromClass`, `createFunctionSpy`, `provideAutoSpy` с `.and` / `.calls`; только Vitest | [Переход с Jasmine](/ru/migrating-jasmine#the-auto-spies-api)                   |
| `vitest-auto-spy/jasmine-compat` | Только `enableJasmineCompat()`, для `bun test` и `node --test`                                                                                                                                        | [На Bun и `node:test`](/ru/migrating-jasmine#on-bun-and-node-test)              |
| `vitest-auto-spy/observer-spy`   | `subscribeSpyTo`, `ObserverSpy`, `SubscriberSpy`: API `@hirez_io/observer-spy`                                                                                                                        | [rxjs](/ru/runtimes/rxjs#subscribespyto-for-a-suite-arriving-with-observer-spy) |
| `vitest-auto-spy/zone`           | `installProxyZonePatch(options?)`, ставится при импорте: `fakeAsync` под Vitest                                                                                                                       | [Zone](/ru/utilities/zone)                                                      |
| `vitest-auto-spy/eslint-plugin`  | Плагин линтера для flat config (экспорт по умолчанию)                                                                                                                                                 | [Плагин ESLint](/ru/utilities/eslint-plugin)                                    |
| `vitest-auto-spy/perf-reporter`  | Репортер Vitest, который использует `npx vitest-auto-spy perf` (экспорт по умолчанию)                                                                                                                 | [Командная строка](/ru/utilities/cli)                                           |
| `vitest-auto-spy/package.json`   | Сам манифест, для инструментов, которые его читают (Storybook, Nx)                                                                                                                                    | —                                                                               |

## Объекты настройки {#configuration-objects}

Второй аргумент `createSpyFromClass`, `createSpyFromInstance` и `provideAutoSpy` —
`ClassSpyConfiguration`. Все опции с примерами: [Спаи из класса](/ru/core/create-spy-from-class#configuration).

| Опция                                          | Тип                  | Что делает                                                                                                                                                                                        |
| ---------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `methodsToSpyOn`                               | `string[]`           | Добавляет вызываемые члены к методам, найденным на прототипе                                                                                                                                      |
| `onlyMethodsToSpyOn`                           | `string[]`           | Спаит только эти; поиск методов не выполняется                                                                                                                                                    |
| `instanceMethodsToSpyOn`                       | `string[]`           | Как `methodsToSpyOn`, для вызываемых членов экземпляра (поля `signal()`, стрелочные свойства)                                                                                                     |
| `observablePropsToSpyOn`                       | `string[]`           | Свойства-Observable, которые получают `nextWith` и остальные                                                                                                                                      |
| `gettersToSpyOn` / `settersToSpyOn`            | `string[]`           | Аксессоры под спай; читаются через `accessorSpies`                                                                                                                                                |
| `autoSpyAccessors`                             | `boolean`            | Сам находит геттеры и сеттеры                                                                                                                                                                     |
| `returns`                                      | `{ method: value }`  | Что метод возвращает с самого начала (методу с Observable передайте `of(value)`); метод остаётся спаем                                                                                            |
| `returnsUndefined`                             | `string[]`           | Методы, которые отвечают `undefined`; под `strict` считаются настроенными                                                                                                                         |
| `returnsClass`                                 | `{ method: Class }`  | Метод отвечает одним спаем этого класса на подмену, доступным как `innerDouble(double, 'method')`; `[Class, options]` настраивает его — [подробнее](/ru/core/create-spy-from-class#returns-class) |
| `overrides`                                    | `{ member: value }`  | Заменяет член обычным значением (см. [returns или overrides](/ru/core/returns-vs-overrides))                                                                                                      |
| `selfReturning`                                | `string[]`           | Методы, которые возвращают саму подмену, для цепочек вызовов                                                                                                                                      |
| `fillMissing`                                  | `boolean`            | Добавляет спай для имени, которого нет на прототипе (`abstract`-члены)                                                                                                                            |
| `lazySpies`                                    | `boolean \| 'proxy'` | Когда собираются спаи методов (`'proxy'`: один прокси-объект собирает их при первом обращении); если не задано, решает число методов                                                              |
| `strict`, `onUnstubbedCall`, `onUnstubbedRead` | см. ниже             | [Строгий режим](/ru/core/strict-mode)                                                                                                                                                             |
| `passthrough`                                  | `boolean`            | Только `createSpyFromInstance`: ненастроенные методы вызывают настоящий                                                                                                                           |

`createAutoMock`, `autoMocked` и `provideAutoSpyForToken` последним аргументом принимают
`AutoMockConfiguration`: `observablePropsToSpyOn`, `returns`, `returnsUndefined`, `returnsClass`,
`selfReturning`, `name` (как подмену называет отчёт строгого режима) и поля строгого режима. Если
засевать нечего, опции можно передать первым аргументом:
`createAutoMock<EventSource>({ returnsUndefined: ['close'] })`. Так работает, когда в объекте есть хотя
бы одна из опций `returnsUndefined`, `selfReturning`, `returnsClass`, `observablePropsToSpyOn`,
`onUnstubbedCall`, `onUnstubbedRead`; `strict`, `name` или `returns` сами по себе по-прежнему идут
вторым аргументом — [опции без значений](/ru/core/auto-mock-by-type#options-without-values).

**`StrictSpyConfiguration`**: принимает каждая фабрика, а `setupAutoSpy(options?)` — как общее
значение для всех тестов. См. [приоритет](/ru/core/strict-mode#precedence).

| Поле               | Тип                                                                                                                 | Что делает                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `strict?`          | `boolean`                                                                                                           | Вызов ненастроенного метода бросает ошибку с классом, методом и аргументами. По умолчанию выключен |
| `onUnstubbedCall?` | `(call: { className: string \| undefined; method: string; args: unknown[] }) => unknown`                            | Выполняется вместо этого, и его результат становится результатом вызова. Сильнее `strict`          |
| `onUnstubbedRead?` | `(read: { className: string \| undefined; member: string; kind: 'getter' \| 'observable'; count: number }) => void` | После теста получает геттеры и потоки, которые прочитали без настройки. Нужен `setupAutoSpy`       |

**`ValueConfig`** (для `nextWithValues`, `createObservableWithValues`): `{ value, delay? }`,
`{ errorValue, delay? }` или `{ complete?, delay? }`.

**Опции `createSpyClass`**: `{ statics?: boolean }` копирует статические члены класса на подмену.
См. [статика](/ru/core/spy-typing#the-class-s-statics-—-statics-true).

**Опции `captureArg`**: `{ where? }` — предикат, который решает, какие значения принимает ловушка.

## Публичные типы {#public-types}

Их экспортирует ядро; большинство из них вы увидите разве что в сообщении об ошибке.

| Тип                                                                          | Что это                                                                                          | Где подробно                                                                                          |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `Spy<T>`                                                                     | Объект-спай: каждый метод `T` с хелперами, которые допускает его тип возврата, и `accessorSpies` | [Типизация спаев](/ru/core/spy-typing)                                                                |
| `Spy<T, Options>`                                                            | `{ overload?: 'first' \| 'last' }` выбирает перегрузку, по которой работают хелперы              | [Перегрузки](/ru/core/spy-typing#overloads-parameters-reads-the-last-signature)                       |
| `FunctionSpy<Fn>`                                                            | Что возвращает `createFunctionSpy`                                                               | [Одна функция](/ru/core/create-spy-from-class#a-single-function-—-createfunctionspy)                  |
| `DeepMockProxy<T>`                                                           | Что возвращает `mockDeep`                                                                        | [Глубокие подмены](/ru/core/auto-mock-by-type#recursive-deep-mocks-—-mockdeep)                        |
| `AutoMocked<T>`                                                              | Что возвращает `autoMocked`: одновременно `T` и `Spy<T>`                                         | [Один объект, два типа](/ru/core/auto-mock-by-type#automocked-—-one-object-typed-as-both-t-and-spy-t) |
| `DeepPartial<T>`                                                             | Что принимают `createMock` и `createAutoMock`: частичный объект на любой глубине                 | [Фикстуры](/ru/utilities/fixtures)                                                                    |
| `ClassType<T>`                                                               | Класс `T`, включая абстрактные                                                                   | [Спаи из класса](/ru/core/create-spy-from-class)                                                      |
| `SpyDisposable`                                                              | Позволяет использовать любую подмену с `using`                                                   | [Сброс через using](/ru/core/create-spy-from-class#using)                                             |
| `ObservableLike<T>`, `SubjectLike<T>`, `SubjectOf<T>`, `AutoSpyRxjsTypes<T>` | Как типы узнают поток, не называя rxjs                                                           | [rxjs в типах](/ru/runtimes/rxjs#rxjs-in-the-types)                                                   |
| `SubscribableLike<T>`, `CallbackSubscribable<T>`, `EmissionSource<T>`        | Что принимают проверки Observable                                                                | [Какие источники подходят](/ru/core/observable-assertions#which-sources-work)                         |
| `AddSpyMethodsByReturnTypes<Method>`                                         | Хелперы одного метода                                                                            | [Типизация спаев](/ru/core/spy-typing)                                                                |

Все экспортируемые типы по точкам входа. Список нужен для поиска; нужные в работе типы описаны в таблице выше.

```text
vitest-auto-spy (их же реэкспортируют /bun, /node, /rstest, /react, /svelte, /vue, /bun-angular)
  AccessorImplementations, AccessorKeysOf, AddAccessorsSpies, AddCalledWithAny,
  AddCalledWithObservable, AddCalledWithPromise, AddCalledWithSpyMethods, AddObservableSpyMethods,
  AddPromiseSpyMethods, AddSpyMethodsByReturnTypes, AddThrowHelper, AddVoidReturnHelpers,
  AdoptMockOptions, AdoptedMock, AnyReturnHelpers, ArgCaptor, AsInstances, AssertMockedOptions,
  AutoMockConfiguration, AutoMocked, AutoSpyDefaultEntry, AutoSpyRxjsTypes, CallLog,
  CallbackSubscribable, CaptureArgOptions, ClassSpyConfiguration, ClassType, CompleteValueConfig,
  ConstructorMock, ConstructorSpy, DeepMockProxy, DeepPartial, EmissionObserver, EmissionOptions,
  EmissionSource, ErrorValueConfig, FixtureFactory, FlushUntilOptions, Func, FunctionSpy,
  InstanceSpyConfiguration, MethodReturns, MockDeepOptions, ModuleNamespace,
  ModuleNamespaceOptions, Mutable, NextValueConfig, NotAPublicKey, ObservableLike,
  ObservablePropSpyMethods, OnlyMethodKeysOf, OnlyObservablePropsOf, OnlyPropsOf,
  OutsideHookReaction, Overload, OverloadChoice, Overloads, PropStubValue, RestoreProp, Spy,
  SpyClassOptions, SpyDisposable, SpyOptions, StrictSpyConfiguration, SubjectLike, SubjectOf,
  SubscribableLike, UnstubbedCall, UnstubbedCallHandler, UnstubbedRead, UnstubbedReadHandler,
  ValueConfig, ValueConfigPerCall, WithMockReturnValue

/rxjs (реэкспорт из ядра)
  AddObservableSpyMethods, CompleteValueConfig, ErrorValueConfig, NextValueConfig,
  ObservablePropSpyMethods, ValueConfig, ValueConfigPerCall

/angular
  AccessorImplementations, AngularTestEnvMode, AngularTestEnvOptions, AngularTokenProvider,
  AngularValueProvider, AutoSpiedInstance, AutoSpyFixture, AutoSpyOverride, AutoSpyTokenDefaults,
  CallbackSubscribable, ComponentInputs, ComponentStubOptions, CreateWithAutoSpiesOptions,
  DirectiveHostOptions, ElementConstructor, EmissionObserver, EmissionOptions, EmissionSource,
  ExtendWithAutoSpiesOptions, InjectionLog, MockResourceOptions, MockedResource,
  NativeElementHolder, PreparedShallow, RenderShallowOptions, ResourceDouble,
  ResourceDoubleSnapshot, ResourceDoubleStatus, ResourceStatusLike, RestoreProp, RunCounter,
  SettleResourceOptions, ShallowOverrides, ShallowRender, SignalPropHandles, SignalPropValues,
  SpiedFixtures, Spy, SpyRegistry, StableOptions, SubjectOf, SubscribableLike,
  TrackInjectionsOptions, TrackedProvider

/angular/diagnostics
  AngularDiagnosticsOptions, PendingRequestsOptions, SpecTiming, TestBedDiagnosticsOptions

/angular/doubles
  AttachedComponent, DialogComponent, DialogDataOf, DialogRefLike, DialogResult,
  MatDialogRefDouble, MatDialogRefInit, OverlayDouble, OverlayDoubleInit, OverlayLike,
  OverlayRefDouble, OverlayRefStub, PlatformFlagTokens, PlatformName, PlatformOverrides,
  PositionCall

/angular/matchers
  RegisterSignalMatchersOptions, ResourceLike, SignalLike, SignalValueOptions

/angular-http
  ExpectRequestOptions, FlushOptions, HttpTestingOptions, RequestErrorOptions, RequestExpectation,
  RequestMatcher, ResponseBody

/angular-router
  ActivatedRouteChange, ActivatedRouteDouble, ActivatedRouteInit, LocationDouble, NavigationInit,
  RouteResources, RouterDouble, RouterDoubleInit, RouterEventPair, RouterEventsHandle

/signal-forms
  CreateFormOptions, FieldErrorMatch

/bun-angular (сверх ядра)
  AngularResourceInlinerOptions, AngularValueProvider, AutoSpiedInstance, ComponentInputs,
  CreateNestUnitOptions, CreateWithAutoSpiesOptions, DomRegistrar, ElementConstructor,
  GlobalRegistratorOptions, JsdomModule, JsdomRegistrarOptions, NativeElementHolder, NestUnit,
  NestUnitClass, NestUnitProvider, NestUnitSpies, PreparedShallow, RegisterDomGlobalsOptions,
  RenderShallowOptions, ResourceStatusLike, RunCounter, SettleResourceOptions, ShallowOverrides,
  ShallowRender, SpyRegistry, StableOptions

/nestjs
  CreateNestUnitOptions, InjectionLog, NestModuleRef, NestUnit, NestUnitClass, NestUnitProvider,
  NestUnitSpies, NestValueProvider, TrackInjectionsOptions, TrackedProvider

/bun (сверх ядра)
  CreateNestUnitOptions, NestUnit, NestUnitClass, NestUnitProvider, NestUnitSpies

/node (сверх ядра)
  CreateNestUnitOptions, NestUnit, NestUnitClass, NestUnitProvider, NestUnitSpies,
  StopTrackingNodeMocks

/vue (сверх ядра)
  VueInjectionToken, VueProvideSpy

/setup
  BlockNetworkOptions, CountingClock, CountingClockOptions, DocumentPollutionOptions,
  DocumentPollutionReaction, DuplicateCopiesReaction, ExpectedUnhandledError, FakeTimersConfig,
  GlobalPatchReaction, MisconfigurationReaction, PerTestHandle, PrototypePollutionReaction,
  RejectionHost, RestoreWebStorageOptions, SchedulerHost, SetupAutoSpyOptions, SetupAutoSpyPreset,
  SpyEngine, StopTrackingListeners, StopTrackingRejections, StopTrackingTimers, StorageSpyKey,
  StrayConsoleOptions, StrayConsoleReaction, StrayListener, StrayListenerReport, StrayRejection,
  StrayTimer, StrayTimerReport, StrayTimersOptions, StubResponseInit, SwallowedStrictCallsReaction,
  SystemTime, TrackedListenerTarget, UnconfiguredReadsReaction, UnhandledObservableError,
  XhrBlockMode

/dom-stubs
  AnimationFrameMode, AnimationFrameStub, AnimationFrameStubOptions, CancelAnimationFrameFn,
  ClassListStub, ElementRectRestore, ElementStub, ElementStubOptions, FillMissingDomApisOptions,
  IntersectionEntryOverrides, IntersectionObserverStubOptions, MediaElementState, MediaElementStub,
  MediaElementStubOptions, MutationRecordInit, ObserverGlobal, ObserverInstance, ObserverStub,
  ObserverStubOptions, RequestAnimationFrameFn, ResizeEntryRect, StyleStub, WebStorageKey,
  WebStorageStub, WebStorageStubOptions, WorkerInstance, WorkerScript, WorkerStub,
  WorkerStubOptions

/diagnostics
  TestRunComparison, TestRunReport, TestRunSummary

/console
  ConsoleChannel, ConsoleLine, ConsoleMethodSpy, ConsoleOutput, ConsoleSpies

/jasmine
  AngularValueProvider, ClassSpyConfiguration, ClassType, JasmineAccessorSpies, JasmineAccessorSpy,
  JasmineAnd, JasmineCallInfo, JasmineCalls, JasmineClassSpyConfiguration, JasmineClock,
  JasmineMethodSpy, JasmineNamespaces, JasmineSpy, JasmineStrategies, JasmineWithArgsAnd,
  JasmineWithArgsStrategies, JasmineWithArgsSync, OnlyMethodKeysOf, OnlyObservablePropsOf,
  OnlyPropsOf, Spy, SpyObj

/jasmine-compat
  JasmineAccessorSpies, JasmineAccessorSpy, JasmineAnd, JasmineCallInfo, JasmineCalls,
  JasmineMethodSpy, JasmineNamespaces, JasmineSpy, JasmineStrategies, JasmineWithArgsAnd,
  JasmineWithArgsStrategies, JasmineWithArgsSync

/observer-spy
  ObserverSpyConfig, ObserverSpyWaitOptions

/zone
  ProxyZonePatchOptions, ProxyZoneScope

/eslint-plugin
  AutoSpyEslintPlugin, FlatConfig, PluginRule, RuleSeverity
```

## Подробнее {#in-depth}

Детали, у которых пока нет другой страницы.

- **Куда ушли заглушки DOM.** Хелперы `/dom-stubs` и функции `/diagnostics` ушли из ядра в версии 4.0;
  см. [Переход на 4.0](/ru/upgrading-4#_2-dom-stubs-and-run-diagnostics-moved-to-their-own-subpaths).
- **Настройка `createSpyFromInstance`.** Она принимает `ClassSpyConfiguration`, но пропускает
  `lazySpies` и `fillMissing`: члены объекта уже существуют, а у экземпляра нет стёртых
  `abstract`-членов. Об ошибках настройки она сообщает так же, как фабрика класса, но сверяется с
  живым объектом, поэтому поле со стрелочной функцией считается членом.
- **Общий `strict`.** `setupAutoSpy` включает значение по умолчанию, только если вы передали `strict`
  или `onUnstubbedCall`, и снимает его в `afterAll`. Иначе при `isolate: false` значение, включённое
  одним файлом, осталось бы и для файлов, которые его не просили. Значение хранится на `globalThis`,
  поэтому доходит до подмены, из какого бы бандла пакета она ни была собрана. Явный `strict: false`
  на подмене — единственный способ освободить от общего правила одну широкую зависимость.
- **`className` в хуках строгого режима** — класс, из которого собрана подмена, или `name`, данное
  подмене по типу, или `createAutoMock(file:line)`, если имени нет.
- **`SpyDisposable`** — это `{ [Symbol.dispose](): void }`, объявленный структурно, а не как
  глобальный `Disposable`. Тот живёт в `lib.esnext.disposable`, и в проекте, где `lib` заканчивается
  на ES2022 и нет `@types/node`, опубликованные типы не собрались бы. Там, где `Disposable` есть,
  `Spy<T>` ему присваивается. Освобождение любого узла дерева `mockDeep` сбрасывает всё дерево.
- **`SubscribableLike<T>` / `CallbackSubscribable<T>`** — две формы подписки, которые принимают
  проверки Observable: объект-наблюдатель, как в rxjs, и голый колбэк `next`, как у `output()` в
  Angular. `EmissionSource<T>` — их объединение.
- **`AddCalledWithAny<Method>` / `AnyReturnHelpers`.** Метод с типом возврата `any` сохраняет
  `mockReturnValue` в цепочке `calledWith` и получает ещё и хелперы для Promise и Observable, потому
  что во время выполнения у него есть все они. Эти два типа называют такую цепочку и такой набор —
  для сигнатуры, собранной вне `Spy<T>`.
- **`DeepPartial<T>`** по-прежнему отвергает ключ, которого нет в `T`, на любой глубине. `Date`,
  `Map`, `Promise` и функции проходят как есть, а настоящее значение принимается везде, где принят
  частичный объект, поэтому объект хоста вроде `NodeList` остаётся совместимым.
- **`SubjectOf` из `/angular`** ничего не расширяет: переменная с этим типом становится `Subject` из
  rxjs, только если `vitest-auto-spy/rxjs` есть в программе TypeScript, а иначе это `SubjectLike`.
- **`restoreGlobals()` и глобали DOM.** Vitest кладёт свойства окна jsdom или happy-dom на
  `globalThis` парами геттер и сеттер, которые переадресуют к окну. `global.ResizeObserver = stub`
  вызывает сеттер, а дескриптор свойства не меняется. Поэтому `restoreGlobals()` возвращает старое
  значение через тот же сеттер, а не только сравнивает дескрипторы.
- **`mockResourceProp` после `fail()`**: `value()` бросает `ResourceValueError`, как настоящий
  упавший ресурс.
