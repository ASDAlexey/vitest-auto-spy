---
title: Правила ESLint
description: По разделу на каждое правило ESLint-плагина - о чём оно сообщает, пример до и после, опции, как исправить находку и когда правило выключить.
---

# Правила ESLint

На этой странице по разделу на каждое правило [ESLint-плагина](/ru/utilities/eslint-plugin).
Открывайте её, когда пришла находка: в разделе видно, о чём сообщает правило, пример «до и после»,
опции и когда правило стоит выключить. У каждого раздела стабильный якорь, так что на него можно
сослаться из конфига:

```js
// eslint.config.js
{
  // https://asdalexey.github.io/vitest-auto-spy/ru/utilities/eslint-rules#no-bare-called-with
  'vitest-auto-spy/no-bare-called-with': 'error',
}
```

Подключение, глоб `files` и рецепт для большого существующего проекта описаны на
[странице плагина](/ru/utilities/eslint-plugin).

Каждое сообщение называет то, что правило нашло в вашем файле, одной фразой объясняет, почему это
ломается, и предлагает одно исправление. В конце стоит `Docs:` и ссылка на раздел правила ниже. Эта же
ссылка — `meta.docs.url` правила, поэтому редактор делает имя правила ссылкой.

Разделы ниже устроены одинаково:

1. Первая строка: уровень по умолчанию, есть ли исправление и нужна ли правилу информация о типах.
2. О чём сообщает правило и чем это плохо.
3. Пример с ❌ и пример с ✅.
4. **Опции**, **Как исправить** и **Когда выключить**.
5. **Как правило решает** — свёрнутый блок: как именно правило сопоставляет код, на чём оно основано
   и почему у него такой уровень. Раскройте его, если правило вас удивило.

<!-- The id is frozen on purpose: configs already point at #the-twenty-five-rules. Keep it when the rule count changes. -->

## Пятьдесят шесть правил {#the-twenty-five-rules}

