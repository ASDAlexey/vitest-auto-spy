---
title: Миграция с @suites/unit
description: Перевод спеки в спеку — с TestBed.solitary и TestBed.sociable на createNestUnit; формы API рядом, что каждая сторона запрещает и чего стоит переход.
---

# Миграция с `@suites/unit`

Эта страница переводит юнит-тесты NestJS с [`@suites/unit`](https://github.com/suites-dev/suites) на
[`createNestUnit`](/ru/adapters/nestjs#building-the-unit-from-its-metadata) из
`vitest-auto-spy/nestjs`. Обе библиотеки собирают тестируемый класс по его метаданным DI и
подменяют каждую зависимость спаем. Большинство спек меняется так:

```ts
// Было
import { TestBed } from '@suites/unit';

const { unit, unitRef } = await TestBed.solitary(CartService).compile();
unitRef.get(PricingService).total.mockReturnValue(100);

// Стало
import { createNestUnit } from 'vitest-auto-spy/nestjs';

const { unit, spies } = createNestUnit(CartService);
spies.get(PricingService).total.mockReturnValue(100);
```

На две вещи стоит обратить внимание: стаб несуществующего метода теперь падает
([подробно](#the-difference-that-will-change-a-spec)), а если конструктор вызывает зависимость, спай
нужно настроить через `providers` ([подробно](#configuring-a-double)). Что выбрать и почему — на
[странице сравнения](/ru/comparison#nestjs).

## Установить и удалить {#install-and-remove}

```bash
npm remove @suites/unit @suites/di.nestjs @suites/doubles.vitest
npm i -D vitest-auto-spy
```

Три прямых пакета превращаются в один.

- `@suites/unit` тянет ещё четыре рантайм-зависимости: `@suites/core.unit`, `types.common`,
  `types.di` и `types.doubles`.
- `@suites/di.nestjs` в рантайме импортирует `@nestjs/common/constants`, поэтому тестовые
  инструменты жёстко зависят от `@nestjs/common`.
- У `vitest-auto-spy` **ноль рантайм-зависимостей**, и из `@nestjs/*` он ничего не импортирует.
  Точка входа для Nest читает ключи метаданных как обычные строки.

**`tsconfig` не меняется.** Обоим пакетам нужны `reflect-metadata` и `emitDecoratorMetadata: true`.
Это требования самого Nest, так что в работающем Nest-приложении они уже есть.

**Конфиг Vitest не меняется.** esbuild (а значит, и Vite) не выдаёт `design:paramtypes`, поэтому
Nest-проект на Vitest уже прогоняет спеки через SWC (`unplugin-swc`). `createNestUnit` читает те же
метаданные, так что плагин остаётся.

**Один файл можно удалить:** `global.d.ts`, который ссылается на `@suites/doubles.vitest/unit`. Он
добавляет типы моков Vitest к `Mocked<T>` и `unitRef.get()`. Suites пытается сделать то же самое
`postinstall`-скриптом, который правит `.d.ts` пакета `@suites/unit` прямо в `node_modules`. Там, где
install-скрипты не запускаются (pnpm 10 по умолчанию, `--ignore-scripts`), этот скрипт ничего не
делает. Здесь `Spy<T>` — обычный экспортируемый тип, патчить нечего.

## Перевод {#the-translation}

| Suites                                              | `vitest-auto-spy/nestjs`                                                                                                             |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `await TestBed.solitary(S).compile()`               | `createNestUnit(S)`                                                                                                                  |
| `await TestBed.sociable(S).expose(D).compile()`     | `createNestUnit(S, { expose: [D] })`                                                                                                 |
| `const { unit, unitRef } = …`                       | `const { unit, spies } = …`                                                                                                          |
| `unitRef.get(Dep)`                                  | `spies.get(Dep)`                                                                                                                     |
| `unitRef.get<T>('TOKEN')`, `unitRef.get<T>(SYMBOL)` | `spies.get<T>('TOKEN')`, `spies.get<T>(SYMBOL)`                                                                                      |
| `.mock(Dep).impl((stub) => ({ … }))`                | `spies.get(Dep).method.mockReturnValue(…)`; если конструктор вызывает `Dep` — `providers: [provideAutoSpy(Dep, { returns: { … } })]` |
| `.mock('TOKEN').final({ … })`                       | `providers: [{ provide: 'TOKEN', useValue: { … } }]`                                                                                 |
| `Mocked<Dep>`                                       | [`Spy<Dep>`](/ru/core/spy-typing)                                                                                                    |

«Solitary» значит, что каждая зависимость — спай. «Sociable» значит, что несколько названных
зависимостей — настоящие классы, а всё, что за ними, по-прежнему спаи.

### Solitary {#solitary}

```ts
// Было
import { TestBed } from '@suites/unit';

const { unit, unitRef } = await TestBed.solitary(CartService).compile();

unitRef.get(PricingService).total.mockReturnValue(100);
unitRef.get(TaxService).rate.mockReturnValue(0.5);

expect(unit.checkout(3)).toBe(150);
```

```ts
// Стало
import { createNestUnit } from 'vitest-auto-spy/nestjs';

const { unit, spies } = createNestUnit(CartService);

spies.get(PricingService).total.mockReturnValue(100);
spies.get(TaxService).rate.mockReturnValue(0.5);

expect(unit.checkout(3)).toBe(150);
```

**`await` исчезает.** Suites ищет свои адаптеры во время компиляции, поэтому `compile()` возвращает
промис. `createNestUnit` читает метаданные и вызывает `new` синхронно. `beforeEach`, который
существовал только ради `await`, можно заменить обычным присваиванием.

На каждый токен — один экземпляр, как в стандартной singleton-области Nest. Зависимость, общая для
двух классов, — один спай и до, и после миграции.

### Sociable — `expose` {#sociable-—-expose}

```ts
// Было
const { unit, unitRef } = await TestBed.sociable(CheckoutFacade).expose(CartService).compile();

unitRef.get(PricingService).total.mockReturnValue(10);
```

```ts
// Стало
const { unit, spies } = createNestUnit(CheckoutFacade, { expose: [CartService] });

spies.get(PricingService).total.mockReturnValue(10);
```

`expose` принимает весь список сразу, а не цепочкой. В Suites `sociable()` требует хотя бы один
`.expose()` перед `.compile()`. Здесь `{ expose: [] }` допустим и означает solitary.

Ни одна сторона не отдаст вам открытый (exposed) класс как спай. Suites бросает
`DependencyResolutionError` с текстом, что идентификатор «is marked as an exposed dependency».
`spies.get(CartService)` тоже бросает ошибку и называет оба способа исправить. `spies.exposedTokens()`
перечисляет, что на самом деле построено, так что запись в `expose`, которая никому не понадобилась,
видна как отсутствующая.

### Настройка зависимости {#configuring-a-double}

Suites настраивает зависимость до `compile()`, потому что до этого момента юнита ещё нет:

```ts
// Было
const { unit, unitRef } = await TestBed.solitary(CartService)
  .mock(TaxService)
  .impl((stub) => ({ rate: stub().mockReturnValue(0.2) }))
  .compile();
```

`createNestUnit` строит юнит сразу. Настраивайте спай после этого
[хелперами управления](/ru/core/control-helpers). Собственные `mockReturnValue` и `mockResolvedValue`
из Vitest тоже работают; `resolveWith(v)` — типизированный вариант, а `calledWith(arg).resolveWith(v)`
отвечает только на один аргумент:

```ts
// Стало
const { unit, spies } = createNestUnit(CartService);

spies.get(TaxService).rate.mockReturnValue(0.2);
spies.get(ApiService).fetchUser.calledWith(7).resolveWith(user);
```

**Если конструктор вызывает зависимость**, «после» — слишком поздно. Передайте настроенный спай через
`providers`; он важнее автоматических спаев. `returns` задаёт, что возвращает каждый названный метод
при любых аргументах ([все опции](/ru/core/create-spy-from-class)):

```ts
import { createNestUnit, provideAutoSpy } from 'vitest-auto-spy/nestjs';

const { unit, spies } = createNestUnit(CartService, {
  providers: [provideAutoSpy(TaxService, { returns: { rate: 0.2 } })],
});
```

`.final(value)` из Suites («это значение, а не мок») становится записью в `providers`:

```ts
// Было
await TestBed.solitary(CartService).mock('CONFIG').final({ currency: 'EUR' }).compile();

// Стало
createNestUnit(CartService, { providers: [{ provide: 'CONFIG', useValue: { currency: 'EUR' } }] });
```

Одно отличие вам на руку. В Suites `unitRef.get('CONFIG')` бросает `DependencyResolutionError`,
потому что «faked dependencies are not intended for direct retrieval». Здесь `spies.get('CONFIG')`
возвращает переданное значение.

`providers` принимает ещё:

- `{ provide: Abstract, useClass: Impl }`: строится как открытый класс, его зависимости — спаи;
- `{ provide: TOKEN, useFactory }`: фабрика без аргументов, которая выполняется один раз, при первом
  запросе токена.

### Токены без класса {#tokens-with-no-class}

В обоих пакетах строковый или символьный токен передаётся прямо в `get`:

```ts
unitRef.get<AppConfig>('CONFIG'); // Suites
spies.get<AppConfig>('CONFIG'); //  здесь
spies.get<Flags>(FLAGS); //          и символы тоже
```

Оба читают токен из одних и тех же метаданных: `@Inject('CONFIG')` записывает его в
`self:paramtypes`. Отличается то, что вы получаете. У токена без класса нет методов, которые можно
прочитать, поэтому этот пакет отвечает на него [`createAutoMock()`](/ru/core/auto-mock-by-type) —
моком, собранным по типу. Для сервиса за интерфейсом это подходит. Для объекта конфигурации — нет:
`config.currency` окажется функцией-спаем, а не `'EUR'`. Такие значения передавайте через
`providers`, как выше.

### `@Optional()` и внедрение в свойства {#optional-and-property-injection}

Внедрение в свойства (`@Inject(Logger) logger!: Logger`) работает в обоих пакетах. Оба читают
`self:properties_metadata` и `design:type` и присваивают значение после создания экземпляра.

`@Optional()` работает только здесь. `@suites/di.nestjs` читает `design:paramtypes`,
`self:paramtypes` и `self:properties_metadata`, но не `optional:paramtypes`, так что декоратор ничего
не меняет. `createNestUnit` его читает:

- параметр или свойство с `@Optional()`, токен которого нельзя внедрить, получает `undefined`, как в
  Nest;
- необязательная зависимость, токен которой внедрить можно, всё равно получает свой спай.

```ts
class ReportService {
  constructor(
    readonly logger: Logger,
    @Optional() @Inject('AUDIT') readonly audit?: AuditSink,
  ) {}
}

const { unit, spies } = createNestUnit(ReportService);

expect(unit.logger).toBe(spies.get(Logger));
```

## Отличие, из-за которого спека изменится {#the-difference-that-will-change-a-spec}

**Мок Suites отвечает на любое имя свойства.** `@suites/doubles.vitest` строит мок как `Proxy`,
ловушка `get` которого создаёт всё, чего не хватает:

```js
// @suites/doubles.vitest 3.1.0, mock.static.js
get: (obj, property) => {
  if (!(property in obj)) {
    // …
    if (property !== 'calls') {
      obj[property] = new Proxy(vi.fn(), handler());
      obj[property]._isMockObject = true;
    }
  }
  return obj[property];
};
```

Мок начинается с пустого объекта и ничего не читает из класса, поэтому принимает любое имя.
Переименуйте в сервисе `getUser` в `fetchUser` — и спека, которая всё ещё настраивает `getUser`,
продолжит проходить. Стаб настраивает функцию, которую никто не вызывает, и тесты остаются зелёными
для метода, которого больше нет.

```ts
unitRef.get(Api).getUserz.mockResolvedValue(user); // рабочий мок несуществующего метода
```

Здесь спай строится по настоящему классу через [`createSpyFromClass`](/ru/core/create-spy-from-class),
поэтому та же строка падает:

```ts
spies.get(Api).getUserz; // undefined: `getUserz` нет на Api.prototype
spies.get(Api).getUserz.mockResolvedValue(user); // TypeError — на той строке, где ошибка
```

Если перечислить метод явно, ошибка его назовёт:
`createSpyFromClass(Api, { onlyMethodsToSpyOn: ['getUserz'] })` сообщает, что `getUserz` нет на
прототипе класса. В обоих случаях неправильный стаб падает там, где он написан.

После миграции ждите, что часть спек упадёт именно так. Каждая из них настраивала переименованный
метод, и найти их — часть того, что вы получаете.

### Что каждая сторона запрещает {#what-each-side-refuses}

| Ситуация                                 | Suites                                                 | `createNestUnit`                                                |
| ---------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------- |
| Метод с опечаткой на моке                | рабочий мок                                            | `undefined` или именованная ошибка с `onlyMethodsToSpyOn`       |
| `get` токена, который юнит не запрашивал | `DependencyResolutionError`                            | бросает ошибку **и перечисляет токены с автоспаями**            |
| `get` открытого (exposed) класса         | `DependencyResolutionError`                            | бросает ошибку и называет оба исправления                       |
| `get` переданной константы               | бросает: «faked dependencies»                          | возвращает значение                                             |
| Параметр с типом-интерфейсом             | берёт выданный компилятором `Object` как идентификатор | бросает ошибку с именем класса, позицией и обоими исправлениями |
| Цикл среди настоящих классов             | совет про `forwardRef` в тексте ошибки                 | называет цикл как `A -> B -> A`                                 |

Больше всего времени экономит вторая строка. Обе стороны отказывают в токене, который юнит не
использует: спай, которого юнит не видит, делает тест, который не может упасть. Здесь ошибка ещё и
перечисляет, что юнит _действительно_ запросил. Поэтому после рефакторинга `spies.get(OldService)`
в том же сообщении подскажет новое имя.

## Чем приходится пожертвовать {#what-you-give-up}

- **Inversify.** У Suites есть `@suites/di.inversify` рядом с `@suites/di.nestjs`, а в списке его
  адаптеров упомянут и `tsyringe` (в npm его сейчас нет). Здесь поддержки Inversify нет и не
  планируется: `createNestUnit` читает только ключи метаданных Nest. Проект на Inversify оставьте на
  Suites.
- **Jest.** Точки входа для Jest нет. Пакет поддерживает Vitest, `bun:test` и `node:test` и не даёт
  публичного способа подключить другой раннер. Если проект остаётся на Jest, используйте
  `@suites/doubles.jest`.
- **`identifierMetadata`.** Каждый `get` и `mock` в Suites принимает необязательный объект
  метаданных — для DI-контейнеров, которые различают привязки не только по токену. Здесь такого нет:
  токен есть токен.
- **Настройка зависимости до создания экземпляра — другой вызов.** `.mock(…).impl(…)` в Suites
  выполняется до появления юнита, поэтому покрывает конструктор, который вызывает зависимость. Здесь
  для этого нужен `providers: [provideAutoSpy(Dep, config)]`.

## Что вы получаете {#what-you-get}

- **Ноль рантайм-зависимостей** вместо четырёх транзитивных пакетов `@suites/*`, двух адаптеров,
  которые вы ставите сами, и рантайм-импорта `@nestjs/common`.
- **Опечатка падает.** См. [отличие выше](#the-difference-that-will-change-a-spec).
- **Три рантайма.** Одна и та же спека работает на Vitest, [`bun:test`](/ru/runtimes/bun) и
  [`node:test`](/ru/runtimes/node). Suites — только для бэкенда и поставляет адаптеры моков для Jest,
  Vitest и sinon.
- **Остальные тесты фронтенда на той же библиотеке:** [Angular](/ru/adapters/angular),
  [React](/ru/adapters/react), [Vue](/ru/adapters/vue) и [Svelte](/ru/adapters/svelte). Angular
  Suites покрыть не может: он находит зависимости через `design:paramtypes` конструктора, а
  `readonly #x = inject(X)` таких метаданных не создаёт.
- **Потоки и аксессоры.** Мок Suites отвечает на любое имя функцией `vi.fn()`. Метод, который
  возвращает `Observable`, не получает хелперов для потоков, а чтение геттера возвращает
  мок-функцию. Здесь метод с `Observable` получает
  [`nextWith` и остальные](/ru/core/control-helpers#observable-methods-properties-—-nextwith), а
  геттеры и сеттеры — [свои спаи](/ru/core/create-spy-from-class#accessor-spies-—-accessorspies).
- **Хелперы, которые в Nest-спеке иначе пишут руками:** спаи геттеров и сеттеров,
  [observable-спаи](/ru/core/observable-assertions), `calledWith` / `resolveWith` /
  `mustBeCalledWith`, [строгий режим](/ru/core/strict-mode) и [фикстуры](/ru/core/create-spy-from-class).
- **Синхронное создание** и ошибка `spies.get`, которая называет, что юнит на самом деле запросил.

## В чём Suites прав {#what-suites-gets-right}

Suites — сборщик юнит-тестов, на который ссылается документация Nest; его скачивают почти полмиллиона
раз в месяц. `createNestUnit` сознательно взял у него модель, и обе главные идеи переходят вместе с
ней.

**Юнит собирается по собственным метаданным DI.** Провайдер Nest уже объявляет свои зависимости:
`@Injectable()` и `emitDecoratorMetadata` их записывают. Спека, которая повторяет их записями
`{ provide, useValue }`, — вторая копия конструктора, и каждое изменение конструктора правит обе.
Suites вместо этого читает метаданные, так что в спеке нет списка провайдеров, который мог бы
устареть.

**Solitary и sociable — две настоящие формы юнит-теста.** Sociable-тест намеренно сдвигает границу
на один класс наружу. Он не растит тестовый модуль, пока тот не превратится во всё приложение. Suites
сделал это полноценным выбором в API, и это правильный выбор. `createNestUnit` сохраняет обе формы.

Эти два слова полезны и за пределами Nest. `TestBed` в Angular делает тот же выбор по одному
провайдеру:

- `provideAutoSpy(Dep)` для каждой зависимости — solitary-спека;
- если оставить одну зависимость настоящей (не указать её или указать настоящий класс), спека станет
  sociable.

Отдельный сборщик там не нужен: список провайдеров уже им является.

## Версии, по которым это писалось {#versions-this-was-written-against}

- `@suites/unit` 3.1.1 (опубликован 2026-05-08), `@suites/di.nestjs` и `@suites/doubles.vitest` —
  3.1.0.
- `4.0.0-beta.0` опубликован 2025-11-04. С тех пор на линейке 4.x ничего не вышло; следующие релизы
  3.1.x — на линейке 3.x.
- До них между 3.0.1 (2025-01-02) и `4.0.0-alpha.0` (2025-10-27) ничего не публиковалось.

Всё на этой странице прочитано из опубликованных архивов пакетов, а не с сайта документации. Версии
и даты перепроверены в реестре 2026-09-19: без изменений, 3.1.1 всё ещё `latest`. За неделю до
2026-09-18 `@suites/unit` скачали 80 249 раз, а `@suites/doubles.vitest` — 25 353 раза.
