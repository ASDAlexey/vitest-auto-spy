---
title: Fixtures without casts
description: createMock takes a deep partial, createFixture and createFixtureFactory build a model many specs share, narrow() picks the branch of a union a test knows it got, and withOverrides() keeps a model's getters.
---

# Fixtures without casts

Helpers for the test data a spec builds: models, configs, API responses. Each one replaces an
`as T` cast, which silently stops type-checking, with a call the compiler still checks. So when a
model changes, the fixtures that no longer match fail to compile.

```ts
import { createFixtureFactory, createMock } from 'vitest-auto-spy';

// one spec reads two nested fields of a big type
const token = createMock<AccountToken>({ profiles: { active: { id: '1' } } });

// many specs build the same model
export const anArticle = createFixtureFactory<Article>({
  id: '1',
  header: { title: '', subtitle: 'none' },
  tags: [],
  publishedAt: new Date(0),
});

const draft = anArticle({ header: { title: 'Draft' } });
```

::: tip Which of the three?
`createMock<T>` builds data from the fields one spec reads. `createFixture<T>` builds it from
defaults many specs share. `createAutoMock<T>` builds a collaborator whose calls you assert. All three
take a deep partial.
:::

## `createMock<T>(partial?)` — now partial all the way down

Builds a `T` from only the fields your spec reads, at any depth. Use it for a config object, an
account token or a route snapshot, where the test reads one leaf of a big tree.

```ts
import { createMock } from 'vitest-auto-spy';

const config = createMock<FeatureFlagService>({ featureFlags: { retry_count: '3' } });
const token = createMock<AccountToken>({ profiles: { active: { id: '1' } } });
```

A key that `T` does not have is still rejected, at any depth. That is the point: after a model
changes, a renamed field fails here instead of hiding behind `as T`.

```ts
// @ts-expect-error — `nickname` is not on the active profile
createMock<AccountToken>({ profiles: { active: { nickname: 'ada' } } });
```

Built-ins are passed through as they are: a `Date`, a `Map`, a `Promise` or a function stays itself.

**Common mistake:** `{ ... } as AccountToken`. It compiles today and keeps compiling after the model
changes, so the fixture quietly stops matching the real type.

## `createFixture<T>(defaults, overrides?)` — a model written out once

Builds a model from full defaults written once, plus the few fields one test cares about. Use it for
a model with many required fields that many specs need. `createFixtureFactory<T>(defaults)` returns
a reusable function that does the same.

```ts
import { createFixture, createFixtureFactory } from 'vitest-auto-spy';

// article.fixture.ts — the model, written out once, checked in full
export const anArticle = createFixtureFactory<Article>({
  id: '1',
  header: { title: '', subtitle: 'none' },
  tags: [],
  publishedAt: new Date(0),
});

// in a spec — name only what this test is about
const draft = anArticle({ header: { title: 'Draft' } });
const archived = createFixture(draft, { tags: ['archived'] }); // any complete Article works as defaults
```

| Argument    | Type                | Meaning                                                      |
| ----------- | ------------------- | ------------------------------------------------------------ |
| `defaults`  | `T` (complete)      | Every required field; checked in full                        |
| `overrides` | deep partial of `T` | Fields for this test; unknown keys are rejected at any depth |

How it behaves:

- **`defaults` must be a complete `T`.** A field the model dropped fails here, in one place, not in
  eight copies nobody checks.
- **Overrides merge field by field.** `header.subtitle` above survives an override that only sets
  `header.title`.
- **An overridden array replaces the default array.** Arrays are not merged.
- **An optional key accepts an explicit `undefined`**, also under `exactOptionalPropertyTypes`:
  `createFixture(anOrganisation, { sites: undefined })` clears it, and
  `createMock<T>({ ...base, sites: undefined })` keeps the key, with the value `undefined`. A required key still
  rejects `undefined`; for that, see [`outOfType`](/api).
- **Every call returns a new object**, and the defaults are copied when the factory is built. One
  test's changes never leak into another test, even across files under `isolate: false`.
