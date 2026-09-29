---
title: Сравнение
description: Чем vitest-auto-spy отличается от jest-auto-spies, vitest-mock-extended, @golevelup/ts-vitest, @suites/unit, ng-mocks, @testing-library/angular, spectator, sinon и встроенных средств Vitest, с датами последних релизов.
---

# Сравнение

`vitest-auto-spy` превращает класс или тип в объект, где каждый метод — типизированный
[спай](/ru/glossary). Каждый спай получает хелперы под тип возврата метода: `resolveWith` для
`Promise`, `nextWith` для `Observable`. Библиотека работает на Vitest, Bun и `node:test`, есть
хелперы для Angular, NestJS, React, Vue и Svelte. Эта страница показывает, какая библиотека подходит
к какой ситуации и что вы получаете или теряете при переходе.

## Что выбрать {#which-one-to-pick}

| Ваша ситуация                                                            | Выбор                                                                                              | Почему                                                                                                                                          |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| У вас `jest-auto-spies`, и вы остаётесь на Jest                          | оставьте [`jest-auto-spies`](https://github.com/hirezio/auto-spies)                                | тот же API; `vitest-auto-spy` пока не работает на Jest                                                                                          |
| У вас `jest-auto-spies`, и вы переходите на Vitest, Bun или `node:test`  | `vitest-auto-spy`                                                                                  | тот же API, в основном меняются импорты; см. [до и после](#before-and-after)                                                                    |
| Вы подменяете сервисы спаями через `ng-mocks`                            | `vitest-auto-spy`                                                                                  | вы получаете `Spy<UserService>` вместо `UserService`, и спеки сохраняют AOT-компиляцию, которую ng-mocks просит отключить ([почему](#ng-mocks)) |
| Вы мокаете через `ng-mocks` целое дерево компонентов и модулей           | оставьте [`ng-mocks`](https://github.com/help-me-mom/ng-mocks)                                     | у `MockBuilder`, `MockInstance`, `ngMocks.findInstance` здесь нет аналогов; используйте обе в одном проекте                                     |
| Вы рендерите компоненты и проверяете то, что видит пользователь          | оставьте [`@testing-library/angular`](https://github.com/testing-library/angular-testing-library)  | оставьте его для рендеринга; замените только его `createMock` на `createSpyFromClass`                                                           |
| У вас `@ngneat/spectator`                                                | `vitest-auto-spy`                                                                                  | его репозиторий удалён, и на Angular 22 он не ставится; см. [Angular](#angular)                                                                 |
| Вы мокаете только интерфейсы, никогда классы, и больше ничего не нужно   | [`vitest-mock-extended`](https://github.com/eratio08/vitest-mock-extended)                         | он меньше и работает на Vitest 4 и новее; если нужны ещё и хелперы, берите `createAutoMock` / `mockDeep` из `vitest-auto-spy`                   |
| Нужен юнит NestJS, собранный из DI-метаданных, только на Jest или Vitest | [`@suites/unit`](https://github.com/suites-dev/suites) или [`createNestUnit`](/ru/adapters/nestjs) | см. [NestJS](#nestjs)                                                                                                                           |
| Моки у вас уже есть, и нужны только ответы в зависимости от аргументов   | [`vitest-when`](https://github.com/mcous/vitest-when)                                              | ровно это и ничего больше; берите 0.10.2, пропускайте 0.10.1                                                                                    |
| Нужны песочницы, фейковые серверы или полный набор тестовых подмен       | [`sinon`](https://github.com/sinonjs/sinon)                                                        | инструмент шире; этот пакет только превращает класс или тип в типизированный спай                                                               |

## До и после {#before-and-after}

При переходе с `jest-auto-spies` в большинстве спек меняются только импорты. Angular-хелперы лежат в
своей точке входа. Хелперам для `Observable` ещё нужен `import 'vitest-auto-spy/rxjs'` один раз, в
setup-файле ([как подключить](/ru/runtimes/rxjs)):

```diff
- import { createSpyFromClass, provideAutoSpy } from 'jest-auto-spies';
+ import { createSpyFromClass } from 'vitest-auto-spy';
+ import { provideAutoSpy } from 'vitest-auto-spy/angular';
```

При переходе с `ng-mocks` меняется тип подмены сервиса. `ng-mocks` типизирует её как настоящий
сервис, поэтому до мока приходится добираться через приведение типа. Ещё ng-mocks нужен
`ngMocks.autoSpy('vitest')` в setup-файле; уберите эту строку, когда ни одна спека не использует
ng-mocks.

```ts
import { TestBed } from '@angular/core/testing';
import { MockProvider, ngMocks } from 'ng-mocks';
import { of } from 'rxjs';
import { vi } from 'vitest';

TestBed.configureTestingModule({ imports: [ProfileComponent], providers: [MockProvider(UserService)] });
const users = TestBed.inject(UserService); // тип UserService
vi.mocked(users.load).mockReturnValue(of({ id: 1, name: 'Ann' })); // приведение, чтобы достать мок
```

С `vitest-auto-spy` `injectSpy` возвращает `Spy<UserService>`, и `load` получает хелперы под свой тип
возврата `Observable`. Этим хелперам нужен `import 'vitest-auto-spy/rxjs'` один раз на проект,
в setup-файле Vitest (см. [RxJS](/ru/runtimes/rxjs)). `nextWith` задаёт значение, которое выдаёт каждый
следующий вызов `load()`. Вызывайте его до `TestBed.createComponent`: компонент вызывает `load()`
при создании:

```ts
import { TestBed } from '@angular/core/testing';
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/angular';

it('shows the user name', async () => {
  TestBed.configureTestingModule({ imports: [ProfileComponent], providers: [provideAutoSpy(UserService)] });
  const users = injectSpy(UserService); // Spy<UserService>
  users.load.nextWith({ id: 1, name: 'Ann' }); // проверяется по Observable<User>

  const fixture = TestBed.createComponent(ProfileComponent);
  await fixture.whenStable();

  expect(fixture.nativeElement.textContent).toContain('Ann');
  expect(users.load).toHaveBeenCalledTimes(1); // матчеры Vitest работают с этими спаями
});
```

Пошаговые руководства: [Переход с jest-auto-spies](/ru/migrating),
[Переход со Spectator](/ru/migrating-spectator),
[Переход с @testing-library/angular](/ru/migrating-testing-library-angular),
[Переход с @suites/unit](/ru/migrating-suites).

## Что вы получаете и теряете при переходе {#what-you-gain-and-lose-by-switching}

| Откуда                     | Получаете                                                                                                                                                                                                                   | Теряете                                                                                                                                                  |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `jest-auto-spies`          | Vitest, Bun и `node:test`; моки по типу без класса (`createAutoMock`, `mockDeep`); хелперы для zoneless и `httpResource()`; у пакета выходят новые релизы; меньше памяти на спай ([Стоимость в рантайме](#_4-runtime-cost)) | Jest: на нём этот пакет пока не работает                                                                                                                 |
| `ng-mocks`                 | `Spy<T>` вместо `T`, без приведений через `vi.mocked()`; хелперы по типу возврата; `calledWith` / `mustBeCalledWith`; спаи геттеров и сеттеров; спеки в AOT-компиляции; хелперы для zoneless и ресурсов; моки по типу       | мок целого графа (`MockBuilder`), `MockInstance` (настройка зависимости, которую вложенный потомок читает в инициализаторе поля), `ngMocks.findInstance` |
| `@testing-library/angular` | геттеры в подмене; методы `Object.prototype` не мокаются по ошибке; ленивые спаи (спай метода создаётся при первом обращении)                                                                                               | ничего, если оставить его `render` и заменить только `createMock`                                                                                        |

## Половина поля перестала выпускать релизы {#half-the-field-has-stopped-shipping}

Прежде чем сравнивать возможности, проверьте, кто ещё выпускает релизы. Последний релиз каждого
пакета по реестру npm, прочитано 2026-08-30 и повторно 2026-09-04:

| Библиотека                                                                               | Последняя | Опубликована   | Репозиторий                                                                                                       | Состояние                                       |
| ---------------------------------------------------------------------------------------- | --------- | -------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| [ts-auto-mock](https://www.npmjs.com/package/ts-auto-mock)                               | 3.7.4     | **2024-08-24** | [Typescript-TDD/ts-auto-mock](https://github.com/Typescript-TDD/ts-auto-mock)                                     | автор заморозил развитие                        |
| [testdouble](https://www.npmjs.com/package/testdouble)                                   | 3.20.2    | **2024-03-21** | [testdouble/testdouble.js](https://github.com/testdouble/testdouble.js)                                           | спит около 2,5 лет                              |
| [moq.ts](https://www.npmjs.com/package/moq.ts)                                           | 10.0.8    | **2023-05-02** | [dvabuzyarov/moq.ts](https://github.com/dvabuzyarov/moq.ts)                                                       | спит с 2023 года                                |
| [@fluffy-spoon/substitute](https://www.npmjs.com/package/@fluffy-spoon/substitute)       | 1.208.0   | **2021-05-07** | [ffMathy/FluffySpoon.JavaScript.Testing.Faking](https://github.com/ffMathy/FluffySpoon.JavaScript.Testing.Faking) | последний релиз в 2021                          |
| [@golevelup/nestjs-testing](https://www.npmjs.com/package/@golevelup/nestjs-testing)     | 0.1.2     | **2019**       | [golevelup/nestjs](https://github.com/golevelup/nestjs)                                                           | мёртв — не ссылайтесь на него как на актуальный |
| [@ngneat/spectator](https://www.npmjs.com/package/@ngneat/spectator)                     | 22.1.0    | **2025-11-02** | `ngneat/spectator` отдаёт **HTTP 404** → [ngneat-archive/spectator](https://github.com/ngneat-archive/spectator)  | около 10 месяцев, репозитория нет               |
| [jest-auto-spies](https://www.npmjs.com/package/jest-auto-spies)                         | 3.0.1     | 2025-09-22     | [hirezio/auto-spies](https://github.com/hirezio/auto-spies)                                                       | тихо; его основная зависимость — от 2023 года   |
| [@bugsplat/vitest-auto-spies](https://www.npmjs.com/package/@bugsplat/vitest-auto-spies) | 1.0.0     | 2026-02-04     | [BugSplat-Git/auto-spies](https://github.com/BugSplat-Git/auto-spies)                                             | 102 загрузки за окно                            |

Первые пять строк последний раз публиковались больше года назад, а у `@ngneat/spectator` пропал
репозиторий. На 2026-09-04 первым пяти было 740, 896, 1 220, 1 945 и 2 486 дней. `jest-auto-spies`
тогда было 346 дней, так что без нового релиза ему исполнится год 2026-09-22.

Две поправки к тому, что эта страница утверждала раньше и что до сих пор пишут в других местах:

- **`ts-auto-mock` не запускается на современном тулчейне.** Автор заморозил его развитие, и он не
  работает ни с esbuild, ни с swc. Значит, ни с Vitest, ни с Vite, ни с Bun, ни с билдером Angular.
  Старая формулировка здесь («не нужно ставить трансформер ttsc») преуменьшала проблему.
- **`@ngneat/spectator` — риск сопровождения, а не просто старая версия.** Подробности, проверено
  2026-09-02:
  - 22.1.0 вышла 2025-11-02. `github.com/ngneat/spectator` отдаёт **404**, все issue и PR пропали;
    сама организация `ngneat` ещё существует.
  - Сторонний снимок лежит в [ngneat-archive/spectator](https://github.com/ngneat-archive/spectator),
    создан 2026-06-07 и уже заархивирован.
  - Его по-прежнему скачивают **739 852 раза в месяц** (2026-07-31 → 2026-08-29).
  - У него три рантайм-зависимости: `tslib`, `@testing-library/dom` и **`jquery`**.
  - `lib/mock.d.ts:11` объявляет `CompatibleSpy … extends jasmine.Spy`, и на нём построен
    `SpyObject<T>`. Поэтому даже `@ngneat/spectator/vitest` затаскивает глобальные типы Jasmine в
    проект на Vitest.
  - На чистом воркспейсе Angular 22 он не ставится. Он импортирует `BrowserDynamicTestingModule` из
    `@angular/platform-browser-dynamic/testing`, но нигде не объявляет этот пакет. Установка падает с
    `ERR_MODULE_NOT_FOUND`. Сам этот пакет ещё выпускается (22.1.4) и только помечен deprecated,
    поэтому ошибку обходят, добавив его руками.
  - Форк [`@openng/spectator`](https://www.npmjs.com/package/@openng/spectator)
    ([openng-org/spectator](https://github.com/openng-org/spectator), 1.0.1, 2026-07-10) живой, у
    него 16 251 загрузка, 2,1 % от оригинала. Его сборка под Angular 22 — перекомпиляция с тем же
    необъявленным импортом, поэтому падает точно так же. Исправление
    ([#13](https://github.com/openng-org/spectator/pull/13)) открыто с 2026-07-26.

  Путь миграции описан на [отдельной странице](/ru/migrating-spectator).

## Живое поле {#the-live-field}

Библиотеки, которые ещё выпускают релизы, с загрузками за то же окно:

| Библиотека                                                                         | Последняя           | Загрузок/мес | Репозиторий                                                                                           | Что это                                                                          |
| ---------------------------------------------------------------------------------- | ------------------- | ------------ | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| [sinon](https://www.npmjs.com/package/sinon)                                       | 22.1.0, 2026-07-20  | 50 371 190   | [sinonjs/sinon](https://github.com/sinonjs/sinon)                                                     | универсальный набор инструментов; за чтение класса отвечает `createStubInstance` |
| [jest-mock-extended](https://www.npmjs.com/package/jest-mock-extended)             | 4.0.1, 2026-04-20   | 9 397 966    | [marchaos/jest-mock-extended](https://github.com/marchaos/jest-mock-extended)                         | глубокие Proxy-моки по типу, Jest                                                |
| [vitest-mock-extended](https://www.npmjs.com/package/vitest-mock-extended)         | 5.1.1, 2026-08-02   | 5 443 915    | [eratio08/vitest-mock-extended](https://github.com/eratio08/vitest-mock-extended)                     | то же самое, перенесённое на Vitest                                              |
| [ng-mocks](https://www.npmjs.com/package/ng-mocks)                                 | 14.17.3, 2026-08-24 | 2 502 024    | [help-me-mom/ng-mocks](https://github.com/help-me-mom/ng-mocks)                                       | здоров; мокает **граф деклараций** Angular, а не один класс                      |
| [@testing-library/angular](https://www.npmjs.com/package/@testing-library/angular) | 19.4.2, 2026-08-07  | 1 020 821    | [testing-library/angular-testing-library](https://github.com/testing-library/angular-testing-library) | прежде всего рендеринг, но в `/vitest-utils` есть собственный `createMock`       |
| [vitest-when](https://www.npmjs.com/package/vitest-when)                           | 0.10.2, 2026-09-03  | 702 637      | [mcous/vitest-when](https://github.com/mcous/vitest-when)                                             | `when(mock).calledWith(…).thenReturn(…)` для моков, которые у вас уже есть       |
| [@suites/unit](https://www.npmjs.com/package/@suites/unit)                         | 3.1.1, 2026-05-08   | 473 130      | [suites-dev/suites](https://github.com/suites-dev/suites)                                             | сборщик юнитов на основе DI, рекомендован документацией NestJS                   |
| [@golevelup/ts-vitest](https://www.npmjs.com/package/@golevelup/ts-vitest)         | 4.0.0, 2026-03-18   | 353 803      | [golevelup/nestjs](https://github.com/golevelup/nestjs)                                               | глубокий Proxy `createMock<T>()`, выбор сообщества Nest по умолчанию             |
| [Собственный `vi` в Vitest](https://vitest.dev/api/vi)                             | Vitest 4            | —            | [vitest-dev/vitest](https://github.com/vitest-dev/vitest)                                             | `vi.fn` / `vi.spyOn` / `vi.mockObject` — всё чаще ответ по умолчанию             |

Главный конкурент — вообще не библиотека. `jasmine-core` до сих пор скачивают **23 922 905** раз в
месяц. Официальный ответ Angular v22 на вопрос о подмене сервиса — объект, написанный руками:
`const stub: Mocked<TaxCalculator> = { calculate: vi.fn() }`.

## Возможность за возможностью {#feature-by-feature}

### Сама подмена {#the-double-itself}

_Подмена_ (тестовый дубль) — объект, который стоит в тесте вместо настоящего сервиса.

|                                              | vitest-auto-spy | jest-auto-spies | \*-mock-extended | @golevelup/ts-vitest |      @suites/unit       | ng-mocks | @testing-library/angular | @ngneat/spectator |         sinon          | Встроенное в Vitest 4 |
| -------------------------------------------- | :-------------: | :-------------: | :--------------: | :------------------: | :---------------------: | :------: | :----------------------: | :---------------: | :--------------------: | :-------------------: |
| Читает настоящий **класс** в рантайме        |       ✅        |       ✅        |        ❌        |       частично       | метаданные конструктора |    ✅    |            ✅            |        ✅         |  `createStubInstance`  |    `vi.mockObject`    |
| Мокает по **типу**, без класса               |       ✅        |       ❌        |        ✅        |          ✅          |           ❌            |    ❌    |            ❌            |        ❌         |           ❌           |          ❌           |
| Рекурсивный глубокий мок                     |       ✅        |       ❌        |        ✅        |          ✅          |           ❌            |    ❌    |            ❌            |        ❌         |           ❌           |       частично        |
| Хелперы для **Promise** по типу возврата     |       ✅        |       ✅        |        ❌        |          ❌          |           ❌            |    ❌    |            ❌            |        ❌         |           ❌           |          ❌           |
| Хелперы для **Observable** по типу возврата  |       ✅        |       ✅        |        ❌        |          ❌          |           ❌            |    ❌    |            ❌            |        ❌         |           ❌           |          ❌           |
| **Спаи геттеров / сеттеров**                 |       ✅        |       ✅        |        ❌        |          ❌          |           ❌            |    ❌    |            ❌            |        ❌         |           ✅           |          ✅           |
| `calledWith`                                 |       ✅        |       ✅        |        ✅        |          ❌          |           ❌            |    ❌    |            ❌            |        ❌         |       `withArgs`       |          ❌           |
| `mustBeCalledWith` (падает при несовпадении) |       ✅        |       ✅        |        ❌        |          ❌          |           ❌            |    ❌    |            ❌            |        ❌         |           ❌           |          ❌           |
| Типизирован как **спай-тип**, а не как `T`   |    `Spy<T>`     |    `Spy<T>`     |  `MockProxy<T>`  |   `DeepMocked<T>`    |       `Mocked<T>`       | **`T`**  |   `Mock<T>` (см. ниже)   |  `SpyObject<T>`   | `SinonStubbedInstance` |   `MaybeMockedDeep`   |

Три ячейки требуют пояснения. Первые две прочитаны из опубликованных пакетов 2026-08-30.

- **ng-mocks возвращает `T`.** `index.d.ts:1473` объявляет
  `MockService<T>(service: AnyType<T>, spyNamePrefix?: string): T`. Подмена типизирована как
  настоящий сервис, поэтому `.mockReturnValue(…)` не компилируется. Их собственные e2e-спеки
  приводят тип через `vi.mocked(...)`. В рантайме методы — настоящие спаи: с 14.17.0 (2026-08-10)
  `ngMocks.autoSpy('vitest')` делает каждый из них `vi.fn()`, это проверяет отдельный проект
  `e2e/vitest`. Скрывает это только тип.
- **`Mock<T>` из `@testing-library/angular` обещает больше, чем даёт.** Его тип —
  `T & { [K in keyof T]: T[K] & Mock }`, то есть _каждый_ член типизирован как вызываемый.
  Рантайм-фабрика ставит `vi.fn()` только там, где `typeof descriptor.value === 'function'`. Поэтому
  свойство с данными типизировано как мок, а в рантайме равно `undefined`.
- **`createStubInstance` из sinon создаёт новый объект.** Он принимает конструктор и возвращает свежий
  стаб. Поставить спаи на объект, который у вас уже есть, он не умеет. Для этого в пакете есть
  `createSpyFromInstance`: он превращает методы объекта в спаи прямо на месте. `bun:test` и
  `node:test` ставят спай на один метод за раз, и вызова для целого объекта у них нет.

`vitest-mock-extended` и `jest-mock-extended` делят колонку `*-mock-extended`. У них один API и одно
ядро на глубоких Proxy из `ts-essentials`, а раннеры разные.

#### vitest-mock-extended и Prisma {#vitest-mock-extended-and-prisma}

Заметная часть трафика `vitest-mock-extended` приходит из одного рецепта. Серия статей Prisma о
тестировании мокает `PrismaClient` его `mockDeep`. Версию 5.1.1 (2026-08-02) скачали 897 290 раз за
неделю по 2026-09-18.

| Перед выбором        | vitest-mock-extended | vitest-auto-spy          |
| -------------------- | -------------------- | ------------------------ |
| Peer-диапазон Vitest | `>=4.0.0`            | `>=2.1.0`                |
| Раннеры              | только Vitest        | Vitest, Bun, `node:test` |

Тот же рецепт на `mockDeep` этого пакета добавляет типизированные `resolveWith` / `rejectWith`,
`resolveWithPerCall`, `resetAutoSpy` по всему дереву и интерактивный `$transaction`. См.
[Мок Prisma Client](/ru/guides/mocking-prisma).

#### vitest-when {#vitest-when}

**`vitest-when` конкурирует с `calledWith`, и только с ним.** У него 702 637 загрузок за то же окно
и API из двух функций: `when(mock).calledWith(args).thenReturn(v)`. Ещё есть `thenResolve`,
`thenReject`, `thenThrow`, `thenDo`, хелпер `debug()` и `{ ignoreExtraArgs, times }`. Аргументы
сравниваются глубоким равенством через `equals` из `@vitest/expect`, поэтому асимметричные матчеры
Vitest внутри работают. `calledWith` здесь сравнивает по тем же правилам.

`when()` настраивает мок, который у вас уже есть; сам он мок не создаёт. Поэтому в нём нет:

- чтения класса и моков по одному только типу;
- спаев геттеров;
- хелперов для Promise и Observable по типу возврата;
- поддержки Angular, Bun и `node:test`;
- `mustBeCalledWith`: вызов с другими аргументами возвращает `undefined`, а не падает.

Эти двое хорошо работают вместе. Если на Vitest нужны только ответы в зависимости от аргументов,
`vitest-when` — инструмент поменьше. Две заметки об упаковке:

- **Берите 0.10.2, пропускайте 0.10.1.** `0.10.1` (2026-09-01) поставлял `dist/vitest-when.mjs` и
  `.d.mts`, а карта `exports` указывала на `.js` и `.d.ts`, поэтому его нельзя было импортировать.
  `0.10.2` (2026-09-03) исправляет карту, проверено в опубликованном пакете 2026-09-04. Прежний совет
  фиксировать 0.10.0 больше не действует.
- **Под pnpm ставьте `@vitest/expect` сами.** Бандл импортирует его всегда, а
  `peerDependenciesMeta` помечает его как необязательный.

### Где это работает и сколько стоит {#where-it-runs-and-what-it-costs}

|                                                | vitest-auto-spy | jest-auto-spies | vitest-mock-extended | jest-mock-extended | @golevelup/ts-vitest | @suites/unit |   ng-mocks   | @testing-library/angular | @ngneat/spectator  |    sinon    |
| ---------------------------------------------- | :-------------: | :-------------: | :------------------: | :----------------: | :------------------: | :----------: | :----------: | :----------------------: | :----------------: | :---------: |
| Vitest                                         |       ✅        |       ❌        |          ✅          |         ❌         |          ✅          |      ✅      |      ✅      |            ✅            |     частично¹      | свои стабы³ |
| Jest                                           |    пока нет²    |       ✅        |          ❌          |         ✅         |          ❌          |      ✅      |      ✅      |            ✅            |         ✅         | свои стабы³ |
| Bun (`bun:test`)                               |     **✅**      |       ❌        |          ❌          |         ❌         |          ❌          |      ❌      |      ❌      |            ❌            |         ❌         | свои стабы³ |
| `node:test`                                    |     **✅**      |       ❌        |          ❌          |         ❌         |          ❌          |      ❌      |      ❌      |            ❌            |         ❌         | свои стабы³ |
| Хелперы для Angular `TestBed`                  |       ✅        |       ✅        |          ❌          |         ❌         |          ❌          |    **❌**    |      ✅      |            ✅            |         ✅         |     ❌      |
| Angular **TestBed под `bun`**                  |     **✅**      |       ❌        |          ❌          |         ❌         |          ❌          |      ❌      |      ❌      |            ❌            |         ❌         |     ❌      |
| Хелперы для Angular **zoneless**               |       ✅        |       ❌        |          ❌          |         ❌         |          ❌          |      ❌      |      ❌      |    ✅ (`./zoneless`)     |         ❌         |     ❌      |
| Тестовый хелпер для `httpResource()`           |     **✅**      |       ❌        |          ❌          |         ❌         |          ❌          |      ❌      |      ❌      |            ❌            |         ❌         |     ❌      |
| Работает со спеками, скомпилированными **AOT** |       ✅        |        —        |          —           |         —          |          —           |      —       | `aot: false` |            —             |         —          |      —      |
| Рецепт для NestJS                              |       ✅        |       ❌        |          ❌          |         ❌         |          ✅          |      ✅      |      ❌      |            ❌            |         ❌         |     ❌      |
| Юнит NestJS из DI-метаданных                   |       ✅        |       ❌        |          ❌          |         ❌         |          ❌          |      ✅      |      ❌      |            ❌            |         ❌         |     ❌      |
| Рецепты для React / Vue / Svelte               |       ✅        |       ❌        |          ❌          |         ❌         |          ❌          |      ❌      |      ❌      |            ❌            |         ❌         |     ❌      |
| Рантайм-зависимости                            |      **0**      |        1        |          1           |         2          |          0           |      4       |      0       |            1             | 3 (включая jQuery) |      4      |

¹ `@ngneat/spectator/vitest` — настоящая точка входа, она есть с 19.2.0 (2024-12-17). Подвох в
другом: его типы объявляют `namespace jasmine`, и глобалы Jasmine попадают в проект на Vitest. Ещё он
импортирует пакет, который Angular 20 объявил устаревшим; см.
[выше](#half-the-field-has-stopped-shipping).
² Ядро работает с любым раннером через адаптер раннера; у Vitest, Bun и `node:test` он есть. См.
[Рантаймы](/ru/runtimes/vitest). Импорт точки входа регистрирует адаптер сам, больше ничего делать не нужно. **Адаптера для Jest
сегодня нет**, и ни одна точка входа не
экспортирует способ зарегистрировать свой. Поэтому у проекта на Jest пока нет поддерживаемого
способа использовать пакет. Проверено 2026-09-02.
³ sinon — библиотека, а не интеграция с раннером. Его стабы принадлежат ему самому, поэтому ни
матчеры раннера, ни его очистка через `clearMocks` / `restoreMocks` их не видят.

Число зависимостей взято из поля `dependencies` каждого пакета в npm, прочитано 2026-08-30:

| Пакет                      | Рантайм-зависимости                                      |
| -------------------------- | -------------------------------------------------------- |
| `jest-auto-spies`          | `@hirez_io/auto-spies-core` (последний релиз 2023-06-03) |
| `vitest-mock-extended`     | `ts-essentials`                                          |
| `jest-mock-extended`       | `ts-essentials`, `lodash.isequal`                        |
| `@suites/unit`             | четыре пакета `@suites/*`                                |
| `@testing-library/angular` | `tslib`                                                  |
| `@ngneat/spectator`        | `tslib`, `jquery`, `@testing-library/dom`                |
| `sinon`                    | четыре пакета `@sinonjs/*` и `diff`                      |

## Четыре вещи, которых нет больше нигде {#four-things-nothing-else-does}

Насколько показал этот обзор, ни у одной другой библиотеки на странице нет ничего из этого. Две вещи —
возможности; две — затраты, которые больше никто не измеряет и не публикует.

### 1. Спаи аксессоров на Bun {#_1-accessor-spies-on-bun}

Собственный `spyOn` в Bun отказывается работать с геттерами и сеттерами (аксессорами). Проверено на
Bun 1.4.0:

```ts
const o = {
  get v() {
    return 1;
  },
};
spyOn(o, 'v', 'get');
// TypeError: spyOn(target, prop) does not support accessor properties yet
```

Для аксессоров этот пакет не вызывает `spyOn` из Bun. Он сам заменяет свойство моком вашего раннера
и сохраняет вторую половину пары геттер/сеттер. Поэтому `accessorSpies.getters` работает одинаково
на Vitest, Bun и `node:test`.

Ни одна библиотека на этой странице, которая строит подмену из класса или типа, не спаит геттеры и
сеттеры, ни на одном рантайме. Это ng-mocks, spectator, `@testing-library/angular`, оба пакета
`*-mock-extended`, `@golevelup` и Suites. Заглушить аксессор вообще могут только два инструмента, по
одному свойству за раз:

- `vi.spyOn(obj, key, 'get')`, который работает только на Vitest;
- `stub(obj, key).get(fn)` из sinon, который не является моком раннера.

На Bun ни раннер, ни сгенерированная подмена не дают вам ничего. См.
[Спаи аксессоров](/ru/core/create-spy-from-class) и [Bun](/ru/runtimes/bun).

### 2. `injectSpy` предупреждает, когда получил настоящий сервис {#_2-injectspy-warns-when-it-gets-the-real-service}

Вы вызываете `injectSpy(UserService)`, но забыли `provideAutoSpy(UserService)`. Тогда `injectSpy`
печатает предупреждение, один раз на токен в каждом файле спеки. В нём названы токен и недостающий
вызов `provideAutoSpy`.

Без этого предупреждения ошибка всплывает гораздо позже. Какой-нибудь тест вызывает
`.mockReturnValue` на настоящем методе и падает с `.mockReturnValue is not a function`.

Чтобы превратить предупреждение в падение, вызовите
`enableAngularDiagnostics({ unspiedProviders: true })` из `vitest-auto-spy/angular/diagnostics`.
Тогда падает каждый тест, который наткнулся на ошибку, а не только первый.

Spectator делает наоборот. `spectator.d.ts:17` объявляет
`inject<T>(token: Token<T>): SpyObject<T>`, поэтому **каждый** токен типизирован как спай, замокан
он или нет. Компилятор прячет ошибку.

### 3. Стоимость проверки типов {#_3-type-check-cost}

Моки на глубоких Proxy замедляют `tsc`, и насколько — никто не публикует. Обзор 2026-08-29 замерил
одну фикстуру через `tsc --extendedDiagnostics`, результат одинаков на трёх прогонах:

- класс на 80 членов;
- 30 объявлений моков;
- 600 обращений к членам.

| Тип                    | Инстанцирований типов |
| ---------------------- | --------------------: |
| `Spy<T>` (этот пакет)  |             **2 656** |
| `@golevelup/ts-vitest` |                 5 092 |
| `vitest-mock-extended` |                 5 614 |

`Spy<T>` обходится тайпчекеру примерно вдвое дешевле библиотек на глубоких Proxy, и при этом на
каждом методе больше хелперов. Это единственное число на странице, не перемеренное 2026-08-30.

Проверка в CI этого репозитория не даёт числу расти: `npm run types:budget`, часть `npm run check`.
Она строит фикстуру той же формы и проверяет её типы против исходников библиотеки. Затем вычитает
контрольную программу с тем же классом, но без спаев. Проверка падает, когда разница превышает
бюджет.

| Дата       | TypeScript |  Всего | Контроль | Дельта (`Spy<T>`) | Бюджет |
| ---------- | ---------- | -----: | -------: | ----------------: | -----: |
| 2026-09-02 | 5.9.3      |      — |   10 807 |             9 126 | 11 000 |
| 2026-09-12 | 6.0.3      | 23 265 |   12 855 |        **10 410** | 12 500 |

Бюджет оставляет около 20 % запаса; откат к типу на глубоких Proxy примерно удвоил бы дельту. Рост с
9 126 — не регрессия. Контрольная программа сама по себе выросла на 18,9 %, а дельта — на 14,1 %.
Значит, доля `Spy<T>` в общем счёте уменьшилась. Рост в основном дали новая мажорная версия
TypeScript и типизированные возможности, добавленные с тех пор, а не испортившийся тип.

Эта фикстура отличается от фикстуры обзора, которую так и не закоммитили. К тому же она считает
против исходников, а не против опубликованных объявлений. Поэтому сравнивайте дельту только с ней
самой между коммитами, но не с 2 656 выше. `node scripts/check-type-budget.mjs --print` выводит
фикстуру; `--measure` печатает числа, не роняя проверку.

### 4. Стоимость в рантайме {#_4-runtime-cost}

Во сколько тот же класс обходится на весь прогон тестов, а не на один мок? Этого тоже никто не
публикует.

В сравнении участвуют `jest-auto-spies@3.0.1`, `jasmine-auto-spies@8.0.1` и
`@bugsplat/vitest-auto-spies@1.0.0`, каждый измерен напрямую. Все три оборачивают
`@hirez_io/auto-spies-core@3.0.0` и отличаются только фабрикой спаев, которую ему передают
(`jest.fn()`, `jasmine.createSpy()`, `vi.fn()`). Между собой они расходятся на единицы процентов в
каждом случае. Пакеты для Jest и Jasmine работают здесь под минимальным глобалом `jest` / `jasmine`
на базе `vi.fn()`. Так каждый участник сравнения (в таблицах ниже — «ветка») создаёт один и тот же мок. Числа описывают собственный код
каждой библиотеки, а не настоящий прогон на Jest или Jasmine.

**Скорость всего прогона против этого общего ядра** (перемерено на сборке 4.1, 2026-09-04):

| Размер класса | Тестов | Этот пакет быстрее в | Раунды                                 |
| ------------- | -----: | -------------------: | -------------------------------------- |
| 20 методов    |  1 000 |                1,50× | медиана трёх                           |
| 20 методов    |  3 000 |                1,61× | медиана трёх                           |
| 20 методов    | 10 000 |                1,54× | медиана трёх; все 9 раундов 1,46–1,62× |
| 100 методов   | 10 000 |                1,68× | 5 из 5 раундов выше 1,0× (1,66–1,73×)  |

**Микробенчмарки.** В версии 4.1 спаи методов перестали строиться на `vi.fn()`; матчеры `expect` из Vitest с ними
по-прежнему работают. См.
[движок спаев](/ru/core/performance#the-spy-engine). До этого шесть строк в опубликованных таблицах были проигрышем, а
одна — паритетом. Самые заметные изменения:

|                                               |                  4.0 |           4.1 |             лучшая чужая ветка |
| --------------------------------------------- | -------------------: | ------------: | -----------------------------: |
| вызваны все 14 из 14 методов                  | 18,92 мкс (проигрыш) |  **8,17 мкс** | 17,92 мкс рукописный `vi.fn()` |
| вызваны все 45 из 45 методов                  | 75,33 мкс (проигрыш) | **26,12 мкс** | 62,04 мкс рукописный `vi.fn()` |
| `createAutoMock<T>()`, 40 членов              | 72,88 мкс (проигрыш) | **18,92 мкс** | 56,79 мкс vitest-mock-extended |
| `mockDeep<T>()`, 3 уровня                     |  8,83 мкс (проигрыш) |  **2,29 мкс** |  5,46 мкс vitest-mock-extended |
| диспетчеризация `calledWith`                  |   0,54 мкс (паритет) |  **0,17 мкс** |  0,54 мкс vitest-mock-extended |
| удержанная куча, один материализованный метод |              5 445 Б |   **1 929 Б** |   5 169 Б рукописный `vi.fn()` |

Теперь этот пакет выигрывает в **каждой** опубликованной таблице микробенчмарков «один на один». Это касается и двух блоков
`worst case`, где тест вызывает каждый метод и ленивой библиотеке нечего пропустить. Самый узкий
отрыв — 2,19×, в строке, где тест вызывает каждый метод своей подмены.

Насколько точны эти цифры:

- Каждая — **медиана p75 семи независимых прогонов** при удвоенном бюджете итераций.
- Колонка ± в каждой строке показывает, насколько медиана может ошибаться: обычно ±0,9 %, в худшем
  случае ±6,3 % по 47 строкам.
- **Не цитируйте разницу меньше примерно 20 % по одному локальному прогону.** 2,19× далеко за этой
  границей.

Полная методика:
[Производительность → измеренный предел разрешения](/ru/core/performance#the-measured-resolution-limit).

Два противовеса:

- **Часть отрыва — в том, что пакет не платит раннеру за каждый мок**, а все остальные ветки
  платят. Это настоящая разница в продукте, и таблица показывает её размер. Ветка
  `hand-written vi.fn() per method` — собственный мок раннера без библиотеки посередине.
  `setSpyEngine('runner')` возвращает пакет на `vi.fn()`, если нужно сравнение без этой разницы.
- **На всём прогоне рукописные подмены на `vi.fn()` всё же дешевле.** Микробенчмарки выше меряют
  только сборку подмены. При `isolate: true` по умолчанию рукописные подмены
  выигрывают примерно **3 %** по медиане на сборке 4.1 (до неё — 10–15 %). Отдельные раунды — от
  0,84× до 1,00×. Сборка подмены — около одного процента стоимости теста, поэтому выигрыш в 10× на
  подмене даёт несколько процентов на прогоне.

**Вчистую библиотека выигрывает по памяти.** Два замера:

| Замер                                                       | Рукописные / другие         | Этот пакет                                                                                                                 |
| ----------------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Пиковая память, класс из 100 методов, `test.isolate: false` | 6366 МБ (рукописные)        | 1851 МБ (`lazySpies: 'proxy'`, по умолчанию при таком размере класса; замерено до 27.09.2026); 2103 МБ (`lazySpies: true`) |
| Удержанная память на метод, нетронутый класс из 100 методов | 5 835 Б (`jest-auto-spies`) | **256 Б** (по умолчанию)                                                                                                   |

Первый замер — это разница между воркером CI, который доработал, и тем, которого убили за нехватку
памяти. Второй — цифра, которая решает судьбу большого прогона. Полные таблицы, методика и цифры по
каждой библиотеке:
[Производительность → Удерживаемая память на подмену](/ru/core/performance#retained-memory-per-double).

Измерено 2026-09-04: Node v24.19.0, Vitest 4.1.11, Apple M4 Max. Как воспроизвести:

| Команда                    | Что запускает                                              |
| -------------------------- | ---------------------------------------------------------- |
| `npm run bench:vs:precise` | медиану семи прогонов, использованную выше, около 11 минут |
| `npm run bench:vs`         | один прогон примерно на минуту, для локальных итераций     |
| `npm run bench:suite`      | сравнение на всём прогоне                                  |

Методика по режимам isolate и чередованию — в [Производительности](/ru/core/performance).

## Angular {#angular}

С этим пакетом напрямую конкурируют две Angular-библиотеки. `ng-mocks` делает то, за что этот пакет
не берётся: мокает целое дерево компонентов.

### ng-mocks {#ng-mocks}

**[ng-mocks](https://github.com/help-me-mom/ng-mocks)**: 14.17.3 от 2026-08-24, 2,5 млн загрузок в
месяц, здоров.

Он выигрывает, когда нужно замокать целый граф компонентов и модулей. Здесь ничего из этого нет:

- `MockBuilder` мокает весь граф деклараций разом.
- `MockInstance` дотягивается до зависимости, которую читает **инициализатор поля вложенного
  потомка**.
- `ngMocks.findInstance` находит настоящий экземпляр в отрендеренном дереве.

Он проигрывает:

- в типах: `MockService<T>` возвращает `T` (см. [Сама подмена](#the-double-itself));
- в моках по типу без класса;
- в **AOT** (компиляция заранее, которая проверяет типы в шаблонах): ему нужен `aot: false`, а со спаями
  `vitest-auto-spy` спеки сохраняют полную AOT-проверку шаблонов;
- в [ресурсах](/ru/adapters/angular#resources-httpresource-and-resource);
- в zoneless, где у него нет ничего. _Zoneless_ — Angular без zone.js, где обнаружение изменений
  работает на сигналах.

Его поддержка Vitest настоящая и актуальная. `ngMocks.autoSpy('vitest')` появился в 14.17.0
(2026-08-10). Отдельный проект `e2e/vitest` гоняет его на `@angular/build:unit-test` с
`runner: vitest`. Две оговорки:

- Он не объявляет peer-зависимость на `vitest`; `vi` он берёт из глобала в рантайме.
- В его юнит-тестах ветка для Vitest помечена `istanbul ignore`, поэтому её покрывают только эти
  e2e-проекты.

### @testing-library/angular {#testing-library-angular}

**[@testing-library/angular](https://github.com/testing-library/angular-testing-library)**: 19.4.2 от
2026-08-07. Её обычно считают дополнением, но она пересекается с этим пакетом. Её точка входа
`/vitest-utils` экспортирует `createMock` / `provideMock`, которые делают то же, что
`createSpyFromClass` / `provideAutoSpy`.

Весь файл `fesm2022/testing-library-angular-vitest-utils.mjs` в 19.4.2 — 52 строки. Оба дефекта ниже
перечитаны в опубликованном пакете **2026-09-02**. Она хуже в трёх местах:

- **Геттеры пропускаются** (строка 14). Мок ставится только когда
  `typeof descriptor?.value === 'function'`. У дескриптора геттера нет `value`, поэтому
  `get isLoggedIn()` сервиса в подмене отсутствует. `Mock<T>` при этом типизирует его как
  вызываемый. Тест видит `undefined` там, где читает геттер, а не там, где строилась подмена.
- **`Object.prototype` тоже мокается** (строка 18). Обход идёт вверх по цепочке прототипов до `null`.
  Поэтому `hasOwnProperty`, `toString`, `valueOf` и `isPrototypeOf` оказываются замоканы в подмене.
  `createSpyFromClass` останавливается перед `Object.prototype` и его члены не собирает.
- **Только жадно.** Каждый метод строится заранее. [Ленивые спаи](/ru/core/performance) существуют
  потому, что это стоит 11,50 мкс против 6,04 мкс на сервисе из 40 методов.

Ещё это единственная сторонняя библиотека на странице с **поддержкой zoneless**. Точки входа
`./zoneless` нет в карте `exports` у 19.1.1, и она есть у 19.2.0, вышедшей 2026-03-17. Обе карты
прочитаны из опубликованных пакетов. Это настоящий плюс в её пользу. Её API рендеринга остаётся
другим инструментом, не фабрикой спаев.

Поэтому эта страница советует её оставить. Пошаговый перевод половины `/vitest-utils` — на странице
[Переход с @testing-library/angular](/ru/migrating-testing-library-angular). Там `createMock` в
`createSpyFromClass`, `provideMock` в `provideAutoSpy`, разница между `values` и `returns`, оба
дефекта, воспроизведённые в REPL, и что на самом деле даёт `render` из `./zoneless`.

### httpResource() {#httpresource}

**Ни одна другая Angular-библиотека не помогает с `httpResource()`.** Это главный примитив данных в
Angular. Слова `httpResource` нет в опубликованных пакетах ng-mocks 14.17.3, `@ngneat/spectator`
22.1.0 и `@testing-library/angular` 19.4.2, прочитанных 2026-09-02.

Без хелпера спека делает шесть шагов руками:

1. Тикнуть, потому что ресурс, созданный в контексте инъекции, ещё ничего не отправил.
2. Получить `HttpTestingController` через `inject()`.
3. Вызвать `expectOne`.
4. Вызвать `flush`.
5. Дать выполниться одной микрозадаче, чтобы ответ дошёл до ресурса.
6. Тикнуть ещё раз, чтобы представление, которое его читает, обновилось.

Обе половины ломаются молча:

- Пропустите первый тик — и `expectOne` сообщит о запросе, который так и не был отправлен. Это
  выглядит как баг в тестируемом коде.
- Пропустите микрозадачу — и проверка прочитает **значение ресурса по умолчанию**. Тест зелёный и
  останется зелёным, пока это значение не изменится.

[`expectRequest(url).flush(body)`](/ru/adapters/angular-http) делает все шесть шагов, и значение
можно читать уже на следующей строке. Это опирается на замер (Angular 21.2.17, zoneless `TestBed`).
`httpResource()` приходит в устойчивое состояние ровно через одну микрозадачу и один тик после того,
как его ответ отправлен через `flush`. Обычному `resource()` нужно два круга. Поэтому
[`settleResource`](/ru/adapters/angular#resources-httpresource-and-resource) по-прежнему нужен для
любого ожидания, не привязанного к одному запросу.

Цена небольшая и по желанию: одна **необязательная** peer-зависимость (`@angular/common`) за одной
точкой входа на 2,2 кБ. Проект, который не тестирует HTTP-вызовы, её не ставит.

### Собственный тестовый `Log` в Angular {#angular-s-own-test-log}

[`createLog()`](/ru/utilities/call-log) перенесён из класса `Log` в тестовом коде самого Angular
(`packages/core/testing/src/logger.ts`). В Angular три копии этого класса: в core, router и forms.
Там это обычный ответ всюду, где проверяется последовательность: хуки жизненного цикла, guards,
resolvers, завершение работы.

## NestJS {#nestjs}

### @suites/unit {#suites-unit}

**[@suites/unit](https://github.com/suites-dev/suites)**: 473 130 загрузок в месяц, рекомендован
документацией NestJS. Это самый серьёзный живой конкурент [рецепту для NestJS](/ru/recipes).

Suites собирает юнит из его DI-метаданных, поэтому изменение конструктора не заставляет переписывать
спеку. У точки входа этого пакета для Nest та же модель:
[`createNestUnit`](/ru/adapters/nestjs#building-the-unit-from-its-metadata). `expose` — это
`sociable().expose()`. Ваши собственные значения в `providers` перекрывают и спаи, и `expose`.
Отличия:

- За каждым токеном стоит `createSpyFromClass`, который читает настоящий прототип. Опечатка падает,
  а не получает ответ.
- Он читает те же метаданные, что и Suites. Ему нужно только то, что нужно самому Nest
  (`reflect-metadata`, `emitDecoratorMetadata`), и никаких пакетов-адаптеров.
- Он работает везде, где работает ядро.

Как устроен Suites:

- **Только бэкенд, по собственному описанию.** DI-адаптеры — `@suites/di.nestjs` и
  `@suites/di.inversify`. Адаптеры подмен — `@suites/doubles.jest`, `.vitest` и `.sinon` (все 3.1.0,
  по списку npm на 2026-08-30). **Ни Bun, ни `node:test`, ни Angular.**
- **Angular он не может в принципе.** Зависимости он находит по `design:paramtypes` конструктора. А
  `readonly #x = inject(X)`, как пишут современные Angular-классы, таких метаданных не создаёт.
  Открытого запроса на Angular в репозитории нет; issue #931 — собственный пункт мейнтейнера про
  injection-js.
- **`reflect-metadata` и `emitDecoratorMetadata` обязательны.** Это флаг в `tsconfig` и
  рантайм-импорт, которые проекту на Vite/esbuild иначе могут быть не нужны. У приложения на Nest
  они уже есть, и `createNestUnit` требует того же, не больше.
- **Его Proxy отвечает на любое свойство**, поэтому опечатка в имени замоканного метода никогда не
  падает. `createSpyFromClass` читает настоящий прототип, и
  [`onlyMethodsToSpyOn` сообщает об имени, которого на нём нет](/ru/core/create-spy-from-class).
  `createNestUnit` строит им каждый классовый токен.
- **v4 в бете с 2025-11-04** (`4.0.0-beta.0`) и на 2026-09-19 всё ещё не выпущена; `latest` —
  3.1.1 (2026-05-08). До ветки 3.1 между 3.0.1 (2025-01-02) и `4.0.0-alpha.0` (2025-10-27) не
  выходило ничего.
- **Vitest-адаптер при установке правит типы чужого пакета.** В `@suites/doubles.vitest` 3.1.0 есть
  скрипт `postinstall`. Он дописывает `/// <reference types="@suites/doubles.vitest/unit" />` в
  начало `index.d.ts` пакета `@suites/unit`, находя его по относительному пути. Иногда
  install-скрипты не запускаются: так по умолчанию в pnpm 10, с `--ignore-scripts`, в закрытом CI.
  Иногда два пакета лежат не рядом. Тогда `Mocked<T>` молча остаётся типом, не привязанным к раннеру,
  и документированный обходной путь — рукописный `global.d.ts`. У точек входа этого пакета свои
  типы, так что патчить нечего.
- **На Vitest метаданным декораторов нужен SWC.** esbuild, а значит и Vite, не выдаёт
  `design:paramtypes`. Проект на Nest под Vitest добавляет `unplugin-swc`, какой бы сборщик юнитов
  он ни использовал. `createNestUnit` читает те же метаданные, и ему это тоже нужно. Точки входа
  Angular, React, Vue и Svelte метаданные декораторов не читают вовсе.
- **Масштаб.** За неделю по 2026-09-18 `@suites/doubles.vitest` скачали 25 353 раза, а
  `@suites/unit` — 80 249. Один мейнтейнер, Apache-2.0.

**Solitary и sociable переносятся на Angular.** Suites называет две формы юнит-теста:

- _solitary_: каждая зависимость — подмена;
- _sociable_: несколько названных зависимостей настоящие, а всё за ними по-прежнему подменено.

В `TestBed` тот же выбор делается по одному провайдеру. `provideAutoSpy(X)` делает `X`
подменой. Чтобы `X` остался настоящим, укажите сам `X`. Сервис с `providedIn: 'root'`
настоящий и без указания. Сам список
провайдеров говорит, какие зависимости настоящие, и учить отдельный сборщик не нужно. На Nest
сборщик есть: [`createNestUnit(S, { expose: [D] })`](/ru/adapters/nestjs#sociable-—-expose) — это
`sociable().expose()`.

Пошаговый перевод — на странице [Переход с @suites/unit](/ru/migrating-suites). Там `unitRef.get` в
`spies.get`, `.mock().impl()` в управляющий хелпер или `providers`, строковые и символьные токены,
`@Optional()` и исчезающий `await`.

### @golevelup/ts-vitest {#golevelup-ts-vitest}

**[@golevelup/ts-vitest](https://github.com/golevelup/nestjs)**: 4.0.0 от 2026-03-18, 353 803
загрузки в месяц, выбор сообщества по умолчанию. `createMock<T>()` — глубокий Proxy без хелперов по
типу возврата и без сопоставления аргументов. Он стоит примерно вдвое больше инстанцирований типов
([Стоимость проверки типов](#_3-type-check-cost)). **`@golevelup/nestjs-testing` мёртв** (0.1.2 от
2019 года); не ссылайтесь на него как на актуальный пакет.

## За пределами спая класса {#beyond-the-class-spy}

Таблицы выше сравнивают то, что делают все эти библиотеки. Вот чего никто из остальных не даёт
вдобавок:

- [**Angular `TestBed` под `bun test`**](/ru/runtimes/bun-angular). В Bun нет DOM, и он не умеет
  разрешать `templateUrl`, поэтому Angular-спеки там не запускаются вообще. Один preload решает обе
  проблемы.
- [`renderShallow`](/ru/adapters/angular#shallow-component-rendering) и
  [`createWithAutoSpies`](/ru/adapters/angular#building-a-class-with-auto-spied-dependencies). Каждый
  заменяет одним вызовом шаблонный код поверхностного `TestBed` или создание экземпляра через DI.
  `renderShallow` не строит дочерние компоненты, поэтому его стоимость не растёт с числом детей.
  `TestBed.createComponent` растёт вместе с ними. Листовому компоненту без детей экономить нечего, и
  там `overrideComponent` на каждый тест может стоить больше, чем экономит. Как это работает и
  промежуточный вариант `keepTemplate: true` — в
  [Производительности](/ru/core/performance#_2-rendering-the-child-subtree).
- [`stable` / `flushEffects`](/ru/adapters/angular#zoneless-waiting) и `toHaveSignalValue`: ожидание
  в zoneless и матчер сигнала, для кода, где `detectChanges()` уже не хватает.
- [Проверки Observable](/ru/core/observable-assertions), которые падают, когда поток молчит. Они
  проверяют форму объекта, поэтому rxjs не тянут.
- [`setupFakeTimers()` / `advanceTimers()`](/ru/utilities/fake-timers): продвижение часов заодно
  выполняет микрозадачи, которые голый `advanceTimersByTime()` оставляет висеть.
  [`flushEventLoop` / `settleDynamicImport`](/ru/utilities/event-loop) — для очереди, до которой часы
  не добираются.
- [`mockConstructor` / `stubConstructor`](/ru/utilities/constructor-doubles): подмена, которую
  тестируемый код может вызвать через `new`. Собственный `vi.fn(() => instance)` раннера так не
  умеет.
- [`fakeAsync` и `waitForAsync` на Vitest](/ru/utilities/zone). `zone.js/testing` ставит свой
  ProxyZone только через хуки Jasmine и Jest, поэтому оба бросают ошибку, пока вы не импортируете
  этот патч.
- [`assertMocked` / `moduleNamespace`](/ru/utilities/module-mocks): доказательство, что `vi.mock()`
  действительно применился под бандлером, а спека не проверяет молча настоящий модуль.
- [`setupAutoSpy({ strayRejections: true })`](/ru/utilities/setup#_8-failing-on-a-rejection-zone-js-swallowed)
  превращает в упавшие тесты отклонённые промисы, которые zone.js отправляет в `console.error`.
  Vitest такой реджект не видит. Поэтому спека с проверкой внутри `.then()`, который никто не
  дождался, остаётся зелёной и завершается с кодом 0.
- [`setupAutoSpy({ pruneMockRegistry: true })`](/ru/utilities/setup#_9-pruning-the-mock-registry-nothing-empties)
  чистит `Set` внутри `@vitest/spy`. Туда попадает каждый `vi.fn()`, и никто их оттуда не убирает;
  опция оставляет только моки, которые живут дольше файла. При `isolate: false` этот `Set` делает
  `clearMocks` медленнее с каждым тестом. Ещё он держит в одном воркере записанные аргументы всего
  прогона и деревья компонентов за ними.
- [Пятьдесят семь правил ESLint](/ru/utilities/eslint-plugin), которые версионируются вместе с
  рекомендуемым ими API, и [`setupAutoSpy()`](/ru/utilities/setup) для очистки, нужной общей
  тестовой среде.
- [Пофайловая диагностика `TestBed`](/ru/adapters/angular#where-a-spec-spends-its-time): какие спеки
  действительно платят за `TestBed` и сколько.
- [`compareTestRuns`](/ru/migrating): не потеряла ли миграция тест. Он сравнивает два множества имён
  тестов, а не два итога, которые случайно совпали.

## Источники и даты {#sources-and-dates}

::: info Откуда берутся числа
Счётчики загрузок — окно npm **2026-07-29 → 2026-08-27** из обзора от **2026-08-29**. Версии, даты
публикаций, списки зависимостей, состояние репозиториев и цитируемые типы перечитаны из реестра npm
и опубликованных пакетов **2026-08-30**. Всё воспроизвелось. Считайте это датированным снимком и
перепроверяйте перед цитированием.

Перепроверено с тех пор:

- **2026-09-04**: оба дефекта `createMock` из `@testing-library/angular` в разделе
  [Angular](#angular), перечитаны в опубликованном пакете 19.4.2. Оба на месте, в тех же двух
  строках. Оба воспроизведены запуском опубликованного модуля; вывод — на странице
  [Переход с @testing-library/angular](/ru/migrating-testing-library-angular).
- **2026-09-04**: каждая версия и дата публикации в двух таблицах состояния, перечитаны из реестра.
  Всё воспроизвелось.
- **2026-09-04**: каждое число производительности на странице, полностью перемерено. Это
  собственные замеры пакета; полные таблицы — в [Производительности](/ru/core/performance).

Единственная цифра, не перемеренная против конкурентов, — число инстанцирований типов в разделе
[Стоимость проверки типов](#_3-type-check-cost), она взята из обзора 2026-08-29. У собственной
стоимости пакета есть число, измеряемое в CI с 2026-09-02; см. тот же раздел.
:::
