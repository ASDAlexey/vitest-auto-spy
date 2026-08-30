---
title: Fixtures without casts
description: createMock’s deep partial, createFixture/createFixtureFactory for a model many specs build, narrow() for a union a test knows the branch of, and withOverrides() for a model whose getters a spread would drop.
---

# Fixtures without casts

Four helpers for the data a spec builds rather than the collaborators it drives. What they have in
common: each one replaces a type assertion that silently stops checking, with something that keeps
checking.

## `createMock<T>(partial?)` — now partial all the way down

```ts
const config = createMock<FeatureFlagService>({ featureFlags: { retry_count: '3' } });
const token = createMock<AccountToken>({ profiles: { active: { id: '1' } } });
```

`Partial<T>` is one level deep, so a fixture for a configuration object, an account token or a route
snapshot — a tree the test reads one leaf of — used to need the type of every nested level named and
built with its own call. The input is now a deep partial, and the part that matters survives: a key
`T` does not have, **at any depth**, is still rejected.

```ts
// @ts-expect-error — `nickname` is not on the active profile
createMock<AccountToken>({ profiles: { active: { nickname: 'ada' } } });
```

That rejection is the whole value. After a model changes, a renamed or removed field is exactly what
a spec fixture is least likely to notice and most likely to be lying about — and `as T` throws the
check away, which is why "the fixture compiles" stops meaning anything.

::: tip Which of the three?
`createMock<T>` builds data from the fields one spec reads; `createFixture<T>` builds it from
defaults many specs share; `createAutoMock<T>` builds the collaborator whose calls you assert. All
three take a deep partial.
:::

Built-ins are handed through untouched — a `Date`, a `Map`, a `Promise`, a function stays itself
rather than becoming an object of optional methods.

## `createFixture<T>(defaults, overrides?)` — a model written out once

`createMock` answers "this spec reads two fields of a big shape". It has nothing to say about the
other habit, which is more expensive: a content model with seventeen required fields, each with its
own nested interface, copied into every spec that needs one. Measured on a single migration shard,
those copies produced **28 `TS1117`** diagnostics — a duplicate key in a literal — and half of the
shard's `TS2741`.

```ts
// article.fixture.ts — the model, written out once, checked in full
export const anArticle = createFixtureFactory<Article>({
  id: '1',
  header: { title: '', subtitle: 'none' },
  tags: [],
  publishedAt: new Date(0),
});

// in a spec — name only what this test is about
const draft = anArticle({ header: { title: 'Draft' } });
```

The `defaults` argument is a **complete** `T`, and that is the point rather than a chore: a field the
model dropped six months ago fails here, in one place, instead of in eight copies nobody re-checks.
`Partial<T>` and `as T` both delete that diagnostic, which is why neither is the answer.

Overrides are deep-partial-checked like `createMock`'s, and merge leaf by leaf — `header.subtitle`
above survives an override that only names `header.title`. An overridden **array** replaces the
default one outright; no merge rule over arrays is right often enough to guess at.

**Every call hands back a new object**, and the defaults are copied when the factory is built. A
fixture shared by reference is the most common way one test's mutation decides another's outcome,
and under `isolate: false` that sharing reaches across files.

The copy is deep through plain objects and arrays and stops there: a `Date`, a `Map`, a DOM node or a
class instance is carried across by reference, because rebuilding one would strip its prototype —
accessors included. When the defaults *are* a class instance with getters, snapshot it with
[`withOverrides`](#withoverrides-model-overrides-a-model-whose-getters-survive) first and hand the
result here.

## `narrow(value, predicate)` — the branch a test knows it got

```ts
import { narrow } from 'vitest-auto-spy';

const open = narrow(result.link, (link): link is OpenLink => 'params' in link);
const params = narrow.byKey(result.link, 'params').params;
const canMatch$ = narrow.observable(guard.canMatch(route, segments));
```

A spec routinely knows something the type does not: that `result.link` is the one form of twenty that
carries `params`, that a guard returned the `Observable` and not the `boolean`. The two usual ways to
say it are both bad — an assertion is a lie the compiler stops checking, and a hand-written
`if ('params' in link) … else throw` is six lines per site whose message is whatever the author felt
like typing.

The failure prints the shape the value actually had, which is the only thing that makes it cheaper
than the assertion it replaces:

```text
[vitest-auto-spy] narrow: expected an object with a 'params' property, but the value is Object { type, slug }.
```

`narrow.observable` exists here rather than as a call to rxjs's `isObservable` because that one
narrows to `Observable<unknown>` and drops the element type, so every call site adds a type argument
back by hand. The check is structural, so nothing in the core imports rxjs.

## `withOverrides(model, overrides?)` — a model whose getters survive

```ts
const expired = withOverrides(SUBSCRIPTION, { isExpired: true });
```

Angular codebases model API responses as classes with getters — `get isSubscribed()`,
`get isExpired()` — computed from the raw fields. "The same subscription, but expired" then has two
usual spellings, and both are broken in ways that are hard to see:

- `{ ...subscription, isExpired: true }` **drops every getter**: spread copies own enumerable
  properties, and a prototype accessor is neither. The component reads `undefined` from a flag that
  should have had a value.
- `Object.assign(new SubscriptionModel(), fields)` keeps the getters **live**, so each runs against a
  half-filled instance — and a getter written for real data throws from inside the model, with a
  stack that names neither the spec nor the missing field.

`withOverrides` reads every accessor once, while the model is still whole, and hands back a plain
object carrying the results as data. A getter that throws contributes `undefined` rather than failing
the snapshot: a spec that asserts on that field will say so far more clearly than a stack inside the
model would.
