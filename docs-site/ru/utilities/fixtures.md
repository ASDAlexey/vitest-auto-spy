---
title: Фикстуры без приведений типов
description: createMock принимает глубокий partial, createFixture и createFixtureFactory строят модель, общую для многих спек, narrow() выбирает ветку union, которую тест точно получил, а withOverrides() сохраняет геттеры модели.
---

# Фикстуры без приведений типов

Хелперы для тестовых данных, которые строит спека: моделей, конфигов, ответов API. Каждый заменяет
приведение `as T`, которое молча перестаёт проверять типы, вызовом, который компилятор проверяет
по-прежнему. Когда модель меняется, неподходящие фикстуры перестают компилироваться.

```ts
import { createFixtureFactory, createMock } from 'vitest-auto-spy';

// одна спека читает два вложенных поля большого типа
const token = createMock<AccountToken>({ profiles: { active: { id: '1' } } });

// многие спеки строят одну и ту же модель
export const anArticle = createFixtureFactory<Article>({
  id: '1',
  header: { title: '', subtitle: 'none' },
  tags: [],
  publishedAt: new Date(0),
});

const draft = anArticle({ header: { title: 'Draft' } });
```

::: tip Какой из трёх?
`createMock<T>` строит данные из полей, которые читает одна спека. `createFixture<T>` строит их из
значений по умолчанию, общих для многих спек. `createAutoMock<T>` строит зависимость, вызовы которой
вы проверяете. Все три принимают глубокий partial.
:::

## `createMock(partial?)` — теперь partial до самого низа {#createmock-t-partial-—-now-partial-all-the-way-down}

Строит `T` только из тех полей, которые читает спека, на любой глубине. Подходит для объекта
конфигурации, токена аккаунта или снимка маршрута, где тест читает один лист большого дерева.

```ts
import { createMock } from 'vitest-auto-spy';

const config = createMock<FeatureFlagService>({ featureFlags: { retry_count: '3' } });
const token = createMock<AccountToken>({ profiles: { active: { id: '1' } } });
```

Ключ, которого нет в `T`, по-прежнему отклоняется на любой глубине. В этом и смысл: когда модель
меняется, переименованное поле падает здесь, а не прячется за `as T`.

```ts
// @ts-expect-error — `nickname` is not on the active profile
createMock<AccountToken>({ profiles: { active: { nickname: 'ada' } } });
```

Встроенные объекты передаются как есть: `Date`, `Map`, `Promise` или функция остаются собой.

**Частая ошибка:** `{ ... } as AccountToken`. Сегодня это компилируется и продолжит компилироваться
после изменения модели, так что фикстура молча перестанет совпадать с настоящим типом.

## `createFixture(defaults, overrides?)` — модель, выписанная один раз {#createfixture-t-defaults-overrides-—-a-model-written-out-once}

Строит модель из полного набора значений по умолчанию, выписанного один раз, и нескольких полей,
важных одному тесту. Подходит для модели с множеством обязательных полей, которая нужна многим
спекам. `createFixtureFactory<T>(defaults)` возвращает функцию, которая делает то же самое, для
повторного использования.

```ts
import { createFixture, createFixtureFactory } from 'vitest-auto-spy';

// article.fixture.ts — модель выписана один раз и проверена целиком
export const anArticle = createFixtureFactory<Article>({
  id: '1',
  header: { title: '', subtitle: 'none' },
  tags: [],
  publishedAt: new Date(0),
});

// в спеке — только то, о чём этот тест
const draft = anArticle({ header: { title: 'Draft' } });
const archived = createFixture(draft, { tags: ['archived'] }); // значениями по умолчанию подойдёт любой полный Article
```

| Аргумент    | Тип                  | Смысл                                                                |
| ----------- | -------------------- | -------------------------------------------------------------------- |
| `defaults`  | `T` (полный)         | Все обязательные поля; проверяются целиком                           |
| `overrides` | глубокий partial `T` | Поля для этого теста; неизвестные ключи отклоняются на любой глубине |

Как это работает:

- **`defaults` — это полный `T`.** Поле, которое модель потеряла, падает здесь, в одном месте, а не в
  восьми копиях, которые никто не проверяет.
- **Переопределения сливаются поле за полем.** `header.subtitle` в примере выше остаётся, когда
  переопределение задаёт только `header.title`.
- **Переопределённый массив заменяет массив по умолчанию.** Массивы не сливаются.
- **Необязательный ключ принимает явный `undefined`**, в том числе при
  `exactOptionalPropertyTypes`: `createFixture(anOrganisation, { sites: undefined })` его очищает,
  а
  `createMock<T>({ ...base, sites: undefined })` оставляет ключ со значением `undefined`. Обязательный ключ
  `undefined` по-прежнему не принимает; для этого см. [`outOfType`](/ru/api).
