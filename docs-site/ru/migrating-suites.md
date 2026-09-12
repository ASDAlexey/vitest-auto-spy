---
title: Миграция с @suites/unit
description: Перевод спеки в спеку — с TestBed.solitary и TestBed.sociable на createNestUnit; формы API рядом, что каждая сторона запрещает и чего стоит переход.
---

# Миграция с `@suites/unit`

[`@suites/unit`](https://github.com/suites-dev/suites) — сборщик юнит-тестов для NestJS, на который
ссылается документация Nest; его скачивают почти полмиллиона раз в месяц. Это ещё и пакет, у которого
здешний подход позаимствован: `createNestUnit` в
[`vitest-auto-spy/nestjs`](/ru/adapters/nestjs#building-the-unit-from-its-metadata) — это сознательно
взятая у Suites модель solitary / sociable. Эта страница — перевод, а не спор; спор лежит в
[сравнении](/ru/comparison#nestjs).

## В чём Suites прав {#what-suites-gets-right}

Две идеи, и обе переживают переезд.

**Юнит собирается из собственных метаданных DI.** Провайдер Nest уже объявил своих коллабораторов;
`@Injectable()` и `emitDecoratorMetadata` уже записали это объявление. Спека, которая повторяет его
списком записей `{ provide, useValue }`, — вторая копия конструктора, и каждое изменение конструктора
правит обе. Suites вместо этого читает метаданные, так что устаревать в спеке нечему: списка
провайдеров там нет.

**Solitary и sociable — две настоящие формы юнит-теста.** Solitary — это когда задублирован каждый
коллаборатор. Sociable — когда несколько названных построены по-настоящему, а всё, что за ними,
по-прежнему задублировано: шов сознательно сдвинут на класс наружу, вместо тестового модуля, который
растёт, пока не станет приложением. Suites сделал это различие частью API, а не комментарием в спеке,
и различие это верное.

`createNestUnit` сохраняет обе формы. Меняются дубль за каждым токеном, число зависимостей и то, где
всё это может выполняться.

## Установить и удалить {#install-and-remove}

```bash
npm remove @suites/unit @suites/di.nestjs @suites/doubles.vitest
npm i -D vitest-auto-spy
```

Три прямых пакета превращаются в один. `@suites/unit` тянет ещё четыре собственные
рантайм-зависимости `@suites/*` — `core.unit`, `types.common`, `types.di`, `types.doubles`, — а
`@suites/di.nestjs` в рантайме импортирует `@nestjs/common/constants`, так что `@nestjs/common`
оказывается жёсткой peer-зависимостью тестовой обвязки. У `vitest-auto-spy` **ноль
рантайм-зависимостей**, и из `@nestjs/*` он не импортирует ничего: nestjs-точка входа читает ключи
метаданных как строки.

`tsconfig` не меняется. `reflect-metadata` и `emitDecoratorMetadata: true` обязательны для Suites и
ровно так же обязательны здесь — это требования самого Nest, и приложение на Nest, которое стартует,
им уже удовлетворяет. Ни один из пакетов ничего к ним не добавляет.

Один файл можно удалить: тот `global.d.ts`, который ссылается на `@suites/doubles.vitest/unit`, чтобы
дополнить `Mocked<T>` и `unitRef.get()` типами моков Vitest. `Spy<T>` — обычный экспортируемый тип,
дополнять нечего.

## Перевод {#the-translation}

| Suites                                              | `vitest-auto-spy/nestjs`                             |
| --------------------------------------------------- | ---------------------------------------------------- |
| `await TestBed.solitary(S).compile()`               | `createNestUnit(S)`                                  |
| `await TestBed.sociable(S).expose(D).compile()`     | `createNestUnit(S, { expose: [D] })`                 |
| `const { unit, unitRef } = …`                       | `const { unit, spies } = …`                          |
| `unitRef.get(Dep)`                                  | `spies.get(Dep)`                                     |
| `unitRef.get<T>('TOKEN')`, `unitRef.get<T>(SYMBOL)` | `spies.get<T>('TOKEN')`, `spies.get<T>(SYMBOL)`      |
| `.mock(Dep).impl((stub) => ({ … }))`                | `spies.get(Dep).method.mockReturnValue(…)`           |
| `.mock('TOKEN').final({ … })`                       | `providers: [{ provide: 'TOKEN', useValue: { … } }]` |
| `Mocked<Dep>`                                       | [`Spy<Dep>`](/ru/core/spy-typing)                    |

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

**`await` исчезает.** `compile()` возвращает промис, потому что Suites разрешает свои адаптеры DI и
дублей динамически, в момент компиляции, исходя из того, что найдёт установленным. Искать
`createNestUnit` нечего: он читает метаданные и синхронно вызывает `new`. `beforeEach`,
существовавший только ради `await`, превращается в обычное присваивание, а тело `describe` может
собрать юнит напрямую.

Один экземпляр на токен — как и даёт стандартный синглтон-скоуп Nest: коллаборатор, общий для двух
классов, остаётся одним спаем по обе стороны миграции.

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

`expose` принимает весь список сразу, а не цепочкой, — это единственное изменение формы.
`sociable()` в Suites типизирован как `Pick<SociableTestBedBuilder, 'expose'>`, поэтому хотя бы один
`.expose()` обязан быть до того, как появится `.compile()`; здесь `{ expose: [] }` легален и просто
означает solitary.

Обе стороны отказываются выдать выставленный класс в виде спая: Suites бросает
`DependencyResolutionError` с текстом о том, что идентификатор «is marked as an exposed dependency»,
а `spies.get(CartService)` бросает с тем же обоснованием и двумя способами починки.
`spies.exposedTokens()` перечисляет то, что граф действительно построил, так что запись в `expose`,
которую никто не запрашивал, видна как отсутствующая, а не как тишина.

### Настройка дубля {#configuring-a-double}

Suites настраивает до `compile()`, потому что до этого момента юнита не существует:

```ts
// Было
const { unit, unitRef } = await TestBed.solitary(CartService)
  .mock(TaxService)
  .impl((stub) => ({ rate: stub().mockReturnValue(0.2) }))
  .compile();
```

`createNestUnit` собирает юнит в момент вызова, поэтому обычный перевод — настроить спай после,
[управляющими хелперами](/ru/core/control-helpers), а не частичным объектом:

```ts
// Стало
const { unit, spies } = createNestUnit(CartService);

spies.get(TaxService).rate.mockReturnValue(0.2);
spies.get(ApiService).fetchUser.calledWith(7).resolveWith(user);
```

Есть один случай, когда «после» — уже поздно: конструктор, который зовёт коллаборатора. Для него
настроенный спай передаётся через `providers`, и он побеждает авто-спаи:

```ts
import { createNestUnit, provideAutoSpy } from 'vitest-auto-spy/nestjs';

const { unit, spies } = createNestUnit(CartService, {
  providers: [provideAutoSpy(TaxService, { returns: { rate: 0.2 } })],
});
```

`.final(value)` — «это не дубль, это значение» на языке Suites — становится записью в `providers`:

```ts
// Было
await TestBed.solitary(CartService).mock('CONFIG').final({ currency: 'EUR' }).compile();

// Стало
createNestUnit(CartService, { providers: [{ provide: 'CONFIG', useValue: { currency: 'EUR' } }] });
```

— с одним отличием в поведении в вашу пользу. Suites считает подставленную зависимость нечитаемой:
`unitRef.get('CONFIG')` бросает `DependencyResolutionError`, потому что «faked dependencies are not
intended for direct retrieval». Здесь `spies.get('CONFIG')` возвращает переданное значение как есть.

`providers` принимает ещё `{ provide: Abstract, useClass: Impl }` — такой класс строится как
выставленный, со спаями на собственные зависимости — и `{ provide: TOKEN, useFactory }`, фабрику без
аргументов, которая выполняется один раз, когда токен запросят впервые.

### Токены без класса {#tokens-with-no-class}

Оба пакета добираются до строкового или символьного токена, передавая его прямо в `get`:

```ts
unitRef.get<AppConfig>('CONFIG'); // Suites
spies.get<AppConfig>('CONFIG'); //  здесь
spies.get<Flags>(FLAGS); //          и символы тоже
```

Токен на обеих сторонах приходит из одного места: `@Inject('CONFIG')` записывает его в
`self:paramtypes`, и это первый ключ метаданных, который читают оба пакета. Отличается то, что
возвращается: у токена без класса нет прототипа для чтения, поэтому здесь ответом будет
[`createAutoMock()`](/ru/core/auto-mock-by-type) — мок по типу. Для сервиса за интерфейсом это верно,
а для конфигурационного литерала — нет: `config.currency` окажется функцией-спаем, а не `'EUR'`.
Такие вещи передавайте явно, как показано выше.

### `@Optional()` и внедрение в свойства {#optional-and-property-injection}

Внедрение в свойства (`@Inject(Logger) logger!: Logger`) работает по обе стороны; обе читают
`self:properties_metadata` вместе с `design:type` и присваивают после конструирования.

`@Optional()` работает не по обе стороны. `@suites/di.nestjs` читает три ключа метаданных —
`design:paramtypes`, `self:paramtypes` и `self:properties_metadata`, — и `optional:paramtypes` в их
число не входит, так что декоратор никак не меняет то, что получает юнит. `createNestUnit` его
читает: параметр или свойство с `@Optional()`, чей токен вообще нельзя внедрить, получает
`undefined` — ровно то, что подставил бы сам Nest. Опциональная зависимость с внедряемым токеном
по-прежнему получает свой спай, потому что в этом графе доступен каждый токен.

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

**Дубль Suites отвечает на любое имя свойства.** `@suites/doubles.vitest` строит мок как `Proxy`,
чья ловушка `get` создаёт недостающее:

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

Мок начинается с `{}` — с класса не читается ничего, — поэтому ловушка отвечает на любое имя и
отказать не может ни в одном. Переименуйте `getUser` в `fetchUser` в сервисе, и спека, которая всё
ещё стабит `getUser`, продолжит проходить: стаб настраивает функцию, которую никто не зовёт, проверка
на неё не выполняется ни разу, и сюита остаётся зелёной по методу, которого больше нет.

```ts
unitRef.get(Api).getUserz.mockResolvedValue(user); // рабочий мок — мок ничего
```

Здесь дубль строится из настоящего прототипа функцией
[`createSpyFromClass`](/ru/core/create-spy-from-class), поэтому та же строка — это `TypeError` на
`undefined`:

```ts
spies.get(Api).getUserz; // undefined — `getUserz` нет в Api.prototype
spies.get(Api).getUserz.mockResolvedValue(user); // TypeError, ровно на неверной строке
```

Попросите метод явно — и сообщение назовёт его:
`createSpyFromClass(Api, { onlyMethodsToSpyOn: ['getUserz'] })` сообщит, что `getUserz` не найден на
прототипе класса. Правило одно и то же: неверный стаб должен падать на самом стабе.

Ради этого после миграции стоит пройтись по сюите, а не полагаться на веру. Спека, которая молча
стабила переименованный метод, теперь упадёт, и это падение — окупившаяся миграция.

### Что каждая сторона запрещает {#what-each-side-refuses}

| Ситуация                                      | Suites                                                | `createNestUnit`                                            |
| --------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------- |
| Опечатка в имени метода на дубле              | рабочий мок                                           | `undefined` или именованная ошибка при `onlyMethodsToSpyOn` |
| `get` токена, который юнит не запрашивал      | `DependencyResolutionError`                           | бросает, **и перечисляет авто-спаенные токены**             |
| `get` выставленного класса                    | `DependencyResolutionError`                           | бросает, называя оба способа починки                        |
| `get` переданной константы                    | бросает — «faked dependencies»                        | возвращает значение                                         |
| Параметр с типом-интерфейсом                  | берёт за идентификатор выданный компилятором `Object` | бросает, называя класс, слот и оба способа починки          |
| Цикл среди классов, построенных по-настоящему | подсказка про `forwardRef` в тексте ошибки            | называет цикл как `A -> B -> A`                             |

Вторая строка — та, что экономит время. Оба пакета отказывают в токене, которым юнит не пользуется,
и это правильно: спай, который юнит никогда не увидит, — это спека, которая не может упасть. Здесь
вдобавок печатается то, что юнит _действительно_ запрашивал, так что `spies.get(OldService)` после
рефакторинга сообщит новое имя тем же сообщением.

## Чем приходится пожертвовать {#what-you-give-up}

Четырьмя вещами, если честно.

- **Inversify.** Suites поставляет `@suites/di.inversify` рядом с `@suites/di.nestjs`, а в его
  реестре адаптеров назван ещё и `tsyringe` (пакета `@suites/di.tsyringe` в npm сегодня нет).
  Адаптера для Inversify здесь нет и не планируется: `createNestUnit` читает именно ключи метаданных
  Nest. Сюите на Inversify стоит остаться на Suites.
- **Jest.** Точки входа для Jest нет. Ядро вообще не импортирует тест-раннер напрямую — оно общается
  с ним через внутренний `MockAdapter`, и адаптеры для Vitest, `bun:test` и `node:test` уже
  поставляются, — но этот интерфейс не экспортируется ни из одной публичной точки входа, так что
  проект на Jest не сможет зарегистрировать свой, не залезая во внутренности. Если сюита на Jest и
  остаётся на Jest, рабочий ответ — `@suites/doubles.jest`, и этот переезд не для вас.
- **`identifierMetadata`.** Каждый `get` и `mock` в Suites принимает вторым аргументом
  необязательный объект метаданных — для DI-контейнера, который различает привязки не только по
  токену. Здесь эквивалента нет: токен есть токен.
- **Настройка дубля до конструирования — это другой вызов.** `.mock(…).impl(…)` в Suites выполняется
  до того, как юнит существует, поэтому случай «конструктор зовёт коллаборатора» покрывается
  бесплатно. Здесь для него нужен `providers: [provideAutoSpy(Dep, config)]`, а не строка
  постфактум, — ещё одна вещь, которую надо заметить при миграции, и единственное место, где убранный
  `await` делал работу.

## Что вы получаете {#what-you-get}

- **Ноль рантайм-зависимостей** против четырёх транзитивных пакетов `@suites/*` плюс двух адаптеров,
  которые ставятся руками, плюс рантайм-импорта `@nestjs/common` в DI-адаптере.
- **Опечатка падает.** Самое крупное отличие в поведении, разобранное выше.
- **Три рантайма.** Одна и та же спека выполняется на Vitest, [`bun:test`](/ru/runtimes/bun) и
  [`node:test`](/ru/runtimes/node); Suites описывает себя как бэкенд-инструмент и поставляет адаптеры
  дублей для Jest, Vitest и sinon.
- **Остальная часть вашей сюиты на том же ядре.** [Angular](/ru/adapters/angular) — чего Suites не
  может структурно, потому что находит коллабораторов по `design:paramtypes` конструктора, а
  `readonly #x = inject(X)` таких метаданных не выдаёт, — плюс [React](/ru/adapters/react),
  [Vue](/ru/adapters/vue) и [Svelte](/ru/adapters/svelte), из одной зависимости.
- **Спаи на геттеры и сеттеры**, [спаи на Observable](/ru/core/observable-assertions), `calledWith` /
  `resolveWith` / `mustBeCalledWith`, [строгий режим](/ru/core/strict-mode) и
  [фикстуры](/ru/core/create-spy-from-class) — тот слой хелперов, который спека на Nest в итоге
  пишет руками.
- **Синхронное конструирование** и падение `spies.get`, которое называет то, что юнит на самом деле
  запрашивал.

## Версии, по которым это писалось {#versions-this-was-written-against}

`@suites/unit` 3.1.1, опубликован 2026-05-08, вместе с `@suites/di.nestjs` и
`@suites/doubles.vitest` версии 3.1.0. `4.0.0-beta.0` вышел 2025-11-04, и с тех пор на ветке 4.x не
выходило ничего; релизы 3.1.x, появившиеся позже, — это ветка 3.x. Всё на этой странице прочитано из
опубликованных тарболов, а не с сайта документации.