Правила сгруппированы по темам — так же, как на [странице плагина](/ru/utilities/eslint-plugin#rules).
Все правила — `error`, кроме одиннадцати.

| Правило                                                                 | По умолчанию | Что сообщает                                                                                                                                                               |
| ----------------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`no-expect-in-subscribe`](#no-expect-in-subscribe)                     | `error`      | `expect()` внутри колбэка `subscribe` — он выполнится только если поток эмитит                                                                                             |
| [`no-vacuous-absence-assertion`](#no-vacuous-absence-assertion)         | `error`      | тест, каждое утверждение которого выполнено уже тем, что поток ничего не прислал                                                                                           |
| [`no-floating-assertion`](#no-floating-assertion)                       | `error`      | `expect()` в цепочке `.then()`, которую никто не ждёт                                                                                                                      |
| [`no-done-callback`](#no-done-callback)                                 | `error`      | параметр `done` в тесте или хуке и `done.fail(…)`                                                                                                                          |
| [`no-bare-called-with`](#no-bare-called-with)                           | `error`      | `calledWith(…)` / `mustBeCalledWith(…)` отдельным выражением-инструкцией                                                                                                   |
| [`no-constant-expect`](#no-constant-expect)                             | `error`      | `expect(true).toBe(true)` — значение из спеки под матчером, чей ответ оно предрешает                                                                                       |
| [`no-redundant-smoke-test`](#no-redundant-smoke-test)                   | `error`      | тест, всё тело которого — проверка, что субъект существует, рядом с тестами на том же setup                                                                                |
| [`no-self-called-spy`](#no-self-called-spy)                             | `error`      | тест сам вызывает заспаенный метод, а потом утверждает, что его вызвали                                                                                                    |
| [`prefer-to-have-signal-value`](#prefer-to-have-signal-value)           | `warn`       | `expect(signal()).toBe(…)` — значение прочитано инлайн, имя сигнала потеряно из падения                                                                                    |
| [`prefer-settle-dynamic-import`](#prefer-settle-dynamic-import)         | `error`      | `await import('…')` в теле теста — ждёт модуль, а не код под тестом                                                                                                        |
| [`no-real-wait-in-test`](#no-real-wait-in-test)                         | `warn`       | `new Promise((r) => setTimeout(r, N))` — сон на реальных часах                                                                                                             |
| [`no-unasserted-argument`](#no-unasserted-argument)                     | `warn`       | голый `toHaveBeenCalled()` там, где сам файл показывает, что тест про аргументы                                                                                            |
| [`prefer-create-mock`](#prefer-create-mock)                             | `warn`       | объектный литерал под `as SomeType` — каст пропускает и лишний ключ, и недостающий                                                                                         |
| [`no-mock-cast`](#no-mock-cast)                                         | `error`      | `TestBed.inject(S).m as Mock` — `Mock` это `Mock<any>`, аргументы перестают сравниваться                                                                                   |
| [`prefer-create-spy-from-class`](#prefer-create-spy-from-class)         | `error`      | объектный литерал из двух и более `vi.fn()`                                                                                                                                |
| [`no-stub-class-double`](#no-stub-class-double)                         | `warn`       | класс, чьи поля — `vi.fn()`: тот же дубль, только с `new` впереди                                                                                                          |
| [`no-structural-double`](#no-structural-double)                         | `warn`       | объект из `vi.fn()` у имени, объявленного как объект из `Mock` Vitest                                                                                                      |
| [`prefer-spy-on-own-method`](#prefer-spy-on-own-method)                 | `warn`       | `createSpyFromInstance`, который шпионит за одним методом и читается только ради него                                                                                      |
| [`no-shared-module-level-mock`](#no-shared-module-level-mock)           | `error`      | **экспортируемое** значение, которое строит `vi.fn()` при загрузке модуля                                                                                                  |
| [`no-outer-binding-in-mock-factory`](#no-outer-binding-in-mock-factory) | `error`      | фабрика `vi.mock`, читающая биндинг верхнего уровня, объявленный не через `vi.hoisted`                                                                                     |
| [`no-object-define-property`](#no-object-define-property)               | `error`      | `Object.defineProperty` / `defineProperties` в спеке                                                                                                                       |
| [`no-import-time-spread`](#no-import-time-spread)                       | `error`      | спред импортированного биндинга, вычисляемый на уровне модуля                                                                                                              |
| [`prefer-observer-stub`](#prefer-observer-stub)                         | `error`      | глобальный observer, подменённый руками или через раннер                                                                                                                   |
| [`no-hand-assigned-global`](#no-hand-assigned-global)                   | `error`      | `global.fetch = vi.fn()`, `environment.x = …` — значение, которое никакой teardown не возвращает                                                                           |
| [`prefer-stub-response`](#prefer-stub-response)                         | `error`      | объектный литерал, приведённый к `Response`, или `createMock<Response>(…)` — половина ответа                                                                               |
| [`no-redundant-mock-reset`](#no-redundant-mock-reset)                   | `error`      | сброс моков в хуке, который раннер и так делает между тестами                                                                                                              |
| [`prefer-provide-activated-route`](#prefer-provide-activated-route)     | `error`      | `ActivatedRoute`, предоставленный как собранный руками объект, класс или фабрика, — полмаршрута                                                                            |
| [`no-passthrough-console-spy`](#no-passthrough-console-spy)             | `error`      | `vi.spyOn(console, m)`, которому ничто не дало реализации, — вызывает оригинал и печатает                                                                                  |
| [`no-unasserted-console-spy`](#no-unasserted-console-spy)               | `warn`       | консольный спай, которого файл только сбрасывает или настраивает и никогда не проверяет, — `useConsoleSpies()` и так глушит вывод                                          |
| [`no-console-in-spec`](#no-console-in-spec)                             | `error`      | спека, которая вызывает метод консоли или подменяет его присваиванием                                                                                                      |
| [`no-import-time-console-spies`](#no-import-time-console-spies)         | `error`      | импорт `vitest-auto-spy/console` в файле, который не зовёт `installConsoleSpies()` или `useConsoleSpies()`                                                                 |
| [`prefer-provide-auto-spy`](#prefer-provide-auto-spy)                   | `error`      | провайдер, который собирает дубль сервиса руками или расписывает `provideAutoSpy`                                                                                          |
| [`prefer-inject-spy`](#prefer-inject-spy)                               | `error`      | `vi.spyOn` поверх инстанса, который выдал `TestBed.inject`                                                                                                                 |
| [`no-unregistered-inject-spy`](#no-unregistered-inject-spy)             | `error`      | `injectSpy(X)` для токена, который этот файл не регистрировал как автоспай                                                                                                 |
| [`no-real-component-provider`](#no-real-component-provider)             | `error`      | собственный провайдер компонента, прочитанный из фикстуры, когда файл его ничем не подменил                                                                                |
| [`prefer-render-shallow`](#prefer-render-shallow)                       | `warn`       | `TestBed.createComponent` в файле, который ни разу не читает отрендеренный шаблон; под `{ templates: 'never' }` — любое чтение DOM или шаблон в спеке                      |
| [`prefer-set-inputs`](#prefer-set-inputs)                               | `warn`       | серию `fixture.componentRef.setInput(…)` — имя, которое Angular ничем не проверяет                                                                                         |
| [`no-overridden-provider`](#no-overridden-provider)                     | `error`      | провайдер, которого заменяет более поздний или `TestBed.overrideProvider`                                                                                                  |
| [`no-inject-before-override`](#no-inject-before-override)               | `error`      | вызов, создающий модуль, в хуке набора тестов, который ещё вызывает `TestBed.override*` или `overrideComponentProvider`; `injectSpy` выше переопределения в `beforeCreate` |
| [`no-dead-schemas`](#no-dead-schemas)                                   | `error`      | `schemas` в тестовом модуле, который ничего не объявляет                                                                                                                   |
| [`no-mistyped-use-value`](#no-mistyped-use-value)                       | `error`      | `useValue`, который не подходит под примитивный тип, объявленный его `InjectionToken`                                                                                      |
| [`no-unknown-use-value-key`](#no-unknown-use-value-key)                 | `error`      | ключ объектного `useValue`, которого нет у предоставляемого типа, — только ключи                                                                                           |
| [`no-instance-lifecycle-spy`](#no-instance-lifecycle-spy)               | `warn`       | `vi.spyOn(component, 'ngOnInit')` — спай на хуке, который Angular не вызывает                                                                                              |
| [`no-compile-components`](#no-compile-components)                       | `error`      | `compileComponents()` под билдером, встраивающим ресурсы, — молчит, пока ему не скажут                                                                                     |
| [`no-relative-mock-under-builder`](#no-relative-mock-under-builder)     | `error`      | `vi.mock('./x')` в спеке, которую запускает `@angular/build:unit-test`, — билдер на этом падает; молчит, пока такой билдер не найден                                       |
| [`no-disabled-testbed-teardown`](#no-disabled-testbed-teardown)         | `error`      | `destroyAfterEach: false` — каждая фикстура переживает свой тест                                                                                                           |
| [`no-sync-testbed-await`](#no-sync-testbed-await)                       | `error`      | `await` на вызове TestBed, который отвечает самим TestBed или фикстурой, а не промисом                                                                                     |
| [`no-private-member-access`](#no-private-member-access)                 | `error`      | `private` / `protected`-член, добытый через скобки, каст или прототип                                                                                                      |
| [`no-reflect-member-access`](#no-reflect-member-access)                 | `error`      | `Reflect.get` / `Reflect.set` по субъекту теста — ключ, который не проверяет никто                                                                                         |
| [`no-mocked-for-spy`](#no-mocked-for-spy)                               | `error`      | `Mocked<T>` в типовой позиции, где значение — спай                                                                                                                         |
| [`prefer-as-spy`](#prefer-as-spy)                                       | `error`      | `TestBed.inject(X) as Spy<X>` — каст, который больше не компилируется                                                                                                      |
| [`no-ts-expect-error-on-double`](#no-ts-expect-error-on-double)         | `error`      | `@ts-expect-error` / `@ts-ignore` над `nextWith`, `mockReturnValue`, … дубля                                                                                               |
| [`no-jasmine-globals`](#no-jasmine-globals)                             | `error`      | `jasmine.*`, голые `spyOn(` / `fail(` / `pending(` и `.withContext(`                                                                                                       |
| [`jasmine-namespace-without-entry`](#jasmine-namespace-without-entry)   | `error`      | `.and` / `.calls` / `.withArgs` в файле, который нигде не ставит слой совместимости                                                                                        |
| [`no-save-arguments-by-value`](#no-save-arguments-by-value)             | `error`      | `spy.calls.saveArgumentsByValue()` — здесь это no-op                                                                                                                       |
| [`prefer-native-spy-api`](#prefer-native-spy-api)                       | `error`      | `.and` / `.calls` там, где то же самое умеет собственный API спая                                                                                                          |

- **Опции есть у десяти правил:** [`prefer-create-spy-from-class`](#prefer-create-spy-from-class),
  [`no-stub-class-double`](#no-stub-class-double) и [`no-structural-double`](#no-structural-double)
  (`minRunnerFns`), [`prefer-render-shallow`](#prefer-render-shallow) (`templates`),
  [`prefer-inject-spy`](#prefer-inject-spy) (`ignoreTokens`),
  [`no-real-component-provider`](#no-real-component-provider) (`ignoreTokens`, `childInjectors`),
  [`no-redundant-mock-reset`](#no-redundant-mock-reset) (флаги сброса раннера, `configFile`,
  `configFlags`), [`no-compile-components`](#no-compile-components) (`builder`, `ignoreComponents`),
  [`no-relative-mock-under-builder`](#no-relative-mock-under-builder) (`builder`) и
  [`jasmine-namespace-without-entry`](#jasmine-namespace-without-entry) (`setupModules`).
- **Четырём правилам нужна информация о типах:**
  [`no-private-member-access`](#no-private-member-access),
  [`no-mistyped-use-value`](#no-mistyped-use-value),
  [`no-unknown-use-value-key`](#no-unknown-use-value-key) и
  [`prefer-to-have-signal-value`](#prefer-to-have-signal-value).
- **Два правила входят ещё и в `configs.typeErrors`,** потому что их находки не компилируются:
  [`prefer-as-spy`](#prefer-as-spy) и [`no-mocked-for-spy`](#no-mocked-for-spy).

## no-expect-in-subscribe {#no-expect-in-subscribe}

**`error`** · подсказка · только синтаксис

Сообщает про `expect()` внутри колбэка `subscribe(…)`. Такая проверка выполнится, только если поток
эмитит. Если поток молчит, тест проходит, ничего не проверив.

```ts
it('maps the products', () =>
  new Promise<void>((done) => {
    service.getProducts(id).subscribe((products) => {
      expect(products).toEqual(expected); // ❌ не выполнится, если поток молчит
      done();
    });
  }));
```

```ts
import { firstValueFrom } from 'rxjs';

it('maps the products', async () => {
  const products = await firstValueFrom(service.getProducts(id)); // ✅ упадёт, если ничего не придёт

  expect(products).toEqual(expected);
});
```

**Опции.** Нет.

**Как исправить.** Сообщение говорит, какой из трёх случаев у вас. Для каждого нужна своя правка:

```ts
// 1. invertible: подписка — последнее, что делает тест. Дождитесь значения.
const value = await firstValueFrom(source$);
expect(value).toBe(1);

// 2. afterTrigger: поток эмитит из-за инструкции ниже. Сначала сохраните промис.
//    `await firstValueFrom(...)` здесь зависнет: триггер под ним так и не выполнится.
//    `expectEmission` подписывается при вызове, а не при `await`.
const emission = expectEmission(service.getCurrentLevel());
httpMock.expectOne(url).flush(payload);
await expect(emission).resolves.toEqual(payload);

// 3. inErrorHandler: проверка стоит в ветке ошибки. Проверьте реджект.
await expect(firstValueFrom(source$)).rejects.toBeInstanceOf(UpstreamStatusError);
```

- Если поток эмитит несколько значений и вы хотели проверить каждое, используйте
  `expectEmissions(source$, N)`.
- В случае с ошибкой удалите и страж `next: () => expect.unreachable(…)` рядом с колбэком `error`.
  `await expect(firstValueFrom(source$)).rejects.toMatchObject({ status: 404 })` и так падает, когда
  поток завершается успешно.
- Для точного каркаса `it(name, () => new Promise((done) => …))` редактор предложит подсказку,
  которая сама пишет замену. Для обработчика `next` она берёт `firstValueFrom`, для `complete` —
  `lastValueFrom(src, { defaultValue: undefined })`, и добавляет импорт из rxjs.

**Когда выключить.** Правило видит форму, а не ошибку. Поэтому оно сообщает и про подписку на поток,
который точно эмитит: `BehaviorSubject`, `of(…)` или `ReplaySubject`, наполненный в том же тесте.
Такие места всё равно перепишите: проверка читается так же. Построчный disable нужен там, где
предмет теста — сама подписка, например проверка отписки или счёт мультикаста.

::: details Как правило решает
**Что считается.** Считается каждый `expect(…)` внутри вызова `…subscribe(…)`. Считается и вызов
простого имени внутри него: правило находит эту функцию в том же файле и считает `expect`-ы в её
теле. Это один шаг вглубь, без информации о типах. Хелпер, объявленный _внутри_ колбэка, считается
один раз, а не два.

```ts
const assertShape = (data: Content): void => {
  expect(data.items).toHaveLength(3);
};

source$.subscribe((data) => assertShape(data)); // это всё ещё проверка, которая может не выполниться
```

Отчёты группируются по `subscribe`. Колбэк с четырьмя проверками даёт одно сообщение, а не четыре.
Так один файл реального переезда сократился с 44 сообщений до 23.

**Какое сообщение вы получите**, тоже решается по синтаксису:

- **`inErrorHandler`**: проверка стоит в ветке ошибки, позиционной (`subscribe(next, error)`) или
  именованной (`subscribe({ error })`). `subscribe({ next: () => expect.unreachable(…), error: (e) =>
expect(e).toBe(err) })` тоже превращается в одну строку с `rejects`.
- **`afterTrigger`**: в том же блоке за инструкцией с `subscribe` идёт ещё одна. Обычно именно она
  заставляет поток эмитить (`req.flush(payload)`, `subject.next(…)`).
- **`invertible`**: ни то, ни другое, то есть подписка — последнее, что делает тест.

Сообщений три, потому что верная правка меняется от файла к файлу, а не от проекта к проекту. За пять
партий переезда в одном файле 110 мест из 111 оказались простым разворотом, а в другом — 36 из 119.

**Почему оно в recommended.** Подписка, которая ни разу не сработала, — самый чистый зелёный и
неверный тест. См. [четыре формы проверки против четырёх поведений потока](/ru/core/observable-assertions):
все четыре зелёные, когда поток ничего не эмитит. В прогоне об этом ничего не сказано: ни
необработанного реджекта, ни предупреждения, ни пропущенного теста.

**Почему подсказка, а не `--fix`.** Каркас выше дал 111 находок из 133 в одной партии из 22
переехавших файлов, поэтому он заслужил своё распознавание. Но замена равносильна, только пока
проверки — это весь колбэк. Неверная замена оставит тест, который всё ещё проходит. А это ровно тот
отказ, ради которого правило существует. Подсказка предлагается, только когда:

- в исполнителе промиса одна инструкция `subscribe` и больше ничего;
- колбэк один, с телом-блоком и одним обработчиком (не `subscribe({ next, complete })`);
- `done` упомянут один раз и вызывается последним;
- тестовый колбэк не принимает контекст Vitest.

Всё остальное в исполнителе — обычно та инструкция, что запускает источник. Она должна выполниться,
когда кто-то уже слушает.

**Серьёзность.** `error`. Находка — тест, который проходит, ничего не проверив, а большинство
исправлений механические.
:::

## no-vacuous-absence-assertion {#no-vacuous-absence-assertion}

**`error`** · без автоисправления · синтаксис и области видимости

Сообщает про тест, в котором **каждая** проверка выполняется и тогда, когда поток ничего не прислал.
Такой тест не отличает «результат пуст» от «результата нет».

```ts
it('yields an empty list when no sub-genre resolved to an address', () => {
  let chips: GenreChip[] = [];

  load$(quickLinks).subscribe((result) => (chips = result)); // ❌ тест зелёный, даже если это не выполнится

  expect(chips).toEqual([]);
  expect(catalog.getSectionById).not.toHaveBeenCalled();
});
```

```ts
it('asks for no shelf when no sub-genre resolved to an address', async () => {
  await expectNoEmission(load$(quickLinks)); // ✅ падает, как только что-то пришло

  expect(catalog.getSectionById).not.toHaveBeenCalled();
});
```

**Опции.** Нет.

**Как исправить.** Решите, что утверждает тест:

- **Ничего не приходит:** `await expectNoEmission(source$)`, как выше.
- **Приходит пустой список:** [`expectEmission`](/ru/core/observable-assertions), который падает, когда
  ничего не пришло:

```ts
expect(await expectEmission(load$(quickLinks))).toEqual([]);
```

**Когда выключить.** Редко. Правило молчит, как только хоть одна проверка в тесте может упасть на
молчащем потоке. Ещё оно пропускает любой тест, который проверяет через собственный хелпер. Какие
находки блокируют мерж — одна строка конфига.

::: details Как правило решает
Правило проверяет три факта, и все они есть в файле.

**1. Носитель.** `const` / `let`, объявленный внутри этого теста. Каждая запись в него, кроме
объявления, стоит внутри колбэка `subscribe` этого же теста. Считаются обе формы:
`subscribe((r) => (chips = r))` и `subscribe((r) => seen.push(r))`. Считается и имя, связанное с
`vi.fn()`, если тест отдаёт его в `subscribe` и сам нигде не вызывает.

**2. Что там оставляет молчание.** Правило читает исходный текст инициализатора (`'undefined'` для
`let` без него). На молчании выполняются такие матчеры:

- матчер равенства, повторяющий этот текст (`let chips = []` … `expect(chips).toEqual([])`);
- `toBeUndefined` / `not.toBeDefined`, когда объявление держит `undefined`;
- `toBeNull`, когда там `null`;
- `toBeFalsy` / `not.toBeTruthy`, когда там любой ложный литерал;
- `toHaveLength(0)`, когда там `[]` или `''`;
- `not.toHaveBeenCalled` / `not.toHaveBeenCalledWith` / `toHaveBeenCalledTimes(0)` на любом субъекте.

Правило читает буквально, а не по семейству матчеров, и это сознательно. `toBeNull()` на `let` без
инициализатора на молчании падает, и о нём правило не сообщает.

**3. Ничто другое в тесте упасть не может.** Каждый остальной `expect()` в тесте взвешивается так же.
Если хоть один из них может упасть на молчащем источнике, правило молчит. Так же действует вызов
`expectEmission`, `expectEmissions`, `expectCompletion` или `expectError`: каждый падает по таймауту
на источнике, который не эмитит и не завершается. Поэтому правило не трогает частую форму «проверить
отсутствие, запустить источник, проверить значение».

**Границы.**

- Тест, который проверяет ещё и что-то положительное, не сообщается никогда, даже если одна его
  строка пустая.
- Проверкой считается только `expect()`. `assert.exists(…)` и ожидаемый `expectCompletion(…)` правило
  не останавливают.
- Тест, который проверяет через собственный хелпер, пропускается: взвесить хелпер правило не может.
- Цепочка, которую правило не может дочитать до конца (`resolves`, `rejects`, матчер, взятый как
  значение), считается проверкой, которая может упасть. От этого правило становится только тише.

**Почему оно в recommended.** Это доказано мутацией, дважды, на Angular-проекте из 2 030 файлов.
Продакшн-источник файла выше заменили на поток, который никогда не эмитит. Упали три соседних теста,
а этот остался зелёным. Та же замена в сервисе промо-баннера уронила четыре теста и оставила зелёными
два, оба этой формы. Двумя тестами ниже в том же файле захват объявлен как
`let chips: … | null = null` и проверяется через `toEqual([])`, и вот он на молчании _падает_. Автор
знал приём, но применил его не везде, а для этого и нужен линтер. На том проекте правило сообщает
**39 раз в 33 файлах**: 22 записанных захвата и 17 `vi.fn()`, отданных в `subscribe`.

Это вторая половина [`no-expect-in-subscribe`](#no-expect-in-subscribe). То правило сообщает про
проверку, до которой молчащий поток не доходит. Это — про проверку, которую молчащий поток выполняет.

**Почему нет ни автоисправления, ни подсказки.** Починка — пять согласованных правок: удалить
объявление, заменить подписку ожидаемым хелпером, убрать проверку, сделать колбэк `async`, добавить
импорт. К тому же `expectNoEmission` утверждает нечто _более сильное_, чем строка, которую он
заменяет. Ошибочно принятая подсказка сделала бы зелёный тест красным, с сообщением про хелпер, а не
про код. Поэтому починку называет сообщение, как у [`prefer-stub-response`](#prefer-stub-response).

**Серьёзность.** `error`. Доказательство — объявление и матчеры, и то и другое в файле. Находка —
тест, который ничего не доказывает про названный им источник. Исправление идёт по одному тесту, а не
миграцией. Большой проект не придёт к нулю сразу; какие находки блокируют мерж, остаётся одной
строкой конфига, как и у [`prefer-settle-dynamic-import`](#prefer-settle-dynamic-import).
:::

## no-floating-assertion {#no-floating-assertion}

**`error`** · без автоисправления · только синтаксис

Сообщает про `expect()` внутри колбэка `.then()`, `.catch()` или `.finally()`, когда цепочку никто не
ждёт, не возвращает, не сохраняет и никуда не передаёт. Колбэк выполняется после конца теста, поэтому
проверка не может его уронить.

```ts
it('compiles', () => {
  TestBed.compileComponents().then(() => expect(fixture.componentInstance).toBeTruthy()); // ❌
});
```

```ts
it('compiles', async () => {
  await TestBed.compileComponents(); // ✅ тест ждёт, поэтому проверка может его уронить

  expect(fixture.componentInstance).toBeTruthy();
});
```

**Опции.** Нет.

**Как исправить.** Сделайте тест `async`, добавьте `await` перед промисом и проверяйте после `await`.

**Когда выключить.** Почти никогда. Правило сообщает только о том, что действительно лечится
ожиданием. `expect()`, спрятанный глубже, например в `setTimeout` внутри `.then()`, не сообщается. Для
такого случая включите [`setupAutoSpy({ strayRejections: true })`](/ru/utilities/setup#_8-failing-on-a-rejection-zone-js-swallowed):
он ловит во время прогона то, чего не увидит никакое правило линтера.

::: details Как правило решает
**Обход вверх по цепочке.** В `p.then(a).catch(b)` родитель `p.then(a)` — member expression. Только у
последнего вызова цепочки есть родитель, по которому видно, использует ли промис хоть кто-нибудь.
Поэтому правило поднимается до конца цепочки. Если читать только непосредственного родителя, первый
колбэк оправдывался бы в каждой цепочке, где есть второй.

**Считается только непосредственно охватывающий колбэк.** На один колбэк глубже ожидание цепочки уже
не помогает: оно оживляет проверку в теле `.then()`, но не ту, что спрятана в `setTimeout` внутри
него. Такие формы оставлены [`no-expect-in-subscribe`](#no-expect-in-subscribe) и `strayRejections`.
Вычисляемое имя метода (`p[settle](…)`) не обязательно промис-колбэк, поэтому правило его не трогает.
Цепочка, которая ничего не проверяет, не сообщается. Значит, от висящей цепочки с одним лишь
побочным эффектом правило не помогает.

**Почему оно в recommended.** Что покажет прогон, зависит от окружения, и ни один ответ не называет
тест. Одни и те же два теста (`expect()` в неожидаемом `.then()` и `async`-хелпер, вызванный без
`await`) в трёх окружениях:

|                                                     |          тесты           | что сообщает раннер                                               |
| --------------------------------------------------- | :----------------------: | ----------------------------------------------------------------- |
| без зон                                             |       **2 passed**       | 2 `Unhandled Rejection`, код выхода 1, ни один не связан с тестом |
| zone.js                                             |       **2 passed**       | 1 ошибка; вторую zone.js перенёс в `console.error`                |
| zone.js + `setupAutoSpy({ strayRejections: true })` | **1 failed \| 1 passed** | скрытая ошибка стала именованным падением нужного теста           |

Проверка ложна в каждой строке, а тест зелёный везде, кроме последней.

**Серьёзность.** `error`. Тест зелёный и неверный, и никакая диагностика не указывает на спеку.
:::

## no-done-callback {#no-done-callback}

**`error`** · без автоисправления · только синтаксис

Сообщает про первый параметр в стиле `done` у `it` / `test` / `beforeAll` / `beforeEach` /
`afterAll` / `afterEach` и про `done.fail(…)` на нём. На это место Vitest передаёт свой объект
контекста теста, и вызов `done()` бросает ошибку. Если этот вызов стоит внутри колбэка, ошибку никто
не ловит, и тест **проходит**, почти ничего из себя не выполнив.

```ts
it('loads', (done) => {
  service.load().subscribe((value) => {
    expect(value).toBe(1);
    done(); // ❌ TestContext is not a function
  });
});
```

```ts
import { firstValueFrom } from 'rxjs';

it('loads', async () => {
  expect(await firstValueFrom(service.load())).toBe(1); // ✅
});
```

**Опции.** Нет.

**Как исправить.** Сделайте тест `async` и дождитесь проверки, как выше.

- Для `done.fail(…)` проверьте само падение:
  `await expect(firstValueFrom(source$)).rejects.toMatchObject({ status: 404 })`.
- Если строка отмечает ветку, которая не должна выполняться, напишите `expect.fail(message)`.

**Когда выключить.** Редко. Параметр в порядке, когда тело только читает его члены, например
`ctx.skip()` или `ctx.task`; тогда правило и так молчит. Деструктурированный параметр (`({ task })`)
и колбэк без параметров не сообщаются никогда.

::: details Как правило решает
**Что это за параметр.** Vitest 4 передаёт **вызываемый** `TestContext`:

```text
typeof done                → 'function'
Object.keys(done)          → signal, task, skip, annotate, onTestFailed, onTestFinished
done()                     → Error: done() callback is deprecated, use promise instead
```

Прямой вызов падает сразу, с понятной ошибкой. Но так почти никто не пишет. В наборе тестов на Jasmine
`done()` стоит в конце колбэка:

```ts
it('loads', (done) => {
  setTimeout(() => {
    expect(1).toBe(999); // ← бросает здесь, так что до done() дело даже не доходит
    done();
  }, 0);
});
```

Тело возвращает `undefined`, поэтому тест заканчивается раньше, чем срабатывает таймер. Замер:
**зелёный**. `AssertionError` приходит позже как одна из необработанных ошибок прогона, а ошибка об
устаревании не возникает вовсе. В проекте, откуда пришло это правило, четыре таких теста годами были
зелёными.

`done.fail(…)` хуже в том же смысле. У `TestContext` нет `fail`, поэтому строка бросает
`done.fail is not a function`. Бросает она там, где стоит, а это почти всегда колбэк `error` или
`.catch()`. Реджект не обработан, и прогон **зелёный ровно на том пути, который должен был его
уронить**.

**Как правило отличает `done` от контекста.** Оно смотрит на форму параметра и на то, что с ним делает
тело, но никогда не на имя:

- Деструктуризация (`({ task })`) и колбэк без параметров молчат. Фикстуру `test.extend` обязательно
  деструктурировать.
- Простое имя — неоднозначный случай. Vitest в любом случае передаёт туда `TestContext`, а
  `(ctx) => ctx.skip()` — пример из документации самого Vitest.
- Правило молчит, когда **каждое** использование имени — чтение члена: `ctx.task`, `ctx.expect`,
  `ctx.onTestFinished`.
- Оно сообщает, когда имя вызывают (`done()`), передают тому, кто его вызовет (`.subscribe(done)`,
  `setTimeout(done)`), или не используют вовсе.
- `.fail` — единственное чтение члена, которое не считается использованием контекста: у `TestContext`
  такого члена нет. Это второе сообщение правила. Оно касается только параметра, о котором правило
  уже сообщило; такой параметр находится через анализ областей видимости. Метод `fail` у другого
  объекта — чей-то API.

**Границы.** Хелпер, который принимает один позиционный аргумент и вызывается как хук, выглядит так
же. Правило смотрит только на шесть имён раннера, поэтому это редкость. Неиспользуемый параметр
сообщается сознательно: неиспользуемый `done` — ровно та форма, которую раннер никогда не вызовет, а
неиспользуемый контекст можно просто убрать. Имя, которое только читают через члены, считается
контекстом, как бы оно ни называлось.

**Серьёзность.** `error`. Тест, который проходит, не выполнившись, нельзя пролистать в выводе линтера.
:::

## no-bare-called-with {#no-bare-called-with}

**`error`** · без автоисправления · только синтаксис

Сообщает про `calledWith(…)` или `mustBeCalledWith(…)`, записанный отдельной инструкцией. В этой
библиотеке `calledWith` настраивает стаб. Отдельной строкой он ничего не проверяет, поэтому тест
проходит независимо от того, был вызов или нет.

```ts
cart.checkout.calledWith(1); // ❌ настраивает «на 1 отвечать undefined», не проверяет ничего
```

```ts
cart.checkout.calledWith(1).mockReturnValue(receipt); // ✅ стаб, доведённый до конца
expect(cart.checkout).toHaveBeenCalledWith(1); // ✅ или проверка, если имелась в виду она
```

**Опции.** Нет.

**Как исправить.** Выберите, что вы имели в виду:

- **Стаб:** продолжите цепочку через `.mockReturnValue(v)`, `.resolveWith(v)`, `.nextWith(v)` или
  `.failWith(err)`.
- **Проверку:** `expect(spy.method).toHaveBeenCalledWith(…)`.

**Когда выключить.** Для chai не нужно: цепочки, которые начинаются с `expect(…)`, не сообщаются
никогда, так что `expect(fn).to.have.been.calledWith(x)` в порядке. Цепочка `calledWith`, сохранённая
в переменную и продолженная позже, тоже не голая инструкция.

::: details Как правило решает
**Два значения одного слова.** `calledWith` в этой библиотеке настраивает **стаб**. С Vitest 4.1 в
сборке chai тоже есть `calledWith`, но как **проверка**, для проектов, пришедших с sinon:

```ts
expect(fn).to.have.been.calledWith('example'); // chai: проверяет, что вызов был
cart.checkout.calledWith(1); // эта библиотека: настраивает, что ответит вызов
```

Правило различает их, спускаясь по цепочке членов до корня. Проверка всегда начинается с вызова
`expect`, стаб — всегда со спая. `mustBeCalledWith` такая проверка не нужна: в chai нет ничего с этим
именем.

**Почему оно в recommended.** Сам по себе `calledWith(1)` регистрирует «на аргумент `1` отвечать
`undefined`». Ненастроенный спай и так это делает, поэтому тест проходит независимо от того, был ли
вызов. `mustBeCalledWith` сам по себе неверен в другую сторону. Без настройки под его аргументы он
отвергает **любой** вызов, включая подходящий. В падении он называет аргументы, поэтому оно читается
как несовпадение, а не как забытый `.mockReturnValue`. Поэтому у него своё сообщение.

**Границы.** Правило не может отличить стаб, который вы собирались достроить, от проверки, записанной
не тем словарём. Поэтому сообщение называет обе починки.

**Серьёзность.** `error`. Зелёный и неверный, а починка — в одно слово.
:::

## no-constant-expect {#no-constant-expect}

**`error`** · без автоисправления · только синтаксис

Сообщает про `expect(value)`, когда значение выписано прямо в спеке и ответ матчера этим значением уже
предрешён. Такой тест проходит, что бы ни делал код.

```ts
it('emits after the timeout', () => {
  cache.waitUntilReady().subscribe();
  vi.runOnlyPendingTimers();

  expect(true).toBe(true); // ❌ проходит, что бы ни сделал поток
});
```

```ts
it('emits after the timeout', async () => {
  const emitted = expectEmission(cache.waitUntilReady(), { advance: () => vi.runOnlyPendingTimers() });

  await expect(emitted).resolves.toBeUndefined(); // ✅
});
```

**Опции.** Нет.

**Как исправить.** Проверяйте значение, которое вернул код. Если строка отмечает ветку, до которой
тест дойти не должен, например `expect(true).toBe(false)` в колбэке `error`, напишите
`expect.fail('the request should not fail')`. Это говорит то же самое и называет ветку.

**Когда выключить.** Не нужно. Правило читает только значения, выписанные в спеке, поэтому на живых
значениях ложных срабатываний у него нет.

::: details Как правило решает
**Два прочтения значения**, по одному на вид матчера. Между ними допускается сколько угодно `.not`.

- `toBe`, `toEqual` и `toStrictEqual` предрешены, когда постоянны **обе** стороны. Постоянное — это
  литерал, шаблонная строка без `${…}`, `undefined`, унарный оператор над постоянным, функция, стрелка
  или выражение класса, либо массив или объектный литерал, где каждый элемент — одно из этого. Спред,
  вычисляемый ключ, геттер или любое имя делают значение живым.
- `toBeTruthy`, `toBeFalsy`, `toBeDefined`, `toBeUndefined`, `toBeNull` и `toBeNaN` предрешены для
  этих же постоянных **и** для любого литерала объекта, массива, функции или класса, что бы в нём ни
  лежало. Объект никогда не бывает ложным, `null`/`undefined` или `NaN`.

Правило не трогает:

- цепочку через `.resolves` / `.rejects`;
- все прочие матчеры: `expect(() => load()).toThrow()` передаёт стрелку намеренно;
- арифметику: `expect(1 + 1).toBe(2)` не вычисляется;
- постоянное значение за именем: `const ok = true; expect(ok).toBe(true)`;
- `expect.soft(…)` и chai-шный `expect(x).to.be.true`.

Касты читаются насквозь.

**Почему оно в recommended.** [`vitest/expect-expect`](/ru/utilities/eslint-plugin#alongside-vitest-expect-expect)
видит `expect` и доволен. Поэтому тест, чья единственная проверка постоянна, зелёный при любом
состоянии кода. На одном Angular-проекте из 1759 файлов спек правило сообщило четыре раза в четырёх
файлах:

- тест, названный по потоку, на который он так и не посмотрел;
- тест, оставленный после того, как его фичу убрали;
- два теста, которые импортируют barrel только ради того, чтобы его строки считались покрытыми.

В `@vitest/eslint-plugin` (1.6) такого правила нет. Его `valid-expect` проверяет форму вызова, а не
то, что в него передано.

**Серьёзность.** `error`. Находка — факт о строке: ничто из того, что делает код, её ответ не изменит.
:::

## no-redundant-smoke-test {#no-redundant-smoke-test}

**`error`** · подсказка · только синтаксис

Сообщает про тест, который только проверяет, что субъект существует, например
`expect(pipe).toBeTruthy()`, когда другие тесты того же блока уже строят этот субъект. Если субъект
сломан, первыми упадут они, так что smoke-тест ничего не добавляет.

```ts
describe('IndicatorOffsetPipe', () => {
  let pipe: IndicatorOffsetPipe;

  beforeEach(() => {
    pipe = new IndicatorOffsetPipe();
  });

  it('should create an instance', () => {
    expect(pipe).toBeTruthy(); // ❌ зелёный при любом состоянии кода, до которого дотягивается этот файл
  });

  it('clamps a position past the right edge', () => {
    expect(pipe.transform(120, 100, 200)).toBeLessThanOrEqual(95);
  });
});
```

**Опции.** Нет.

**Как исправить.** Удалите тест. Подсказка это и делает, вместе с пустой строкой над ним. Тест ниже
выполняет тот же `beforeEach`, поэтому пустой `pipe` первым уронит **его**, на `transform` от
undefined, и падение покажет, что спека в этот момент делала.

Если вы действительно проверяете сборку субъекта, проверяйте именно её. Например, фабрику, которая
отвергает плохой конфиг:

```ts
it('refuses a config with no bucket', () => {
  expect(() => new Uploader({ bucket: '' })).toThrow('bucket is required'); // ✅
});
```

**Когда выключить.** Блок, где smoke-тест — единственный выполняемый, не сообщается никогда. Правило
не смотрит, что строят остальные тесты, поэтому сообщает и про smoke-тест, чьи соседи проверяют
**другой** субъект. Такая спека проверяет не то, но знайте, что правило читает её именно так.

::: details Как правило решает
Правило читает только тела тестов блока.

- **Smoke-тест** — это тело, где каждая инструкция — `expect(x)` под `toBeTruthy`, `toBeDefined` или
  `toBeInstanceOf`, либо под `toBeFalsy`, `toBeNull` или `toBeUndefined` за `.not`. Одна инструкция,
  которая делает что-то ещё (вызов, локальная переменная, `if`, матчер, читающий значение), — и тест
  остаётся нетронутым. Пустое тело smoke-тестом не считается.
- **Значение должно быть ссылкой на субъект**, а не тем, что тест вычислил. То есть идентификатором,
  цепочкой членов без вызова (`fixture.componentInstance`) или вызовом без аргументов, который только
  строит субъект (`createService()`, `TestBed.inject(Token)`). Правило не трогает:
  - вызов со значением внутри, чтение метода или сигнала, запрос к DOM, выражение над коллекцией.
    `expect(isRestrictedProfile(MEMBER_ROLE.CHILD)).toBeTruthy()` и
    `expect(el.querySelector('expand-card')).toBeTruthy()` — не smoke-тесты;
  - запрос к DOM за именем: `expect(minimap()).not.toBeNull()`, где собственный хелпер файла
    `minimap` вызывает `querySelector`, `query(All)`, `getElement*`, `closest`, `By.*` или
    `queryElement`, или имя, один раз связанное с таким результатом. Это проверка того, какая ветка
    шаблона отрисовалась;
  - билдер под `toBeInstanceOf`: он утверждает, что два имени разрешаются друг в друга, а это
    проводка.
- **Выполняемый тест блока должен добираться до субъекта тем же путём**, целиком, а не только по
  первому имени. `expect(publicApi.FocusModule).toBeDefined()` рядом с тестом на
  `publicApi.viewerSettings` делит с ним только слово `publicApi`, поэтому не сообщается. То же с
  флагом, который `beforeAll` выставляет из `complete` наблюдаемого, когда соседи читают собранные
  значения.
- **Какие тесты считаются:** остальные тесты своего блока и все тесты во вложенных в него блоках.
  Пропущенный сосед (`it.skip`, `xit`, `it.todo`) ничего не доказывает и не считается. Пропущенный
  smoke-тест всё равно сообщается.
- **Тест во вложенном блоке** не взвешивается против блока над ним. Внешние тесты не выполняют
  внутренний `beforeEach`.
- Блок, где этот тест — единственный выполняемый, правило не трогает. Такая спека тонкая, но правило,
  которое опустошает файл, уже не правило линтера.

**Границы.** Только синтаксис. Проверку существования за хелпером (`expectCreated(pipe)`) правило не
читает, как и проверку через `expect.soft`. `it.each([…])('…')` читается как один тест.

**Почему оно в recommended.** Строка не может упасть сама по себе, но выглядит как покрытие. На одном
Angular-проекте из 1771 файла спек: 569 находок в 540 файлах. 515 из них назывались `should create`,
`should be created` или `create an instance` — то, что `ng generate` пишет в каждую новую спеку. На
втором проекте, из 845 файлов: 97 находок в 87 файлах. На третьем, из 127 файлов: одна.
[`vitest/expect-expect`](/ru/utilities/eslint-plugin#alongside-vitest-expect-expect) видит `expect`
и доволен; в `@vitest/eslint-plugin` (1.6) такого правила нет.

**Серьёзность.** `error`. Ничто из того, что делает проверяемый код, ответа не изменит, а исправление —
удаление.
:::

## no-self-called-spy {#no-self-called-spy}

**`error`** · без автоисправления · синтаксис и области видимости

Сообщает про тест, который ставит спай на метод, сам вызывает этот метод, а потом проверяет, что его
вызвали. Тест сам делает свою проверку истинной, поэтому ничего не проверяет в коде.

```ts
it('relays subscribeClick from children', () => {
  const emitSpy = vi.spyOn(component.subscribeClick, 'emit');
  component.subscribeClick.emit(payload); // ❌ тест сам делает свою проверку истинной
  expect(emitSpy).toHaveBeenCalledWith(payload);
});
```

```ts
it('relays subscribeClick from children', () => {
  const emitSpy = vi.spyOn(component.subscribeClick, 'emit');
  renderShallow(Parent).query(ChildComponent).subscribeClick.emit(payload); // ✅ настоящий триггер

  expect(emitSpy).toHaveBeenCalledWith(payload);
});
```

**Опции.** Нет.

**Как исправить.** Запустите то, что должно сделать вызов: отправьте DOM-событие, эмитните на подмене
соседнего сервиса или вызовите публичный метод, который должен передать вызов дальше. Вся починка
есть в сообщении.

**Когда выключить.** Не нужно: правило тихое по замыслу. Оно никогда не сообщает про:

- вызов, написанный **до** спая: это подготовка;
- отрицательную проверку или `toHaveBeenCalledTimes(0)`;
- вызов, запись о котором `mockClear` / `mockReset` / `mockRestore` / `vi.clearAllMocks()` сбрасывает
  до проверки;
- проверку, чьи аргументы отличаются от переданных в вызове;
- спай, поставленный в хуке, или вызов изнутри колбэка.

::: details Как правило решает
**Три позиции в одном теле теста**, сопоставленные по тексту объекта и имени члена:
`vi.spyOn(obj, 'm')`, затем прямой `obj.m(…)` самим тестом **после** него, затем положительный
`toHaveBeenCalled*` по тому же члену. Порядок — это всё правило. В другом порядке те же формы —
обычная подготовка: привести субъект в состояние, поставить спай, затем запустить продакшн-путь.

**Почему оно в recommended.** Тест выше доказывает, что `EventEmitter.emit` вызывает
`EventEmitter.emit`. Удалите привязку `(subscribeClick)="…"`, которую называет его заголовок, — и он
останется зелёным. Он переживает удаление того поведения, которое обещает проверять.

Правило тихое. На проекте из 2 030 файлов оно сообщает **5 мест в 3 файлах**: три передачи
`EventEmitter.emit` в одной спеке компонента и ещё две той же формы в других местах. Проекту оно
ничего не стоит (на спеке, которая запускает продакшн-путь, находок нет), а ловит тест, в котором
субъекта нет вовсе.

**Границы подробнее.**

- «Его не вызывали» вызовом истинным не сделаешь, поэтому отрицательные проверки не сообщаются
  никогда.
- Сброс между вызовом и проверкой значит, что спека сама говорит: проверка — про продакшн-путь. Пять
  мест в одном файле замеренного проекта именно такие.
- `expect(component.scale.set).toHaveBeenCalledWith(3)` после подготовительного
  `component.scale.set(2)` этой строкой выполниться не может. Аргументы сравниваются по исходному
  тексту, поэтому правило ошибается в тихую сторону: одно значение, записанное двумя способами, оно
  пропускает.
- Спай в **хуке** общий для всех тестов блока, и большинство из них запускают продакшн-путь.
- Вызов **изнутри колбэка** делает проверяемый код, а не тест.

**Почему нет ни автоисправления, ни подсказки.** В сообщённом узле нечего править. Исправление зависит
от того, что тест имел в виду, а угадывать это по той же причине отказывается и
[`no-vacuous-absence-assertion`](#no-vacuous-absence-assertion).

**Серьёзность.** `error`. Доказательство — три строки файла в одном порядке, без догадок, а находка —
тест, который ничего не доказывает про код, который называет.
:::

## prefer-create-spy-from-class {#prefer-create-spy-from-class}

**`error`** · без автоисправления · только синтаксис · опция `minRunnerFns`

Сообщает об объектном литерале, у которого **два и более** свойства со значением `vi.fn()` / `jest.fn()`.
У такой подмены, написанной руками, есть только те методы, которые кто-то вспомнил. Когда в классе
появляется новый метод, подмена от него отстаёт.

```ts
const cart = { total: vi.fn(), add: vi.fn() } as unknown as CartService; // ❌
```

```ts
const cart = createSpyFromClass(CartService); // ✅ следует за классом, правок потом не нужно
```

**Опции.**

| Опция          | Тип               | По умолчанию | Смысл                                            |
| -------------- | ----------------- | ------------ | ------------------------------------------------ |
| `minRunnerFns` | целое число, от 1 | `2`          | сколько свойств `vi.fn()` делают объект подменой |

```js
'vitest-auto-spy/prefer-create-spy-from-class': ['error', { minRunnerFns: 1 }],
```

**Как исправить.** Замените объект на `createSpyFromClass(Class)`, который читает класс, или на
`createAutoMock<T>()`, который читает тип. Для интерфейса или абстрактного класса берите
`createAutoMock<T>()`. Сообщение называет подмену, сколько в ней `vi.fn()` и каких, а также
`createAutoMock<T>()` для типа, который объявляет её имя.

У объекта из одного члена, например thenable `{ then: vi.fn() }`, нет класса, который можно прочитать.
Для него сообщение называет `createMock<T>({ then: vi.fn() })`: он сверяет ключ и сигнатуру с `T`.
Вложенный `{ set: vi.fn() }` / `{ update: vi.fn() }` стоит вместо сигнала, поэтому его сообщение
называет `mockSignalProp`.

**Когда выключить.** Если две подмены на соседних строках ведут себя по-разному (одна в отчёте, другая
нет), сначала проверьте порог. При пороге `2` по умолчанию объект с одним `vi.fn()` не сообщается. Он
выглядит ровно как набор опций с колбэком внутри (`{ onDone: vi.fn() }`). Если нужны и такие, поставьте
`minRunnerFns: 1`. Посмотрите также, что правило уже пропускает, — ниже.

::: details Как правило решает
**Подсчёт.** Правило считает собственные свойства объекта, а не всё поддерево. Значение считается, если
разворачивается в `vi.fn()` / `jest.fn()`, какой бы длинной ни была цепочка настройки:
`vi.fn().mockReturnValue(of([]))` и `vi.fn().mockReturnValue(x).mockName('y')` оба попадают в счёт.
Правило срабатывает на каждом объектном литерале файла, поэтому внутренний объект оценивается по своим
свойствам. Свойство считается и тогда, когда его значение — имя, которое файл один раз связывает с
`vi.fn()`: `{ load, save }` при двух `const … = vi.fn()`.

**Что правило пропускает:**

- объект, который `useValue` провайдера отдаёт в DI, написанный прямо в слоте или через одно имя. Это
  случай [`prefer-provide-auto-spy`](#prefer-provide-auto-spy), а два отчёта на одну подмену приучают
  выключать оба правила;
- всё внутри вызова `autoMocked`, `createActivatedRoute`, `createAutoMock`,
  `createComponentStub`, `createDirectiveHost`, `createDocumentDouble`, `createMock`,
  `createRouterDouble`, `createSpyClass`, `createSpyFromClass`, `createWindowDouble`,
  `mockConstructor`, `mockDeep`, `provideActivatedRoute`, `provideAutoSpy`,
  `provideAutoSpyForToken`, `provideDocumentDouble`, `provideRouterDouble` или
  `provideWindowDouble`, на любой глубине. Такой объект — **начальные значения** (набор
  переопределений или значения для экземпляра), то есть ровно то, о чём правило просит:

  ```ts
  const xhr = createAutoMock<XhrLike>({ send: vi.fn(), abort: vi.fn() }); // ✅ никогда не в отчёте
  const api = mockDeep<Api>({ api: { load: vi.fn(), save: vi.fn() } }); // ✅ и на любой глубине тоже
  ```

- всё внутри фабрики `vi.mock()` / `vi.doMock()`, чей объект подменяет экспорты модуля, и всё, что
  возвращает колбэк `vi.hoisted()`: `vi.hoisted(() => ({ spawnMock: vi.fn() }))`;
- набор опций, переданный прямо в вызов или в `new`: ровно один `vi.fn()` рядом хотя бы с одним
  обычным значением, как в `service.openDialog({ elRef, options, onColorChange: vi.fn() })`. До этой
  формы доходит только `{ minRunnerFns: 1 }`. Два мока, значение-функция или тот же объект, сначала
  сохранённый в `const`, по-прежнему попадают в отчёт. То же относится к набору, вложенному в аргумент
  вызова: `render({ options: { slide, onClose } })`;
- всё внутри `createFixture(…)` / `createFixtureFactory(…)`, например
  `createFixture<Options>({ changeOptionsCallback: vi.fn() })`: такой объект уже типизирован по
  модели;
- RxJS-обсервер, переданный прямо в `subscribe(…)` или `tap(…)`:
  `source$.subscribe({ error: vi.fn() })`;
- описание провайдера, то есть любой объект с ключом `provide:`;
- карта инпутов в `setInputs(fixture, { … })` и в `renderShallow(C, { inputs: { … } })`: оба
  сверяют её с инпутами компонента;
- `return { preventDefault, stopPropagation }` из одних имён, где каждый спай читается ещё где-то. Это
  ссылки на спаи, которые установил хелпер. Фабрика, чьи спаи существуют только в возвращаемом объекте,
  по-прежнему попадает в отчёт;
- объект ниже порога.

**Объекты из одного члена, которые уже типизированы, тоже пропускаются:**

- литерал из одного члена, привязанный к имени с объявленным типом
  (`const parameters: Record<string, unknown> = { fn }`, на любой глубине), если только этот тип сам не
  инлайновый объектный тип;
- литерал внутри значения `mockValueProp` / `mockReadonlyProp` / `mockSignalProp`;
- аргумент хелпера, объявленного в том же файле, если параметр типизирован:
  `createDefaultOptions({ onChange: callback })` при
  `const createDefaultOptions = (overrides?: Partial<Options>) => …`.

Параметр **импортированного** хелпера синтаксическому правилу не виден, поэтому там тот же вызов
по-прежнему в отчёте. Оберните литерал в `createMock<Partial<Options>>(…)` или привяжите его к `const`
с типом.

**Настроенный спай — всё равно спай.** `vi.fn()` и `vi.fn().mockReturnValue(of([]))` — одна и та же
подмена, просто вторая настроена. Правило разматывает цепочку до вызова, который создал мок. Чем
сильнее настроена подмена, написанная руками, тем дальше она ушла от класса.

**Почему оно в recommended.** В классе появляется метод, и спека падает в коде приложения, в
нескольких кадрах стека от объекта, который на самом деле неверен:

```text
F1  написан руками { total: vi.fn() }      → TypeError: cart.applyCoupon is not a function
F2  createSpyFromClass(CartService)        → следует за классом, без правок
```

Система типов этого не ловит, потому что подмена никогда и не совпадала с классом. Стоящий перед ней
`as unknown as CartService` прячет ошибку:

```text
TS2741: Property 'rate' is missing in type '{ total: Mock<Procedure>; add: Mock<Procedure>; }'
        but required in type 'CartService'.
```

`createSpyFromClass` читает прототип, а `createAutoMock<T>()` читает тип, поэтому ни один из них не
может отстать.

**Почему порог — 2.** Правило не может отличить `{ onDone: vi.fn() }` от `{ load: vi.fn() }`, а
срабатывает на каждом объектном литерале. Видимая цена — две подмены на соседних строках: одна в
отчёте, другая нет. На это наткнулись семь партий переезда. Подмены с одним `vi.fn()` закрывают
правила, у которых есть доказательство. У [`prefer-provide-auto-spy`](#prefer-provide-auto-spy) рядом с
объектом стоит `provide:`, у [`no-structural-double`](#no-structural-double) есть объявленный тип, а
[`no-stub-class-double`](#no-stub-class-double) читает форму класса. Все три срабатывают при **одном**.

**Серьёзность.** `error`. Без правила тест всё равно краснеет, но сообщение называет метод, а не
подмену. И исправление — переписать подмену, а не одну строку.
:::

## no-stub-class-double {#no-stub-class-double}

**`warn`** · без автоисправления · только синтаксис · опция `minRunnerFns`

Сообщает о классе, чьи собственные поля — `vi.fn()` / `jest.fn()`. Это та же подмена, написанная
руками, что и объект из `vi.fn()`, только с `new` впереди. Когда в настоящем классе появляется метод,
заглушка от него отстаёт.

```ts
class PaymentCardServiceMock {
  getPreviewUrl = vi.fn().mockReturnValue(of(url));
  load = vi.fn();
} // ❌

const mock = new PaymentCardServiceMock();
```

```ts
const mock = createSpyFromClass(PaymentCardService); // ✅
// либо, когда подмена стоит вместо интерфейса или абстрактного класса:
const mock = createAutoMock<PaymentCardService>();
// а за DI весь класс-заглушка исчезает:
providers: [provideAutoSpy(PaymentCardService)];
```

**Опции.**

| Опция          | Тип               | По умолчанию | Смысл                                         |
| -------------- | ----------------- | ------------ | --------------------------------------------- |
| `minRunnerFns` | целое число, от 1 | `1`          | сколько полей `vi.fn()` делают класс подменой |

**Как исправить.** Удалите класс-заглушку и возьмите `createSpyFromClass(Class)`, `createAutoMock<T>()`
или `provideAutoSpy(Class)` в `providers`.

**Когда выключить.** Правило решает по догадке, поэтому входит в пакет как `warn`. Выключите его, если
не согласны с таким чтением: [`prefer-create-spy-from-class`](#prefer-create-spy-from-class)
продолжит работать. Поднимите до `error`, когда заглушек не останется. Правило не видит:

- класс-заглушку в общем `*.mock.ts`: объявление должно быть в проверяемом файле;
- поля, которым значение присваивают в конструкторе (`this.load = vi.fn()`).

::: details Как правило решает
**Подсчёт** читает собственные инициализированные поля класса и разматывает цепочку настройки:
`load = vi.fn().mockReturnValue(of(url))` попадает в счёт. `static`-поля тоже считаются:
`static`-поле из `vi.fn()` — та же подмена, только построенная один раз на модуль. Поле без
инициализатора, вычисляемый ключ и поле, которому значение присваивают в конструкторе, не считаются.

**Четыре вида классов пропускаются.** В файле спеки много классов, которые держат `vi.fn()`, но не
подменяют сервис:

- класс **с декоратором** — тестовый хост или тестовый модуль. Его поля `vi.fn()` — обработчики
  событий (`onChange = vi.fn()`);
- класс с непустым **`implements`**. Он отстать _не может_: добавьте член в тип, и заглушка перестанет
  компилироваться;
- класс, который **`extends`** что-нибудь. Он наследует настоящее поведение, поэтому `provideAutoSpy`
  ему не замена;
- класс **без собственного имени** — классовое выражение в слоте свойства. Такой класс подменяет
  экспорт модуля, который потом служит DI-токеном, а токен обязан быть конструктором. Сюда входят и
  `vi.mock('m', () => ({ C: class { … } }))`, и объект, сохранённый в `const`, который фабрика лишь
  называет.

**Класс, который тот же файл отдаёт в DI, пропускается:** через `useClass:`, `useExisting:`,
`useValue: new StubMock()` или дескриптор `TestBed.overrideProvider`, который его называет. Такой
провайдер — случай [`prefer-provide-auto-spy`](#prefer-provide-auto-spy) на уровне `error`, и
исправление пишется там. Это правило копирует условия того правила в точности, вместе с `multi: true`:
где молчит то правило, это сообщает.

**Почему счёт начинается с одного.** [`prefer-create-spy-from-class`](#prefer-create-spy-from-class)
нужно два, потому что `{ onDone: vi.fn() }` выглядит как `{ load: vi.fn() }`. А набор опций классом
никто не пишет. На одном проекте из 1759 файлов спек порог в два поля даёт 6 классов, а в одно — 12.
Все шесть, которые скрывал высокий порог, называются `*Mock` или `Mock*`.

**Единственная ложная форма.** Локальный вспомогательный класс без декоратора и без `extends`, который
держит один колбэк `vi.fn()`, попадает в отчёт, хотя сервис не подменяет. В замеренном проекте таких не
было. К тому же сообщение называет `createAutoMock<T>()`, и это верный ответ, если класс вообще стоит
вместо чего-то.

**Почему оно в recommended.** Тот же дрейф, что у `prefer-create-spy-from-class`: спека падает на
`TypeError: mock.applyCoupon is not a function` в коде приложения. Это отдельное правило, потому что
это была _самая большая_ оставшаяся группа в проекте, где включены все `error`-правила и нет ни одного
`eslint-disable`: 112 полей `vi.fn()` в 46 классах по 32 файлам. `prefer-create-spy-from-class` ищет
объектные литералы, а объявление класса к ним не относится.

**Серьёзность.** `warn` — из-за доказательства, а не из-за находки. Дефект тот же, о котором
`prefer-create-spy-from-class` сообщает на `error`. Но у того правила есть счёт, который можно
защитить, а у этого — эвристика с четырьмя исключениями, подобранными руками. Проект, который не
согласен, должен уметь выключить это правило и не потерять правило со счётом. На одном проекте из 1759
файлов спек оно даёт 10 отчётов в 7 файлах.
:::

## no-structural-double {#no-structural-double}

**`warn`** · без автоисправления · только синтаксис · опция `minRunnerFns`

Сообщает об объекте из `vi.fn()`, присвоенном имени, чей **объявленный тип** — инлайновый объектный
тип с членом из мок-типов Vitest, например `let card: { load: Mock }`. Объявление говорит, что объект
стоит вместо типа. А дальше объект пишет эту подмену руками, по одному методу. Когда тип меняется,
подмена отстаёт.

```ts
let devModeService: { devMode: Mock };

beforeEach(() => {
  devModeService = { devMode: vi.fn().mockReturnValue(true) }; // ❌
});
```

```ts
let devModeService: Spy<DevModeService>;

beforeEach(() => {
  devModeService = createAutoMock<DevModeService>(); // ✅ читает тип
  devModeService.devMode.mockReturnValue(true);
});
```

**Опции.**

| Опция          | Тип               | По умолчанию | Смысл                                                                                           |
| -------------- | ----------------- | ------------ | ----------------------------------------------------------------------------------------------- |
| `minRunnerFns` | целое число, от 1 | `2`          | правило сообщает только **ниже** этого числа; держите его равным `prefer-create-spy-from-class` |

**Как исправить.** Объявите переменную как `Spy<T>` и создайте её через `createAutoMock<T>()`.
`createAutoMock<T>()` работает и там, где `provideAutoSpy` не может: для абстрактного класса или
интерфейса. Если объект идёт в Angular DI, исправление — `provideAutoSpy(Class)`. Об этом случае
сообщает [`prefer-provide-auto-spy`](#prefer-provide-auto-spy).

**Когда выключить.** Доказательство здесь — чтение объявления, поэтому правило входит в пакет как
`warn`. Выключите его, если не согласны: [`prefer-create-spy-from-class`](#prefer-create-spy-from-class)
продолжит работать. Правило никогда не сообщает о:

- **голом** `let fn: Mock`: это обычный колбэк, и `Mock` — его верный тип;
- приведении `X.y as Mock`, которое перетипизирует уже существующую функцию;
- подмене, объявленной через интерфейс, псевдоним типа, `Record<…, Mock>` или пересечение;
- объекте, присвоенном не простому имени (`state.svc = { … }`, деструктурированная привязка,
  параметр).

::: details Как правило решает
**Доказательство — объявление.** `prefer-create-spy-from-class` нужно два `vi.fn()`, потому что
`{ onDone: vi.fn() }` и `{ load: vi.fn() }` выглядят одинаково. `Mock`, записанный **членом объектного
типа**, снимает вопрос: набор опций как `{ onDone: Mock }` никто не аннотирует. Поэтому это правило
сообщает уже при одном `vi.fn()` — так же, как `prefer-provide-auto-spy`, когда `provide:` доказывает
то же самое.

**Имя отслеживается в обе стороны, которыми его пишет спека:** собственная аннотация декларатора
(`const svc: { load: Mock } = { … }`) и присваивание обратно в `let`, который его объявил. Важна
вторая. В замеренном проекте **ни у одной** из 120 аннотированных подмен не было инициализатора. Каждая
была `let x: { … };` в начале `describe` и `x = { … }` в `beforeEach`.

**Типом члена считается любой мок-тип Vitest:** `Mock`, `MockInstance`, `Mocked`, `MockedClass`,
`MockedFunction`, `MockedFunctionDeep`, `MockedObject`, `MockedObjectDeep`, `PartialMock`. Какой бы ни
встретился, это тип одного **члена**. А член объектного типа, написанного руками, — это метод, который
кто-то вспомнил. Какой из них означает подмену всего объекта — вопрос
[`no-mocked-for-spy`](#no-mocked-for-spy).

**Что правило пропускает:**

- подмену, отданную в Angular DI, начальные значения фабрики и фабрику `vi.mock()` — так же, как
  `prefer-create-spy-from-class`;
- всё, что на пороге `prefer-create-spy-from-class` или выше. То правило уже сообщает о таком на
  `error`, так что одна подмена никогда не получает двух отчётов. Оба читают один и тот же
  `minRunnerFns`; меняете его — меняйте на обоих;
- объявление, обёрнутое во что угодно. `Mocked<{ load: Mock }>` — отчёт `no-mocked-for-spy`.
  Пересечение с настоящими полями — единственная форма, где объект действительно отчасти конфигурация.
  У `interface` или псевдонима `type` нет значения в поле зрения, так что указать не на что.

**Пропуск про DI шириной в одно имя.** [`prefer-provide-auto-spy`](#prefer-provide-auto-spy) идёт по
имени внутрь `useValue`, а это правило идёт по тому же имени обратно к объявлению. Иначе форма ниже
получила бы два отчёта, которые расходятся в том, как её исправить:

```ts
let svc: { load: Mock };

beforeEach(() => {
  svc = { load: vi.fn() };
  TestBed.configureTestingModule({ providers: [{ provide: Card, useValue: svc }] });
});
```

Большинство аннотированных подмен оказались именно такими. Из 115 кандидатов в замеренном проекте
**110** уходят в DI через одно имя. Они принадлежат правилу провайдера, и его ответ —
`provideAutoSpy(Card)`. На долю этого правила остаётся 5 отчётов в 4 файлах.

**Почему голый `Mock` никогда не сообщается:** 109 из 290 упоминаний `Mock` в замеренном проекте были
обычными колбэками.

**Серьёзность.** `warn`, по той же причине, что у [`no-stub-class-double`](#no-stub-class-double).
Дефект настоящий, но доказательство — чтение объявления, а не счёт. И больше ничто в файле не
доказывает, что объект стоит вместо чего-то. Серьёзность выбрана по доказательству, а не по числу
отчётов.
:::

## prefer-spy-on-own-method {#prefer-spy-on-own-method}

**`warn`** · `--fix` и подсказка · только синтаксис

Сообщает о вызове `createSpyFromInstance`, который шпионит за одним методом и используется только ради
него. Хелперы [`spyOnOwnMethod` и `spyOnVoidMethod`](/ru/core/create-spy-from-class#spy-on-own-method)
говорят то же самое одним вызовом.

```ts
const seek = createSpyFromInstance(player, {
  onlyMethodsToSpyOn: ['seek'],
  passthrough: true,
}).seek; // ❌

let spy: Spy<Player>;
beforeEach(() => {
  spy = createSpyFromInstance(player, { onlyMethodsToSpyOn: ['seek'], passthrough: true }); // ❌
});
it('seeks', () => expect(spy.seek).toHaveBeenCalled());
```

```ts
const seek = spyOnOwnMethod(player, 'seek'); // ✅

let spy: Spy<Player>['seek'];
beforeEach(() => {
  spy = spyOnOwnMethod(player, 'seek'); // ✅
});
it('seeks', () => expect(spy).toHaveBeenCalled());
```

**Опции.** Нет.

**Как исправить.** Правило знает три формы:

| Переданные опции                                                  | Замена                         | Как       |
| ----------------------------------------------------------------- | ------------------------------ | --------- |
| `{ onlyMethodsToSpyOn: ['m'], passthrough: true }`                | `spyOnOwnMethod(target, 'm')`  | `--fix`   |
| `{ onlyMethodsToSpyOn: ['m'], returns: { m: undefined } }`        | `spyOnVoidMethod(target, 'm')` | `--fix`   |
| `{ returns: { m: undefined } }` на настоящем событии или элементе | `spyOnVoidMethod(target, 'm')` | подсказка |

`--fix` переписывает вызов и превращает каждое чтение `name.m` в `name`. Хелпер он импортирует рядом с
фабрикой. Источник — та же точка входа, если она экспортирует хелпер. Иначе — точка входа адаптера,
которую импортирует файл, или корень. Импорт фабрики удаляется, когда уходит её последнее
использование.

- Аннотация `Spy<X>` у имени становится `Spy<X>['m']` — в подсказке, а не в исправлении.
- Любая другая аннотация, явные аргументы типа или `spyOnOwnMethod`, который файл объявляет сам:
  отчёт приходит без правки.
- Несколько переписываний за один проход `--fix` могут оставить импорт `createSpyFromInstance`
  неиспользованным. Его поймает ваше правило про неиспользуемые импорты.

**Когда выключить.** Вызов, о котором сообщает правило, корректен и делает ровно то же, что хелпер. Это
более короткое написание, а не дефект, поэтому правило — `warn`. У точных форм есть `--fix`, так что
поднять уровень стоит одного запуска `eslint --fix`.

::: details Как правило решает
**«Используется только ради этого метода»** — одно из четырёх написаний, в одну строку или в десять:

- `.m` (или `['m']`), прочитанное прямо с вызова;
- `const { m } = …`;
- вызов отдельной инструкцией;
- имя, которому вызов присвоен один раз и которое читается только как `name.m`: `const` или `let`,
  который заполняет `beforeEach`.

**Что снимает отчёт:** второй метод в списке; `methodsToSpyOn` (он добавляет к обнаружению, а не
заменяет его); любая другая опция; спред; результат, который передают дальше, экспортируют,
перезаписывают как `spy.m = …` или читают ради другого члена.

**Одиночному `{ returns: { m: undefined } }` нужна настоящая цель.** Она читается из выражения или
через одно имя:

- `new MouseEvent(…)` и любой глобальный конструктор `…Event`;
- `document` и `window`;
- `document.createElement(…)` / `createElementNS` / `createEvent` / `querySelector` /
  `getElementById`, а также `document.body`;
- `fixture.nativeElement`, `….debugElement.nativeElement`, `….query(…).nativeElement`;
- `hostElement(…)` и `queryElement(…)`.

Подмена (`createAutoMock<Event>()`, `createSpyFromClass(Event)`, приведённый литерал, имя, значение
которого файл не задаёт) никогда не попадает в отчёт.

**Почему одиночный `{ returns: { m: undefined } }` — только подсказка.** Без `onlyMethodsToSpyOn`
фабрика шпионит и за всеми остальными методами цели. Тест, который полагается на то, что один из них
заглушён, под `spyOnVoidMethod` меняет поведение. По той же причине экземпляра компонента нет среди
настоящих целей: на его остальные методы полагаются чаще всего.

**Почему оно в recommended.** Хелперы появились потому, что этот вызов встречается часто. В коде,
написанном до них, он повсюду. Текстовый поиск пропускает каждый вызов, разбитый на несколько строк.
Проект, который попросил это правило, перевёл около шестидесяти вызовов руками, а правило нашло ещё
десять.

**Серьёзность.** `warn`, как у [`prefer-render-shallow`](#prefer-render-shallow): правило называет
более короткое написание, а не дефект.
:::

## no-shared-module-level-mock {#no-shared-module-level-mock}

**`error`** · без автоисправления · только синтаксис

Сообщает об **экспортируемой** переменной, которая создаёт `vi.fn()` при загрузке модуля. Все спеки,
которые её импортируют, делят один объект. При `isolate: false` это один объект на воркер, и состояние
утекает из одного файла тестов в другой.

```ts
export const cartFixture = { total: vi.fn(), add: vi.fn() }; // ❌ строится один раз на модуль
```

```ts
export const createCartFixture = () => ({ total: vi.fn(), add: vi.fn() }); // ✅ свой набор на каждый вызов
```

**Опции.** Нет.

**Как исправить.** Экспортируйте фабрику и вызывайте её в `beforeEach` каждой спеки, которая
пользовалась общим объектом. Тогда каждый тест начинает со свежих спаев. Сам файл спеки
[не должен экспортировать ничего](/ru/utilities/setup#shared-fixtures-are-functions-not-constants).

**Когда выключить.** Экспортируемая замороженная константа, собранная из `vi.fn()` намеренно: например,
стабильная ссылка, которую какой-нибудь реестр сравнивает по идентичности. Такую гасите построчно.
Применяйте правило и к модулям фикстур, и к файлам спек.

::: details Как правило решает
**Что правило читает:** объявление экспорта и каждый `vi.fn()` в его инициализаторе, останавливаясь на
границе функции. `vi.fn()` за стрелкой создаётся на каждый вызов, а это и есть исправление, поэтому
правило внутрь функций не заглядывает. Спай, который не покидает файл, в отчёт не попадает.

`const` уровня модуля без экспорта тоже не сообщается, хотя у него та же проблема, как только его
делят два блока `describe`. Правило читает экспорт, потому что именно он переходит между файлами.

**Почему оно в recommended.** При `isolate: false` модуль вычисляется один раз на **воркер**. Это
видно на пробной фикстуре с идентификатором загрузки модуля, которую импортируют два файла спек:

```ts
// пробная фикстура, её импортируют два файла спек
export const analytics = { sent: [] as string[], track: vi.fn((e: string) => analytics.sent.push(e)) };
export const moduleLoadId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
```

```text
isolate: true    file 1: load=…-mdncyn     file 2: load=…-ywp3q0   sent=[]
isolate: false   file 1: load=…-n0v4yh     file 2: load=…-n0v4yh   sent=[from-file-1]
```

Одинаковый id значит одно вычисление, и файл 2 читает то, что записал файл 1. Вызовы спая не утекают:
`clearMocks: true` доходит до `vi.fn()` уровня модуля и очищает их (это подтвердили три пробы). Утекает
всё остальное, что фикстура держит рядом со спаями: уже завершившийся `Subject`, массив, в который
кто-то положил элемент, сохранённый `mockReturnValue`. Поэтому исправление — фабрика, а не `beforeEach`,
который чистит усерднее. Какой файл пойдёт первым, решает раннер. Поэтому отказ выглядит как мигающий
тест в файле, которого никто не трогал.

**Серьёзность.** `error`. Тест зелёный и неверный, а отказ появляется не в том файле, где причина.
:::

## no-outer-binding-in-mock-factory {#no-outer-binding-in-mock-factory}

**`error`** · без автоисправления · только синтаксис

Сообщает о фабрике `vi.mock(path, factory)`, которая читает `const` / `let` / `var` / `class` верхнего
уровня, объявленные не через `vi.hoisted`. Vitest поднимает каждый `vi.mock` выше импортов, поэтому
фабрика выполняется раньше, чем появляется это объявление.

```ts
const user = { id: 1 };
vi.mock('./session', () => ({ current: user })); // ❌ Cannot access 'user' before initialization
```

```ts
const { user } = vi.hoisted(() => ({ user: { id: 1 } })); // ✅ поднимается вместе с моком
vi.mock('./session', () => ({ current: user }));
```

**Опции.** Нет.

**Как исправить.** Объявите значение через `vi.hoisted`, как выше. Если спека импортирует модуль только
внутри теста (`await import('./session')`), возьмите `vi.doMock`: он не поднимается, и правило о нём не
сообщает.

**Когда выключить.** Не нужно. Подъём — факт раннера, а не догадка о файле.

::: details Как правило решает
Фабрика выполняется, как только первый импорт доходит до замоканного модуля. Считаются только чтения во
время выполнения фабрики. Чтение внутри функции, которую фабрика возвращает, происходит позже, в тесте,
и это нормально. Объявления функций и импорты не сообщаются, а позиции типов чтениями не являются.

**Почему оно в recommended.** Фабрика читает привязку раньше, чем та существует. Для `const`, `let` или
`class` это `ReferenceError`. Для `var` это молчаливый `undefined`, который замоканный модуль затем
отдаёт коду под тестом.

**Серьёзность.** `error`.
:::

## no-object-define-property {#no-object-define-property}

**`error`** · подсказка · только синтаксис

Сообщает о каждом вызове `Object.defineProperty` и `Object.defineProperties` в спеке. После теста
никто не возвращает исходное свойство на место, поэтому патч утекает в следующие тесты и файлы.

```ts
Object.defineProperty(navigator, 'onLine', { value: false, configurable: true }); // ❌
```

```ts
import { mockValueProp } from 'vitest-auto-spy';

mockValueProp(navigator, 'onLine', false); // ✅ откатывается через restoreMockedProps() после теста
```

**Опции.** Нет.

**Как исправить.** Возьмите хелпер, который соответствует дескриптору; все они экспортируются из
`vitest-auto-spy`. `configurable: true` не нужен: хелпер сам оставляет свойство configurable. Каждую такую подмену откатывает `restoreMockedProps()`. `setupAutoSpy()` из
`vitest-auto-spy/setup` вызывает его после каждого теста; без `setupAutoSpy()` вызывайте
`restoreMockedProps()` в `afterEach`. Подсказка выберет хелпер за вас:

| Дескриптор                                                          | Хелпер                   |
| ------------------------------------------------------------------- | ------------------------ |
| `{ value }`                                                         | `mockValueProp`          |
| `{ get }`                                                           | `mockReadonlyPropGetter` |
| с `set`                                                             | `mockAccessorsProp`      |
| значение, построенное через `mockImplementation(function () { … })` | `stubConstructor`        |

Два случая, которых дескриптор не показывает:

- Свойство `Signal<T>`: возьмите `mockReadonlyProp(obj, key, signal(value))` с настоящим `signal`.
  `vi.fn().mockReturnValue(value)` читается так же, но останавливает обновление каждого `computed()` и
  `effect()` ниже по цепочке.
- Свойство, которого нет, потому что это поле экземпляра, а не член прототипа: исправляйте там, где
  строится спай, через `instanceMethodsToSpyOn` / `observablePropsToSpyOn`.

**Когда выключить.** Когда не подходит ни один хелпер: свойство на замороженном хостовом объекте,
дескриптор, который хелперы не воспроизводят, или патч в `beforeAll`, который должен жить весь файл.
Выключите правило на этой строке и напишите причину:

```ts
// eslint-disable-next-line vitest-auto-spy/no-object-define-property -- clientWidth is a getter on a frozen host object
Object.defineProperty(target, 'clientWidth', { value: 100 });
```

Это правило чувствительнее всех к глобу `files`. `Object.defineProperty` в коде приложения вполне
уместен, а слишком широкий глоб начинает о нём сообщать.

::: details Как правило решает
**Два сообщения.** Каждый вызов получает обычное сообщение. Второе, более резкое (`manualRestore`),
появляется, когда одно и то же свойство патчат дважды в одном блоке: патч и восстановление, написанное
руками. Правило сопоставляет патчи по охватывающей функции, исходному тексту цели и исходному тексту
ключа. Текст нужен потому, что `window` в двух вызовах — это два идентификатора, но один глобальный
объект. Два патча в двух разных тестах, как и патч в `beforeEach` с восстановлением в `afterEach`,
получают обычное сообщение.

**Когда предлагается подсказка.** Она читает **дескриптор** и называет хелпер, который воспроизводит его
точно. Поэтому она часто отказывается:

- `configurable` — единственный разрешённый соседний ключ: вернуть свойству конфигурируемость и есть
  смысл замены;
- `writable`, `enumerable` или второй значимый ключ означают, что подсказки нет;
- `{ value: vi.fn().mockImplementation(function () { … }) }` тоже подсказки не получает: код под тестом
  вызывает это через `new`, и хелпер для такого случая — `stubConstructor`;
- `defineProperties` подсказку не получает никогда: его замена — один `mockValueProp` на запись.

**Почему оно в recommended.** Пробный файл патчит `navigator.onLine`, а затем вызывает всё, что раннер
предлагает для отката:

```ts
Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

vi.restoreAllMocks();
vi.resetAllMocks();
vi.unstubAllGlobals();
```

```text
after every restore the runner offers: onLine=false   ← тот же файл
onLine=false                                          ← следующий файл
after restoreMockedProps: onLine=true                 ← mockValueProp, запущен отдельно
```

Третья строка — исправление, и замерена она отдельно не случайно. Запустите её **после** файла с
`defineProperty` в том же воркере, и она тоже прочитает `false`: исходный дескриптор пропал ещё до того,
как хелпер увидел свойство. Проект не выберется из этого файл за файлом. К тому же
`Object.defineProperty` по умолчанию ставит `configurable` в `false`, поэтому патч запечатывает
свойство до конца жизни воркера.

**Серьёзность.** `error`. Ущерб выходит за пределы файла, который его нанёс.
:::

## no-import-time-spread {#no-import-time-spread}

**`error`** · подсказка · только синтаксис

Сообщает о спреде импортированного значения на уровне модуля: он выполняется, пока модуль ещё
загружается. Внутри тестового бандла импортированное значение в этот момент может быть ещё `undefined`.
Тогда спред в массив бросает ошибку, а спред в объект молча даёт `{}`.

```ts
import { BaseEvents } from './base-events';

export const platformEvents = [...BaseEvents]; // ❌ нормально под tsc, TypeError под бандлером
```

```ts
export const platformEvents = () => [...BaseEvents]; // ✅ выполняется позже, при вызове
```

**Опции.** Нет.

**Как исправить.** Перенесите спред в функцию, как выше. Подсказка делает это для спреда в
инициализаторе переменной. Когда вы её примете, каждому использованию имени понадобятся `()`, и
тайпчекер перечислит все места, которые надо поправить. Другое исправление — заинлайнить константу,
чтобы для этой строки ничего не импортировалось, — из одного файла не написать.

**Когда выключить.** Большинство отчётов придётся на код, который ещё ни разу не падал: отказ зависит от
того, как бандлер делит чанки. Правило включено потому, что отказ дорогой, а не частый. Внутри тела
функции ничего не сообщается, как и в поле экземпляра:

```ts
export const make = () => [...BaseEvents]; // тело функции
class Events {
  all = [...BaseEvents]; // поле экземпляра, выполняется при создании экземпляра
  static all = [...BaseEvents]; // …а static-поле в отчёте: оно выполняется вместе с объявлением класса
}
```

Операндом должно быть само импортированное имя. `[...BaseEvents.slice()]` — это вызов, и что бы он ни
бросил, это другая проблема.

::::: details Как правило решает
**Два вопроса, и на оба правило отвечает без типов:**

1. Является ли операнд спреда именем, которое этот файл **импортировал**? Правило разрешает его через
   анализ областей видимости до привязки импорта.
2. Выполняется ли спред во время импорта? Правило поднимается до верха модуля и останавливается на любом
   теле функции и на любом не-`static` поле класса. `static`-поле границей не является: оно выполняется
   вместе с объявлением класса.

**Почему оно в recommended.** Под `tsc` и под ESM-загрузчиком браузера это упасть не может: модуль
никогда не выполняется раньше своей зависимости. Внутри одного бандла может. Сборщик выпускает общие
чанки. Чанк может выполниться, пока значение, которое он переэкспортирует, ещё `undefined`. И тогда
`[...undefined]` бросает ошибку во время загрузки бандла — на дереве, где все тесты проходят:

```
Spread syntax requires ...iterable[Symbol.iterator] to be a function
```

Первопричина та же, что в заметке об инициализации barrel-модулей в
[руководстве по переезду](/ru/migrating). Но ошибка не называет ни модуля, ни barrel-модуля.

**Спред в объект — тихая половина, и у него своё сообщение.** `[...undefined]` и `f(...undefined)`
бросают ошибку, а `{ ...undefined }` — это `{}`. Модуль загружается, а константа молча остаётся без
всех ключей, которые должна была скопировать:

```ts
import { SectionItemType } from '@acme/api';

// ❌ ничего не бросает; `ItemType.COVER` просто читается как `undefined` до конца прогона
export const ItemType = { ...SectionItemType, ...LocalItemType } as const;
```

Сообщения разделены вот почему. Читатель, которого отправили искать `Spread syntax requires …`, не
находит такой ошибки в логе и принимает отчёт за ложное срабатывание. Сообщение про объект сразу
говорит, что искать ошибку не нужно, а ущерб — ключ, который читается как `undefined`.

**Как часто правило срабатывает.** AST-проход по воркспейсу из 8 673 файлов нашёл ровно **семь**
спредов импортированного имени на уровне модуля. Два из них спредят barrel-модуль воркспейса. Проба
всех семи их оправдала: ни один не был тем отказом, который тогда искали.

::: warning У той же ошибки есть вторая причина, которую правило не видит
`Spread syntax requires ...iterable[Symbol.iterator] to be a function` появляется и тогда, когда
**сборщик** Angular раскладывает точки входа по-другому. В этом случае ни один спред в исходниках не
виноват. На одном шарде Angular-воркспейса, на том же дереве, три прогона подряд:

- собственный ключ `isolate` у `@angular/build:unit-test` не задан: 860 файлов зелёные;
- `"isolate": false`: 39 файлов красные с этой ошибкой и **ноль собранных тестов**;
- `"isolate": true`: снова 860 зелёных файлов.

`isolate` раннера и одноимённая опция сборщика — разные настройки. Отличить их помогает число тестов.
Настоящий спред на уровне модуля ломает файл _после_ того, как его тесты собраны. В случае со сборщиком
не собирается ни одного теста, стека нет, а список падающих файлов меняется от прогона к прогону.
Оставьте ключ `isolate` сборщика незаданным (покрытие включает изоляцию), а не пишите `false`. Эти числа
получены в одной серии прогонов.
:::

**Серьёзность.** `error`. Отказ красный по построению, но приходит раньше любого теста, а его сообщение
указывает на бандлер.
:::::

## prefer-observer-stub {#prefer-observer-stub}

**`error`** · без автоисправления · только синтаксис

Сообщает, когда `IntersectionObserver`, `ResizeObserver` или `MutationObserver` подменены самописной
подменой. В jsdom нет ни одного из трёх, поэтому спеки снова и снова пишут одну и ту же заглушку на
девятнадцать строк. К тому же самописное восстановление ломается: оно выполняется, только если тест
прошёл.

```ts
let original: typeof IntersectionObserver;

beforeEach(() => {
  disconnectSpy = vi.fn();
  original = global.IntersectionObserver;
  global.IntersectionObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {
      disconnectSpy();
    }
  } as unknown as typeof IntersectionObserver; // ❌
});

afterEach(() => {
  global.IntersectionObserver = original;
});
```

```ts
const observers = stubIntersectionObserver(); // ✅ снимается после каждого теста
// observers.last.emit([intersectionEntry({ isIntersecting: true })]) вызывает колбэк
// observers.last.disconnected — то, ради чего писали disconnectSpy
```

**Опции.** Нет.

**Как исправить.** Вызовите [`stubIntersectionObserver()`](/ru/utilities/observer-stubs) или его
соседей для `ResizeObserver` / `MutationObserver`. Сохранение и восстановление удалите. Хэндл,
который он возвращает, покрывает то, ради чего писали самописную заглушку:

- `observers.last.disconnected`: проверка очистки;
- `observers.last.options`: объект инициализации;
- `observers.last.targets`: то, за чем наблюдали;
- `observers.instances`: все наблюдатели в порядке создания.

`let original = …` и `afterEach`, который его возвращает, тоже уходят.
`restoreMockedProps()` и так возвращает настоящий конструктор.

**Когда выключить.** Когда спеке нужна _конкретная_ реализация наблюдателя: настоящий полифилл или
наблюдатель, который записывает геометрию, не смоделированную хелпером. Там поставьте построчный
disable. Список из трёх имён закрыт: о четвёртом глобальном наблюдателе отчёта не будет.

::: details Как правило решает
**Сообщаются три формы:** присваивание в глобальный объект, `vi.stubGlobal('IntersectionObserver', …)`
и `vi.spyOn(globalThis, 'MutationObserver')`. `vi.stubGlobal` считается, потому что это та же
подделка, а `vi.unstubAllGlobals()` по умолчанию выключен.

**Получатель должен быть глобальным объектом:** `global`, `globalThis`, `self` или `window`, касты
снимаются. Алиас (`const g = globalThis`) правилу недоступен. Ключ может быть через точку или строкой.

**Значение должно быть подменой:** выражение класса, функция, мок раннера или имя, которое
разрешается в одно из этого. Эта проверка намеренно оставляет без отчёта три реальные строки:

- `globalThis.IntersectionObserver = original`, восстановление. Значение — имя, которому
  присваивают дважды, поэтому правило не считает его подменой.
- `window.ResizeObserver = ResizeObserver` из полифилла. Значение пришло из импорта, значит это
  настоящая реализация.
- Получатель, который не является глобальным объектом. Поддельный `window`, который спека собирает и
  передаёт коду под тестом, — обычное значение.

Правило читает _вид_ определения имени, а не его узел. Определение параметра указывает на его
функцию, поэтому чтение узла назвало бы функцией каждый параметр.
`function restore(original) { globalThis.ResizeObserver = original; }` остаётся без отчёта.

`Object.defineProperty(globalThis, 'ResizeObserver', …)` **не** входит в эти формы.
[`no-object-define-property`](#no-object-define-property) уже сообщает о каждом `defineProperty` в
спеке и называет хелпер из той же семьи. Два отчёта об одном и том же на одной строке — верный способ
добиться, чтобы правило выключили.

**Почему оно в recommended.** Причин две, и вторая — дефект.

1. Эти девятнадцать строк уже написаны в виде хелпера. Правило существует, потому что тот, кто их
   пишет, об этом не знает. В одном из замеренных блоков стоял комментарий, что другого способа нет.
2. Восстановление. Если оно написано последней инструкцией `it`, оно выполняется, только когда все
   проверки выше прошли. Первый красный тест оставляет заглушку на весь остаток файла. При
   `isolate: false` она остаётся и на все следующие файлы воркера. Там она всплывает как
   `observe is not a function` в компоненте, которого никто не трогал. Хелпер ставит заглушку через
   `mockValueProp`, а `restoreMockedProps()` её снимает; `setupAutoSpy()` запускает его после каждого
   теста.

У формы через раннер свой сбой. `vi.fn().mockImplementation((cb) => ({ observe() {} }))` — стрелочная
функция, а стрелку нельзя вызвать через `new`. `TypeError` падает в коде приложения, а спека
по-прежнему выглядит правильной.

В Angular-монорепозитории из 1 758 спек-файлов **16 мест** подменяют один из трёх глобалов руками:
14 присваиваний и 2 `vi.spyOn(globalThis, 'MutationObserver')`. Они разбросаны по пяти библиотекам и
обоим приложениям. Одно спрятано за кастом, и grep по `global.IntersectionObserver =` его не найдёт.
Правило сообщает о пятнадцати (шестнадцатое стоит под файловым `/* eslint-disable */`).
**Четырнадцать из пятнадцати — тестовый код.** Последнее — SSR-шим вне глоба спек. Именно поэтому
плагин включают только для спек-файлов. Три строки такого вида намеренно остаются без отчёта: два
восстановления в `afterEach` (значение — имя, а не подмена) и `window.ResizeObserver = ResizeObserver`
в модуле приложения (значение пришло из импорта).

**Серьёзность.** `error`. Тест зелёный и при этом неверный, а вред переходит между файлами.
:::

## no-hand-assigned-global {#no-hand-assigned-global}

**`error`** · `--fix` для записи в импортированный объект, без автоисправления для глобала · синтаксис и области видимости

Сообщает о подмене, присвоенной прямо в глобал, например `global.fetch = vi.fn(…)`, если ничто в
файле не возвращает оригинал в teardown-хуке. Ни одна очистка раннера не дотягивается до голого
присваивания, поэтому подделка отвечает всем следующим тестам файла. Ещё правило сообщает о любом
значении, записанном в импортированный объект, например `environment.production = true`.

```ts
beforeEach(() => {
  global.fetch = vi.fn(() => Promise.resolve({ json: () => Promise.resolve(user) })) as never; // ❌
});
```

```ts
beforeEach(() => {
  mockValueProp(
    globalThis,
    'fetch',
    vi.fn(async () => stubResponse({ body: user })),
  );
  // ✅ откат зарегистрирован в restoreMockedProps(), который setupAutoSpy() запускает после каждого теста
});
```

**Опции.** Нет.

**Как исправить.** Возьмите хелпер, который сам умеет откатываться. Сообщение называет тот, что
подходит к глобалу:

| Глобал                                                        | Хелпер                                                                                                                                                                                         |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fetch`                                                       | `mockValueProp(globalThis, 'fetch', vi.fn(async () => stubResponse({ body })))`, где [`stubResponse`](/ru/utilities/setup#answering-a-stubbed-fetch-—-stubresponse) из `vitest-auto-spy/setup` |
| другое имя со строчной буквы, например `matchMedia`           | `mockValueProp(globalThis, name, vi.fn(…))`                                                                                                                                                    |
| имя с заглавной: `XMLHttpRequest`, `WebSocket`, `EventSource` | `stubConstructor(globalThis, name, …)`: код вызывает его через `new`                                                                                                                           |
| `localStorage`, `sessionStorage`                              | [`stubWebStorage()`](/ru/utilities/setup#stub-web-storage)                                                                                                                                     |
| `Worker`                                                      | [`stubWorker({ respond })`](/ru/utilities/worker-stub), который сохраняет поведение слушателей, теряемое самописной заглушкой                                                                  |

- Если спеке нужно лишь не ходить в сеть, ей нужна не подмена, а
  [`blockNetwork()`](/ru/utilities/setup#_5-keeping-the-run-off-the-network) (или
  `setupAutoSpy({ blockNetwork: true })`). Он закрывает `fetch`, `XMLHttpRequest` и `sendBeacon` для
  каждого теста.
- `vi.stubGlobal(name, value)` с `unstubGlobals: true` в конфиге Vitest тоже возвращает глобал.
- Или оставьте присваивание и возвращайте оригинал в `afterEach`, `afterAll` или `onTestFinished`.
  Это правильно, и отчёта не будет.

Для импортированного объекта `--fix` пишет `mockValueProp`:

```ts
it('uses the stand configs', () => {
  environment.useRemoteConfigs = true; // ❌
  mockValueProp(environment, 'useRemoteConfigs', true); // ✅ так пишет --fix
});
```

**Когда выключить.** Для подмены, которая должна жить весь прогон, например той, что намеренно
ставит setup-файл. Там поставьте построчный disable. Кроме того, правило не видит восстановление
внутри хелпера, который вызывают ваши хуки: оно читает только присваивания и `delete`, написанные в
самом файле.

::: details Как правило решает
**Глобал.** Правило читает так же, как [`prefer-observer-stub`](#prefer-observer-stub):

- получатель — `global`, `globalThis`, `self` или `window`, касты снимаются. Алиас
  (`const g = globalThis`) правилу недоступен;
- ключ через точку или строковый литерал;
- значение — **подмена**: мок раннера (`vi.fn()` голый или настроенный), выражение класса,
  функция, имя, связанное с одним из них, или объектный литерал, где-то внутри которого есть
  `vi.fn()`. `window.localStorage = { getItem: vi.fn() }` считается.

Затем правило один раз, в конце, читает весь файл и ищет восстановление того же глобала:
присваивание значения, которое не подмена, или `delete`. Восстановление внутри `afterEach`,
`afterAll` или `onTestFinished` снимает отчёт, потому что хук выполняется при любом исходе проверок.
Восстановление в любом другом месте, например последней строкой `it`, получает своё сообщение
`restoreInTest`: первая красная проверка его пропускает.

Три глобала-наблюдателя оставлены правилу `prefer-observer-stub`, а
`Object.defineProperty(globalThis, …)` — правилу [`no-object-define-property`](#no-object-define-property).
Одна строка никогда не получает двух отчётов.

**Импортированный объект.** Правило читает в спеке и `environment.production = true`: присваивание
(`=`, не `+=`) в член имени, связанного именованным импортом или импортом по умолчанию. Член может
быть через точку или строковым ключом, касты снимаются, напрямую или глубже по цепочке
(`config.feature.enabled`). Модуль закеширован на весь воркер, поэтому сообщается **любое** значение,
а не только подмена. Восстановление в teardown-хуке снимает отчёт, как и для глобала. Не
сообщаются: локальная переменная, `this`, вычисляемый ключ и сам объект пространства имён
(`import * as env`: объект запечатан, и запись бросает исключение).

**Когда применяется `--fix`.** Он переписывает инструкцию в
`mockValueProp(environment, 'production', true)`. Если `mockValueProp` в файле ещё нет, он
импортирует его из точки входа адаптера, которую файл уже импортирует (`vitest-auto-spy/bun`,
`/bun-angular`, `/node`, `/rstest`…). Так спека на другом раннере не загружает адаптер Vitest. Если
импорта адаптера нет, импорт идёт из `vitest-auto-spy`; `mockValueProp`, импортированный из любой
другой точки входа, используется как есть. Исправление не предлагается:

- в `beforeAll` или в теле `describe`: очистка после первого теста сняла бы патч до конца файла;
- для присваивания, использованного как значение;
- в файле, который объявляет собственный `mockValueProp`.

**Почему оно в recommended.** Голое присваивание — единственный вид мока, до которого не
дотягивается ни одна очистка:

- `vi.restoreAllMocks()` восстанавливает спаи;
- `vi.unstubAllGlobals()` восстанавливает то, что поставил `vi.stubGlobal`;
- `restoreMockedProps()` восстанавливает то, что прошло через `mockValueProp`.

Подделка затем отвечает каждому следующему тесту файла. При `isolate: false` — каждому следующему
файлу воркера, где компонент, которого никто не трогал, вдруг получает заготовленный ответ.
`global.fetch = vi.fn(() => Promise.resolve({ json: () => … }))` — первое, что показывает
большинство туториалов по `fetch`, и сгенерированные шпаргалки копируют это без восстановления.

**Серьёзность.** `error`. Подмена переживает тест, который её поставил, а при `isolate: false` — и
файл.
:::

## prefer-stub-response {#prefer-stub-response}

**`error`** · без автоисправления · только синтаксис

Сообщает о `Response`, собранном руками для заглушенного `fetch`: объектном литерале под кастом к
`Response` или `createMock<Response>(…)`. Каждый член, о котором автор не подумал, отвечает
`undefined`. Код под тестом может уйти в ветку, куда настоящий ответ его никогда не привёл бы.

```ts
vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => user } as Response); // ❌
```

```ts
vi.spyOn(globalThis, 'fetch').mockImplementation(async () => stubResponse({ body: user })); // ✅
```

**Опции.** Нет.

**Как исправить.** Соберите настоящий `Response` через
[`stubResponse`](/ru/utilities/setup#answering-a-stubbed-fetch-—-stubresponse), как выше. Тогда каждый
член настоящий.

**Когда выключить.** Не нужно для `Response`, который не глобальный. `Response` из обработчика
Express или конверт сгенерированного клиента с тем же именем никогда не сообщаются: для них
`stubResponse` собрал бы не тот объект.

::: details Как правило решает
**Что сообщается:**

- `{ ok: true, json: async () => data } as Response`;
- двойной каст `as unknown as Response` (читается сквозь вложенность, поэтому это один отчёт, а не
  ноль);
- форма с угловыми скобками `<Response>{ … }`;
- `createMock<Response>(…)` / `createAutoMock<Response>(…)`.

**Решают два факта в строке:** тип, который называет каст, и типовой аргумент, который получает
хелпер. Информация о типах не нужна, как и у [`no-sync-testbed-await`](#no-sync-testbed-await).

**`Response` должен разрешаться в глобальный.** У имени, которое файл импортирует
(`import { type Response } from 'express'`) или объявляет (доменный тип с тем же именем), есть
определение, и о нём никогда не сообщается. Биндинг без определения — тоже глобальный: именно его
кладёт в область видимости `languageOptions.globals` у проекта, который объявляет свою среду.

**Границы.** Подмена, собранная за фабрикой, правилу недоступна — то же ограничение, что у
[`no-structural-double`](#no-structural-double): о `buildResponse()`, который возвращает литерал под
кастом, сообщается там, где написан каст, и больше нигде. `Response`, собранный по членам на `const` с
аннотацией типа, — не каст, и о нём не сообщается.

**Почему оно в recommended.** Когда `fetch` подменён, что-то нужно вернуть, и каждый туториал
показывает каст поверх двух членов. Всё остальное отвечает `undefined`: `status`, `statusText`,
`headers`, `url`, `text()`, `arrayBuffer()`, `clone()`. Каст позволяет этому скомпилироваться и заодно
это прячет. Код под тестом читает один из этих членов и уходит в ветку по `undefined`. Настоящий ответ
такого дать не мог, и тест зелёный на пути, которого не существует. Строгий пресет ловит этот дефект
на подмене, которую собрала библиотека. Обычный объектный литерал — не она, поэтому за ним никто не
следил.

**Серьёзность.** `error`. Доказательство — сама строка, исправление — хелпер, который входит в этот
пакет, и миграции нет: проект, который уже собирает ответы через `stubResponse`, ничего не увидит.
:::

## prefer-settle-dynamic-import {#prefer-settle-dynamic-import}

**`error`** · подсказка · только синтаксис

Сообщает об `import()`, которого спека сама дожидается в тесте или хуке. Допустим, код под тестом
лениво грузит модуль по клику. Ожидание того же `import()` дожидается модуля, но не строк после
собственного `await` этого кода. Проверка тогда выполняется на такт раньше.

```ts
// Обработчик клика делает `await import('./exit-from-app.component')` и затем открывает диалог.
button.click();
await import('./exit-from-app.component'); // ❌ ждёт модуль, а не обработчик
expect(dialog.open).toHaveBeenCalled();
```

```ts
button.click();
await settleDynamicImport(() => import('./exit-from-app.component')); // ✅
expect(dialog.open).toHaveBeenCalled();
```

**Опции.** Нет.

**Как исправить.** Оберните импорт в
[`settleDynamicImport`](/ru/utilities/event-loop#settledynamicimport-load-turns). Он загружает модуль,
а затем выполняет `flushEventLoop(turns)`, который даёт продолжению кода его такт. Он возвращает
пространство имён модуля, поэтому `const { Thing } = await import(…)` читается так же. Подсказка
оборачивает `import()` на месте и добавляет импорт хелпера. Если в файле уже есть импорт из
`vitest-auto-spy`, она вписывает его туда.

`fakeAsync`, `tick()` и `flushMicrotasks()` его не заменят: они двигают очереди зоны Angular, а
загрузчик модулей — не одна из них.

Если спека только читает экспорты модуля, лучше исправить на статический `import`.
`settleDynamicImport`, который называет сообщение, там тоже работает.

**Когда выключить.** Редко: правило сообщает только то, что доказывает один файл. Не сообщаются:

- локальный для спеки `const load = async () => { await import('…'); }`: такой код пишется одинаково,
  зовёт ли его сама спека или отдаёт коду под тестом как загрузчик, а во втором случае хелпер был бы
  плохим советом;
- колбэк, который вызывает не раннер, включая `it('x', waitForAsync(async () => …))`;
- пространство имён, привязанное **первой** инструкцией теста или хука, например
  `const api = await import('./index')`. Ещё ничего не выполнилось, чьё продолжение могло бы ждать.
  Там лучше исправить на статический `import * as ns`.

::: details Как правило решает
**Что сообщается:** `await import('./thing')`, форма с деструктуризацией
`const { Thing } = await import('./thing')` и `import('./thing').then(…)`.

**Решают два факта в файле:**

1. что стоит на `import()`: родитель `await` или вызов `.then`;
2. внутри какой функции он стоит. Отчёт делается только там, где ближайшая объемлющая функция —
   собственный колбэк раннера: `it`, `test`, `beforeEach`, `beforeAll`, `afterEach`, `afterAll`, в
   формах `.only`, `.skip` и `.each`.

Информация о типах не нужна, как и у [`no-sync-testbed-await`](#no-sync-testbed-await).

Второй факт закрывает все исключения. В каждой форме, где хелпер был бы плохим советом, между
колбэком и импортом стоит своя функция:

- фабрика `vi.mock` / `vi.doMock`;
- `loadComponent` / `loadChildren` ленивого роута в фикстуре, которую спека отдаёт роутеру;
- колбэк, который спека отдаёт коду под тестом;
- собственный `() => import(…)` у `settleDynamicImport`.

У `import()` на уровне модуля объемлющего колбэка нет вовсе.

**Первая инструкция.** Привязанное пространство имён первой инструкцией теста или хука не сообщается
(например, `ns = await import('@scope/lib')` в `beforeEach`, который потом ставит на него спай).
Голый `await import(…)` в том же месте по-прежнему сообщается: ждать он может только того, что начал
грузить хук. После строки подготовки, как в `configure(…); const { run } = await import('./run')`,
привязка сообщается. Эта строка выглядит так же, как `button.click()`, который запускает загрузку, и
правило их не различает.

**Почему оно в recommended.** Реестр модулей общий, поэтому `import()` спеки разрешается на тот же
модуль, который уже грузит код под тестом. Но продолжения этого кода он не ждёт: строк после _его_
`await`, которые открывают диалог, пишут сигнал или навигируют. Они стоят в очереди за микротаской
загрузчика. Проверка читает состояние на такт раньше. Тест зелёный, только пока продолжение
достаточно короткое, чтобы случайно успеть. Он краснеет в тот день, когда кто-то добавит строку. Это
флак без единой плохой строки.

В Angular-монорепозитории из 2 030 спек-файлов: **81 отчёт в 32 файлах**. Сильнее говорит то, что
лежало рядом. Четыре отчёта в одном файле несли под импортом написанный руками
`await Promise.resolve()` — расписанный `flushEventLoop(1)`. Ещё одиннадцать мест той же формы были
вынесены в локальные для спек хелперы: `flushCodeInputChunk`, `settleAccountPickerImport`,
`settleModalImports`, `settleModalComponentImport` и `flushLazyImport`. У двух из них стоял цикл из
пяти `await Promise.resolve()`. Проект переписал этот хелпер руками одиннадцать раз. Эти одиннадцать —
ровно та локальная форма, которую правило не читает.

**Серьёзность.** `error`. Доказательство — сама строка, исправление — одна строка, которую правило
предлагает правкой, и нет миграции, которую нужно вводить постепенно, в отличие от
[`prefer-set-inputs`](#prefer-set-inputs). Большой проект не придёт к нулю сразу, и это довод за
`error`: 81 однострочная находка в 32 файлах из 2 030, и каждая — тест, который ждёт не того.
:::

## no-real-wait-in-test {#no-real-wait-in-test}

**`warn`** · без автоисправления · только синтаксис

Сообщает о сне на реальных часах, например `await new Promise((r) => setTimeout(r, 300))`. Каждый
прогон платит эту задержку, и это гонка: код должен уложиться в неё. На ноутбуке он укладывается, а на
нагруженном раннере CI — не всегда.

```ts
await new Promise((r) => setTimeout(r, 300)); // ❌ каждый прогон платит 300 мс, нагруженный CI может не уложиться
expect(search.query).toHaveBeenCalledWith('ab');
```

```ts
import { advanceTimers, setupFakeTimers } from 'vitest-auto-spy/setup';

setupFakeTimers();

it('debounces', async () => {
  component.onInput('ab');
  await advanceTimers(300); // ✅ реальное время не проходит
  expect(search.query).toHaveBeenCalledWith('ab');
});
```

**Опции.** Нет.

**Как исправить.** Переходите на фейковые таймеры через `setupFakeTimers()` и `advanceTimers(ms)`,
как выше. Если вы ждёте результата, а не отрезка времени, ждите результата: `await vi.waitFor(…)`
или `await fixture.whenStable()`.

**Когда выключить.** Сон — факт, но исправление меняет каждый таймер в тесте, поэтому правило
`warn`. Переводите файлы на фейковые таймеры по одному, потом поднимите его до `error`.

::: details Как правило решает
**Что считается сном:**

- `new Promise((r) => setTimeout(r, N))` в любой форме, где `resolve` исполнителя доходит до
  таймера: `window.` / `globalThis.` / `self.setTimeout`, `() => r()`;
- `setTimeout(N)`, импортированный из `node:timers/promises` под любым локальным именем.

Отсутствующая или нулевая задержка — это сброс макрозадач, её правило не трогает. О хелпере
`sleep(ms)` сообщается один раз, там, где он определён.

**Серьёзность.** `warn`, по исправлению, а не по находке. Сон на реальных часах определяется
точно. Но исправление — переход на фейковые таймеры, а он меняет каждый таймер в тесте. Это миграция,
которую проходят файл за файлом, как у [`prefer-set-inputs`](#prefer-set-inputs).
:::

## prefer-create-mock {#prefer-create-mock}

**`warn`** · подсказка · только синтаксис

Сообщает об объектном литерале под кастом к именованному типу, например `{ id: '1' } as Device`.
Каст пропускает проверки, которые делает присваивание: лишний ключ проходит, и отсутствующее
обязательное поле тоже. Фикстура может закрепить ключ, которого у настоящего типа нет.

```ts
// У `Device` восемь полей, и `isOffline` среди них нет.
const device = { id: '1', name: 'TV', isOffline: false } as Device; // ❌
expect(service.rename).toHaveBeenCalledWith({ ...device, name: 'Box' });
```

```ts
const device = createMock<Device>({ id: '1', name: 'TV' }); // ✅ лишний ключ теперь ошибка компиляции
expect(service.rename).toHaveBeenCalledWith({ ...device, name: 'Box' });
```

**Опции.** Нет.

**Как исправить.** Выберите первое, что подходит:

1. Литерал уже стоит в типизированном слоте (аргумент вызова, `nextWith`, `mockReturnValue`,
   типизированный `const`): удалите каст, и слот проверит литерал сам.
2. Иначе оберните его в `createMock<T>({ … })`. Он принимает `DeepPartial<T>` и возвращает значение
   типа `T`. Подсказка делает именно это и импортирует `createMock`.
3. Значение вне `T` намеренно (`null`, который присылает бэкенд, данные, которые должны дойти до
   гарда): напишите `outOfType<T>(…)`. Он называет намерение, и о нём не сообщается.

Каст к `Partial<T>` в слоте, который и так `Partial<T>`, обычно просто лишний; удалите его.

**Когда выключить.** Для фикстуры, невалидной **нарочно**, например `linkType: 'INVALID_TYPE'`,
поданного ради ветки по умолчанию. Подсказка там не компилируется, и это подтверждает находку.
Оставьте каст с `eslint-disable-next-line` и объясните почему. Правило `warn`, потому что принятая
подсказка отдаёт каждую фикстуру компилятору, и все разъехавшиеся фикстуры краснеют в один день.
Поднимите уровень, когда их исправите.

::: details Как правило решает
**Два факта в строке:** операнд каста — объектный литерал, а тип, который он называет, — ссылка на
тип. Считаются обе записи: `{ … } as Device` и `<Device>{ … }`. Информация о типах не нужна, как и у
[`prefer-stub-response`](#prefer-stub-response) и [`no-sync-testbed-await`](#no-sync-testbed-await).

**Вложенные касты — одна находка,** о ней сообщается на самом внешнем.
`{ inner: { id: '1' } as Inner } as Outer` даёт один отчёт, и его подсказка снимает и внутренний
каст: начальные значения `createMock` проверяются против `DeepPartial<Outer>` на любой глубине. Каст
за функцией (`make: () => ({ … }) as Item`) не входит в начальные значения и получает свой отчёт.

**Как подсказка добавляет импорт.** Она вписывает `createMock` в уже существующий импорт из
`vitest-auto-spy`. Иначе пишет новую строку прямо над импортами `vitest-auto-spy/*` в файле, в той
группе, которую ожидает `import/order`. Так же ставят импорт все исправления и подсказки плагина.
Это подсказка, а не `--fix`, потому что принятие делает каждую разъехавшуюся фикстуру красной.

**Где правило молчит:**

- `as const`, который сужает литерал, а не заявляет тип;
- `as unknown` и `as any`, а также двойной каст `{ … } as unknown as T`, собранный из них. Переход
  через `unknown` стоит потому, что компилятор отказал одиночному касту, так что `createMock<T>` тоже
  не скомпилируется;
- каст чего угодно, кроме литерала: `raw as Device`, `load() as Device`, `[{ … }] as Device[]`;
- каст к встроенному объектному типу, `{ … } as { id: string }`, который компилятор и так читает;
- литерал внутри собственных фабрик этой библиотеки: `createMock<Outer>({ inner: { … } as Inner })`,
  начальные значения `provideAutoSpyForToken`, набор `provideRouterDouble`;
- имена типов, которыми владеет другое правило: `Response` ([`prefer-stub-response`](#prefer-stub-response)),
  `Spy` ([`prefer-as-spy`](#prefer-as-spy)) и семейство `Mock` / `Mocked` из Vitest
  ([`no-mocked-for-spy`](#no-mocked-for-spy), [`no-mock-cast`](#no-mock-cast)).

**Границы.** Правило не читает типы, поэтому не отличает разъехавшуюся фикстуру от случайно полной.
Оно сообщает о касте, а какой это был случай, решает следующая проверка типов. Тип-утилита
(`Partial<T>`, `Pick<T, …>`, `Record<…>`, `ReturnType<typeof f>`) сообщается наравне с остальными.
`createMock<Partial<T>>({ … })` компилируется и всё равно проверяет ключи.

**Почему оно в recommended.** `as T` спрашивает, _пересекаются_ ли два типа, а не является ли
значение одним из них. Поэтому он пропускает обе вещи, которые присваивание отвергает: проверка лишних
свойств не выполняется, и обязательное поле, которое фикстура не задаёт, тоже проходит. Ни одна
проверка типов ничего не говорит — ради этого каст и стоит. Потом объект разворачивается в ожидаемые
данные проверки вызова или уходит в код под тестом. Спека закрепляет ключ, которого в контракте нет,
или покрывает ветку, до которой настоящее значение никогда не дойдёт. `createMock<T>` оставляет
неуказанные поля `undefined` в рантайме, ровно как каст, а лишний ключ становится ошибкой компиляции.

В Angular-монорепозитории из 2 032 спек-файлов: **1 200 отчётов в 327 файлах**, 217 разных типов.

- **Ни в одном** из этих литералов нет `vi.fn()`. Значит, на этом проекте правило ни разу не сообщает
  об одной строке с [`prefer-create-spy-from-class`](#prefer-create-spy-from-class) или
  [`no-structural-double`](#no-structural-double): те про коллабораторов, это — про данные.
- **529** отчётов стоят в слоте, у которого тип уже есть: аргумент вызова, `nextWith`,
  `mockReturnValue`. Там каст только выключает собственную проверку слота, и первое исправление —
  удалить его.
- 25 из 1 200 — касты к типу-утилите.

**Серьёзность.** `warn`, по исправлению, как у [`prefer-set-inputs`](#prefer-set-inputs) (а не по
эвристикам, как у [`no-structural-double`](#no-structural-double)). Находка точна: литерал и тип,
который он заявляет, оба в строке. Оценивается миграция: на проекте выше это 1 200 мест в 327 файлах,
и никто не вольёт их одной веткой. `off` был бы той же ошибкой с другого края, поэтому плагин ставит
`warn`, а не пропускает правило. Разрыв с [`no-mock-cast`](#no-mock-cast) (24 места на том же
проекте) — причина, по которой у двух правил одной семьи разная серьёзность.
:::

## no-mock-cast {#no-mock-cast}

**`error`** · подсказка · только синтаксис

Сообщает о касте к `Mock` или `MockInstance` из Vitest поверх члена, например
`TestBed.inject(S).m as Mock`. `Mock` без параметров — это `Mock<any>`, поэтому каст стирает
сигнатуру метода: `toHaveBeenCalledWith` перестаёт сравнивать типы аргументов, и неверный вызов всё
равно проходит.

```ts
(TestBed.inject(AppMetricsService).sendEvent as Mock).mockReturnValue(undefined); // ❌
expect(TestBed.inject(AppMetricsService).sendEvent).toHaveBeenCalledWith(payload);
```

```ts
injectSpy(AppMetricsService).sendEvent.mockReturnValue(undefined); // ✅ типизирован по настоящей сигнатуре
expect(injectSpy(AppMetricsService).sendEvent).toHaveBeenCalledWith(payload);
```

**Опции.** Нет.

**Как исправить.** Член подмены, которую собрала эта библиотека, — уже спай, типизированный по
настоящей сигнатуре. Читайте его как есть:

- `injectSpy(Service).method` для подмены, которую выдал DI. Подсказка пишет это всюду, где токен
  виден, и импортирует `injectSpy` из `vitest-auto-spy/angular`;
- `asSpy(double).method` для подмены, которую держит тест;
- `vi.mocked(object.method)` для спая `vi.spyOn` или `vi.fn()` на другом объекте.

Если каст появился, потому что значение не компилировалось, посмотрите на метод. Перегруженный метод
типизирован по последней сигнатуре; `Spy<Service, { overload: { method: 'first' } }>` выбирает ту,
которую вызывает код. Параметризованный `Mock<[…], R>` пишет сигнатуру второй раз, там, где её никто
не держит в согласии с первой.

**Когда выключить.** Не нужно для обычного `fn as Mock` поверх локального `vi.fn()` или для своего
типа `Mock`: ни о том, ни о другом не сообщается.

::: details Как правило решает
**Что сообщается:** `TestBed.inject(Metrics).send as Mock`,
`(shelves.getByGid.mockReturnValue as Mock)(…)` и форма `<Mock>svc.load`. Параметризованный
`Mock<[string], void>` сообщается тоже.

**Три проверки:**

- имя типа — `Mock` или `MockInstance`;
- операнд — обращение к члену. Обычный `fn as Mock` поверх локального `vi.fn()` ничьей подменой не
  является;
- `Mock` разрешается в именованный импорт из `vitest`, `@rstest/core`, `bun:test` или `jest` либо не
  разрешается ни во что (проект с ambient-типами раннера). `Mock`, который файл объявляет сам или
  импортирует откуда-то ещё, — чей-то доменный тип.

**У худшей формы своё сообщение.** `(shelves.getByGid.mockReturnValue as Mock)(of(shelf))` ставит каст
на член, который устанавливает ответ. Тогда не проверяется ни значение на входе, ни тип возврата
метода. Каждая проверка ниже — про значение, которое настоящий коллаборатор выдать не мог.

**Почему подсказка, а не `--fix`.** Причина не в системе типов. `injectSpy` возвращает подмену,
которую _отдали_ контейнеру, поэтому переписывание верно, только когда эту подмену собрала эта
библиотека. Спека, которая положила самописный `{ provide: X, useValue: { m: vi.fn() } }`, получила
бы исключение в рантайме вместо ошибки компиляции. Автоматическое исправление так падать не должно.
[`no-unregistered-inject-spy`](#no-unregistered-inject-spy) сообщает о принятой подсказке, которая
попала на такую подмену.

**Почему оно в recommended.** Каст не _добавляет_ методы спая, он стирает сигнатуру. Дальше
`mockReturnValue` принимает что угодно, а `toHaveBeenCalledWith` ничего не сравнивает. Проверка
продолжает проходить, когда код вызывает метод с неверными аргументами. Исправление ничего не стоит:
член и так уже спай.

В Angular-монорепозитории из 2 032 спек-файлов: **24 отчёта в 21 файле**, 22 обычной формы и 2
конфигурационной. Пятнадцать несут правку `injectSpy`, остальные называют исправление, не записывая
его.

**Чего не покрывают соседние правила.** [`no-mocked-for-spy`](#no-mocked-for-spy) читает _объявление_
`Mocked<T>`, а [`prefer-as-spy`](#prefer-as-spy) — каст к `Spy<T>`. Оба называют подмену целиком, и
ни одно не видит `Mock`, подставленный вместо сигнатуры одного члена.
[`no-structural-double`](#no-structural-double) нужно имя, объявленное как объект из `Mock`, а
[`no-stub-class-double`](#no-stub-class-double) — класс с полями `vi.fn()`. Оба про подмену, которую
собирают. Это правило — про существующую подмену, которую читают через каст.

**Серьёзность.** `error`. Доказательство — сама строка, исправление предлагается правкой, а мест
достаточно мало, чтобы закрыть их за один заход: 24 на проекте из 2 032 файлов против 1 200 у
[`prefer-create-mock`](#prefer-create-mock).
:::

## no-redundant-mock-reset {#no-redundant-mock-reset}

**`error`** · `--fix` или подсказка · только синтаксис, плюс конфиг вашего раннера

Сообщает о сбросе моков в хуке, который раннер и так делает между тестами, например
`vi.clearAllMocks()` в начале `beforeEach` при `clearMocks: true`. Такая строка ничего не делает.
Правило молчит, пока не узнает, какие флаги сброса ставит ваш раннер. Оно узнаёт их из своих опций
или читает ваш `vitest.config.*` / `vite.config.*` как текст.

```ts
beforeEach(() => {
  vi.clearAllMocks(); // ❌ при `clearMocks: true` раннер сделал ровно это мгновением раньше
  TestBed.configureTestingModule({ providers: [provideAutoSpy(Api)] });
});
```

```ts
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [provideAutoSpy(Api)] }); // ✅
});
```

**Опции.** Мёртвый ли сброс, зависит от конфига раннера, а не от спеки. Опции говорят правилу, что
делает раннер:

| Опция          | Тип                                                   | По умолчанию | Смысл                                                                                           |
| -------------- | ----------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------- |
| `clearMocks`   | `boolean`                                             | —            | раннер очищает каждый мок между тестами                                                         |
| `mockReset`    | `boolean`                                             | —            | раннер сбрасывает каждый мок между тестами                                                      |
| `restoreMocks` | `boolean`                                             | —            | раннер восстанавливает спаи `vi.spyOn` между тестами                                            |
| `configFile`   | `string`                                              | —            | конфиг раннера, который поиск не находит; путь абсолютный или относительно запуска ESLint       |
| `configFlags`  | `{ clearMocks?, mockReset?, restoreMocks? }` (булевы) | —            | флаги, которые собранный фабрикой `configFile` ставит сверх своего текста; требует `configFile` |

Без опций правило само ищет конфиг раннера (см. _Как правило решает_). Если нет ни опции, ни
найденного конфига, **правило не сообщает ничего**.

```js
'vitest-auto-spy/no-redundant-mock-reset': ['error', { clearMocks: true, restoreMocks: true }],
'vitest-auto-spy/no-redundant-mock-reset': ['error', { configFile: 'tools/unit-test-bench/vitest-runner.config.ts' }],
'vitest-auto-spy/no-redundant-mock-reset': ['error', { configFile: 'vitest.config.ts', configFlags: { clearMocks: true } }],
```

**Как исправить.** Удалите строку, а если в хуке больше ничего не было, то и хук. `--fix` делает это
в файле без другого `beforeEach` и без `beforeAll`; в остальных случаях это подсказка. Инструкция,
которая стоит на строке одна, уходит вместе со строкой.

**Когда выключить.** Редко: на проекте, о котором правило ничего не знает, оно молчит. Лучше
правильно укажите флаги.

**Если правило молчит,** хотя в конфиге есть `clearMocks: true`, проверьте по порядку:

1. **Сброс — не первая инструкция первого `beforeEach`.** То, что выполняется до него (инструкция
   выше, `beforeEach` внешнего `describe`), может нуждаться в сбросе, поэтому правило о нём не
   сообщает.
2. **Спеку запускает ещё и таргет Angular-билдера.** `@angular/build:unit-test` без `runnerConfig`
   не читает `vitest.config.ts`, и этот прогон идёт на значениях Vitest по умолчанию. На Vitest 4
   `clearMocks` по умолчанию выключен, так что сброс там не лишний. Задайте таргету `runnerConfig`
   или перейдите на Vitest 5, где `clearMocks` по умолчанию включён.
3. **Правило не может найти или прочитать конфиг.** Поиск начинается в папке спеки и идёт вверх.
   Конфиг в другой папке или собранный фабрикой в другом модуле не читается. Укажите его через
   `configFile` и добавьте `configFlags` с тем, что ставит фабрика.

- **Называйте только те флаги, которые раннер действительно ставит.** `restoreMocks` — не более
  сильный `clearMocks`: `vi.restoreAllMocks()` дотягивается только до спаев, поставленных
  `vi.spyOn`, и никогда до обычного `vi.fn()`. При одном лишь `restoreMocks: true`
  `vi.clearAllMocks()` в хуке всё ещё что-то делает. Передать флаг, которого раннер не ставит, —
  единственный способ заставить это правило удалить строку, нужную вашим тестам.
- **`setupAutoSpy({ restoreMocks })` — это не `restoreMocks` раннера.** Раннер восстанавливает перед
  каждым тестом; `setupAutoSpy` — в `afterEach`. Не передавайте правилу `{ restoreMocks: true }`
  из-за того, что ваш setup-файл вызывает `setupAutoSpy({ restoreMocks: true })`. Что происходит между
  тестами, говорит только флаг в конфиге раннера.

::: details Как правило решает
**Что сообщается.** `vi.clearAllMocks()`, `vi.resetAllMocks()`, `vi.restoreAllMocks()` и помоковые
`mockClear()` / `mockReset()` / `mockRestore()` там, где после собственного сброса раннера ничего из
написанного в файле ещё не выполнилось. То есть:

- первая инструкция `beforeEach`, которому не предшествует другой `beforeEach`; или
- очистка последней инструкцией `afterEach`.

**Поиск конфига раннера.** Без опций правило идёт вверх от каталога линтуемого файла и ищет
`vitest.config.*`, `vite.config.*` или `vitest-base.config.*` (это имя разрешает
`runnerConfig: true` у `@angular/build:unit-test`). Первый найденный файл читается **как текст**:
правило ищет литералы `clearMocks: true`, `mockReset: true` и `restoreMocks: true`. Ничего не
вычисляется и ни один модуль не загружается: прогон линтера не должен выполнять конфиг проекта, а эти
три значения — литералы в любом конфиге, который их ставит.

- **Опции главнее.** Если они заданы, они и есть ответ, и поиск не выполняется. Проект, который не
  хочет, чтобы линтер читал диск, передаёт флаги опциями.
- **`configFile`** называет конфиг по пути, где поиск не смотрит, и читается так же. Флаг, записанный
  рядом, главнее файла. Несуществующий `configFile` роняет прогон линтера с его именем, а не оставляет
  правило молчать. Например, конфиг раннера в `tools/unit-test-bench/vitest-runner.config.ts` для
  `@angular/build:unit-test` поиск пропускает; `configFile` называет его, и флаги остаются в том
  единственном файле, который их ставит.

**Значение Vitest по умолчанию для `clearMocks` зависит от версии.** До Vitest 4 включительно оно
выключено, с Vitest 5 — включено. Правило берёт установленную мажорную версию из ближайшего
`node_modules/vitest/package.json` выше линтуемого файла.

- На Vitest 5 и новее найденный конфиг (или `configFile`) без `clearMocks` считает его включённым.
  Тогда `vi.clearAllMocks()` или `mockClear()` в начале первого `beforeEach` попадает в отчёт, а
  сообщение говорит, что флаг взят по умолчанию.
- На Vitest 4 и старше, или если Vitest не найден, неупомянутый `clearMocks` выключен.
- `clearMocks`, записанный чем угодно, кроме литерала `true` (`false`, выражение), читается
  выключенным на любой версии.
- Флаги, заданные опциями правила, значениями по умолчанию не дополняются: чего в них нет, то
  выключено.

**Конфиг, собранный в другом месте, читается только в пределах своего текста.** В
`export default createProjectConfig({ alias })` или в `mergeConfig(base, …)`, где `base` лежит в
другом модуле, флаги задаёт файл, который правило не открывает. Его текст не упоминает `clearMocks`.
Поэтому до Vitest 4 флаг читается выключенным и правило молчит, а с Vitest 5 — как значение по
умолчанию (включённым), даже там, где фабрика его выключает. `npx vitest-auto-spy doctor` отмечает
такой `configFile` как [`mock-reset-config-unread`](/ru/utilities/cli#mock-reset-config-unread).
Запишите то, что ставит фабрика, в `configFlags`. Они читаются так, будто их записал сам файл: они
главнее его текста и доходят только до прогонов, которые этот файл загружают (обычный `vitest run` и
таргет билдера, чей `runnerConfig` указывает на него). Флаг, заданный прямой опцией
(`{ configFile, clearMocks: true }`), наоборот, действует на каждый прогон.

**Спека, которую гоняет ещё и Angular unit-test builder, учитывает только флаги, которые применяет
этот билдер.** `@angular/build:unit-test` и делегирующий ему `@nx/angular:unit-test` передают Vitest
`config: false`, если в таргете не назван `runnerConfig`. Тогда `vitest.config.ts`, который читает
`npx vitest`, под `ng test` / `nx test` не открывается вовсе, и этот прогон идёт на значениях Vitest по
умолчанию. Таргеты правило находит само:

1. Идёт вверх от линтуемого файла до корня воркспейса (`angular.json`, `workspace.json` или
   `nx.json`).
2. Берёт каждый таргет любого из двух билдеров, в корне проекта которого лежит файл. Executor может
   прийти из `targetDefaults` в `nx.json`.
3. Разрешает `runnerConfig` так же, как билдер: путь — от корня воркспейса; `true` или `""` — в
   первый `vitest-base.config.*` в корне проекта, затем в корне воркспейса; отсутствие или `false` —
   ни в какой конфиг.
4. Каждая конфигурация таргета, задающая `runnerConfig`, считается ещё одним прогоном.

Сброс попадает в отчёт, только если его делает найденный конфиг (или `configFile`) **и** каждый
прогон билдера, найденный на шагах 1–4:

| в конфиге            | таргет билдера без `runnerConfig` | в отчёте                            |
| -------------------- | --------------------------------- | ----------------------------------- |
| `restoreMocks: true` | по умолчанию Vitest: выключен     | `vi.restoreAllMocks()`: **нет**     |
| `mockReset: true`    | по умолчанию Vitest: выключен     | `vi.resetAllMocks()`: **нет**       |
| `clearMocks: true`   | включён по умолчанию с Vitest 5   | `vi.clearAllMocks()`: да, Vitest 5+ |

Поэтому на Vitest 5 и новее очистка по-прежнему попадает в отчёт: прогон билдера тоже очищает по
умолчанию. На Vitest 4 она в отчёт не попадает. Воркспейс без таких таргетов, то есть любой проект на
чистом Vitest, читается как обычно. Флаги, заданные опциями правила, действуют на каждый прогон как
записаны: проверка билдеров их не урезает, поэтому называйте только то, что применяет каждый раннер.
`configFlags` действуют только на прогоны, которые загружают их `configFile`. Файл воркспейса, который не является чистым JSON, таргетов не даёт.

**Флаг должен совпадать с вызовом, а не с семейством.** Три опции — не три степени одного и того же:

| опция раннера  | что раннер вызывает между тестами | до каких моков дотягивается                  |
| -------------- | --------------------------------- | -------------------------------------------- |
| `clearMocks`   | `vi.clearAllMocks()`              | до всех; забывает записанные вызовы          |
| `mockReset`    | `vi.resetAllMocks()`              | до всех; ещё и сбрасывает реализацию         |
| `restoreMocks` | `vi.restoreAllMocks()`            | **только** до спаев, поставленных `vi.spyOn` |

Поэтому `vi.restoreAllMocks()` в хуке **не** лишний при одном лишь `clearMocks: true`, а
`vi.clearAllMocks()` не лишний при одном лишь `restoreMocks: true`. Правило использует только два
доказуемых пересечения:

- `resetAllMocks` сбрасывает каждый зарегистрированный мок, а это включает очистку;
- `restoreMocks` покрывает **помоковый** `mockClear` / `mockReset` / `mockRestore` там, где файл
  показывает, что получатель — спай `vi.spyOn`: `const spy = vi.spyOn(api, 'load')`, `let`, который
  хук заполняет один раз, или вызов, написанный на месте. Для обычного `vi.fn()` или имени, которому
  присваивают больше одного раза, отчёта нет.

`setupAutoSpy({ restoreMocks })` восстанавливает в `afterEach`, а раннер — в `onBeforeTryTask`, перед
каждым тестом. Восстановление в `beforeAll` или перед первым тестом покрыто опцией раннера и ничем из
того, что делает `setupAutoSpy`.

**Почему правило смотрит так узко.** Vitest сбрасывает моки в `onBeforeTryTask`, который выполняется
**перед** цепочкой `beforeEach` каждого теста и никогда после теста. Отсюда три следствия:

- **Сброс отменяет то, что выполнилось раньше.** Между сбросом раннера и инструкцией внутри
  `beforeEach` уже отработали инструкции выше в том же хуке. Отработал и каждый `beforeEach`
  объемлющего `describe`, где бы он ни был написан, и каждый более ранний рядом. Спай, который
  кто-то из них поставил, или вызовы, сделанные подготовкой, — ровно то, что там снимает
  `spy.mockRestore()` или `mockClear()`. Удаление такой строки роняло тесты в реальном проекте. Поэтому
  сброс в `beforeEach` сообщается только первой инструкцией хука, которому не предшествует другой
  `beforeEach`. Хук внутри соседнего `describe` не считается.
- **После последнего теста файла ничего не сбрасывается до конца файла.** Vitest вызывает
  `vi.restoreAllMocks()` ещё раз на границе файла, после всех `afterAll`. До этого момента хуки
  `afterEach` объемлющих `describe` и каждый `afterAll` (включая хуки setup-файла) работают со
  спаями последнего теста на `window`, `document` или прототипе. Restore или reset в `afterEach` /
  `afterAll` их снимает, и о нём не сообщается никогда. Сообщается только очистка последней
  инструкцией `afterEach`.
- **`beforeAll` выполняется до первого сброса раннера,** поэтому сброс там защищает тело самого хука
  и ничего не повторяет.

**Сброс в середине тела теста не сообщается никогда.** Он отделяет одну подготовку от следующей
внутри одного теста, а ни одна опция раннера так не делает. В одном проекте таких вызовов **445 в 132
файлах**, и правило молчит на всех по своему устройству: отчёт делается только там, где ближайшая
функция вокруг вызова — собственный колбэк хука. Сброс внутри `onTestFinished(…)`, который
регистрирует хук, внутри `if` или внутри хелпера, который вызывает хук, тоже вне правила.

**Серьёзность.** `error`, и довод — молчание: проекту, который ничего не сказал, ничего и не
сообщат, поэтому ошибиться насчёт незнакомого проекта правило не может. Там, где оно срабатывает,
доказательство — флаг, который поставил проект, и вызов, который его повторяет, а исправление —
удаление, которое правило делает или предлагает. Находка — чистая цена (строка ничего не делает), а
на такой отчёт реагировать проще всего.
:::

## no-unasserted-argument {#no-unasserted-argument}

**`warn`** · без автоисправления · синтаксис и области видимости

Сообщает о голом `expect(spy).toHaveBeenCalled()` там, где сам файл показывает, что аргументы
важны: другой тест закрепляет тот же спай через `toHaveBeenCalledWith`, или в заголовке теста есть
`with`. Тест проверяет, что что-то выполнилось, но не с чем это вызвали.

```ts
it('emits rowFocused with the host element', () => {
  component.onFocus();

  expect(component.rowFocused.emit).toHaveBeenCalled(); // ❌ «с host-элементом» не проверено
});
```

```ts
expect(component.rowFocused.emit).toHaveBeenCalledWith(host.nativeElement); // ✅
```

**Опции.** Нет.

**Как исправить.** Назовите аргументы через `toHaveBeenCalledWith(…)`.

- `expect.objectContaining({ … })` и `expect.any(Type)` закрывают ту часть аргумента, которую тест
  не решает.
- `toHaveBeenCalledExactlyOnceWith(…)` — когда «ровно один раз» тоже часть утверждения.
- Подмена, собранная этим пакетом, принимает [`mustBeCalledWith(…)`](/ru/core/control-helpers) там,
  где её настраивают. Он падает на самом вызове, а не после него.
- У метода без аргументов называть нечего. Закрепите счётчик: `toHaveBeenCalledOnce()` или
  `toHaveBeenCalledTimes(n)`.

**Когда выключить.** Находка точна, но правильный список аргументов знает только автор, поэтому
правило `warn`. Поднимите его до `error`, когда ответите на отчёты. Никогда не сообщаются:

- `expect(spy).not.toHaveBeenCalled()`: аргументов, которые можно назвать, нет;
- `toHaveBeenCalledTimes`, `toHaveBeenCalledOnce` и другие считающие матчеры;
- субъект, который заканчивается на `preventDefault`, `stopPropagation` или
  `stopImmediatePropagation`: эти методы `Event` не принимают аргументов.

::: details Как правило решает
Ничего вне файла и ничего из того, что знает тайпчекер. Прочтений два:

1. **Тот же субъект закреплён через `toHaveBeenCalledWith` в другом тесте этого файла.** Автор уже
   записал, что аргументы этого вызова — часть контракта; здесь он этого не сделал. Тест, который
   проверяет оба варианта на одном субъекте, не трогается: аргументы там проверены, а голая строка
   просто лишняя.
2. **В заголовке теста есть `with`, а тело не проверяет ничего другого.** Тогда всё утверждение теста
   — список аргументов, а проверяет он только то, что что-то выполнилось. Любая другая проверка
   снимает это прочтение, потому что аргументы могут проверяться как раз в ней: равенство на
   результате, счётчик или цепочка, которую правило не может дочитать (`resolves`, `rejects`). `with`,
   который входит в имя проверяемого метода, не читается: `it('dismisses with action …')` над
   `expect(ref.dismissWithAction).toHaveBeenCalled()` называет метод, а не список аргументов.

**Тот же субъект** — это тот же исходный текст, переданный в `expect()`, без учёта пробелов. Поэтому
`expect(api.load)` и `expect(loadSpy)` — два субъекта, даже если это один спай. Имена читаются через
то, что в них лежит, потому что тесты переиспользуют общие имена: `spy` с `vi.spyOn(obj, 'm')` — это
тот член, а `vi.fn()` — только он сам. Поэтому `const spy = vi.spyOn(dialog, 'close')` одного теста —
не тот же `const spy = vi.spyOn(logger, 'info')` следующего. Так правило теряет находки, но не
выдумывает ни одной.

Голый вызов рядом с проверкой результата снимается по второму прочтению, но не по первому: там файл
уже сказал, что аргументы _этого субъекта_ важны. Методы `Event` распознаются по имени, потому что у
правила нет информации о типах.

**Почему оно узкое.** Грубая версия уже есть: `vitest/prefer-called-with` сообщает о **каждом** голом
`toHaveBeenCalled`. Оно не входит в `recommended` своего плагина. На проекте из 2032 файлов оно даёт
**1941 отчёт в 360 файлах** — число, по которому никто ничего не делает. Два прочтения выше дают на
том же дереве **175 отчётов в 90 файлах**: 151 по первому и 24 по второму. И то и другое — файл,
который противоречит сам себе, а это находка. Остальные 1766 — вопрос стиля.

Самая сильная пара на том проекте: два теста в одном файле с одинаковыми телами, заголовки которых
различаются только тем, какой аргумент несёт вызов. Разницы, которую обещают заголовки, в коде нет, и
никто, кроме этого правила, об этом не скажет.

**Серьёзность.** `warn`, по тому, чего требует исправление, а не по доказательству. Оба прочтения —
факты из файла, как у каждого `error` здесь. Но исправление — это список аргументов, который тест
должен был назвать, а его правило дать не может. Каждое `error`-правило либо несёт правку, либо
называет хелпер; это несёт вопрос автору.
:::

## prefer-provide-activated-route {#prefer-provide-activated-route}

**`error`** · без автоисправления · только синтаксис

Сообщает о провайдере `ActivatedRoute`, собранном руками, и о `provideAutoSpy(ActivatedRoute)`.
Самодельный маршрут знает только ту половину, о которой подумал автор: snapshot или стримы.
Компонент, который читает другую половину, получает `undefined`, а тест всё равно проходит.

```ts
// Одинокий snapshot: компонент, читающий `route.params`, получает `undefined`.
{ provide: ActivatedRoute, useValue: { snapshot: { queryParams: { ['q']: 'mock' } } } } // ❌

// Пустой объект: каждое чтение даёт `undefined`.
{ provide: ActivatedRoute, useValue: {} } // ❌

// Фабрика спаев: у прототипа нет ни одного поля экземпляра, которые держит маршрут.
{ provide: ActivatedRoute, useValue: createSpyFromClass(ActivatedRoute, { observablePropsToSpyOn: ['queryParams'] }) } // ❌

// Фабрика, которая собирает половины по одной.
{
  provide: ActivatedRoute,
  useFactory: () => {
    const mock = { snapshot: { params: {} } };
    mockReadonlyPropGetter(mock, 'params', () => of({}));
    return mock;
  },
} // ❌
```

```ts
import { injectActivatedRoute, provideActivatedRoute } from 'vitest-auto-spy/angular-router';

TestBed.configureTestingModule({
  providers: [provideActivatedRoute({ params: { id: '1' } })], // ✅
});

const route = injectActivatedRoute();

route.setParams({ id: '2' }); // стримы эмитят, snapshot уже согласован
```

**Опции.** Нет.

**Как исправить.** Замените провайдер из отчёта на `provideActivatedRoute({ … })` из
`vitest-auto-spy/angular-router`. Маршрутом в тесте управляйте через объект из
`injectActivatedRoute()`, как в примере выше.

**Когда выключить.**

- Спека с настоящей маршрутизацией (`RouterTestingModule`, настоящий `Router`, по которому спека
  навигирует) обходится без дескриптора маршрута и в отчёт не попадает.
- Спеке сознательно нужна половина маршрута: выключите правило на этой строке.
- Класс проекта, который случайно называется `ActivatedRoute`, тоже попадёт в отчёт: правило читает
  имя. Переименуйте один из двух.

::: details Как правило решает
**Пять форм.** Четыре из них — слоты одного дескриптора провайдера: объект в `useValue` (написан на
месте или сохранён в имя над TestBed), `useClass`, `useFactory` и `useExisting`. Пятая — вызов
`provideAutoSpy(ActivatedRoute)`. Спай читает прототип, а все части `ActivatedRoute` лежат в полях
экземпляра. Поэтому у такого спая их нет.

**Токен** — значение `provide:`, которое называет класс. Оно читается как написано. Объявление в
другом файле правило не ищет.

**Что пропускается:** собственный маршрут библиотеки. Это дескриптор, внутри которого где угодно
встречается `createActivatedRoute(…)`. Или дескриптор, чей `useValue` — имя (простое, `.route` от
имени или из деструктуризации), объявленное или один раз записанное этим вызовом фабрики.

**Почему оно в recommended.** `ActivatedRoute` — единственный коллаборатор, у которого очевидный мок
неверен так, что зелёный тест это прячет. Настоящий класс держит `snapshot`, `params`, `queryParams`,
`data`, `fragment` и `url` в полях экземпляра над одной записью состояния. Спека, которая задаёт
`snapshot.params` и не эмитит `params`, тестирует маршрут, который не получится ни при одной
навигации. `provideActivatedRoute()` собирает собственный класс Angular над одной записью состояния,
так что половины не могут разойтись. Его сеттеры меняют их вместе посреди теста, в том же порядке и
с тем же сравнением, что и навигация. Примеры выше взяты из монорепозитория на 11 000+ файлов спек:
там 42 самодельных провайдера маршрута в 36 файлах.

**Два правила про маршрут согласны.** [`prefer-provide-auto-spy`](#prefer-provide-auto-spy) тоже
читает токен `ActivatedRoute`: в дескрипторе провайдера и в `TestBed.overrideProvider`. Для этого
токена то правило советует `provideActivatedRoute()`, а не `provideAutoSpy`. Дескриптор, который видят
оба правила, получает два отчёта с одним и тем же исправлением.

**Серьёзность.** `error`. Рядом с каждым отчётом стоит `provide:`, который называет класс маршрута,
так что ничего не угадывается. Правило сообщает о подмене, чьи половины проходящий тест держит
врозь.
:::

## no-passthrough-console-spy {#no-passthrough-console-spy}

**`error`** · подсказка · только синтаксис

Сообщает о `vi.spyOn(console, 'error')` (или о другом пишущем методе), когда ничто в файле не даёт
спаю реализации. Такой спай записывает вызов **и** всё равно его печатает. Спека выглядит так, будто
заглушила консоль, поэтому шум никто не ищет.

```ts
beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error'); // ❌ записывает вызов, а потом всё равно печатает
});
```

```ts
import { consoleErrorSpy, installConsoleSpies } from 'vitest-auto-spy/console';

beforeEach(() => {
  installConsoleSpies(); // ✅ тихий, типизированный, под strayConsole снимается после теста
});

it('reports the failure', () => {
  service.load();

  expect(consoleErrorSpy).toHaveBeenCalledWith('load failed', expect.any(Error));
});
```

**Опции.** Нет.

**Как исправить.** Возьмите `installConsoleSpies()` из `vitest-auto-spy/console`, как в примере
выше. Правка поменьше — подсказка: она дописывает `.mockImplementation(() => undefined)` к вызову
`spyOn`. Это подсказка, а не исправление: реализация меняет поведение спая, и решать это вам.

**Когда выключить.** Спека следит за консолью, чтобы видеть напечатанное, _и_ хочет видеть этот вывод
в логе. Выключите правило на этой строке.

::: details Как правило решает
**Что совпадает:** `vi.spyOn(console, m)` или `jest.spyOn`, где объект — `console`,
`globalThis.console` или `window.console`. Всё читается без типов.

**Что закрывает вопрос** (отчёта нет):

- вызов прямо в цепочке спая: `.mockImplementation(…)`, `.mockImplementationOnce(…)`,
  `.mockReturnValue(…)`, `.mockReturnValueOnce(…)`, после любого числа звеньев вроде `.mockName(…)`;
- если спай сохранён в имя (`const` или `let`, который присваивает хук) — один из этих четырёх вызовов
  где угодно на этом имени. Правило следит за именем через анализ областей видимости. `expect(spy)`,
  `spy.mock.calls`, `spy.mockRestore()` и прямой вызов его только читают;
- спай передан в хелпер, возвращён, переименован или положен в массив. Туда правило пойти не может,
  поэтому молчит.

**Метод** должен быть литеральным именем, через которое консоль пишет. `time`, `groupEnd` и
`countReset` ничего не пишут, а вычисляемое имя узнать нельзя. `console`, объявленный самим файлом, —
не глобальный, и его правило не трогает. `console` из `globals` вашего конфига проверяется.

**Почему оно в recommended.** Спай без реализации вызывает оригинал. Под
[`setupAutoSpy({ strayConsole })`](/ru/utilities/setup) это роняет тест как посторонний вывод. Без этой
защиты это шум, под которым в логе прогона теряется следующий настоящий провал. На
Angular-монорепозитории из 1 759 файлов спек правило сообщает **0** раз: единственный
`vi.spyOn(console, …)` там уже с реализацией.

**Серьёзность.** `error`. Правило решает по факту: ничто в файле не даёт спаю реализации, значит,
вывод есть.
:::

## no-console-in-spec {#no-console-in-spec}

**`error`** · без автоисправления · только синтаксис

Сообщает о спеке, которая вызывает пишущий метод консоли, например `console.log` или `console.error`,
и о любом присваивании члену `console`. Вызов печатает, поэтому под `strayConsole` роняет тест.
Присваивание никто не отменяет, и оно протекает в следующие файлы.

```ts
httpClient.get(url).subscribe({
  error: (error) => console.error(error), // ❌ спека печатает
});
```

```ts
httpClient.get(url).subscribe({ error: () => undefined }); // ✅ провал — это то, что устроил тест
```

**Опции.** Нет.

**Как исправить.**

- Забытая отладочная строка: удалите её.
- Код под тестом логирует: поглотите лог через `installConsoleSpies()` и проверьте спай.
- Присваивание: возьмите спай, который восстанавливается после теста.

```ts
console.warn = vi.fn(); // ❌ никто не вернёт на место
vi.spyOn(console, 'warn').mockImplementation(() => undefined); // ✅ восстанавливается после теста
```

Замену можно и оставить, сделав её безопасной: `installConsoleSpies()` из `vitest-auto-spy/console`
в `beforeEach` и `restoreConsole()` в `afterEach`.

**Когда выключить.** Ограничьте правило файлами спек. `console.log` у CLI — это его вывод.

::: details Как правило решает
**Пишущие методы:** `log`, `info`, `warn`, `error`, `debug`, `trace`, `table`, `dir`, `dirxml`,
`group`, `groupCollapsed`, `timeLog`, `timeEnd`, `count`, `assert`.

**Объект** должен быть глобальным `console`, в том числе через `globalThis.console` /
`window.console`. Правило проверяет это анализом областей видимости: `console`, объявленный файлом, —
чей-то фейк, и его правило не трогает. Вычисляемый член узнать нельзя, он пропускается.

**О чтении правило не сообщает никогда.** `expect(console.error).toHaveBeenCalled()` и
`register(console.warn)` упоминают метод, но не вызывают его. О присваивании правило сообщает при
любом члене, включая `console.time = …`.

**Почему оно в recommended.** Вызов печатает по определению, поэтому под
[`setupAutoSpy({ strayConsole })`](/ru/utilities/setup) роняет тест. Правило переносит этот провал в
редактор. Присваивание хуже: его никто не восстанавливает. Под `isolate: false` каждый следующий файл
воркера получает консоль, которая ничего не печатает. Что это скрывает, зависит от того, какой файл
выполнился первым. На Angular-монорепозитории из 1 759 файлов спек: **6 отчётов в 2 файлах**, каждый —
`console.error` в колбэке ошибки `subscribe`, и ни одного присваивания.

**Серьёзность.** `error`. Вызов на глобальной консоли пишет, а присваивание ей никто не отменит.
:::

## no-import-time-console-spies {#no-import-time-console-spies}

**`error`** · без автоисправления · только синтаксис

Сообщает об импорте `vitest-auto-spy/console` в файле, который ни разу не вызывает
`installConsoleSpies()` или `useConsoleSpies()`. Импорт ставит спаи один раз на воркер — в том файле,
который импортировал их первым. Потом они глушат каждый следующий файл этого воркера.

```ts
import { consoleErrorSpy } from 'vitest-auto-spy/console';

// ❌ поставлен тем файлом, который импортировал первым
```

```ts
import { useConsoleSpies } from 'vitest-auto-spy/console';

const { consoleErrorSpy } = useConsoleSpies(); // ✅ тесты этого файла, и больше ничьи
```

**Опции.** Нет.

**Как исправить.** Вызовите `useConsoleSpies()`, как в примере выше. Это
`beforeEach(installConsoleSpies)` вместе с `afterEach(restoreConsole)`; на `node:test` и Rstest эту
пару пишите сами. Другие варианты:

- `beforeAll` с `afterAll` — для набора тестов, который делит один сервер или фикстуру между тестами;
- `installConsoleSpies()` один раз в начале файла — когда вывод ждут все тесты файла.

Экспортированные константы и возвращённый объект — одни и те же спаи, поэтому существующий
`expect(consoleErrorSpy)` продолжает работать.

**Когда выключить.** Setup-файл, который импортирует точку входа, чтобы нарочно заглушить консоль на
весь прогон. Это не спека, поэтому ограничьте правило файлами спек.

::: details Как правило решает
**О чём сообщает:** голый импорт ради побочного эффекта, импорт пространства имён или именованный
импорт любой константы `console*Spy`.

**Что его останавливает:** вызов `installConsoleSpies` или `useConsoleSpies` где угодно в файле —
голый, через член или переданный в хук как `beforeAll(installConsoleSpies)`. Тогда файл ставит спаи
сам, а импорт только даёт имена. Импорт одного лишь `installConsoleSpies`, типов или `restoreConsole`
на установку при импорте не опирается, и правило его не трогает.

**Почему оно в recommended.** Импорт ставит спаи при первом вычислении модуля. Под `isolate: false`
это происходит один раз на воркер, и ничто ни в одном файле их не снимает. Что это скрывает, зависит
от порядка файлов. На Angular-монорепозитории из 1 759 файлов спек точку входа импортируют 39 файлов, и
**32** из них ни разу не вызывают `installConsoleSpies()` (6 из 32 — голые импорты ради побочного
эффекта). Когда три файла начали вызывать `restoreConsole()` в `afterEach`, упали 12 тестов в 5 других
файлах. А вывод, который скрывала глобальная тишина, появился в 7 файлах. Под
[`setupAutoSpy({ strayConsole })`](/ru/utilities/setup) импорт не ставит ничего, так что правило и
защита согласны, где место установке.

**Серьёзность.** `error`. Импорт ставит спаи раз на воркер, а ничто в файле их не ставит и не
снимает.
:::

## no-unasserted-console-spy {#no-unasserted-console-spy}

**`warn`** · без автоисправления · только синтаксис

Сообщает о консольном спае, который файл ставит, но ни разу не проверяет. Спай глотает то, что
залогировал код, и никто это не читает. Это единственное место, где спека может залогировать ошибку
и всё равно пройти.

```ts
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined); // ❌ глушит и ничего не проверяет
});
```

```ts
const { consoleErrorSpy } = useConsoleSpies(); // все каналы заглушены и восстанавливаются после каждого теста

it('reports the failure', () => {
  service.load();
  expect(consoleErrorSpy).toHaveBeenCalledWith('boom'); // ✅
});
```

**Опции.** Нет.

**Как исправить.** Проверьте спай — хотя бы через `expect(consoleErrorSpy).not.toHaveBeenCalled()`.
Если нужна была только тишина, удалите эти строки, и пусть это сделает `useConsoleSpies()`. Спай,
импортированный из `/console` и только сбрасываемый в `afterEach`, — та же находка: сброс и так
работа `useConsoleSpies()`.

**Когда выключить.** Правило стоит на `warn`, потому что только вы знаете, что должен был сказать
заглушённый канал. Улика точная, но исправление — вопрос к автору.

::: details Как правило решает
**О чём сообщает:**

- спай из `vitest-auto-spy/console`, импортированный или деструктурированный из `useConsoleSpies()` /
  `installConsoleSpies()` под любым локальным именем, у которого каждое упоминание — сброс или
  реализация: `mockClear`, `mockReset`, `mockRestore`, `mockImplementation`, `mockReturnValue`,
  `mockName`;
- `vi.spyOn(console, m)`, которому дали реализацию и который не лежит нигде, откуда его читает тест.

**Что не трогает:**

- спай, который всё ещё вызывает оригинал. Это находка
  [`no-passthrough-console-spy`](#no-passthrough-console-spy), так что одна строка никогда не получает
  два отчёта с двумя разными исправлениями;
- файл, который читает консоль иначе: `consoleOutput()`, `consoleLines()`, `expect(console.error)`,
  `vi.mocked(console.warn)`.

**Почему оно в recommended.** Код под тестом сообщил о сбое, спай его проглотил, а тест проверил
что-то другое.

**Серьёзность.** `warn`. Улика точная, но только автор может ответить, что должен был сказать
заглушённый канал.
:::

## prefer-provide-auto-spy {#prefer-provide-auto-spy}

**`error`** · `--fix` · только синтаксис

Сообщает о провайдере, который отдаёт в DI Angular написанную руками подмену сервиса через
`useValue`, `useFactory`, `useClass` или `useExisting` — в `providers` или в
`TestBed.overrideProvider`. Такая подмена устаревает, когда меняется класс, а падение всплывает в
компоненте, через один шаг DI. Ещё правило сообщает о `{ provide: X, useValue: createSpyFromClass(X, config) }` — это
длинная запись `provideAutoSpy(X, config)`.

```ts
providers: [{ provide: CartService, useValue: { total: vi.fn(), add: vi.fn() } }]; // ❌

class CartServiceMock {
  total = vi.fn().mockReturnValue(0);
  add = vi.fn();
}
providers: [{ provide: CartService, useClass: CartServiceMock }]; // ❌ и класс-заглушка тоже уходит
```

```ts
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/angular';

TestBed.configureTestingModule({ providers: [provideAutoSpy(CartService)] }); // ✅
injectSpy(CartService).total.mockReturnValue(3); // в beforeEach или в тесте: задаём ответ
```

```ts
// член, который подмена должна подменить значением, а не спаем, задаётся в опциях:
providers: [provideAutoSpy(ConfigService, { overrides: { flagsConfig: { theme: 'dark' } } })];
// а для токена, у которого нет класса для чтения:
providers: [provideAutoSpyForToken(LOGGER, undefined, { selfReturning: ['channel'] })];
```

**Опции.** Нет.

**Как исправить.** Сообщение называет замену для того, что вы провайдите:

| Вы провайдите    | Замените на                                                                  |
| ---------------- | ---------------------------------------------------------------------------- |
| класс            | `provideAutoSpy(Class)`, а класс-заглушку удалите                            |
| `InjectionToken` | `provideAutoSpyForToken(TOKEN)`: у токена нет прототипа для `provideAutoSpy` |
| `ActivatedRoute` | `provideActivatedRoute()` из `vitest-auto-spy/angular-router`                |

- У `{ provide: X, useValue: createSpyFromClass(X, config) }` есть `--fix`: литерал становится
  `provideAutoSpy(X, config)`.
- В `TestBed.overrideProvider(X, { … })` передайте вместо литерала результат `provideAutoSpy`:
  `.overrideProvider(X, provideAutoSpy(X, { … }))`. `provideAutoSpy` возвращает `{ provide, useValue }`,
  а `overrideProvider` читает из него `useValue`.
- Компонент, который объявляет токен в собственных `providers`, недостижим для провайдера уровня
  модуля. Там override остаётся, а меняется только то, что он отдаёт.

**Когда выключить.** Редко: рядом с каждым отчётом стоит `provide:` или токен override. На большом
проекте вводите правило [постепенным рецептом](/ru/utilities/eslint-plugin#land-it-on-a-large-existing-suite-without-a-red-ci),
а не сменой серьёзности. Известные пробелы:

- Проверка токена — проверка имени. Классу, записанному в `SCREAMING_CASE`, правило советует
  `provideAutoSpyForToken`, а токену, названному как класс, — `provideAutoSpy`. Находка верная,
  неверно одно слово в совете.
- Подмена, собранная локальным хелпером, или `let`, в который пишут два хука, не отслеживается.
- Класс-заглушку из общего `*.mock.ts` из спеки не видно: класс должен быть объявлен в проверяемом
  файле.
- Написанная руками подмена, переданная в override по имени (`.overrideProvider(X, descriptor)`), в
  отчёт не попадает. У неё та же форма, что у `.overrideProvider(X, provideAutoSpy(X))`, а о нём
  сообщать нельзя.

::::: details Как правило решает
**Токен** берётся из ключа `provide` или из нулевого аргумента вызова override. Подмена читается
четырьмя способами:

- **`useValue` читается до границы функции.** Значение может быть самим объектным литералом или
  именем. За именем правило делает один шаг — до значения, которое файл ему даёт: инициализатор
  (`const nav = { go: vi.fn() }`) или одно последующее присваивание:

  ```ts
  let nav: { go: Mock };
  beforeEach(() => {
    nav = { go: vi.fn() };
    TestBed.configureTestingModule({ providers: [{ provide: NavService, useValue: nav }] });
  });
  ```

  Со _второй_ записи имя не трогается: что оно держит в точке использования, тогда зависит от порядка
  запуска. Достаточно одного `vi.fn()` где угодно в значении: `provide:` рядом доказывает, что это
  подмена сервиса. Обход останавливается на каждой функции: `vi.fn()` за стрелкой создаётся на каждый
  вызов, а это и есть форма, к которой ведёт правило. Свойство, чьё значение — имя, один раз связанное
  с `vi.fn()`, тоже считается: `useValue: { open }` над `const open = vi.fn()`.

- **`useFactory` читается _сквозь_ функцию.** Всё тело фабрики — это то, что в итоге держит DI.
  Например, `useFactory: vi.fn().mockImplementation(() => ({ isKeyEnabled: vi.fn() }))` прячет
  структурную подмену, никак не связанную с классом.
- **`useValue`, который вызывает `createSpyFromClass`,** оценивается по классу, который тот читает, а
  не по содержимому. `provideAutoSpy(X, config)` возвращает ровно `{ provide: X, useValue:
createSpyFromClass(X, config) }`, так что этот литерал — длинная запись `provideAutoSpy(X, config)`.
  Это единственная форма с **исправлением**: литерал становится вызовом, аргументы переносятся как
  текст исходника, `provideAutoSpy` импортируется (в существующий импорт `vitest-auto-spy/angular`,
  если он есть), а осиротевший импорт `createSpyFromClass` удаляется. Исправление отступает там, где
  замена — не чистая перестановка: явные типовые аргументы (`createSpyFromClass<T, Options>`
  принимает два, `provideAutoSpy<T>` — один), третье свойство в литерале или `provideAutoSpy`,
  объявленный самим файлом.
- **`useClass` и `useExisting` читаются как класс, объявленный в проверяемом файле**, и так же
  читается `useValue: new StubMock()`. Достаточно одного поля `vi.fn()`. Класс, которого файл не
  объявляет (импортированный из общего `*.mock.ts`, доступный через пространство имён), ни во что не
  разрешается и в отчёт не попадает. Четыре исключения
  [`no-stub-class-double`](#no-stub-class-double) действуют и здесь. `useClass` создаёт экземпляр на
  каждый инжектор, а `useExisting` делает токен псевдонимом. Исправление у них одно, поэтому и
  сообщение общее.

**Настроенный спай — всё равно спай.** `vi.fn()` и `vi.fn().mockReturnValue(of([]))` — одна и та же
подмена, только вторая настроена. Цепочка разматывается до вызова, который создал мок, какой бы
длинной она ни была. Чем сильнее настроена написанная руками подмена, тем дальше она ушла от класса.

**`TestBed.overrideProvider`** — та же замена снаружи массива. На одном проекте из 1759 файлов спек
61 вызов override в 36 файлах; 33 из них отдают объектный литерал. Вызов, чей второй аргумент **не**
объектный литерал, правило не трогает: 28 из этих 61 вызова уже используют
`provideAutoSpy(X, { … })`. У формы override своё сообщение: там различается не то, какую фабрику
брать, а куда положить настройку.

**Токен или класс.** Если резолвер дотягивается до инициализатора `new InjectionToken<…>(…)`, вопрос
закрыт. Иначе решает имя: токен почти всегда импортирован, так что читать остаётся `^[\dA-Z_]+$`.
Советы разные, потому что `provideAutoSpy` читает прототип класса, а у токена его нет, и такой совет не
скомпилируется. В трёх партиях переезда это было важно; в одной из них 6 из 8 отчётов пришлись на
токены.

**`ActivatedRoute`** получает своё сообщение. Класс держит `snapshot`, `params`, `queryParams`,
`data`, `fragment` и `url` в полях **экземпляра**, так что у спая, построенного по его прототипу, их
нет. Получилась бы та же половина маршрута, что и у написанного руками `useValue`. Охват правила для
этого токена не меняется, меняется только совет. Исправления у этой формы нет: замена — другая
подмена, а не та же, записанная короче. Это то же исправление, которое называет
[`prefer-provide-activated-route`](#prefer-provide-activated-route), так что оба правила говорят одно.

**`multi: true` пропускается.** `provideAutoSpy` строит одну подмену на токен и не принимает режима
регистрации. Следуя совету, вы бы незаметно превратили накапливающий провайдер в перекрывающий, так что
советовать нечего.

**Молчит намеренно:**

- `{ provide: LocalStorage, useValue: createSpyFromClass(BaseLocalStorage) }`. Токен — абстрактный
  класс, а спай читает его реализацию: у абстрактного прототипа нет ни одного метода, который нужен
  подмене, так что `provideAutoSpy(LocalStorage)` не заспаил бы ничего. Короче это не записать. На
  измеренном проекте это 51 место в 41 файле, и всё это рабочий код.
- Вызов `createSpyFromClass`, сохранённый в имя (`const cart = createSpyFromClass(Cart)`,
  `useValue: cart`). Подмену потом настраивают через это имя, так что исправлением было бы
  `provideAutoSpy(Cart)` плюс `injectSpy(Cart)` в каждом использовании: переписывание файла.
- Начальные значения фабрики. `useValue`, собранный одной из фабрик библиотеки, — это вызов, а правило
  читает только объектные литералы. Имя, за которым оно следует, приводит к этому вызову, и на нём
  правило останавливается.

**Прежде чем решить, что правило слепо, проверьте, где оно запускается.** Один шард переезда нашёл
~100 `vi.fn()`, о которых плагин не сообщил, в шести общих файлах `*.service.mock.ts`, в каждом по
фабрике провайдера:
`export function providePaymentsMock(): Provider { return { provide: X, useValue: new XMock() }; }`.
Правило читает это нормально: на тех 84 файлах `*.mock.ts` оно даёт 9 отчётов в 9 файлах. Ничего не
появилось, потому что проект ограничил конфиг `**/*.spec.ts`, как и написано на
[странице плагина](/ru/utilities/eslint-plugin). Если фикстуры лежат рядом со спеками, используйте
`['**/*.spec.ts', '**/*.mock.ts']`.

**Почему оно в recommended.** Тот же дрейф, что у
[`prefer-create-spy-from-class`](#prefer-create-spy-from-class), только через один шаг DI, и читать его
труднее. Падающая строка — в компоненте, подмена — в конфигурации модуля, а система типов молчит,
потому что `useValue` типизирован как `any`.

**Серьёзность.** `error`. На проекте, где правило ещё ни разу не запускали, оно самое громкое:

- на одном проекте из 1771 файла спек, уже чистом по `recommended`, одна только форма
  `createSpyFromClass` добавляет **91 отчёт в 49 файлах**. Все 91 исправляются автоматически, максимум
  8 на файл, так что один прогон `eslint --fix` их закрывает;
- на прежних 1759 файлах спек того же проекта: **154 отчёта в 87 файлах**. Это 100 `useValue` (28 из
  них за токеном), 20 классов-заглушек и 6 в вызове override.

Большая часть приходит от шага по имени. Эти подмены отдаются в DI через одно имя, где вопрос
закрывает `provide:`, а ответ — `provideAutoSpy(X)`, а не `createAutoMock<T>()`. Поэтому
[`no-stub-class-double`](#no-stub-class-double) и [`no-structural-double`](#no-structural-double) —
отдельные правила на `warn`: они судят подмены без `provide:` и при этом угадывают. Здесь ничего не
угадывается, и это держит правило на `error`.
:::::

## prefer-inject-spy {#prefer-inject-spy}

**`error`** · подсказка · только синтаксис · опция `ignoreTokens`

Сообщает о `vi.spyOn` поверх экземпляра, который вернул `TestBed.inject`. Если этот экземпляр —
автоспай, `vi.spyOn` заменяет его метод обычным `vi.fn()`. Хелперы спая на этом методе пропадают, и
следующий `nextWith` бросает ошибку.

```ts
TestBed.configureTestingModule({ providers: [provideAutoSpy(BillingPlansService)] });

const service = TestBed.inject(BillingPlansService);
vi.spyOn(service, 'getPlans'); // ❌ заменяет метод автоспая обычным vi.fn()

injectSpy(BillingPlansService).getPlans.nextWith(['PRO']);
// TypeError: spy.getPlans.nextWith is not a function
```

```ts
injectSpy(BillingPlansService).getPlans.nextWith(['PRO']); // ✅ эмитит ["PRO"]
```

**Опции.**

| Опция          | Тип        | По умолчанию | Смысл                                                                                     |
| -------------- | ---------- | ------------ | ----------------------------------------------------------------------------------------- |
| `ignoreTokens` | `string[]` | `[]`         | ещё токены, чей заинжекченный экземпляр остаётся настоящим; добавляются к пяти встроенным |

```js
'vitest-auto-spy/prefer-inject-spy': ['error', { ignoreTokens: ['MapRendererService', 'WINDOW_REF'] }],
```

**Как исправить.** Читайте спай через `injectSpy(X).m`. Редактор предложит это как подсказку. Это
никогда не `--fix`: провайдится ли токен через `provideAutoSpy`, решается в другом файле.

**Когда выключить.**

- Если настоящий экземпляр токена важен для всего проекта, добавьте токен в `ignoreTokens`.
- Если один тест намеренно спаит один метод настоящего сервиса, выключите правило на этой строке.
- Токены сравниваются как текст исходника, поэтому импорт под другим именем
  (`import { DestroyRef as NgDestroyRef }`) проходит мимо встроенного списка и попадает в отчёт.
  Добавьте этот псевдоним в `ignoreTokens`.

::: details Как правило решает
**Что совпадает.** Первый аргумент `vi.spyOn` — вызов `TestBed.inject(…)` или имя, чей инициализатор
им является. Имя разрешается в той области видимости, где оно _используется_. Обе формы часто стоят на
соседних строках одного файла:

```ts
vi.spyOn(TestBed.inject(X), 'm'); // прямо
const service = TestBed.inject(X);
vi.spyOn(service, 'm'); // в два шага
```

Обычный `vi.spyOn` по объекту, которым владеет спека, в отчёт не попадает. Как и `vi.spyOn` по имени,
которое правило не может проследить до `TestBed.inject`.

**Когда предлагается подсказка.** Только когда ничего не приходится придумывать:

- вызов `inject` принимает только токен. `TestBed.inject(X, null, InjectFlags.Optional)` не
  переводится: `injectSpy` принимает только токен, а если отбросить остальное, изменится, какой
  экземпляр вернётся;
- имя метода — строковый литерал, который можно записать после точки;
- `injectSpy` в файле ещё не связан с чем-то другим.

**Пять встроенных токенов.** О `ApplicationRef`, `DestroyRef`, `EnvironmentInjector`, `HttpClient` и
`Injector` правило молчит. Для каждого совет либо невыполним, либо убирает то, ради чего спека и
заинжектила объект:

- `DestroyRef` подменить нельзя вообще. У него есть `__NG_ENV_ID__`, и `R3Injector.get()` первой же
  строкой отвечает `token[NG_ENV_ID](this)` — _раньше_, чем читает свои записи. Так что
  `{ provide: DestroyRef, useValue }` принимается, игнорируется и больше нигде не всплывает. Это
  единственный класс в `@angular/core` с таким флагом.
- `ApplicationRef` — это сама обвязка. `TestBed` гоняет через него change detection, а спека, которая
  создаёт компонент руками, берёт рендерер из `ApplicationRef.injector`. Работает настоящий экземпляр,
  у которого заспаены `attachView` / `detachView`, чтобы ничего не прикреплялось.
- `Injector` и `EnvironmentInjector` отдают _другие_ зависимости. Если их заспаить, `get()` вернёт спай
  для каждого токена, разрешённого после этого. Подмена расползётся на всё, что код под тестом ищет
  лениво.
- У `HttpClient` уже есть штатная подмена от фреймворка: `provideHttpClientTesting()` меняет бэкенд и
  даёт спеке `HttpTestingController`. Спай на `get` там читает опции, которые передал вызывающий код,
  по пути к запросу, который контроллер всё равно флашит.

Токенов node-инжектора (`ElementRef`, `Renderer2`, `ChangeDetectorRef`) в списке нет намеренно.
`TestBed.inject()` не вернёт ни один из них, так что запись освобождала бы строку, которую никто не
может написать.

**Токены сравниваются как текст исходника**, как и в
[`no-unregistered-inject-spy`](#no-unregistered-inject-spy): у правила, которое читает один файл, нет
идентичности для сравнения. `ignoreTokens` расширяет встроенный список, а не заменяет его.

**Почему оно в recommended.** Это одна строка, которая тихо отменяет провайдер. `vi.spyOn` заменяет
один метод и оставляет остальные настоящими. Провайдер по-прежнему автоспай, но метод на нём — обычный
`vi.fn()`, так что все хелперы для observable и promise на нём пропали. Ошибка появляется на строке,
которая читается как обычная настройка спая. Прочитайте ту же зависимость через
`injectSpy(BillingPlansService)`, и `nextWith` работает.

**Серьёзность.** `error`. Без правила тест красный, а сообщение указывает на хелпер, а не на `spyOn`,
который его убрал.
:::

## no-unregistered-inject-spy {#no-unregistered-inject-spy}

**`error`** · без автоисправления · только синтаксис

Сообщает об `injectSpy(X)` для токена, который ничто в файле не зарегистрировало как автоспай. Вы
получаете то, что уже было в DI Angular, — обычно настоящий сервис. Его хелперы спая существуют только
для компилятора, поэтому первый же `.mockReturnValue(…)` бросает ошибку.

```ts
TestBed.configureTestingModule({
  imports: [RouterTestingModule], // предоставляет настоящий ActivatedRoute
  providers: [provideAutoSpy(UserService)],
});

const route = injectSpy(ActivatedRoute); // ❌ настоящий, с хелперами спая, которых там нет
```

```ts
providers: [provideAutoSpy(UserService), provideAutoSpy(ActivatedRoute)]; // ✅
// или скажите, что нужен был как раз настоящий:
const route = TestBed.inject(ActivatedRoute);
```

**Опции.** Нет.

**Как исправить.** Либо зарегистрируйте токен через `provideAutoSpy(X)`, либо читайте его через
`TestBed.inject(X)`, если вам нужна настоящая реализация.

**Когда выключить.** Это одно из [трёх правил, которые могут сообщить о корректном
коде](/ru/utilities/eslint-plugin#the-three-rules-that-can-report-on-correct-code), и опции у него нет.
Оно ошибается, когда файл регистрирует часть подмен понятным правилу способом, а ещё одну получает
через хелпер, за которым правило не идёт. Например, общий `beforeEach` из импортированной тестовой
утилиты, который настраивает TestBed. Там выключите правило точечным `'off'` или на строке.

::: details Как правило решает
**Какие регистрации считаются:** вызов `provideAutoSpy(X)` где угодно и `{ provide: X, useValue: … }`,
чьё значение — вызов `createAutoMock`, `createSpyFromClass`, `createMock` или `mockDeep`. Токены
сравниваются как **текст исходника**.

**Правило ничего не сообщает, пока не выполнены все три условия,** потому что ложный отчёт здесь
обходится дороже предупреждения, которое он заменяет:

- файл хотя бы раз вызывает `provideAutoSpy`. Иначе он настраивает DI способом, который правило не
  моделирует, и отсутствие токена ни о чём не говорит;
- ни в одном массиве `providers` нет спреда, дырки или фабрики провайдера, кроме `provideAutoSpy`.
  `providers: [...sharedMocks]` — обычный способ подтянуть общие моки, а одна нечитаемая запись
  скрывает неизвестное число токенов. Поэтому она глушит **файл**, а не одну строку;
- файл не вызывает `createWithAutoSpies`, `renderShallow` или `TestBed.overrideProvider`. Каждый из них
  регистрирует подмены там, куда этот скан не смотрит.

**Какое значение `providers` правило может прочитать:** литерал массива или `const`, объявленную с
таким литералом и нигде не изменяемую (`const providers = […]`, переданную как `{ providers }` или под
ключом в кавычках `'providers'`). Любое другое значение (импорт, вызов фабрики, массив, в который
делают `push`) делает файл нечитаемым, и в нём ничего не сообщается.

**Токен, отданный руками** (`{ provide: X, useValue: someObject }`), записывается как
предоставленный, и о нём правило не сообщает никогда. Это форма
[`prefer-provide-auto-spy`](#prefer-provide-auto-spy), а два правила на одной строке только научили бы
выключать оба.

**Почему оно в recommended.** `injectSpy` объявлен как возвращающий `Spy<T>`. Каждый хелпер на
результате проверяется против этого объявления, а не против значения. Поэтому хелперы есть для `tsc`
и отсутствуют во время выполнения. Первый же `.mockReturnValue(…)` или `.calledWith(…)` попадает на
настоящий метод и бросает `TypeError` — на строке, которая читается как обычная настройка спая.

Библиотека говорит об этом и во время выполнения: `injectSpy` проверяет, что вернул инжектор, и
предупреждает, что это обычный экземпляр. Но предупреждение в stderr не роняет прогон. В проекте на
тысячу файлов оно пролистывается мимо и появляется только для тестов, которые выполнили эту строку. В
одном монорепозитории десятки файлов спек печатают его на каждом прогоне CI, и никто ничего не сделал.
Проверке не нужна информация о типах, поэтому её место там, где ошибку пишут.

**Почему нет ни исправления, ни подсказки.** Исправление — либо провайдер, которого в файле нет, либо
`TestBed.inject(X)`, который говорит, что нужна была настоящая реализация. Какое из двух, знаете
только вы.

**Серьёзность.** `error`. Когда строка выполняется, тест красный по построению, а проверка типов
стоит не на той стороне.
:::

## no-real-component-provider {#no-real-component-provider}

**`error`** · без автоисправления · только синтаксис · опции `ignoreTokens`, `childInjectors`

Сообщает о `fixture.debugElement.injector.get(X)` или `fixture.componentRef.injector.get(X)` для
токена, который ничто в файле не заменило подменой. Вы получаете настоящий провайдер из собственных
`providers` компонента, и спека компонента гоняет настоящий стор вместе с HTTP-вызовами.

```ts
@Component({ providers: [CartStore] })
class CartComponent {}

const fixture = TestBed.createComponent(CartComponent);
const store = fixture.debugElement.injector.get(CartStore); // ❌ настоящий стор, вместе с HTTP
```

```ts
const store = overrideComponentProvider(CartComponent, CartStore); // ✅ до createComponent
const fixture = TestBed.createComponent(CartComponent);

store.load.mockReturnValue(of(items));
```

**Опции.**

| Опция            | Тип        | По умолчанию | Смысл                                                                              |
| ---------------- | ---------- | ------------ | ---------------------------------------------------------------------------------- |
| `ignoreTokens`   | `string[]` | `[]`         | токены, чей настоящий провайдер нужен спеке                                        |
| `childInjectors` | `boolean`  | `false`      | читать ещё `query(…).injector`, `queryAll(…)[i].injector` и `children[i].injector` |

```js
'vitest-auto-spy/no-real-component-provider': ['error', { childInjectors: true }],
```

**Как исправить.** Замените провайдер через `overrideComponentProvider(Component, X)` до
`createComponent` и настройте возвращённый спай. Сообщение называет компонент: класс, который запрос
нашёл через `By.directive(…)`, или единственный класс, который файл передаёт в `createComponent`.
Когда таких несколько, в сообщении стоит `Component`.

**Когда выключить.**

- Интеграционный тест, который намеренно рендерит компонент с настоящим провайдером: перечислите токен
  в `ignoreTokens`.
- Подмену, поставленную хелпером из другого файла, правило не видит. Оберните чтение в `asSpy(…)`: это
  и документирует подмену, и успокаивает правило.

::: details Как правило решает
**Весь файл, сравнение по тексту исходника.** Токен считается заменённым, если он назван в аргументах
`provideAutoSpy`, `overrideAutoSpy`, `overrideComponentProvider`, `overrideProvider`,
`overrideComponent` или `createSpyFromClass` либо в ключе `provide` объекта провайдера. Чтение,
обёрнутое в `asSpy(…)`, правило принимает как ваше слово, что подмена есть.

**Никогда не сообщаются:**

- токены, импортированные из `@angular/*`;
- классы, которые файл рендерит: переданные в `createComponent` или перечисленные в `imports` /
  `declarations` / `hostDirectives`;
- все чтения в файле, который вызывает `createWithAutoSpies`.

**По умолчанию — собственный инжектор.** Читается только собственный инжектор фикстуры.
`debugElement.query(…).injector` принадлежит дочернему элементу, и запрос класса директивы у него —
способ, которым спека до этой директивы добирается. С `childInjectors: true` чтения дочерних
инжекторов тоже считаются, а каждый класс, названный в `By.directive(…)`, считается отрендеренным. Так
что чтение самой директивы по-прежнему молчит.

**Почему оно в recommended.** `injectSpy` не достаёт провайдер, объявленный на компоненте, поэтому
спека идёт через фикстуру. Если провайдер никто не заменил, фикстура возвращает продовый класс. Тогда
спека компонента гоняет стор через его настоящие HTTP-вызовы, флашит запросы, которых компонент сам не
делает, и повторяет спеку стора под именем компонента. Одна правка в сторе красит три файла спек. На
трёх проектах с 1078 файлами спек: 5 отчётов, каждый — стор или сервис из собственных `providers`
компонента.

**Серьёзность.** `error`. Улики точные: и чтение, и каждое место, где можно было бы написать замену,
находятся в этом файле.
:::

## prefer-to-have-signal-value {#prefer-to-have-signal-value}

**`warn`** · `--fix` · нужны типы

Сообщает о `expect(signal()).toBe(…)` и похожих матчерах над сигналом, прочитанным прямо в `expect`.
Тогда в падении названо значение, а не сигнал. И до `expect(component.total).toBe(3)`, которое проходит
для любого когда-либо созданного сигнала, остаётся одно нажатие клавиши.

```ts
expect(counter.total()).toBe(3); // ❌ в падении «3», а не сигнал
expect(counter.total()).toStrictEqual(3); // ❌ то же самое, и исправление сохраняет строгость
```

```ts
expect(counter.total).toHaveSignalValue(3); // ✅
expect(counter.total).toHaveSignalValue(3, { strict: true }); // ✅
```

**Опции.** Нет.

**Как исправить.** `--fix` убирает скобки и переименовывает матчер в `toHaveSignalValue` — матчер,
который регистрирует `registerSignalMatchers()`. `.not` остаётся на своём месте.

| Было                     | Стало                                    |
| ------------------------ | ---------------------------------------- |
| `toBe(v)` / `toEqual(v)` | `toHaveSignalValue(v)`                   |
| `toStrictEqual(v)`       | `toHaveSignalValue(v, { strict: true })` |
| `toBeNull()`             | `toHaveSignalValue(null)`                |
| `toBeUndefined()`        | `toHaveSignalValue(undefined)`           |

`toHaveSignalValue` называет сигнал в падении. Ещё он отказывается от всего, что не геттер без
аргументов, так что забытые скобки приводят к падению, а не к проходу. Вызов с собственными типовыми
аргументами попадает в отчёт без исправления: перенос текста их бы потерял.

**Когда выключить.** Правилу нужна информация о типах; без неё оно ничего не сообщает. Оно стоит на
`warn`, потому что исходная проверка верна: матчер лишь падает понятнее.

::: details Как правило решает
**Что совпадает:** `toBe`, `toEqual`, `toStrictEqual`, `toBeNull` или `toBeUndefined`, включая `.not`,
над вызовом, который проверка типов разрешает в сигнал.

**Сигнал узнаётся по типу, а не по имени:** он вызываемый и несёт бренд сигнала Angular. Проверка типов
записывает этот бренд как `__@SIGNAL@53`, с номером в конце, который меняется от программы к
программе. Поэтому `getProperty('ɵSIGNAL')` по обычному имени ничего не находит. Методы, обычные
функции и геттеры в отчёт не попадают. Без информации о типах правило молчит, а не угадывает по имени.

**Проверка идентичности пропускается.** `toBe` сравнивает через `Object.is`, а `toHaveSignalValue` —
глубоко. `expect(list.items()).toBe(items)` утверждает, что сигнал держит именно этот массив; после
переписывания проверка проходила бы для любой равной копии. Поэтому о `toBe` правило сообщает, только
если:

- ожидаемое значение — примитивный литерал (`3`, `'on'`, `null`, `undefined`, шаблон без выражений),
  или
- тип сигнала примитивный: string, number, boolean, bigint, enum, их литералы, `null`, `undefined`.
  `any` не считается.

Любой другой `toBe` правило не трогает: ни один матчер над сигналом не сохраняет идентичность.

**Почему исправление безопасно.** Матчер сравнивает глубоким равенством раннера, включая вложенные
`Set` и `Map` по содержимому, и на нестрогом, и на строгом пути. Поэтому переписывание эквивалентно
исходной проверке.

**Серьёзность.** `warn`. Правило называет матчер, который падает понятнее; проверка, которую он
заменяет, не ошибочна.
:::

## prefer-render-shallow {#prefer-render-shallow}

**`warn`** · подсказка · только синтаксис · опция `templates`

Сообщает о `TestBed.createComponent` в файле спеки, который ни разу не читает отрендеренный шаблон.
`createComponent` компилирует шаблон и строит все дочерние компоненты, и так в каждом тесте. Спека,
которая только выставляет инпуты и проверяет состояние, платит за это и ничем не пользуется.
`renderShallow(X)` даёт тот же `TestBed` и тот же настоящий `ComponentFixture`, но без детей и с
пустым шаблоном.

```ts
const fixture = TestBed.createComponent(CartPage); // ❌ компилирует шаблон, строит всех детей
fixture.componentRef.setInput('items', items);
fixture.detectChanges();

expect(fixture.componentInstance.total()).toBe(42);
```

```ts
const { fixture } = renderShallow(CartPage); // ✅
// тот же TestBed, тот же настоящий ComponentFixture, детей нет, шаблон пуст;
// инпуты, сигналы, хуки жизненного цикла и DI остаются
```

**Опции.**

| Опция       | Тип                        | По умолчанию  | Смысл                                                                                                          |
| ----------- | -------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------- |
| `templates` | `'as-needed'` \| `'never'` | `'as-needed'` | `'as-needed'` сообщает о рендере, который никто не читает; `'never'` запрещает настоящие шаблоны в юнит-спеках |

При `'never'` правило сообщает о каждом `TestBed.createComponent` (читает файл DOM или нет), о каждом
`keepTemplate: true` и о каждом чтении DOM в спеке (по разу на инструкцию). Ещё оно сообщает об
`@Component`, объявленном в спеке с `template` или `templateUrl`, и о `template:`, переданном в
`renderShallow` / `prepareShallow`. Каждое из этих сообщений ведёт на
[Тестирование без DOM](/ru/guides/testing-without-the-dom). Форма с массивом задаёт и серьёзность:

```js
'vitest-auto-spy/prefer-render-shallow': ['warn', { templates: 'never' }], // или 'error', чтобы требовать
```

**Как исправить.** Замените рендер на `renderShallow(X)` из `vitest-auto-spy/angular`. Если проект
проверяет покрытие веток, учтите одно перед массовой заменой. Поверхностный рендер выводит
AOT-ветки компонента из покрытия до конца файла. Там, где эти ветки важны, оставьте по одному
настоящему рендеру на компонент; см. [renderShallow](/ru/adapters/angular).

- Компонент читает свой шаблон через `viewChild`, `contentChild` или проекцию контента? Или его
  поведение задаёт разметка (привязка события, блок `@defer`)? Тогда используйте
  `renderShallow(X, { keepTemplate: true })`. Шаблон останется, а дети всё равно уйдут.
- Конструктор читает состояние спаев, а каждый тест сначала их настраивает? Рендерите в каждом тесте
  и настраивайте в `beforeCreate`. Он выполняется после настройки модуля и до конструктора:

```ts
const render = (tune: () => void = () => undefined) =>
  renderShallow(SlidesComponent, {
    providers: [provideAutoSpy(StateService)],
    detectChanges: false,
    beforeCreate: () => {
      state = injectSpy(StateService);
      state.savedUi.mockReturnValue(DEFAULT_UI);
      tune();
    },
  });

it('restores the collapsed layout', () => {
  const { component } = render(() => state.savedUi.mockReturnValue(COLLAPSED_UI));
  // …
});
```

**Подсказка сворачивает настройку** в один вызов. Она предлагается только для такой формы, целиком в
одном блоке:

```ts
TestBed.configureTestingModule({ imports: [CardComponent, RouterStub], providers: [provideAutoSpy(Api)] });
api = injectSpy(Api);
fixture = TestBed.createComponent(CardComponent);
fixture.detectChanges();
```

```ts
fixture = renderShallow(CardComponent, { imports: [RouterStub], providers: [provideAutoSpy(Api)] }).fixture;
api = injectSpy(Api);
```

- В литерале могут быть только `providers` и `imports`, и в `imports` должен быть компонент. Из
  списка компонент убирается.
- Между двумя вызовами могут стоять только голые чтения `v = injectSpy(…)`. Они переезжают под
  рендер.
- `fixture.detectChanges()` сразу под рендером поглощается. Если его нет, вызов получает
  `detectChanges: false`, и ничего не рендерится раньше, чем прежде.
- Импорт сливается с уже существующим импортом из `vitest-auto-spy/angular`.
- Любая другая форма получает отчёт без правки. Это цепочка с `compileComponents()`, ключ, который
  `renderShallow` пишет иначе, настроенный спай между вызовами, комментарий, который правка удалила
  бы, и `createComponent` с двумя аргументами.

**Когда выключить.** Правило сообщает о цене, а не о дефекте. У листового компонента (без детей)
экономить нечего, так что там отчёт можно игнорировать. Проект, который решил переходить на
`renderShallow`, может поднять правило до `'error'`.

:::: details Как правило решает
**Что считается чтением шаблона.** Правило смотрит на идентификаторы **всего файла**, а не на
фикстуру, которую вернул вызов. Слова такие: `nativeElement`, `debugElement`, `elementRef`,
`hostElement`, `queryElement`, `querySelector`, `getComputedStyle`, `triggerEventHandler`,
`innerHTML`, `innerText`, `textContent`, `getAttribute`, `classList` и `shadowRoot`. Они ищутся
внутри имени идентификатора или члена (хелпер `nativeElementOf()` тоже считается). К ним добавляются
`By.css` и `By.directive`. Одно чтение где угодно глушит файл.

Считается только код. Комментарий, строковый или шаблонный литерал ничего не читают. Член, который
спека **объявляет**, а не читает, тоже ничего не читает: ключ `{ getAttribute: 'nope' }`, поле или
метод фейкового класса, член интерфейса. Поэтому файл они не глушат. Деструктуризация
`const { nativeElement } = fixture` и вычисляемый `el['textContent']` — это чтения, и они глушат.

**Почему весь файл.** Спека компонента часто держит фикстуру в `let`, заполняет её в `beforeEach` и
читает `debugElement` через три хелпера. Слежение за одной переменной это пропустило бы. А правило,
которое сообщает о половине случаев, хуже, чем никакого. Поэтому правило **намеренно недосообщает**:
оно никогда не утверждает, что спека ничего не читает, если она читает.

**Одна форма вычитается заранее.** Спека, которая подменяет `location` или `defaultView`, отдаёт
подставной `DOCUMENT`. Всё остальное он делегирует настоящему документу:
`querySelector: document.querySelector.bind(document)`. Каждый скопированный ключ — одно из слов
выше, и правило глохло ровно на том файле, ради которого существует. Отбрасывается только форма
`name: document.name`, и только там, где имена совпадают: это делегирование и ничего больше. Голый
`document.querySelector('.row')` по-прежнему считается. Так читают фикстуру, прикреплённую к
документу.

**При `{ templates: 'never' }`** поиск чтений не выполняется. Единственное исключение — файл, чей код
вызывает или импортирует `createDirectiveHost`. Директива навешивается на элемент, значит, кто-то
должен этот элемент отрендерить. Шаблон хоста — это обвязка теста, а не проверяемая разметка. Запрет
на него запретил бы тесты директив, в том числе тем способом, который советует этот пакет. Исключение
снимает отчёты и о хост-компоненте, и о чтениях DOM: тест директивы читает элемент, на который она
навесилась.

Сообщения при двух значениях разные. При `'as-needed'` правило не нашло чтения шаблона, и сообщение
так и говорит. При `'never'` правило вообще не ищет чтения. Там чаще всего срабатывает файл, который
больше всех читает шаблон, поэтому сообщение называет политику, а не утверждает что-то о файле.

**Знайте цену `'never'`.** На одном проекте `'never'` сделал красными **18 из 40** тестов в спеке
компонента. Покрытие упало со **100 % до 95,7 %**. Из отчёта ничего не исключалось: при
`templateUrl` скомпилированный шаблон отображается на `.html`, а glob покрытия `*.ts` его никогда не
захватывал. Перестал выполняться обычный TypeScript. Это тело метода, условие входа в который —
`viewChild` из шаблона. Этот код принадлежит самому компоненту, и никакая настройка покрытия его не
скроет. Проект, который берёт эту опцию, отказывается от порога 100 % по строкам для компонентов.

**Почему подсказка, а не `--fix`.** `renderShallow` сам вызывает `configureTestingModule`, добавляет
`NO_ERRORS_SCHEMA` и запускает первую проверку изменений. Для спеки, которая не читает разметку, это
правильный модуль, но не тот, что был в файле. Голая замена `TestBed.createComponent(X)` →
`renderShallow(X).fixture` оставляла перед ней собственный `configureTestingModule` спеки и каждый
`injectSpy` между ними. На 49 файлах она сломала 17 с ошибкой _Cannot configure the test module
when the test module has already been instantiated_. Кроме того, она рендерила раньше везде, где за
ней не шёл `fixture.detectChanges()`. `--fix` работает без присмотра по всему репозиторию. Подсказку
же принимают по одному вызову, с диффом перед глазами.

**Сколько это экономит.** На листовом компоненте — ничего. Два рендера занимают примерно одинаковое
время, а `overrideComponent` вызывает JIT-перекомпиляцию, которой лист раньше не платил. Чем глубже
дерево детей, тем больше экономия. Одно только опустошение шаблона даёт примерно **3,8×** на
компоненте со 100 детьми. Замеры — на странице [Производительность](/ru/core/performance).

**Серьёзность.** `warn`, и она закреплена. Она выбрана по _виду_ находки. Любое другое правило
называет что-то неверное или мёртвое. Это правило называет файл, который мог бы рендерить дешевле, а
это выбор проекта, не дефект. При `error` плагин навязывал бы этот выбор: **491 находка в 398 из
1759 файлов спек одного проекта**. На такой первый прогон каждый ответил бы собственным `warn`. `off`
был бы той же ошибкой с другой стороны.
::::

## prefer-set-inputs {#prefer-set-inputs}

**`warn`** · подсказка · только синтаксис

Сообщает о серии вызовов `fixture.componentRef.setInput('name', value)` на одной фикстуре. Angular
это имя ни с чем не сверяет. Опечатка или переименованный инпут даёт в лог `NG0303` и ничего не
меняет, а тест падает позже на постороннем состоянии. `setInputs` сначала проверяет каждое имя и
типизирует значения.

```ts
it('shows the updated title', async () => {
  fixture.componentRef.setInput('title', 'Hi'); // ❌ неизвестное имя — это NG0303 и никаких изменений
  fixture.componentRef.setInput('count', 2);
  fixture.detectChanges();

  expect(heading().textContent).toBe('Hi (2)');
});
```

```ts
it('shows the updated title', async () => {
  await setInputs(fixture, { title: 'Hi', count: 2 }); // ✅ каждое имя разрешено до первой записи

  expect(heading().textContent).toBe('Hi (2)');
});
```

**Опции.** Нет.

**Как исправить.** Замените серию одним `await setInputs(fixture, { … })`. Это делает подсказка:

- `detectChanges()` прямо под серией тоже уходит. `setInputs` ждёт `stable()`, а тот сбрасывает
  эффекты и ждёт фикстуру — это больше одного прохода проверки изменений.
- `detectChanges(false)` остаётся. Он пропускает проверку check-no-changes, а `stable()` её не
  пропускает.
- `await` делает колбэк `async`. Подсказка пишет это только в колбэк, которым владеет раннер (`it`,
  `test`, `beforeEach` и остальные, написанные напрямую). Внутри вашего хелпера или обёртки
  `waitForAsync(…)` вы получите отчёт без правки.
- Если ваш линт запрещает `async`-хуки, держите вызов в тесте:
  `const render = async () => { …; await setInputs(fixture, { … }); }`, и первым делом ждите его в
  каждом `it`.

**Когда выключить.** Под zone.js проверяйте каждую замену прогоном. `setInputs` ждёт `stable()`,
который начинается с `TestBed.tick()`. Под zone.js этот tick может войти в тот, который зона
планирует сама: `NG0101: ApplicationRef.tick is called recursively`. Поэтому здесь подсказка, а не
`--fix`, и поэтому правило `warn`. Проект без zone.js может поднять его до `'error'`.

::: details Как правило решает
**Один отчёт на серию,** на её первом вызове. Если `componentRef` один раз привязан к
`<fixture>.componentRef` (`const componentRef = fixture.componentRef` или `let`, который присваивает
хук), правило прослеживает его до фикстуры. Правка тогда называет эту фикстуру — при условии, что в
месте вызова это та же привязка.

**Правило читает только вызов и файл:**

- Приёмник должен читаться как `ComponentFixture`. Большую часть этого несёт `<name>.componentRef`.
  У голого `ComponentRef` (его отдаёт `ViewContainerRef.createComponent()`, и `setInputs` к нему не
  применим) нет `componentRef`. Остальное решает имя (`fixture`, `hostFixture`, `newFixture`) или
  единственное значение, которое даёт ему файл (`TestBed.createComponent(X)`,
  `renderShallow(X).fixture`, `render(X)`). Приёмник, который не опознаётся ни так, ни так, правило
  не трогает.
- Имя инпута должно быть строковым литералом. Вычисляемое имя нельзя записать ключом.
- Вызов должен быть отдельной инструкцией. Результат, который где-то используется, — это эффект,
  который правило не может учесть.
- Серия продолжается, пока инструкции идут подряд, без комментария между ними, на одной фикстуре и
  называют инпуты, которых в серии ещё не было. **Тот же инпут второй раз заканчивает серию:** спека
  говорит «а теперь оно меняется», и слияние дало бы дублирующийся ключ.

**Почему оно в recommended.** Опечатка, инпут, переименованный под спекой, или алиас, записанный
именем поля класса, — всё это кончается зелёными вызовами `setInput` и проверкой, которая падает
позже. На одном Angular-проекте замена 650 вызовов, которые правило умеет переписать, превратила **72
фикстуры, разошедшиеся со своей моделью, в ошибки компиляции — в 21 файле**. Среди них `{}` вместо
`CardActionExtra`, литерал в старой форме интерфейса и `imageUrl` у модели, где поле называется
`imgUrl`.

**Цена под zone.js, в замерах.** На проекте из 1771 файла принятие всех 451 подсказки переписывает
126 файлов. 105 из них по-прежнему проходят проверку типов, и **57 из этих 105 из зелёных становятся
красными**, каждый на `NG0101: ApplicationRef.tick is called recursively`. Это воспроизводится в две
строки: `componentRef.setInput(…)`, а за ним голый `TestBed.tick()`, без хелпера и без `await`.
Подходит ли правка как прямая замена, зависит от факта, которого не видно ни в одной спеке. В том же
проекте 53 из 504 находок стоят в хелпере или `waitForAsync` и правку не получают.

**Серьёзность.** `warn`, по цене исправления, а не по находке. Сама находка — факт без всяких догадок.
Но правило сообщает **504 раза в 140 файлах** на проекте, который зелёный под всеми правилами уровня
`error`. Переход на исправление — это миграция, которую проводят файл за файлом, как у
[`prefer-render-shallow`](#prefer-render-shallow).
:::

## no-overridden-provider {#no-overridden-provider}

**`error`** · подсказка (только для дубликатов) · только синтаксис

Сообщает о провайдере, которого заменяет более поздний провайдер того же токена. Замена бывает в том
же массиве или через `TestBed.overrideProvider` в том же наборе тестов. Angular оставляет
**последний** провайдер токена, поэтому более ранний не выполняется никогда. Спека при этом проверяет
подмену, которой у неё нет.

```ts
providers: [
  provideAutoSpy(DisplaySettingsService), // ❌ никогда не выполняется
  { provide: DisplaySettingsService, useValue: mockDisplaySettings }, // вот что отдаёт DI
];
```

```ts
providers: [provideAutoSpy(DisplaySettingsService)]; // ✅ оставьте один
```

**Опции.** Нет.

**Как исправить.** Сообщение говорит, какой у вас случай:

- **`duplicateProvider`:** два провайдера записаны одинаково. Удалите более ранний: Angular и так его
  игнорировал. Это делает подсказка. Сообщение называет токен и строку копии, которая выживает.
- **`overriddenByBarerProvider`:** выживший настроен _беднее_, чем тот, кого он хоронит. Перенесите
  настройку на выжившего провайдера или удалите выжившего. Здесь за вас ничего не удаляется, потому
  что весь вопрос в том, какой оставить:

  ```ts
  providers: [
    provideAutoSpy(AccountService, { gettersToSpyOn: ['plan'], instanceMethodsToSpyOn: ['refresh'] }),
    provideAutoSpy(AccountService), // ← именно его отдаёт DI
  ];
  ```

- **`noOverriddenProvider`:** два разных провайдера, побеждает более поздний. Оставьте тот, который
  имеете в виду. Сообщение даёт строку победившего провайдера.
- **`overriddenByTestBedOverride`:** провайдер заменяет `TestBed.overrideProvider` для того же токена.
  Удалите регистрацию или переопределение.

**Когда выключить.** О провайдерах с `multi: true` правило не сообщает никогда: Angular собирает их
все, а не оставляет последний. Не сообщает оно и о переопределениях во вложенном `describe`, о
переопределениях из хелпера и о `providers` уровня компонента (см. ниже).

::: details Как правило решает
**Один проход массива справа налево.** Angular оставляет последний провайдер. Значит, первая
встреченная регистрация токена выживает, а всё встреченное после неё мертво. Токен, зарегистрированный
трижды, даёт отчёты на первые два. Регистрацией считаются обе формы: объект с ключом `provide` и вызов
`provideAutoSpy` / `provideAutoSpyForToken`.

**Токены сравниваются как исходный текст.** В массиве `providers` токен пишут один раз, по имени,
рядом с его подменой. Два написания одного токена были бы пропущены, а одно написание двух токенов
дало бы ложный отчёт. На практике не бывает ни того, ни другого.

**«Беднее» считается по записям опций.** `provideAutoSpy(A, { gettersToSpyOn, instanceMethodsToSpyOn })`
даёт 2 против 0 у голого вызова.

**Случай `TestBed.overrideProvider`.** Регистрация лежит внутри `configureTestingModule`, а
переопределение — более поздняя инструкция. Поэтому правило собирает обе половины по файлу и
сопоставляет их в конце. Порядок не читается: переопределение побеждает провайдер модуля всегда, когда
выполняется. Случай держат узким три условия, и каждое понадобилось на реальном проекте:

- **Тот же набор тестов, сравнение по тождеству.** Переопределение внутри вложенного `describe`
  заменяет провайдер только для этого блока. Все остальные тесты по-прежнему получают регистрацию.
- **Переопределение написано прямо в `beforeEach` / `beforeAll`,** так что до него доходит каждый тест
  набора. Один файл переопределяет три токена из хелпера, который вызывают 3 из 34 тестов. Для
  остальных 31 работала регистрация.
- **Не массив `providers` под декоратором.** Такой массив принадлежит компоненту, объявленному в
  спеке. Дотянуться до провайдера уровня компонента — задокументированное применение
  `overrideProvider`.

Набор тестов, который вызывает `TestBed.resetTestingModule()`, исключён, как и в
[`no-inject-before-override`](#no-inject-before-override). О регистрации, которую уже похоронил
массив, правило сообщает один раз, а не два.

**`multi: true`.** Angular **накапливает** multi-провайдеры, поэтому второй такой — не
переопределение:

```ts
providers: [
  { provide: BEFORE_INIT, useValue: first, multi: true },
  { provide: BEFORE_INIT, useValue: second, multi: true }, // выполняются оба, в этом порядке
];
```

Спеке, которая проверяет, что хуки выполняются в порядке регистрации, нужны оба. `multi` читается как
«присутствует и не записан как `false`». Поэтому флаг, который правило не может разрешить
(`multi: isFeatureOn`), считается multi. Пропущенный отчёт ничего не стоит, а ложный стоит
комментария-disable над правильным кодом. Смешение двух режимов на одном токене по-прежнему
сообщается: Angular отвергает такую пару во время выполнения с
`Cannot mix multi providers and regular providers`.

**Почему оно в recommended.** Обе половины пары вводят в заблуждение. Автор верит, что там автоспай, и
пишет проверки под него (`calledWith`, метод, который есть у класса и нет у рукописного объекта). А DI
отдаёт рукописный объект. Тот, кто потом переводит этот объект, видит рядом `provideAutoSpy` и
считает, что работа сделана. Один файл спеки регистрировал восемь токенов сразу обоими способами.
Результат зависит от остального файла. Прочитайте токен через `injectSpy` — и прогон красный, с
[диагностикой, которая называет причину](/ru/adapters/angular). Прочитайте его через
`TestBed.inject` и проверяйте рукописную подмену — и всё проходит, хотя `provideAutoSpy` так и не
выполнился.

Первые данные с реальных проектов (20 отчётов на рабочем пространстве из 8 673 файлов) разделились
надвое. Большинство были буквальными дубликатами. Остальные хоронили настроенный провайдер под более
бедным. Поэтому сообщения и разделены.

**Границы.** Один массив за раз плюс вызовы переопределения в том же наборе тестов. Токен, который
предоставлен в `configureTestingModule` и ещё раз в собственных `providers` компонента, — другая
проблема. Её решает [`assertNoShadowedProviders`](/ru/adapters/angular-overrides). Массив `providers`,
собранный конкатенацией, и токен, записанный в двух записях по-разному, не сравниваются.
Переопределение, до которого доходят через хелпер, не сопоставляется. Так этот случай остаётся без
ложных отчётов.

**Почему правка дубликата — подсказка.** Прогон, который без присмотра удаляет строки массива
`providers`, — не то, что хочется обнаружить в диффе.

**Серьёзность.** `error`. Тест зелёный и неверный везде, где выжившая подмена случайно отвечает. На
одном проекте из 1759 файлов спек случай с переопределением сообщается 9 раз в 5 файлах. Каждый раз
это настроенный `provideAutoSpy(X, { … })`, похороненный под более бедным провайдером того же токена.
:::

## no-inject-before-override {#no-inject-before-override}

**`error`** · без автоисправления · только синтаксис

Сообщает о вызове, который создаёт тестовый модуль (`TestBed.inject()`, `injectSpy()`,
`renderShallow()` и другие), внутри `beforeAll` или `beforeEach`. Речь о наборе тестов, который ещё и
вызывает `TestBed.override*`. Как только модуль создан, каждый `override*` бросает ошибку.

```ts
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [provideAutoSpy(Api)] });
  asSpy(TestBed.inject(Api)).load.mockReturnValue(of(page)); // ❌ модуль уже создан
});

it('renders', () => {
  TestBed.overrideComponent(CartPage, { set: { imports: [] } }); // бросает ошибку
});
```

```ts
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [provideAutoSpy(Api)] });
});

it('renders', () => {
  TestBed.overrideComponent(CartPage, { set: { imports: [] } });
  injectSpy(Api).load.mockReturnValue(of(page)); // ✅ настроен после всех переопределений
});
```

**Опции.** Нет.

**Как исправить.** Два способа, оба есть в сообщении:

- Настройте спай внутри теста, после всех переопределений, как выше.
- Сделайте доступ ленивым, чтобы модуль создавался в первом тесте:
  `const api = () => injectSpy(Api);`.

**Когда выключить.** Правило не читает порядок. Поэтому оно сообщает и о наборе тестов, где порядок
случайно в порядке. Пример — `override*` в хелпере, который вызывается только из теста, сначала
сбрасывающего модуль. Ленивый доступ выше глушит правило честно.

::: details Как правило решает
**Что создаёт модуль:** `TestBed.inject`, `TestBed.createComponent`,
`TestBed.runInInjectionContext`, а также голые `injectSpy(…)` и `renderShallow(…)` этого пакета.
**Что переопределяет:** `overrideComponent`, `overrideDirective`, `overrideModule`, `overridePipe`,
`overrideProvider`, `overrideTemplateUsingTestingModule`, а также `overrideComponentProvider` этого
пакета, который сводится к `TestBed.overrideProvider`.

**Почему порядок не читается.** Порядок в коде — не порядок выполнения. `override*`, записанный выше
хука внутри хелпера, который вызывают тесты, всё равно выполняется после хука. Поэтому правило
спрашивает: «переопределяет ли этот набор тестов хоть что-то?» Одно исключение видно из исходника.
`override*` в том же теле хука, _до_ инъекции, действительно выполняется раньше. Набор тестов,
который вызывает `TestBed.resetTestingModule()`, исключён: это задокументированный способ сбросить
модуль.

**Внутри `beforeCreate` у `renderShallow` порядок читается,** потому что этот хук выполняется сверху
вниз до создания компонента. `injectSpy` выше `overrideComponentProvider` (или любого
`TestBed.override*`) в том же `beforeCreate` получает отдельное сообщение, где бы ни стоял рендер.
Переопределение внутри собственного `beforeCreate` рендера выполняется раньше, чем рендер что-либо
создаёт.

**Границы.** Проверка `injectSpy` ловит только голый вызов. Поэтому `injectSpy(moduleRef, token)` с
двумя аргументами из `vitest-auto-spy/nestjs`, который не трогает `TestBed`, не сообщается.

**Почему оно в recommended.** Переход на `provideAutoSpy` приводит прямо сюда. Рукописный
`{ provide: X, useValue: { m: vi.fn(() => 1) } }` задавал возвраты прямо в литерале. Замените его на
`provideAutoSpy(X)`, как просит [`prefer-provide-auto-spy`](#prefer-provide-auto-spy), — и класть их
станет некуда. Строка уезжает в `beforeEach`, и каждый `override*` в файле падает с
`Cannot override provider when the test module has already been instantiated`. Это касается и
переопределения, записанного _выше_ этой строки, внутри хелпера `createComponent`, который вызывают
тесты. Такое находили дважды после переездов, один раз сразу на шестнадцати тестах.

**Серьёзность.** `error`. Прогон красный, а его сообщение называет переопределение, а не хук, который
всё сломал.
:::

## no-dead-schemas {#no-dead-schemas}

**`error`** · без автоисправления · только синтаксис

Сообщает о `schemas` в `TestBed.configureTestingModule({ … })`, когда файл не объявляет ни одного
компонента. Схема действует только на `declarations` модуля. У standalone-компонента, подключённого
через `imports`, своя область видимости, поэтому схема не действует ни на что.

```ts
await TestBed.configureTestingModule({
  imports: [FooterComponent], // standalone, несёт свою область видимости зависимостей
  schemas: [NO_ERRORS_SCHEMA], // ❌ не действует ни на что
}).compileComponents();
```

```ts
await TestBed.configureTestingModule({
  imports: [FooterComponent], // ✅
}).compileComponents();
// затем добавьте недостающую директиву в imports самого standalone-компонента
// или отрендерите её через createDirectiveHost({ template, scope: [...] })
```

**Опции.** Нет.

**Как исправить.** Удалите запись `schemas`. Если что-то не разрешалось, добавьте недостающую
директиву в собственные `imports` standalone-компонента или отрендерите её через
`createDirectiveHost`. Импорт `NO_ERRORS_SCHEMA` удаляйте, только если в файле он больше нигде не
используется. Затем прогоните файл: зелёного линта мало (см. ниже).

**Когда выключить.** Не нужно. Переопределения и так вне правила: о схеме, добавленной в
`TestBed.overrideComponent` или `overrideModule`, правило не сообщает никогда.

::::: details Как правило решает
**Решает файл, а не вызов.** Angular склеивает подряд идущие вызовы `configureTestingModule` до
создания модуля. Поэтому `schemas` в одном хуке и `declarations` в другом — это одна живая
конфигурация. Правило собирает все литеральные конфигурации и молчит по всему файлу, как только
хоть одна из них что-то объявляет. Список, который нельзя посчитать (спред, имя, вызов хелпера),
читается как _присутствующий_, а не пустой. Иначе живая схема попала бы в отчёт только потому, что
объявления пришли через переменную. Читается только `TestBed.configureTestingModule` с объектным
литералом.

**Переопределения вне правила намеренно,** и тесты пакета это закрепляют. Схема, добавленная там,
компенсирует удаление, которое спека сделала нарочно:

```ts
TestBed.overrideComponent(TicketQrCode, {
  remove: { imports: [QRCodeComponent] }, // рисует на canvas; jsdom не умеет
  add: { schemas: [NO_ERRORS_SCHEMA] }, // поэтому оставшийся элемент надо простить
});
```

Уберите эту схему — и шаблон перестанет компилироваться. На одном проекте из 41 спеки, где вызов
переопределения соседствует со схемой, правило не сообщает ни об одном блоке переопределения. У
standalone-компонента живая схема проявляется как вмешательство в его собственные `imports`
(`set: { imports: [] }`, `set: { imports: [MockThing] }`, `remove: { imports: [X] }`), а не как
`declarations` модуля.

`remove: { imports: … }` тоже **не** читается как «этот файл что-то объявляет». В каждом таком файле
`schemas` уровня модуля тоже была мертва, и после её удаления спеки остались зелёными.

**Почему оно в recommended.** Ничего не заглушается, так что это не зелёный и неверный тест: то,
ради чего добавили схему, по-прежнему не разрешено. Цена — **ложное ощущение защиты**.
`NO_ERRORS_SCHEMA` — самый частый способ убрать `NG8001`, поэтому спека с ней читается как
«неизвестные элементы здесь прощены». В день, когда кто-то добавит `declarations`, та же строка
заработает, и опечатка в шаблоне тихо перестанет быть ошибкой. На одном Angular-проекте из 333
файлов, где упоминается схема, **230 записей в 204 файлах** мертвы.

Это статический двойник
[`enableAngularDiagnostics({ deadSchemas })`](/ru/adapters/angular-diagnostics#deadschemas).
Диагностика знает больше: она видит, что запись в `imports` действительно standalone-компонент. Но
она бросает ошибку внутри `it()`, поэтому список приходит по одному красному прогону за раз. Правило
отдаёт все 204 файла сразу, а по такому списку и планируют уборку.

::: warning Проверяйте удаление прогоном, а не зелёным линтом
Автоисправления нет намеренно. На одном проекте правило вычистило **85 файлов и 107 записей, и ни одна
спека не упала**. Единственная ошибочная правка ошиблась молча. Вместе с записью из отчёта удалили
строку `schemas:` внутри блока `overrideComponent`, потому что обе строки выглядят одинаково. Шесть
тестов упали на
`NG0303: Can't bind to 'collapsed' since it isn't a known property of 'present-button'`. Ни
компилятор, ни ESLint ничего не сказали.
:::

**Серьёзность.** `error`. Сегодня ничего не ломается. Правило позволяет спланировать уборку один раз,
а не находить её по одной опечатке в шаблоне.
:::::

## no-mistyped-use-value {#no-mistyped-use-value}

**`error`** · без автоисправления · **нужен `parserOptions.project`**

Сообщает о `{ provide: TOKEN, useValue }`, когда `TOKEN` — это `InjectionToken` примитивного типа, а
значение этому типу не подходит. Angular типизирует `useValue` как `any`, так что больше его ничто не
проверяет.

```ts
export const IS_PLATFORM_BROWSER = new InjectionToken<boolean>('IS_PLATFORM_BROWSER');

providers: [{ provide: IS_PLATFORM_BROWSER, useValue: {} }]; // ❌ компилируется, и {} истинно
providers: [{ provide: IS_PLATFORM_BROWSER, useValue: false }]; // ✅ значение того типа, что объявил токен
```

**Опции.** Нет. Правилу нужна информация о типах: `parserOptions.project` или `projectService`.

**Как исправить.** Передайте значение объявленного типа. Сообщение называет токен и оба типа,
например `IS_PLATFORM_BROWSER expects boolean, but useValue is {}`. Какое значение передать, решаете
вы.

**Когда выключить.** Не нужно. Токены объектного типа вне правила намеренно: их `useValue` обычно
частичная фикстура, а типизированный инструмент для неё — `createMock<T>()`. Их **ключи** проверяет
[`no-unknown-use-value-key`](#no-unknown-use-value-key), который никогда не сравнивает значения.
Токен-класс (`provide: SomeService`) остаётся за
[`prefer-provide-auto-spy`](#prefer-provide-auto-spy).

::: details Как правило решает
**Решает только тайпчекер.** Тип токена должен называться `InjectionToken`. Его аргумент типа
считается примитивным, когда каждый член объединения — строка, число, boolean, bigint, enum, литерал
одного из них, `null` или `undefined`. Дальше тайпчекер отвечает, присваивается ли в него тип
значения. Без программы или на TypeScript, чей тайпчекер не отдаёт `isTypeAssignableTo`, правило
молчит, а не гадает. Читается только объектный литерал, так что
`TestBed.overrideProvider(TOKEN, { useValue })` не читается.

**Почему оно в recommended.** Всё, что инжектит токен, получает значение как есть. Объект там, где
читается `boolean`, истинен. Спека идёт по ветке, которую собиралась выключить, и всё равно проходит.
На одном Angular-монорепозитории нашлось 259 провайдеров токенов примитивного типа в 179 файлах спек.
2 из них с неверным типом, и оба — этот самый `{}` для `boolean`-токена.

**Серьёзность.** `error`. Правило решает по факту: тайпчекер говорит, что значение не подходит под
объявленный тип. В `configs.typeErrors` его нет, потому что `useValue` — это `any` и находка
компилируется.
:::

## no-unknown-use-value-key {#no-unknown-use-value-key}

**`error`** · без автоисправления · **нужен `parserOptions.project`**

Сообщает о каждом ключе объектного `useValue`, которого нет у предоставляемого типа. Предоставляемый
тип — это `T` для `InjectionToken<T>` или тип экземпляра для класса. Опечатанный или переименованный
ключ остаётся в фикстуре, код читает настоящий член, а спека остаётся зелёной над фикстурой, которую
никто не читает.

```ts
providers: [{ provide: ActivatedRoute, useValue: { queryParams$: of({ id: '1' }) } }]; // ❌ такого члена нет
providers: [{ provide: ActivatedRoute, useValue: { queryParams: of({ id: '1' }) } }]; // ✅ член, который читает код
```

**Опции.** Нет. Правилу нужна информация о типах: `parserOptions.project` или `projectService`.

**Как исправить.** Используйте настоящее имя члена или удалите ключ. Сообщение называет ключ,
предоставляемый тип и токен. Чтобы компилятор проверял всю подмену, используйте
`provideAutoSpy(X, { overrides })`, `provideAutoSpyForToken(TOKEN, { … })` или `createMock<T>({ … })`.

**Когда выключить.** Не нужно. Правило молчит там, где тип ничего не говорит о ключах: `any`,
`unknown`, `object`, `{}`, примитивный токен (это случай
[`no-mistyped-use-value`](#no-mistyped-use-value)), массив и любой член с индексной сигнатурой, в том
числе с шаблонной.

::: details Как правило решает
**Только ключи.** Предоставляемый тип раскладывается на члены объединения. `null`, `undefined` и
прочие примитивные члены отбрасываются. Ключ считается известным, если свойство с таким именем есть
хотя бы у одного оставшегося члена (`getPropertyOfType`; приватные члены и члены `Object.prototype`
считаются). **Значения не сравниваются никогда.** Подходит ли `apiUrl: 42` под `string`, намеренно не
проверяется: `useValue` обычно частичная фикстура.

**Границы.** Спред не добавляет ключей в проверку, вычисляемый ключ пропускается. Провайдер с
`multi: true` правило не трогает: его значение — один элемент того, что отдаёт токен. Читается только
литерал, записанный прямо в `useValue`. Литерал за именем, за `as` или в дескрипторе
`TestBed.overrideProvider(X, { useValue })` не читается. Без программы или на тайпчекере без
`getPropertyOfType` / `getIndexInfosOfType` правило молчит.

**Почему оно в recommended.** В проекте примерно из 1 760 файлов спек около 870 объектных литералов
`useValue`: 375 у провайдеров-классов и 495 у токенов. Ручной пересчёт 434 литералов для классов нашёл
два ключа, которых у класса нет. Один из них — `queryParams$` у `ActivatedRoute`, под проходящей
спекой. Проверка только ключей держит находки на таком уровне, а не на сотнях, которые дала бы
проверка значений.

**Серьёзность.** `error`. Правило решает по факту: тайпчекер говорит, что такого члена у типа нет. В
`configs.typeErrors` его нет, потому что `useValue` — это `any` и находка компилируется.
:::

## no-instance-lifecycle-spy {#no-instance-lifecycle-spy}

**`warn`** · без автоисправления · только синтаксис

Сообщает о `vi.spyOn(component, 'ngOnInit')` и о том же для других хуков жизненного цикла, когда цель
— экземпляр. Angular вызывает хук, который прочитал с прототипа класса при создании компонента. Спай,
поставленный на экземпляр позже, он не вызывает никогда. Поэтому проверка не пройдёт никогда, а
заглушка никогда не выполнится.

```ts
const fixture = TestBed.createComponent(CardComponent);
vi.spyOn(fixture.componentInstance, 'ngOnInit').mockImplementation(() => undefined); // ❌ не выполнится
fixture.detectChanges();
```

```ts
const init = vi.spyOn(CardComponent.prototype, 'ngOnInit').mockImplementation(() => undefined); // ✅
const fixture = TestBed.createComponent(CardComponent);
fixture.detectChanges();

expect(init).toHaveBeenCalledTimes(1);
```

**Опции.** Нет.

**Как исправить.** Ставьте спай на прототип до создания компонента, как выше. А лучше проверяйте, что
хук делает, а не то, что он вызвался.

**Когда выключить.** Спай на экземпляре работает в двух случаях. По одному файлу правило не может их
отличить, поэтому оно `warn`:

- спека сама вызывает хук, `component.ngOnInit()`, а потом проверяет спай;
- инжектор уничтожает **сервис** и вызывает его `ngOnDestroy` на экземпляре.

Там используйте disable на одну строку.

::: details Как правило решает
**Только вызов.** Правило сообщает о `vi.spyOn(target, hook)` или `jest.spyOn(target, hook)`, когда
`hook` — строковый литерал с именем `ngOnInit`, `ngOnDestroy`, `ngDoCheck`, `ngAfterContentInit`,
`ngAfterContentChecked`, `ngAfterViewInit` или `ngAfterViewChecked`, а `target` — не прототип.
`X.prototype` и `Object.getPrototypeOf(x)` — прототипы, их правило не трогает. `ngOnChanges` в списке
нет: Angular вызывает его как `this.ngOnChanges(changes)`, и спай на экземпляре до него доходит.

**Почему оно в recommended.** `expect(component.ngOnInit).toHaveBeenCalled()` после
`fixture.detectChanges()` не пройдёт никогда, а заглушка через `.mockImplementation` никогда не
выполнится. В одном проекте настоящий `ngOnInit` продолжал работать под хуком, который спека считала
заглушённым.

**Серьёзность.** `warn`: правило решает по догадке, а не по факту.
:::

## no-compile-components {#no-compile-components}

**`error`** · подсказка · только синтаксис · **молчит, пока нет `{ builder: 'inline-resources' }`**

Сообщает о `compileComponents()`, когда ваш билдер уже встраивает шаблоны и стили компонентов. Вызов
нужен, чтобы подтянуть `templateUrl` / `styleUrls` во время прогона. Под таким билдером он ничего не
ждёт. Правило молчит, пока вы не зададите опцию.

```ts
beforeEach(async () => {
  await TestBed.configureTestingModule({ imports: [CardComponent] }).compileComponents(); // ❌ ничего не ждёт
});
```

```ts
beforeEach(() => {
  TestBed.configureTestingModule({ imports: [CardComponent] }); // ✅
});
```

**Опции.**

| Опция              | Тип                  | По умолчанию | Смысл                                                                                          |
| ------------------ | -------------------- | ------------ | ---------------------------------------------------------------------------------------------- |
| `builder`          | `'inline-resources'` | не задана    | говорит, что билдер встраивает шаблоны и стили; без неё правило ни о чём не сообщает           |
| `ignoreComponents` | `string[]`           | `[]`         | имена классов компонентов с блоком `@defer`; спека, которая называет один из них, пропускается |

```js
'vitest-auto-spy/no-compile-components': ['error', { builder: 'inline-resources' }],
```

Встраивают ресурсы тестовые билдеры Angular CLI, `jest-preset-angular` и прелоад
[`bun-angular`](/ru/runtimes/bun-angular) этого пакета. При JIT-настройке, которая читает файлы
шаблонов во время прогона, вызов нужен. Там опцию не задавайте.

**Как исправить.** Удалите вызов. Это делает подсказка. Она убирает вызов (всю инструкцию, если
остаётся только `TestBed`). Ещё она убирает `async` у колбэка `beforeEach` / `beforeAll` /
`afterEach` / `afterAll` / `it` / `test`, который больше ничего не ждёт. Подсказка предлагается
только там, где вызов стоит отдельной инструкцией. Цепочка `.then(…)`, возвращённый или сохранённый
промис и стрелка с телом-выражением получают отчёт без правки: каждый из них пользуется промисом.

**Когда выключить.** Оставьте вызов для компонента, в шаблоне которого есть блок `@defer`. Такой
компонент несёт **асинхронные метаданные класса**, и `TestBed` разрешает их именно в этом вызове, что
бы билдер ни сделал с шаблоном. Без вызова тест падает:

```
Error: Component 'BackgroundContentComponent' has unresolved metadata.
Please call `await TestBed.compileComponents()` before running this test.
```

Правило этого не видит: `@defer` лежит в шаблоне компонента, в другом файле. Перечислите такие
компоненты в `ignoreComponents`. Это подходит и проекту, который запрещает disable-комментарии:

```js
'vitest-auto-spy/no-compile-components': ['error', { builder: 'inline-resources', ignoreComponents: ['CardComponent'] }],
```

Или оставьте один вызов с причиной:

```ts
// eslint-disable-next-line vitest-auto-spy/no-compile-components -- @defer: async class metadata
await TestBed.compileComponents();
```

Если в проекте несколько билдеров, ограничьте опцию файлами, которые компилирует встраивающий билдер.

::: details Как правило решает
**Сначала опция, дальше только вызов.** Когда опция задана, правило сообщает о каждом вызове
`….compileComponents()`: на `TestBed`, на цепочке `configureTestingModule(…)` или на имени. Делает ли
вызов что-нибудь — это факт о **сборке**, а его не видно ни в одном файле спеки. Поэтому правило ждёт
опцию, так же как правила с типами ждут программу.

**`ignoreComponents`.** Имя ищется как целое слово в любом месте спеки. Поэтому пропускается и файл,
который импортирует компонент ради проверки чего-то другого. Список — для нескольких
`@defer`-компонентов, а не каталог.

**Почему не сужать по форме вызова.** В сломавшихся файлах оказался
`await TestBed.compileComponents();` на отдельной строке, а не в цепочке после
`configureTestingModule(…)`. Но это разница в стиле, а не довод. Правило, пропускающее отдельную
форму, упустило бы обычный лишний вызов и всё равно сообщило бы о `@defer`-спеке, написанной цепочкой.

**Почему оно в recommended.** Не ради скорости: на standalone AOT-стенде вызов стоит 0,005 мс. Ради
того, что строка говорит следующему читателю. Каждый хук, который её ждёт, читается как «эта спека
грузит шаблоны во время прогона». Каждый `async`, который она вынуждает, делает синхронную настройку
похожей на асинхронную. На одном Angular-проекте из 1759 файлов спек правило сообщает о 449 вызовах в
411 файлах, из них 435 с правкой. На другом, из 1862 файлов спек, `compileComponents()` вызывают 410
файлов. Удаление всех вызовов сломало ровно `@defer`-файлы.

**Почему подсказка, а не `--fix`.** Без `await` следующая инструкция выполняется на одну микрозадачу
раньше. Кроме того, текст самой подсказки называет исключение `@defer`: при массовой правке читают
этот текст, а не сообщение.

**Серьёзность.** `error`, и по умолчанию правило молчит, пока вы не скажете, какой у вас билдер.
:::

## no-relative-mock-under-builder {#no-relative-mock-under-builder}

**`error`** · без автоисправления · только синтаксис · опция `builder` · **молчит, пока файл не запускает билдер**

Сообщает о `vi.mock('./x')` и родственных вызовах с относительным путём в спеке, которую запускает
Angular-билдер `@angular/build:unit-test`. Билдер заставляет эти вызовы падать на любом пути,
который начинается с `.` или `/`. Ни одна опция билдера этого не снимает.

```ts
vi.mock('./cart.service'); // ❌ The "vi.mock" and related methods are not supported for relative imports
```

```ts
TestBed.configureTestingModule({ providers: [provideAutoSpy(CartService)] }); // ✅
```

**Опции.**

| Опция     | Тип           | По умолчанию | Смысл                                                                                   |
| --------- | ------------- | ------------ | --------------------------------------------------------------------------------------- |
| `builder` | `'unit-test'` | не задана    | говорит, что эти спеки запускает билдер unit-test, когда правило не находит таргет само |

```js
'vitest-auto-spy/no-relative-mock-under-builder': ['error', { builder: 'unit-test' }],
```

**Как исправить.** Подменяйте зависимость через `TestBed`, а не через граф модулей:
`provideAutoSpy(X)` в `providers` или `overrideComponentProvider(Component, CartService)` для
собственного провайдера компонента. Подробнее —
[Относительный путь заблокирован, и навсегда](/ru/guides/angular-unit-test-builder#a-relative-path-is-blocked-permanently).

**Когда выключить.** Не нужно. Спека, которую запускает только `npx vitest`, может мокать
относительный путь, и правило о ней не сообщает.

::: details Как правило решает
**Что сообщает:** `vi.mock`, `vi.doMock`, `vi.importMock`, `vi.unmock` или `vi.doUnmock` (на `vi` или
`vitest`) со спецификатором, который начинается с `.` или `/`. Спецификатор может быть строкой,
статическим шаблонным литералом или `import('…')`.

**Запускает ли файл билдер.** Правило ищет так же, как
[`no-redundant-mock-reset`](#no-redundant-mock-reset). Оно ищет таргет `@angular/build:unit-test` или
`@nx/angular:unit-test` в `angular.json`, `workspace.json`, `project.json` или в `targetDefaults`
файла `nx.json`. Проект таргета должен содержать линтуемый файл. Если таргет не найден, правило
ничего не сообщает. Если поиск не видит ваш воркспейс, задайте `{ builder: 'unit-test' }`.

**Границы.** Алиас путей из tsconfig (`@app/cart`) проходит мимо проверки билдера: падения нет, а мок
молча игнорируется. Мимо этого правила он тоже проходит: правило не читает `paths`.

**Почему оно в recommended.** Строка падает при сборе файла, и ничто не снимает эту защиту.

**Серьёзность.** `error`. Там, где правило сообщает, падает собственный патч билдера.
:::

## no-disabled-testbed-teardown {#no-disabled-testbed-teardown}

**`error`** · без автоисправления · только синтаксис

Сообщает о `destroyAfterEach: false`. С выключенным teardown фикстура переживает свой тест.
`ngOnDestroy` не выполняется никогда, подписки и таймеры продолжают срабатывать в следующих тестах, а
DOM и память растут вместе с прогоном.

```ts
getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting(), {
  teardown: { destroyAfterEach: false }, // ❌
});
```

```ts
getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting()); // ✅ значение Angular по умолчанию
```

**Опции.** Нет.

**Как исправить.** Удалите строку: `true` — значение Angular по умолчанию с v13. Потом почините
упавшие тесты: они читали остатки предыдущего теста.

**Когда выключить.** Не нужно. Учтите: конфиг, ограниченный `**/*.spec.ts`, не линтит ваш
setup-файл. Добавьте setup-файл в `files` этого правила.

::: details Как правило решает
Правило сообщает о `destroyAfterEach: false`, где бы он ни был записан: в `initTestEnvironment` в
setup-файле или в `teardown` одного `configureTestingModule`. Ключ в кавычках тоже считается.

**Серьёзность.** `error`. Улика — сам литерал, и обычно это одна строка на проект.
:::

## no-sync-testbed-await {#no-sync-testbed-await}

**`error`** · подсказка · только синтаксис

Сообщает об `await` перед вызовом TestBed, который возвращает сам TestBed или фикстуру, а не промис.
Такой `await` ничего не ждёт. Зато следующий читатель идёт искать асинхронную настройку, которой нет.

```ts
beforeEach(async () => {
  await TestBed.configureTestingModule({ imports: [CardComponent] }); // ❌ ждём сам TestBed
});
```

```ts
beforeEach(() => {
  TestBed.configureTestingModule({ imports: [CardComponent] }); // ✅
});
```

**Опции.** Нет.

**Как исправить.** Уберите `await`, а также `async` у колбэка, если ему больше нечего ждать.
Подсказка делает и то и другое для `beforeEach` / `beforeAll` / `afterEach` / `afterAll` / `it` /
`test`. Если убрать только `await`, хук по-прежнему выглядит асинхронным.

Эти вызовы TestBed действительно возвращают промис и сохраняют свой `await`: `compileComponents()`, а
на фикстуре — `whenStable()`, `whenRenderingDone()` и `getDeferBlocks()`.

**Когда выключить.** Не нужно. О `TestBed.inject(TOKEN)` и `TestBed.runInInjectionContext(fn)`
правило не сообщает никогда. Каждый возвращает то, что держит токен или колбэк, а это может быть
промис.

::: details Как правило решает
**Вызовы:** `configureTestingModule`, `overrideComponent`, `overrideDirective`, `overrideModule`,
`overridePipe`, `overrideProvider`, `overrideTemplate`, `overrideTemplateUsingTestingModule` и
`resetTestingModule` возвращают сам `TestBed` (поэтому они и складываются в цепочку).
`createComponent` и `getLastFixture` возвращают `ComponentFixture`. Ни один из них не thenable,
поэтому правилу не нужна информация о типах.

**Получателем** может быть `TestBed`, `getTestBed()`, цепочка этих вызовов или имя, которое файл
сводит к одному из них. Правило разбирает цепочку по звеньям, а не только по первому слову. Звеном
считается только член, который Angular объявляет возвращающим `TestBed`. Поэтому о
`TestBed.inject(Api).createComponent(x)` правило не сообщает, хотя цепочка начинается с `TestBed`:
этот `createComponent` — метод коллаборатора. Получателя, которого файл не сводит к одному значению
(имя с двумя присваиваниями, результат хелпера), правило не трогает.

**Почему оно в recommended.** Эта форма прячется за вызовом, который действительно возвращал промис.
На Angular-проекте из 1862 спек-файлов [`no-compile-components`](#no-compile-components) убрало 448
вызовов `compileComponents()` из 410 файлов. Под ними обнаружились 18 `await` на значении, которое
никогда не было промисом, и 33 хука, оставшихся `async` без единого ожидания. Цена — не микрозадача.
Каждый читатель принимает `await` за доказательство, что настройка асинхронная.

Потом правило дважды прогнали по другому проекту. На его последнем коммите (1759 спек-файлов, 411 из
них ещё вызывают `compileComponents()`) оно сообщает **14 раз в 10 файлах**, и у каждой находки есть
правка. Это `await TestBed.resetTestingModule()` и цепочки `configureTestingModule(…)`, которые
кончаются на `overrideComponent` или `overrideProvider`. На том же дереве, где 448 вызовов убраны и
починены, оно не сообщает **ничего**. Ни одного ложного срабатывания на 1759 файлах в обоих случаях.

**В сравнении с `@typescript-eslint/await-thenable`.** То правило говорит «Unexpected `await` of a
non-Promise (non-"Thenable") value» и оставляет вам выяснять почему. Ему ещё нужен
`parserOptions.project`, который есть не в каждом проекте. Включите оба — получите два сообщения на
одной строке и в одной колонке. Любое из них отключается одной строкой конфига. Разница в правке:
штатная подсказка убирает `await` и останавливается, хук остаётся `async`. Тогда
`@typescript-eslint/require-await` сообщает о нём на **следующем** прогоне. До этого оно молчит,
потому что в `async`-функции ещё есть `await`.

**Границы.** О `TestBed.inject` и `TestBed.runInInjectionContext` правило сознательно не сообщает. В
проекте выше четыре вызова `await TestBed.inject(…)` действительно ждут промис. Чтобы решать такие
случаи, нужен тайпчекер, а это работа `await-thenable`. Колбэк, у которого подсказка снимает `async`,
сохраняет явный тип возврата `: Promise<void>`, если он был. После этого код не компилируется. Поэтому
правка — подсказка, как у `no-compile-components`.

**Серьёзность.** `error`. Правило решает по опубликованным сигнатурам Angular, а не угадывает, и
починка механическая.
:::

## no-private-member-access {#no-private-member-access}

**`error`** · без автоисправления · **нужен `parserOptions.project`** для двух из трёх форм

Сообщает, когда спека читает `private`- или `protected`-член. Тогда тест закрепляет член, который
класс никому не обещал. Переименование ломает только тест, а сам тест ничего не доказывает о том, что
может вызывающий код.

```ts
expect(component['recalculate']()).toBe(3); // ❌
(component as any).recalculate(); // ❌
vi.spyOn(Object.getPrototypeOf(component), 'recalculate'); // ❌
```

```ts
component.onResize(); // ✅ публичный вызов, который до него добирается
expect(component.total()).toBe(3); // ✅ и его эффект
```

**Опции.** Нет. Двум формам из трёх нужна информация о типах: `parserOptions.project` или
`projectService`.

**Как исправить.** Прогоните член через публичный API, который его использует, и проверьте эффект.

- У компонента публичная сторона, ради которой существует `protected`, — отрендеренный шаблон:
  `renderShallow(Cmp)` и читайте DOM.
- `protected`-сигнал, который компонент передаёт дочернему: отрендерите дочерний компонент как
  `createComponentStub` и прочитайте его input со стаба. Сигнал, которым спека должна управлять:
  `mockSignalProp(component, 'x', value)`, он дотягивается и до `protected`-сигнала.
- Если до члена не добирается ничто публичное, член должен либо стать публичным, либо переехать в
  коллаборатора, которого спека может заменить подменой.

Хелпера `readPrivate(instance, 'x')` нет намеренно: он узаконил бы ровно то, ради чего есть правило.

**Когда выключить.** Без информации о типах две формы из трёх не сообщают ничего. Это выглядит в
точности как чистый файл. Запустите `npx eslint --print-config` на спеке, прежде чем решить, что ваши
спеки чисты. Если у приватного члена действительно нет наблюдаемого эффекта, допустимо отключение на
строку с причиной. Это лучше, чем обход из [`no-reflect-member-access`](#no-reflect-member-access).

::: details Как правило решает
**Три формы:**

- `instance['member']`;
- `(instance as any).member`, а также варианты с двойным кастом и подставным типом:

  ```ts
  (service as any).privateMember;
  (service as unknown as { privateMember: T }).privateMember;
  (service as DecoyDeclaredInTheSpec).privateMember;
  ```

- `vi.spyOn(Object.getPrototypeOf(instance), 'member')`.

**Тайпчекер и есть правило.** Те же скобки — обычный и частый код:
`process.env['APP_FEATURE_ENABLED']`, `dataset['error']`, `queryParams['id']` маршрута,
`req.headers['x-request-id']`, `form.controls['profileName']`, `errors?.['required']` — всё это
индексные сигнатуры. Поэтому правило ничего не сообщает, пока чекер не разрешит имя в член класса с
одним из двух модификаторов. Без информации о типах правило не сообщает ничего и не откатывается к
синтаксису. Типозависимое правило, которое деградирует до синтаксиса, — то же шумное правило под
другой маской.

**Как оно разрешает:**

- через **тип объекта**, а не через сам доступ по элементу: для `a['b']` тот не отвечает ничего;
- имя члена берётся из **типа** ключа, а не из исходного текста. `const KEY = 'secret';
card[KEY]` разрешается так же, как строка на месте. `card[key]`, где `key` — обычный `string`, не
  разрешается ни во что и считается индексным чтением;
- модификатор читается **текстом** из объявления TypeScript. Поле `accessibility` из ESTree покрывает
  только линтуемый файл, а класс под тестом почти всегда объявлен в другом файле. Версия на этом поле
  не сообщала ничего на реальной форме и при этом проходила каждый однофайловый тест.

**Касты.** **Точечный** доступ разрешается, только если перед ним стоит каст. Без каста его уже
проверил компилятор, и это же держит правило подальше от каждого `a.b` в файле. Цепочка кастов
обходится до самого низа. Середина `service as unknown as { hidden: T }` — это `unknown`, и она не
отвечает ничего. Поэтому правило читает член из выражения, которое ещё несёт настоящий тип.

**Форме через прототип типы не нужны**, она работает без программы: `Object.getPrototypeOf`
типизирован как `any`, и доступ через него однозначен. К тому же это подмена хуже, чем кажется. Она
патчит прототип, поэтому её видит каждый экземпляр в воркере. Вернуть всё на место может только
`vi.restoreAllMocks()`.

**Почему без типов нельзя — в числах.** На 1759 спек-файлах Angular синтаксическая версия (каждый
`obj['literal']`) сообщает о **511 местах в 85 файлах**. Из них **324 в 45 файлах** разрешаются в
`private`- или `protected`-член. Остальные **187 (37 %)** — корректный код, а **в 41 из 85 файлов
приватного доступа нет вообще**. Обычный grep ещё хуже: около 1726 скобочных чтений на те же 324
находки. Вместе с двумя другими формами (50 кастов в 10 файлах, 9 спаев через прототип) выходит
**383 находки в 55 файлах**, 204 из них в двух файлах.

**Почему доступ по скобкам компилируется.** Это не лазейка, которую забыл TypeScript. Через скобки
читают индексную сигнатуру, поэтому проверка видимости действует только для точечной формы.

**Падение, которое правило гасит.** Запрос типа заставляет компилятор проверить файл, а сборка одного
из его сообщений об ошибке может бросить исключение. На TypeScript 6.0.3 сообщение, которое называет
символ из другого модуля, падает в `getLocalModuleSpecifier`, когда у программы нет ни `paths`, ни
`baseUrl`. Это в точности изолированная программа, к которой откатывается `@typescript-eslint/parser`
в режиме single-run. Правило ловит исключение и молчит. Правило, которое пробрасывает исключение,
роняет весь прогон линтера вместе с находками всех остальных правил.

**Серьёзность.** `error`. Тест зелёный и неверный так, что ни один прогон об этом не скажет: он
проходит сегодня и падает на переименовании, которого не заметил бы ни один вызывающий.
:::

## no-reflect-member-access {#no-reflect-member-access}

**`error`** · подсказка на одной из трёх форм · синтаксис и области видимости

Сообщает о `Reflect.get(subject, 'member')` и `Reflect.set(subject, 'member', value)` со строковым
ключом, когда субъект — значение, которое держит спека: компонент, сервис, фикстура, подмена. Это тот
же обход, что `component['x']`, только ключ не проверяет вообще никакой компилятор.

```ts
expect(Reflect.get(component, 'minDwellTime')()).toBe(0); // ❌ ключ — строка, которую никто не проверяет
Reflect.set(service, 'savedData', null); // ❌ а это даже не пишет в член
```

```ts
await setInputs(fixture, { seconds: 0 }); // ✅
expect(host.textContent).toContain('0 min'); // публичная сторона, ради которой член и существует
```

**Опции.** Нет.

**Как исправить.** Зависит от того, что за субъект. Сообщение говорит, какой у вас случай:

- **Класс под тестом:** прогоните член через публичный API, как в
  [`no-private-member-access`](#no-private-member-access).
- **Подмена, которую построила эта библиотека** (через `injectSpy`, `provideAutoSpy`,
  `provideAutoSpyForToken`, `createSpyFromClass` и остальные): используйте
  `mockValueProp(double, 'prop', value)`. Он делает ту же запись и регистрирует откат в
  `restoreMockedProps()`. Подсказка пишет именно его.
- **Объект-фикстура, который написала спека:** поставьте ключ в литерал, где его проверяет компилятор.
  Если значение нарочно вне объявленного типа, чтобы дойти до запасной ветки, кастуйте **значение**:
  `{ linkType: value as Model['linkType'] }`. Если в проекте запрещены утверждения типов
  (`@typescript-eslint/consistent-type-assertions: ['error', { assertionStyle: 'never' }]`),
  используйте `mockValueProp(link, 'linkType', value)`. Его свободная перегрузка принимает значение
  вне объявленного типа, а запись откатывается после теста.
- **Приватный член без всякого наблюдаемого эффекта:** меньший из обходов — `component['member']` под
  отключением `no-private-member-access` с причиной. Ключ остаётся там, где его видит компилятор.

**Когда выключить.** Не нужно. О вычисляемом ключе правило не сообщает никогда
(`Reflect.get(component, method)` в хелпере, который получает имя параметром). Как и о
`Reflect.apply`, `Reflect.has`, `Reflect.deleteProperty` или `Reflect.construct`.

::: details Как правило решает
**Цель.** Голое имя должно разрешаться в объявление в линтуемом файле, которое не сделал `import`.
Всё остальное, например цепочка членов или результат вызова, — значение, которое вычислил файл, и
оно считается субъектом. Имя, которое спека объявляет как `Window` или `typeof globalThis`
(`let win: Window` с внедрённым `WINDOW`), — это окружение под другим именем. Правило его не трогает,
как и `window`. Имя, которое ввёл `import`, тоже не трогает: пространство имён модуля — ничей не
субъект, а патчить его — дело `vi.mock`. Пространство имён, которое спека кладёт в собственный `let`
через `await import(…)`, — локальный биндинг, и о нём правило **сообщает**. Ключ должен быть
строковым литералом.

Тайпчекер правило не спрашивает намеренно. К этой форме проект тянется ровно там, где чекер бы
возразил.

**Почему оно в recommended.** Это второй обход
[`no-private-member-access`](#no-private-member-access), и его не охраняет ни один компилятор.
`component['x']` хотя бы оставляет член там, где его разрешит правило с типами.
`Reflect.get(component, 'x')` принимает имя обычным строковым аргументом с типом `any`. Поэтому
мнения нет ни у компилятора, ни у проверки шаблонов, ни у строгого прохода `tsc`. В проекте, на
котором это мерили, собственный запрет двойных кастов в `no-restricted-syntax` называл
`Reflect.get` / `Reflect.set` выходом. Итог: **214 мест в 50 из 2 030 спек-файлов**, 125 чтений,
85 записей и 4 в форме с подменой.

**`Reflect.set` переживает то, что проверяет.** Он ставит **собственное** свойство поверх прототипа,
а не пишет в член. Переименуйте поле в продакшен-коде, и спека продолжит компилироваться, выполняться
и писать **мёртвое** свойство, которое никто не читает. А `expect(spy).not.toHaveBeenCalled()` под
ним будет проходить вечно. В замеренном проекте два таких места нашлись чтением кода, а не прогоном.

**Единственная правка.** `Reflect.set` на подмене из библиотеки патчит её за спиной библиотеки: ни
записи, ни отката. Патч остаётся жив для каждого следующего теста файла, а при `isolate: false` — для
каждого следующего файла воркера. Исправление — подсказка, а не `--fix`, по той же причине, что у
[`no-object-define-property`](#no-object-define-property). Регистрация отката меняет то, что
происходит между тестами. В этом и смысл, но это всё же изменение.

**Серьёзность.** `error`, намеренно не ниже, чем у близнеца. `no-private-member-access` — `error`.
Будь это правило `warn`, `Reflect.get` стал бы одобренным способом заглушить то. Вся улика — в
строке, а починка — та, которую называет то правило.
:::

## no-mocked-for-spy {#no-mocked-for-spy}

**`error`** · `--fix`, где файл это решает, иначе подсказка · только синтаксис · в `configs.typeErrors`

Сообщает о `Mocked<T>` или `MockedObject<T>` в любой типовой позиции. `Mocked<T>` сохраняет
приватные члены `T`. Поэтому присваивание спая не компилируется, а ошибка перечисляет приватные поля
и ни разу не называет `Mocked`.

```ts
import { Mocked } from 'vitest';

let cart: Mocked<CartService>; // ❌ TS2322, как только присвоен спай
```

```ts
import type { Spy } from 'vitest-auto-spy';

let cart: Spy<CartService>; // ✅ то, что пишет --fix
```

**Опции.** Нет.

**Как исправить.** Переименуйте `Mocked` в `Spy`. `--fix` делает это там, где может доказать, что
переименование — вся правка. В остальных местах редактор предлагает ту же правку подсказкой:

- **`--fix`:** аннотация на параметре, типе возврата или касте. А также переменная, каждое значение
  которой приходит из фабрик этой библиотеки: `asSpy`, `autoMocked`, `createAutoMock`, `createMock`,
  `createSpyClass`, `createSpyFromClass`, `injectSpy`, `mockConstructor`, `mockDeep`.
- **Подсказка:** переменная, которая получает и другое значение, например объектный литерал.
  Принимайте её вместе с правкой места создания — обычно `createAutoMock<T>()` вместо литерала.

Правка импортирует `Spy`, когда имя свободно. Она убирает импорт `Mocked`, когда его больше ничто не
использует: всю декларацию, если `Mocked` был в ней последним именем, иначе только это имя. При
нескольких ссылках импорт убирается на том проходе, который переписывает последнюю.

**Когда выключить.** Не нужно. `Mocked<T>` рядом с `vi.mocked()` правило не трогает. Оно сообщает о
том объявлении, чьё присваивание потом падает. Сообщение без правки вы получите, когда:

- файл объявляет собственный тип `Mocked` (сообщение всё равно называет тип из Vitest);
- `Spy` уже означает в файле что-то другое;
- типовой аргумент — не один именованный тип: `Mocked<{ isKeyEnabled: Mock }>`. `Spy<T>` читает
  класс или интерфейс, а объект из `Mock`-ов задаёт другой вопрос.

:::: details Как правило решает
**Что оно читает.** Идентификатор в ссылке на тип плюс области видимости: объявляет ли файл
собственный `Mocked` или `Spy`.

**Почему фикс узкий.** Объявление можно решить по файлу. А что имени _присваивают_ парой строк ниже —
отдельный вопрос. Реальный файл показал разницу:

```ts
let register: Spy<Pick<Registry, 'metrics'>> & { contentType: string }; // ← что написал --fix
register = { contentType: '…', metrics: vi.fn().mockResolvedValue(payload) }; // ← что он оставил
// TS2322: Type 'Mock<Procedure>' is not assignable to type
//   'AddSpyMethodsByReturnTypes<() => Promise<string>>'
```

`eslint --fix` отчитался чисто, а проверка типов потом упала. Это худший вид сбоя автофикса:
собственная проверка правила проходит, поэтому ничто не указывает обратно на него. Поэтому правило
сверяет каждое значение, которое получает имя: инициализатор и каждое последующее присваивание, по
имени. Обычный фикс остаётся только там, где каждое значение приходит из фабрик библиотеки. Они и так
возвращают `Spy<T>`. Скан неточен только в одну, безопасную сторону: одноимённое присваивание в
другой области видимости может превратить фикс в подсказку, но не наоборот.

Аннотация, которая не принадлежит переменной (параметр, тип возврата, выражение `as`), не видит места
создания и сохраняет обычный фикс. Это же не даёт `--fix` переписать объявление и оставить ниже каст,
всё ещё записанный как `Mocked`.

**Почему `--fix` здесь вообще безопасен.** Правка трогает только объявление. Если она неверна, файл
перестаёт компилироваться, а это самый громкий и дешёвый сбой из возможных.

**Почему оно в recommended.** Ошибка называет класс, а не промах:

```text
TS2322: Type 'Spy<CartService, SpyOptions>' is not assignable to type 'Mocked<CartService>'.
        Type 'Spy<CartService, SpyOptions>' is missing the following properties
        from type 'CartService': http, cache
```

В ней ничто не называет `Mocked`, поэтому правило чинит объявление, а не объясняет ошибку.

**Два имени мок-типов Vitest, и только два.** Граница проходит по параметру типа, а не по написанию:

| тип                                                                                          | параметр                               | вердикт                                                                                                                       |
| -------------------------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `Mocked<T>`, `MockedObject<T>`                                                               | любой `T`, отображаемый по членам      | **в отчёт**: подмена всего объекта, на её месте должен быть `Spy<T>`                                                          |
| `Mock<T>`, `MockInstance<T>`, `MockedFunction<T>`, `MockedFunctionDeep<T>`, `PartialMock<T>` | `T extends Procedure \| Constructable` | не в отчёт: `T` — _функциональный_ тип, поэтому ни один не может назвать класс; каждый типизирует один `vi.fn()`, и это верно |
| `MockedClass<T>`                                                                             | `T extends Constructable`              | не в отчёт: замоканный **конструктор** класса; его аналог здесь — `createSpyClass` / `mockConstructor`, а не `Spy<T>`         |
| `MockedObjectDeep<T>`                                                                        | любой `T`, отображаемый вглубь         | не в отчёт: глубокая подмена здесь — `mockDeep<T>()` с типом `DeepMockProxy<T>`, а не `Spy<T>`                                |

Проект, который типизирует свои подмены как `Mock`, не пишет `Mocked<T>` иначе. Он типизирует
_члены_ объектного типа, собранного вручную, и сообщать стоит как раз об этом объектном типе. Это
[`no-structural-double`](#no-structural-double). Это отдельное правило, потому что его находка
**компилируется** (`let s: { load: Mock }` законен). А всё в `configs.typeErrors` должно быть
находкой, которая не компилируется.

**Серьёзность.** `error`, и одно из двух правил в `configs.typeErrors`. Находка не компилируется
(`TS2322`, по построению), поэтому «сейчас warn, починим партиями» не работает: сборка уже красная.
::::

## prefer-as-spy {#prefer-as-spy}

**`error`** · `--fix` · только синтаксис · в `configs.typeErrors`

Сообщает о касте к `Spy<…>` этой библиотеки, например `TestBed.inject(X) as Spy<X>`. С этой
библиотекой такой каст не компилируется (`TS2352`). Это самая частая ошибка компиляции после переезда
Angular-проекта с `jest-auto-spies`, где эта строка пишется на каждую внедрённую подмену.

```ts
const devices = TestBed.inject(DeviceListService) as Spy<DeviceListService>; // ❌ TS2352
```

```ts
const devices = asSpy(TestBed.inject(DeviceListService)); // ✅
const devices = injectSpy(DeviceListService); // ✅ то же самое, inject уже внутри
```

**Опции.** Нет.

**Как исправить.** Запустите `eslint --fix`. Он переписывает каст в `asSpy(…)`, импортирует `asSpy` и
убирает импорт `Spy`, который после этого не используется. Типовые аргументы переносятся:

```ts
// после --fix
import { asSpy } from 'vitest-auto-spy';

// до
hardwareService = TestBed.inject(DeviceListService) as Spy<DeviceListService>;

hardwareService = asSpy<DeviceListService>(TestBed.inject(DeviceListService));
```

**Когда выключить.** Не нужно. Объект _под тестом_ (сервис, который проверяет спека, а не подмена)
типизируйте как класс. Правило не отличает одно от другого и сообщает о касте в обоих случаях. Если
`asSpy` уже означает в файле что-то другое, вы получите сообщение без правки.

::: details Как правило решает
**Что оно читает.** Каст, тип которого — ссылка, записанная как `Spy`, плюс области видимости. `Spy`,
который объявляет сам файл, — чужой тип, и правило молчит. Затем — **значение**, о котором говорит
каст:

- `x as Spy<T>` утверждает, что `x` _и есть_ спай. Замена точна.
- `x as unknown as Spy<T>` утверждает обратное: переход через `unknown` стоит там, потому что `x` и
  `T` не связаны. `asSpy<T>(x)` не прошёл бы проверку типов, поэтому такой каст (например
  `{} as unknown as Spy<CartService>`) правило не трогает. Ему нужна настоящая подмена
  (`createAutoMock<T>()`), а не переименование. Одно исключение чинится целиком, вместе с переходом:
  `TestBed.inject(X) as unknown as Spy<X>`. `TestBed.inject(X)` возвращает `X` по построению, а
  `as unknown` стоял только чтобы заглушить `TS2352`.

**Почему `--fix` безопасен.** Каст — ваше собственное утверждение, что значение — `Spy<X>`. `asSpy` —
типизированная функция-тождество, поэтому замена сохраняет это утверждение целиком и меняет только
написание, на уровне типов. Ничего о другом файле знать не нужно. Неверный фикс не скомпилируется.

**Типовые аргументы переносятся, а не выводятся.** `Spy<T, Options>` и `asSpy<T, Options>` принимают
одни и те же параметры. Поэтому строка после фикса утверждает ровно то же, что строка до него. Это
касается и `Spy<Cinemas, { overload: 'first' }>`, который вывод молча потерял бы. Вывод неверен и на
**дженерик**-классе: `TestBed.inject` возвращает `Service<any>`. Этот `any` всплывает восемью
уровнями ниже как несовпадение `AddPromiseSpyMethods<unknown>` и `WithMockReturnValue<…>`, и ничто
не указывает на спеку.

**Почему оно в recommended.** `Spy<T>` добавляет `accessorSpies` и хелперы на каждый метод, поэтому
типы недостаточно пересекаются. Строка падает с
`TS2352: Conversion of type 'X' to type 'Spy<X>' may be a mistake`. См.
[самая частая ошибка компиляции у переехавшего Angular-проекта](/ru/migrating#reading-a-spy-back-out-of-the-container).
`asSpy` утверждает то же самое: тот же объект во время выполнения и никакого каста.

**Почему не часть `prefer-inject-spy`.** Эти правила соседи, но не одно и то же.
[`prefer-inject-spy`](#prefer-inject-spy) сообщает о дефекте во время выполнения, который чинится
провайдером в другом файле. Это правило сообщает о верном намерении, записанном так, что оно больше
не компилируется, и чинит его на месте. Слияние к тому же сделало бы `meta.fixable` неправдой, а
ESLint читает его для каждого правила отдельно.

**Серьёзность.** `error`, и второе правило в `configs.typeErrors`, по той же причине, что
[`no-mocked-for-spy`](#no-mocked-for-spy): находка — `TS2352`, сборка уже красная.
:::

## no-ts-expect-error-on-double {#no-ts-expect-error-on-double}

**`error`** · без автоисправления · только синтаксис

Сообщает о `@ts-expect-error` или `@ts-ignore` над вызовом настройки подмены, например `nextWith`,
`mockReturnValue` или `calledWith(…)`. Типизированная подмена даёт одну проверку: стаб совпадает с
тем, что объявляет метод. Директива выключает её для всего на строке.

```ts
// @ts-expect-error спай выбирает перегрузку с events, а не тело, которое читает код
shelves.getShelf.nextWith(page); // ❌
```

```ts
let shelves: Spy<ShelvesClient, { overload: { getShelf: 'first' } }>; // ✅ та сигнатура, которую вызывает код
shelves.getShelf.nextWith(page);
```

**Опции.** Нет.

**Как исправить.**

- **Перегруженный метод:** выберите сигнатуру через
  [`overload`](/ru/core/spy-typing#overloads-parameters-reads-the-last-signature), как выше.
- **Перегрузки нет:** у фикстуры неверная форма. Сверьте её с `ReturnType<X['method']>` (аргумент
  `calledWith` — с `Parameters<X['method']>`) и соберите частичную через `createMock<…>()`.
- **Значение нарочно вне типа,** например объект ошибки, переданный в `nextWith`, чтобы дойти до
  ветки по умолчанию: оберните его в `outOfType<T>(…)` из `vitest-auto-spy`. Так вы говорите это без
  директивы, и правило не сообщает:

```ts
reference.load.nextOneTimeWith(outOfType<Reference>(new HttpErrorResponse({ status: 500 })));
```

**Когда выключить.** Если держите директиву намеренно, объясните почему в отключении на строку над
ней:

```ts
// eslint-disable-next-line vitest-auto-spy/no-ts-expect-error-on-double -- ошибка вне union доходит до запасной ветки
// @ts-expect-error
reference.load.nextOneTimeWith(new HttpErrorResponse({ status: 500 }));
```

::: details Как правило решает
**Вызовы:** `nextWith`, `nextOneTimeWith`, `nextWithValues`, `nextWithPerCall`, `resolveWith`,
`resolveWithPerCall`, `returnValue`, `mockReturnValue(Once)`, `mockResolvedValue(Once)`, `calledWith`
и `mustBeCalledWith` на именованном методе (`double.method.nextWith(…)` или то же через цепочку
`calledWith(…)`). Сообщение ставится на директиву.

**Комментарии и номера строк читаются так же, как их читает компилятор.** Директива действует на
строку после комментария. Блочный комментарий читается с последней строки. Эта строка должна быть
внутри вызова настройки (вызываемое выражение или фикстура на несколько строк). Но не внутри
переданного ему колбэка: там директива говорит о другом.

**Не читаются:** `rejectWith`, `failWith` и `throwWith` принимают `unknown`, так что ошибиться в
форме стаба нельзя. Подмена, до которой добираются через вычисляемый член, или голый мок
(`vi.fn().mockReturnValue(…)`) не называет метода.

**Причина после директивы не помогает.** Правило всё равно сообщает. Причина — то место, где
записывают неверный диагноз. А в кодовой базе, которая её требует (как
`@typescript-eslint/ban-ts-comment` по умолчанию), причина есть на каждой строке.

**Почему оно в recommended.** На одном Angular-проекте из 1759 спек-файлов: 34 директивы в 15 файлах,
**у каждой есть причина**. Четыре стояли на перегруженных клиентах, это чинит `overload`. Семь винили
«схлопнутый дженерик» в фикстуре, которую отвергает и настоящий дженерик-тип. Девятнадцать прятали
фикстуру или продакшен-тип, который расходится с объявленным. Четыре были намеренными.

**Серьёзность.** `error`. Правило решает по факту — подавление над настройкой подмены. А у
единственного верного случая есть обход в одну строку, который записывает причину.
:::

## no-jasmine-globals {#no-jasmine-globals}

**`error`** · без автоисправления · только синтаксис

Сообщает о глобалах, которые ставил собственный раннер Jasmine и которые под Vitest никто не ставит:
`jasmine.*`, голый `spyOn(`, `spyOnProperty(`, `spyOnAllFunctions(`, `fail(`, `pending(` и
`.withContext(`. Большинство из них и так громко падают. `spyOn` — нет: после переименования в
`vi.spyOn` он вызывает настоящий метод, а не заменяет его.

```diff
- spyOn(analytics, 'track');        // jasmine: track() не выполняется
+ vi.spyOn(analytics, 'track');     // Vitest: track() выполняется при каждом вызове
```

```ts
vi.spyOn(analytics, 'track').mockImplementation(() => undefined); // ✅ где строка имела в виду «заглушить»
provideAutoSpy(AnalyticsService); // ✅ лучше: глушит каждый метод по построению
```

**Опции.** Нет.

**Как исправить.** Замените каждый глобал его формой из Vitest. Сообщение её называет:

- `spyOn`, который имел в виду «заглушить»: `vi.spyOn(obj, 'm').mockImplementation(() => undefined)`
  или `createSpyFromClass` / `provideAutoSpy`, которые глушат каждый метод.
- `fail(…)`: `expect.fail(…)`.
- `jasmine.clock()`, по одному сообщению на член: `install()` → `setupFakeTimers()`, `uninstall()` →
  `vi.useRealTimers()`, `tick(n)` → `await advanceTimers(ms)` (он также сбрасывает микрозадачи,
  которые поставили таймеры), `mockDate(d)` → `mockSystemTime(date)`.
- Файл, который должен работать до переписывания, может импортировать `{ jasmine }` из
  `vitest-auto-spy/jasmine`. Его пространство имён передаёт каждый член примитиву Vitest.

Для массовой переделки запустите `npx vitest-auto-spy codemod --from jasmine`. См.
[Переезд с jasmine-auto-spies](/ru/migrating-jasmine).

**Когда выключить.** Не нужно, даже если вы никогда не пользовались Jasmine: без этих имён правило
сработать не может. Держите его включённым и в старом Jest-проекте. До Jest 27 Jest работал на
`jest-jasmine2`, который ставил `spyOn`, `fail` и `pending` как глобалы.

::: details Как правило решает
**Имя и то, есть ли для него биндинг в файле.** `jasmine`, который файл объявляет сам, правило не
трогает. Как и `import { spyOn } from 'bun:test'`: это другая функция с тем же именем, и на этом
рантайме она правильная. Часть `jasmine.<member>` — таблица соответствий. `createSpyObj` и `clock()`
вынесены отдельно, потому что одно сообщение должно покрыть несколько вызовов: сообщение про часы
сразу сопоставляет `install` / `uninstall` / `tick` / `mockDate`.

**Почему оно в recommended.** Большинство этих глобалов падает на первом прогоне с `ReferenceError`.
Случай `spyOn` — нет. `spyOn` из Jasmine ставит **стаб**, а `vi.spyOn` **вызывает оригинал**.
Переименование компилируется, спека выполняется, и код под тестом теперь по-настоящему говорит со
своим коллаборатором. Так переехавший проект начинает делать сетевые запросы или проходить на
значении, которое случайно вернула настоящая реализация. `.withContext(` в том же правиле, потому что
[слой chai в Vitest теряет сообщение, а не падает](/ru/migrating-jasmine#withcontext-does-not-throw-it-loses-the-message).

**Серьёзность.** `error`. Один член набора зелёный и неверный, и это самый используемый из них.
:::

## jasmine-namespace-without-entry {#jasmine-namespace-without-entry}

**`error`** · без автоисправления · только синтаксис · опция `setupModules`

Сообщает о `.and`, `.calls` или `.withArgs` на спае, который построил этот файл, когда файл ни разу
не ставит слой совместимости с Jasmine. На обычном спае библиотеки `.and` — `undefined`. Поэтому
строка падает с сообщением, которое не называет ни пропущенный импорт, ни спай.

```ts
import { createSpyFromClass } from 'vitest-auto-spy';

const api = createSpyFromClass(Api);

api.load.and.returnValue(of(page)); // ❌ Cannot read properties of undefined (reading 'returnValue')
```

```ts
api.load.mockReturnValue(of(page)); // ✅ уберите пространство имён
```

```ts
import { createSpyFromClass } from 'vitest-auto-spy/jasmine';

// ✅ или поставьте слой
```

**Опции.**

| Опция          | Тип        | По умолчанию | Смысл                                                                      |
| -------------- | ---------- | ------------ | -------------------------------------------------------------------------- |
| `setupModules` | `string[]` | `[]`         | setup-модули, которые ставят слой, например запись в `setupFiles` у Vitest |

```js
'vitest-auto-spy/jasmine-namespace-without-entry': ['error', { setupModules: ['./test-setup'] }],
```

**Как исправить.** Используйте собственный API спая (`.mockReturnValue`, `.mock.calls`, `calledWith`)
или импортируйте фабрику из `vitest-auto-spy/jasmine`, которая ставит `.and`, `.calls` и `.withArgs`.
На рантайме, который не может импортировать эту точку входа, их ставит `enableJasmineCompat()`.

**Когда выключить.** Это правило может сообщить о корректном проекте: `enableJasmineCompat()` может
выполняться в записи `setupFiles` у Vitest, которую не импортирует ни одна спека. Назовите этот
модуль в `setupModules`, и правило перестанет гадать. Это и есть исправление, а не понижение
серьёзности. Импорт точки входа, которая не может загрузить Jasmine-точку (`vitest-auto-spy/bun`,
`…/bun-angular`, `…/node`, `…/rstest`), тоже заглушает файл.

::: details Как правило решает
Ставит ли слой **проект**, по одному файлу не узнать. Поэтому правило утверждает только одно: «этот
файл использует пространство имён на спае, **который построил этот файл**, и этот файл ничего не
ставит». Три сужения делают это проверяемым:

- **Получатель прослеживается до одной из фабрик этой библиотеки.** Обход идёт вниз по цепочке
  членов, потому что пространство имён висит на _методе_ подмены (`api.load.and.returnValue(…)`). За
  именем правило следит через каждую запись, включая инициализатор. `let api: Spy<Api>`, заполненный в
  `beforeEach`, — так большинство проектов и строит свои подмены.
- **Точка входа, которая не может загрузить Jasmine-точку, заглушает файл:** `vitest-auto-spy/bun`,
  `…/bun-angular`, `…/node`, `…/rstest`. Эти рантаймы ставят слой из setup-файла, и сообщать о них
  значило бы сообщать о задокументированной настройке.
- **Вызов `enableJasmineCompat()` в любом месте файла заглушает его.** Сообщения ждут, пока файл не
  прочитан целиком, потому что вызов может стоять ниже первого спая, которому он даёт слой.

`import type { Spy } from 'vitest-auto-spy/jasmine'` **не** считается: компилятор его стирает, так
что он ничего не ставит. Файл, который импортирует тип из Jasmine-точки, а фабрики — из основной, —
ровно та форма, ради которой правило написано.

**Две формы вычитаются.** Всё под `.mock` никогда не пространство имён Jasmine: `spy.mock.calls[0]` —
собственная запись раннера. `.and` на вызове `withArgs(…)` сообщается на `withArgs`. Его сообщение
называет всю переделку, поэтому цепочка не даёт двух сообщений.

**Почему оно в recommended.** Падает по построению, но ошибка отправляет вас смотреть на спай, а не
на пропущенный импорт.

**Серьёзность.** `error`, с опцией для единственного случая, когда правило ошибается насчёт проекта.
Предупреждение, которое никто не читает, — не запас прочности, когда настоящее исправление — одна
опция.
:::

## no-save-arguments-by-value {#no-save-arguments-by-value}

**`error`** · без автоисправления · только синтаксис

Сообщает о `spy.calls.saveArgumentsByValue()`. Здесь он ничего не делает: Vitest, Bun и `node:test`
хранят ссылку на каждый аргумент, а не копию. Тогда спека проверяет то, во что код позже превратил
объект, а не то, что было передано.

```ts
spy.calls.saveArgumentsByValue(); // ❌ ничего не делает; аргументы — всё та же ссылка
expect(spy.calls.argsFor(0)[0]).toEqual({ status: 'pending' });
```

```ts
const seen: Payload[] = [];

spy.mockImplementation((payload) => {
  seen.push(structuredClone(payload)); // ✅ копия в момент вызова
});

expect(seen[0]).toEqual({ status: 'pending' });
```

**Опции.** Нет.

**Как исправить.** Копируйте аргумент в момент вызова, как выше. `captureArg<T>()` позволяет
_добраться_ до аргумента, но хранит ту же ссылку, поэтому от мутации не спасает.

**Когда выключить.** Не нужно: правило не может сработать, если ваш код не пришёл из Jasmine.

::: details Как правило решает
**Только цепочка членов:** пространство имён `.calls`, прочитанное до вызова `saveArgumentsByValue(…)`,
на чём бы ни висел `.calls`. Никакой другой API это имя не использует.

**Почему это пустая операция.** Jasmine на всякий случай копирует аргументы каждого вызова. Vitest,
Bun и `node:test` хранят ссылку. Копировать каждый аргумент каждого вызова ради совпадения значило бы
замедлить каждый спай в каждом проекте.

**Почему оно в recommended.** Ничего не падает, и в этом проблема. Спека просила аргументы _такими,
какими их передали_. После переезда она читает то, что код под тестом оставил в этом объекте.
Утверждение о состоянии на момент вызова молча становится утверждением о состоянии на момент
проверки. Оно проходит или падает на значении, которое никто не писал. Ни дифф, ни предупреждение, ни
упавший прогон на это не указывают. Это самый чистый тихий случай в плагине.

**Серьёзность.** `error`. Зелёный и неверный без всякого сигнала.
:::

## prefer-native-spy-api {#prefer-native-spy-api}

**`error`** · `--fix`, где получатель прослеживается, иначе подсказка · только синтаксис

Сообщает о вызове `.and` или `.calls`, который собственный API спая говорит напрямую. Это рабочий код
из слоя совместимости с Jasmine. Правило — инструмент, который завершает переезд.

```ts
api.load.and.returnValue(of(page)); // ❌ говорит слой совместимости
api.load.calls.count();
api.load.withArgs(7).and.returnValue(of(other));
```

```ts
api.load.mockReturnValue(of(page)); // ✅
api.load.mock.calls.length;
api.load.calledWith(7).mockReturnValue(of(other));
```

**Опции.** Нет.

**Как исправить.** Запустите `eslint --fix`. Он переписывает эти вызовы, когда спай прослеживается до
одной из фабрик этой библиотеки:

| Jasmine                             | Native                              |
| ----------------------------------- | ----------------------------------- |
| `.and.returnValue(x)`               | `.mockReturnValue(x)`               |
| `.and.callFake(f)`                  | `.mockImplementation(f)`            |
| `.and.nextWith(v)` и ещё 9 хелперов | `.nextWith(v)` и так далее          |
| `.withArgs(a).and.returnValue(v)`   | `.calledWith(a).mockReturnValue(v)` |
| `.calls.count()`                    | `.mock.calls.length`                |
| `.calls.reset()`                    | `.mockClear()`                      |
| `.calls.argsFor(i)`                 | `.mock.calls[i]`                    |

Десять делегированных хелперов: `nextWith`, `resolveWith`, `rejectWith`, `throwWith`, `complete`,
`returnSubject`, `nextWithValues`, `nextOneTimeWith`, `nextWithPerCall` и `resolveWithPerCall`.

В остальных местах та же правка — подсказка: `.calls` на чужом объекте — чужой метод. Переделка,
которая удалила бы комментарий (`.and /* x */ .returnValue` или комментарий внутри
`.calls.argsFor(…)`), тоже подсказка, даже на спае библиотеки. Она предупреждает, что комментарий
пропадёт.

Чтобы переделать весь проект за один проход, включая то, что правило не переписывает, запустите
`npx vitest-auto-spy codemod --from jasmine`. См. [Переезд с jasmine-auto-spies](/ru/migrating-jasmine).

**Когда выключить.** На время переезда. В первый день оно срабатывает на каждой строке слоя
совместимости, поэтому выключите его, пока тесты не позеленеют:

```js
{ rules: { 'vitest-auto-spy/prefer-native-spy-api': 'off' } } // пока тесты не зелёные
```

На последнем отрезке удалите эту строку. Тихий прогон не значит, что слоя больше нет:
`.and.callThrough()` и `.calls.all()` правило не сообщает. Честная проверка — можно ли удалить импорт
`vitest-auto-spy/jasmine`.

::: details Как правило решает
**Закрытая таблица переделок.** Каждая остаётся внутри одного выражения вызова и сохраняет получателя:

- два переименования: `.and.returnValue` → `.mockReturnValue`, `.and.callFake` → `.mockImplementation`;
- десять делегированных хелперов, где `.and` лишь заново открывает то, что уже есть на спае;
- три служебных вызова: `.calls.count()`, `.calls.reset()`, `.calls.argsFor(i)`;
- получатель `withArgs(…)` складывается: `spy.withArgs(a).and.returnValue(v)` →
  `spy.calledWith(a).mockReturnValue(v)`.

**Не в таблице,** потому что никакое переименование не говорит того же:

- `.and.returnValues`, `.and.callThrough`, `.and.stub`, `.and.throwError`, `.and.resolveTo`;
- `.calls.mostRecent()` и `.calls.all()`: нативная форма — не одно выражение;
- `.calls.argsFor()` без индекса: `mock.calls[undefined]` — не то, что имела в виду строка.

**Опциональное звено оставляет цепочку в покое.** Замена собирается из исходного текста получателя
плюс имени члена. Поэтому `spy?.and.returnValue(1)` стал бы `spy.mockReturnValue(1)`: тот же вызов,
но с молча убранной защитой.

**Почему `--fix` только на прослеживаемом спае.** Фикс переименовывает только член
(`and.returnValue` → `mockReturnValue`, `withArgs` → `calledWith`), поэтому получатель, аргументы и
комментарии остаются как написаны. На спае, который не прослеживается до фабрики библиотеки,
`.calls.count()` может быть чужим API.

**Почему `error`.** Оно сообщает о рабочем коде, и этим отличается от всех остальных правил: оно
завершает переезд. Большинство проектов не в середине переезда, а тем, кто в середине, нужна одна
строка. Если бы правило входило в пакет выключенным и законченные проекты должны были бы включать
его сами, его бы не включил никто.
:::

## Смотрите также {#related}

- [ESLint-плагин](/ru/utilities/eslint-plugin): настройка, глоб `files` и как добавить плагин в
  большой существующий проект без красного CI.
- [Диагностика в редакторе](/ru/utilities/editor-diagnostics): те же находки в вашем редакторе.
- [CLI: кодмод](/ru/utilities/codemod): массовая переделка, которую завершают два Jasmine-правила с
  `--fix`.
- [Диагностика Angular](/ru/adapters/angular-diagnostics): двойник
  [`no-dead-schemas`](#no-dead-schemas) во время выполнения.