- **Каждый вызов возвращает новый объект**, а значения по умолчанию копируются при создании фабрики.
  Изменения одного теста не утекают в другой, даже между файлами при `isolate: false`.
- **Копия глубокая только для обычных объектов и массивов.** `Date`, `Map`, DOM-узел или экземпляр
  класса передаются по ссылке: при пересборке они потеряли бы прототип и геттеры.

**Частая ошибка:** передавать в `defaults` экземпляр класса с геттерами. Сначала снимите с него
снимок через [`withOverrides`](#withoverrides-model-overrides-—-a-model-whose-getters-survive):
результат — полный обычный `T`, и его можно передать как `defaults`.

## `narrow(value, predicate)` — ветка, про которую тест знает, что получил именно её {#narrow-value-predicate-—-the-branch-a-test-knows-it-got}

Возвращает `value` с типом той ветки, которую ждёт тест, а если это не она — падает и показывает
настоящую форму значения. Используйте, когда тест знает, какой вариант union он получил, а тип —
нет.

```ts
import { narrow } from 'vitest-auto-spy';

const open = narrow(result.link, (link): link is OpenLink => 'params' in link);
const params = narrow.byKey(result.link, 'params').params;
const canMatch$ = narrow.observable(guard.canMatch(route, segments));
const covers = narrow.defined(row.content?.covers);
const form = narrow.instanceOf(request.body, FormData); // экземпляр класса, с его типом
```

| Форма                             | Сужает до                                         |
| --------------------------------- | ------------------------------------------------- |
| `narrow(value, predicate)`        | того, что говорит ваш предикат-тайпгард           |
| `narrow.byKey(value, key)`        | варианта union, у которого есть `key`             |
| `narrow.observable(value)`        | ветки `Observable`, с сохранённым типом элементов |
| `narrow.defined(value, label?)`   | значения без `undefined` / `null`                 |
| `narrow.instanceOf(value, Class)` | экземпляра `Class`                                |

Падение печатает форму, которую значение имело на самом деле:

```text
[vitest-auto-spy] narrow.byKey: expected an object with a 'params' property, but the value is Object { type, slug }. The code under test took another branch than this test assumes — check the setup that should lead to it.
Docs: https://asdalexey.github.io/vitest-auto-spy/utilities/fixtures#narrow-value-predicate-—-the-branch-a-test-knows-it-got
```

Почему не привычные способы:

- `as OpenLink` — приведение, которое компилятор больше не проверяет.
- Самописный `if ('params' in link) … else throw` — несколько строк в каждом месте и сообщение,
  которое никто не поддерживает.
- `isObservable` из rxjs сужает до `Observable<unknown>` и теряет тип элементов.
  `narrow.observable` его сохраняет и не импортирует rxjs.
- `expect(value).toBeDefined()` и `assert.exists(value)` проверяют, но не **возвращают** суженное
  значение. Тогда на каждое чтение нужна локальная переменная и второй оператор. `narrow.defined`
  делает и то, и другое в одном выражении.

`narrow.defined` пропускает ложные, но существующие значения: `0`, `''`, `false` и `NaN` — это
определённые значения.

**Частая ошибка:** заменять `assert.exists` там, где сама проверка и есть смысл теста. `narrow.defined`
— чтобы прочитать значение, которое тест уже точно получил; проверку оставьте, когда тест проверяет
именно «значение пришло».

## `withOverrides(model, overrides?)` — модель, чьи геттеры выживают {#withoverrides-model-overrides-—-a-model-whose-getters-survive}

Возвращает обычную копию модели, где значения всех геттеров уже прочитаны, плюс ваши
переопределения. Используйте для «тот же объект, но одно поле другое», когда модель — класс с
геттерами.

```ts
import { withOverrides } from 'vitest-auto-spy';

const expired = withOverrides(SUBSCRIPTION, { isExpired: true });
```

| Аргумент    | Тип          | По умолчанию | Смысл                                        |
| ----------- | ------------ | ------------ | -------------------------------------------- |
| `model`     | `T`          | —            | Полный экземпляр модели                      |
| `overrides` | `Partial<T>` | `{}`         | Поля и результаты геттеров, которые заменить |

В Angular-приложениях ответы API часто описывают классами с геттерами вроде `get isExpired()`. Два
привычных способа поменять одно поле оба ломаются:

- `{ ...subscription, isExpired: true }` **теряет все геттеры**. Spread копирует только собственные
  перечисляемые свойства, а геттер на прототипе ни тем, ни другим не является. Компонент читает
  `undefined`.
- `Object.assign(new SubscriptionModel(), fields)` оставляет геттеры **живыми**. Каждый выполняется
  на недозаполненном экземпляре и может упасть внутри модели, со стеком, где нет ни спеки, ни
  пропущенного поля.

`withOverrides` читает каждый геттер один раз, пока модель целая, и возвращает обычный объект, где
результаты лежат как данные. Геттер, который бросает ошибку, даёт `undefined`, а снимок не падает.
