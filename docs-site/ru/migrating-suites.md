---
title: Миграция с @suites/unit
description: Перенесите тесты NestJS с TestBed.solitary или TestBed.sociable на createNestUnit. Узнайте, что заменить и в каких тестах смены импорта недостаточно.
---

# Миграция с `@suites/unit`

Если вы переносите юнит-тесты NestJS с [`@suites/unit`](https://github.com/suites-dev/suites),
используйте [`createNestUnit`](/ru/adapters/nestjs#building-the-unit-from-its-metadata) из `vitest-auto-spy/nestjs`.
Обе библиотеки читают зависимости, которые Nest записывает для класса, и по умолчанию подменяют их спаями.
Замените цепочку вызовов `TestBed` на `createNestUnit()`, а `unitRef.get()` — на `spies.get()`:

```ts
// After
import { createNestUnit } from 'vitest-auto-spy/nestjs';

const { unit, spies } = createNestUnit(CartService);
spies.get(PricingService).total.mockReturnValue(100);
```

```ts
// Before
import { TestBed } from '@suites/unit';

const { unit, unitRef } = await TestBed.solitary(CartService).compile();
unitRef.get(PricingService).total.mockReturnValue(100);
```

В двух случаях тест может упасть после перехода:

- [Настройка спая для несуществующего метода](#the-difference-that-will-change-a-spec) теперь вызывает ошибку.
- Если конструктор вызывает зависимость, [настройте её спай через `providers`](#configuring-a-double).

Если ещё решаете, стоит ли переходить, посмотрите [сравнение для NestJS](/ru/comparison#nestjs).

## Установить и удалить {#install-and-remove}

```bash
npm remove @suites/unit @suites/di.nestjs @suites/doubles.vitest
npm i -D vitest-auto-spy
```

- **Оставьте `tsconfig` как есть.** Обоим пакетам нужны `reflect-metadata` и `emitDecoratorMetadata: true`, как и самому Nest.
- **Оставьте настройки Vitest.** esbuild в Vite не записывает `design:paramtypes` — метаданные с типами параметров конструктора. Сохраните плагин SWC (`unplugin-swc`), который их записывает.
- **Удалите `global.d.ts`, если в нём только ссылка на `@suites/doubles.vitest/unit`.** Эта ссылка добавляет типы моков Vitest к `Mocked<T>` и `unitRef.get()`. `Spy<T>` экспортируется напрямую и не требует патча.

Suites также пытается добавить типы моков, правя объявления `@suites/unit` в `node_modules`.
Его скрипт `postinstall` не сработает, если скрипты установки отключены (по умолчанию в pnpm 10 или с `--ignore-scripts`).

Вместо трёх пакетов вы устанавливаете один. `@suites/unit` подтягивает ещё четыре пакета для выполнения тестов:
`@suites/core.unit`, `types.common`, `types.di` и `types.doubles`. Адаптер Nest при запуске импортирует
`@nestjs/common/constants`, поэтому инструментам нужен `@nestjs/common`.
У `vitest-auto-spy` **нет зависимостей времени выполнения** и импортов из `@nestjs/*`.
Его точка входа для Nest читает ключи метаданных как строки.

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

В solitary-тесте все зависимости заменяются спаями. В sociable-тесте выбранные классы остаются настоящими, а остальные зависимости, в том числе зависимости этих классов, заменяются спаями.

### Solitary {#solitary}

```ts
// Before
import { TestBed } from '@suites/unit';

const { unit, unitRef } = await TestBed.solitary(CartService).compile();

unitRef.get(PricingService).total.mockReturnValue(100);
unitRef.get(TaxService).rate.mockReturnValue(0.5);

expect(unit.checkout(3)).toBe(150);
```

```ts
// After
import { createNestUnit } from 'vitest-auto-spy/nestjs';

const { unit, spies } = createNestUnit(CartService);

spies.get(PricingService).total.mockReturnValue(100);
spies.get(TaxService).rate.mockReturnValue(0.5);

expect(unit.checkout(3)).toBe(150);
```

**Уберите `await`.** Suites ищет адаптеры в `compile()`, поэтому этот вызов возвращает промис.
`createNestUnit` читает метаданные и сразу вызывает `new`. Если в `beforeEach` был только вызов
`compile()` с `await`, теперь достаточно синхронного присваивания. Оставьте `beforeEach`, если каждому тесту нужны новые спаи.

Оба пакета создают один экземпляр на токен, как Nest по умолчанию. Если два класса используют одну зависимость, они получают один и тот же спай.

### Sociable — `expose` {#sociable-—-expose}

```ts
// Before
const { unit, unitRef } = await TestBed.sociable(CheckoutFacade).expose(CartService).compile();

unitRef.get(PricingService).total.mockReturnValue(10);
```

```ts
// After
const { unit, spies } = createNestUnit(CheckoutFacade, { expose: [CartService] });

spies.get(PricingService).total.mockReturnValue(10);
```

Передайте список классов в `expose` вместо цепочки вызовов. Для sociable-теста Suites требует хотя бы один `.expose()`.
В `createNestUnit` пустой список `{ expose: [] }` даёт тот же результат, что и solitary-тест.

`CartService` — настоящий экземпляр, поэтому ни один `get` не вернёт для него спай. Suites выдаёт
`DependencyResolutionError` с текстом «is marked as an exposed dependency». Ошибка `spies.get(CartService)`
подскажет, что сделать: получить спаи зависимостей класса или убрать его из `expose`.
Если класса нет в `spies.exposedTokens()`, он не понадобился при создании тестируемого объекта.

### Настройка зависимости {#configuring-a-double}

В Suites настройте мок до того, как `.compile()` создаст тестируемый класс:

```ts
// Before
const { unit, unitRef } = await TestBed.solitary(CartService)
  .mock(TaxService)
  .impl((stub) => ({ rate: stub().mockReturnValue(0.2) }))
  .compile();
```

С `createNestUnit` настройте спаи после создания экземпляра:

```ts
// After
const { unit, spies } = createNestUnit(CartService);

spies.get(TaxService).rate.mockReturnValue(0.2);
spies.get(ApiService).fetchUser.calledWith(7).resolveWith(user);
```

Подойдут `mockReturnValue` и `mockResolvedValue` из Vitest или [хелперы библиотеки](/ru/core/control-helpers).
`resolveWith(v)` задаёт результат промиса с проверкой типа. С `calledWith(7)` этот результат вернётся только при вызове с `7`.

**Если конструктор вызывает зависимость, настройте спай в `providers`.** Он заменит автоматически созданный спай.
В `returns` задайте, что вернёт каждый указанный метод при любых аргументах ([опции спая](/ru/core/create-spy-from-class)):

```ts
import { createNestUnit, provideAutoSpy } from 'vitest-auto-spy/nestjs';

const { unit, spies } = createNestUnit(CartService, {
  providers: [provideAutoSpy(TaxService, { returns: { rate: 0.2 } })],
});
```

Чтобы передать готовое значение вместо мока, замените `.final(value)` провайдером с `useValue`:

```ts
// Before
await TestBed.solitary(CartService).mock('CONFIG').final({ currency: 'EUR' }).compile();

// After
createNestUnit(CartService, { providers: [{ provide: 'CONFIG', useValue: { currency: 'EUR' } }] });
```

`spies.get('CONFIG')` вернёт переданное значение. Suites выдаёт `DependencyResolutionError`:
«faked dependencies are not intended for direct retrieval».

В `providers` также можно передать:

- `{ provide: Abstract, useClass: Impl }`: создаёт настоящий экземпляр `Impl` со спаями вместо зависимостей.
- `{ provide: TOKEN, useFactory }`: вызывает фабрику без аргументов один раз, когда токен впервые понадобится.

### Токены без класса {#tokens-with-no-class}

В обеих библиотеках передавайте строковый или символьный токен напрямую в `get`:

```ts
unitRef.get<AppConfig>('CONFIG'); // Suites
spies.get<AppConfig>('CONFIG'); // createNestUnit
spies.get<Flags>(FLAGS); // A symbol token
```

Обе библиотеки читают токен из `self:paramtypes`, куда его записывает `@Inject('CONFIG')`.
Если класса нет и прочитать методы неоткуда, `createNestUnit` использует [`createAutoMock()`](/ru/core/auto-mock-by-type).
Это подходит для сервиса, описанного интерфейсом. Объект конфигурации передайте через `providers`:
иначе `config.currency` будет функцией-спаем вместо `'EUR'`.

### `@Optional()` и внедрение в свойства {#optional-and-property-injection}

Обе библиотеки поддерживают внедрение в свойства (`@Inject(Logger) logger!: Logger`). Они читают
`self:properties_metadata` и `design:type`, затем задают свойство после вызова конструктора.

`@suites/di.nestjs` читает `design:paramtypes`, `self:paramtypes` и `self:properties_metadata`.
Он пропускает `optional:paramtypes`, поэтому `@Optional()` ничего не меняет. `createNestUnit` учитывает декоратор:

- Если токен нельзя внедрить, необязательный параметр или свойство получает `undefined`, как в Nest.
- Если токен можно внедрить, зависимость по умолчанию всё равно получает спай.

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

**Suites создаёт мок для любого имени свойства.** Если переименовать `getUser` в `fetchUser`, тест со стабом для `getUser` может по-прежнему проходить. То же самое происходит при опечатке:

```ts
unitRef.get(Api).getUserz.mockResolvedValue(user); // Stubs a method that doesn't exist
```

[`createSpyFromClass`](/ru/core/create-spy-from-class) строит спай по настоящему классу.
Опечатка или старое имя приведут к ошибке в строке, где вы настраиваете спай:

```ts
spies.get(Api).getUserz; // undefined: `getUserz` is not on Api.prototype
spies.get(Api).getUserz.mockResolvedValue(user); // TypeError
```

Если указать метод явно, ошибка назовёт его:
`createSpyFromClass(Api, { onlyMethodsToSpyOn: ['getUserz'] })` сообщит, что `getUserz` нет в прототипе класса.
Если после перехода тест упал на этой строке, сначала проверьте имя метода.

Почему старый стаб работал: `@suites/doubles.vitest` начинает с пустого `Proxy` и не читает класс.
Обработчик `get` создаёт недостающие свойства:

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

### Что каждая сторона запрещает {#what-each-side-refuses}

| Ситуация                         | Suites                                      | `createNestUnit`                                                         |
| -------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------ |
| Опечатка в имени метода          | Создаёт мок                                 | `undefined` или ошибка с именем метода при `onlyMethodsToSpyOn`          |
| `get` для неиспользуемого токена | `DependencyResolutionError`                 | Выдаёт ошибку и перечисляет токены, для которых создал спаи              |
| `get` для класса из `expose`     | `DependencyResolutionError`                 | Предлагает получить спаи зависимостей класса или убрать его из `expose`  |
| `get` для переданной константы   | Ошибка: «faked dependencies»                | Возвращает значение                                                      |
| Параметр с типом-интерфейсом     | Использует `Object` из метаданных как токен | Выдаёт ошибку с именем класса, номером параметра и способами исправления |
| Цикл среди настоящих классов     | Упоминает `forwardRef` в ошибке             | Показывает цикл в виде `A -> B -> A`                                     |

Обе библиотеки отклоняют неиспользуемый токен, чтобы вы не настраивали спай, которого класс не получит.
Если после рефакторинга `spies.get(OldService)` выдаёт ошибку, поищите новую зависимость в списке токенов в сообщении.

## Чем приходится пожертвовать {#what-you-give-up}

- **Inversify.** Если вы используете `@suites/di.inversify`, оставайтесь на Suites. `createNestUnit` читает только метаданные Nest. Поддержка Inversify не планируется. Suites также указывает адаптер `tsyringe`, которого не было в npm на момент проверки.
- **Jest.** Точки входа для Jest нет, а подключить другой раннер через публичный API нельзя. Если остаётесь на Jest, используйте `@suites/doubles.jest`.
- **`identifierMetadata`.** Suites принимает дополнительные метаданные в `get` и `mock`, чтобы различать привязки. В `createNestUnit` привязка определяется только токеном.
- **Настройка через `.mock(…).impl(…)` до вызова конструктора.** Если конструктор вызывает зависимость, вместо этого передайте `providers: [provideAutoSpy(Dep, config)]`.

## Что вы получаете {#what-you-get}

- **Никаких зависимостей времени выполнения.** Тестовым инструментам больше не нужны четыре транзитивных пакета `@suites/*`, два отдельных адаптера и импорт `@nestjs/common`.
- **Тест ловит опечатки.** [Настройка спая для несуществующего метода](#the-difference-that-will-change-a-spec) вызывает ошибку.
- **Выбор раннера.** По той же схеме можно писать тесты для Vitest, [`bun:test`](/ru/runtimes/bun) и [`node:test`](/ru/runtimes/node). Suites рассчитан на бэкенд и поставляет адаптеры для Jest, Vitest и Sinon.
- **Тот же пакет для фронтенда.** Тестируйте [Angular](/ru/adapters/angular), [React](/ru/adapters/react), [Vue](/ru/adapters/vue) или [Svelte](/ru/adapters/svelte). Suites читает `design:paramtypes` конструктора, поэтому не видит зависимости Angular, объявленные через `readonly #x = inject(X)`.
- **Потоки, геттеры и сеттеры.** В Suites чтение геттера даёт `vi.fn()`, а у методов с `Observable` нет хелперов для потоков. Здесь для этих методов есть [`nextWith` и другие хелперы](/ru/core/control-helpers#observable-methods-properties-—-nextwith), а у геттеров и сеттеров — [свои спаи](/ru/core/create-spy-from-class#accessor-spies-—-accessorspies).
- **Больше инструментов для тестов Nest.** Используйте [спаи для Observable](/ru/core/observable-assertions), `calledWith`, `resolveWith`, `mustBeCalledWith`, [строгий режим](/ru/core/strict-mode) и [фикстуры](/ru/core/create-spy-from-class).
- **Синхронное создание.** Уберите `await`. Если `spies.get` выдаст ошибку, список токенов подскажет, какие зависимости класс запрашивал на самом деле.

## В чём Suites прав {#what-suites-gets-right}

Документация Nest рекомендует Suites. Его скачивают почти полмиллиона раз в месяц.
`createNestUnit` сохраняет две идеи Suites:

- **Читайте зависимости, которые Nest уже записывает.** `@Injectable()` и `emitDecoratorMetadata` записывают типы. Не нужно дублировать их в записях `{ provide, useValue }` и обновлять второй список при изменении конструктора.
- **Выбирайте, какие зависимости останутся настоящими.** В solitary-тесте подменяйте все. В sociable-тесте оставляйте нужные классы настоящими, не поднимая всё приложение.

В Angular `TestBed` тот же выбор можно сделать в списке провайдеров. Для solitary-теста укажите `provideAutoSpy(Dep)` для каждой зависимости. Для sociable-теста оставьте существующий провайдер или укажите настоящий класс. Отдельный сборщик не нужен.

## Версии, по которым это писалось {#versions-this-was-written-against}

- `@suites/unit` 3.1.1 (опубликован 2026-05-08), с `@suites/di.nestjs` и `@suites/doubles.vitest` версии 3.1.0.
- `4.0.0-beta.0` вышел 2025-11-04. На момент проверки более новых релизов 4.x не было. Последующие релизы 3.1.x относятся к ветке 3.x.
- Между 3.0.1 (2025-01-02) и `4.0.0-alpha.0` (2025-10-27) релизов не было.

Сравнение основано на опубликованных пакетах, а не на сайте документации. Проверка в реестре 2026-09-19 подтвердила версии и даты. На тот момент 3.1.1 оставалась версией с тегом `latest`. За неделю, закончившуюся 2026-09-18, `@suites/unit` скачали 80 249 раз, а `@suites/doubles.vitest` — 25 353 раза.