- **The copy is deep through plain objects and arrays only.** A `Date`, a `Map`, a DOM node or a
  class instance is shared by reference, because rebuilding it would lose its prototype and getters.

**Common mistake:** passing a class instance with getters as `defaults`. Snapshot it with
[`withOverrides`](#withoverrides-model-overrides-—-a-model-whose-getters-survive) first; the
result is a complete plain `T`, and you can pass it as `defaults`.

## `narrow(value, predicate)` — the branch a test knows it got

Returns `value` typed as the branch your test expects, and fails with the value's real shape if it
is not. Use it when your test knows which member of a union it got, but the type does not.

```ts
import { narrow } from 'vitest-auto-spy';

const open = narrow(result.link, (link): link is OpenLink => 'params' in link);
const params = narrow.byKey(result.link, 'params').params;
const canMatch$ = narrow.observable(guard.canMatch(route, segments));
const covers = narrow.defined(row.content?.covers);
const form = narrow.instanceOf(request.body, FormData); // a class instance, typed as it
```

| Form                              | Narrows to                                        |
| --------------------------------- | ------------------------------------------------- |
| `narrow(value, predicate)`        | whatever your type-guard predicate says           |
| `narrow.byKey(value, key)`        | the union member that has `key`                   |
| `narrow.observable(value)`        | the `Observable` branch, keeping its element type |
| `narrow.defined(value, label?)`   | the value without `undefined` / `null`            |
| `narrow.instanceOf(value, Class)` | an instance of `Class`                            |

The failure prints the shape the value actually had:

```text
[vitest-auto-spy] narrow.byKey: expected an object with a 'params' property, but the value is Object { type, slug }. The code under test took another branch than this test assumes — check the setup that should lead to it.
Docs: https://asdalexey.github.io/vitest-auto-spy/utilities/fixtures#narrow-value-predicate-—-the-branch-a-test-knows-it-got
```

Why not the usual ways:

- `as OpenLink` is a cast the compiler stops checking.
- A hand-written `if ('params' in link) … else throw` is several lines per place, with a message
  nobody maintains.
- rxjs's `isObservable` narrows to `Observable<unknown>` and drops the element type.
  `narrow.observable` keeps it, and does not import rxjs.
- `expect(value).toBeDefined()` and `assert.exists(value)` check, but do not **return** the narrowed
  value. You then need a local variable and a second statement for each read.
  `narrow.defined` does both in one expression.

`narrow.defined` passes falsy values that are present: `0`, `''`, `false` and `NaN` are defined.

**Common mistake:** replacing `assert.exists` where the check itself is the point of the test. Use
`narrow.defined` to read a value the test already knows is there; keep the assertion when "the value
arrived" is what you test.

## `withOverrides(model, overrides?)` — a model whose getters survive

Returns a plain copy of a model with every getter's value captured, plus your overrides. Use it for
"the same object, but with one field different" when the model is a class with getters.

```ts
import { withOverrides } from 'vitest-auto-spy';

const expired = withOverrides(SUBSCRIPTION, { isExpired: true });
```

| Argument    | Type         | Default | Meaning                              |
| ----------- | ------------ | ------- | ------------------------------------ |
| `model`     | `T`          | —       | The complete model instance          |
| `overrides` | `Partial<T>` | `{}`    | Fields and getter results to replace |

Angular apps often model API responses as classes with getters such as `get isExpired()`. The two
usual ways to change one field both break:

- `{ ...subscription, isExpired: true }` **drops every getter**. Spread copies only own enumerable
  properties, and a getter on the prototype is neither. The component then reads `undefined`.
- `Object.assign(new SubscriptionModel(), fields)` keeps the getters **live**. Each one runs against
  a half-filled instance and may throw from inside the model, with a stack that names neither the
  spec nor the missing field.

`withOverrides` reads every getter once, while the model is complete, and returns a plain object
with the results as data. A getter that throws gives `undefined` instead of failing the snapshot.
