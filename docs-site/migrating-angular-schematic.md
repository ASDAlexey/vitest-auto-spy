---
title: After Angular's refactor-jasmine-vitest
description: Replace vi.fn() objects and fix the three createSpyObj TODOs left by Angular's refactor-jasmine-vitest migration.
---

# After Angular's `refactor-jasmine-vitest`

Angular's `refactor-jasmine-vitest` can turn `jasmine.createSpyObj` into a `vi.fn()` object or
leave a `// TODO: vitest-migration:` comment. To replace the generated object or finish the
migration, pass the original class to `createSpyFromClass`. You get typed spies without a method list:

```ts
import { createSpyFromClass } from 'vitest-auto-spy';

const api = createSpyFromClass(Api);
```

If the old spy set properties or mocked only some methods, see
[how to fix the three TODOs](#the-three-todos-and-the-line-beside-each).

If you use `jasmine-auto-spies`, start with [Migrating from jasmine-auto-spies](/migrating-jasmine).
That migration uses [the codemod](/utilities/codemod) (`npx vitest-auto-spy codemod --from jasmine`),
not Angular's schematic.

## What the schematic does to `createSpyObj`

This example shows what `@schematics/angular` **22.1.6** produced in a one-file project. The command
used `@angular-devkit/schematics-cli` 22.x:

```sh
npx schematics @schematics/angular:refactor-jasmine-vitest --project=app --no-dry-run
```

The examples omit the project's original imports.

Before:

```ts
const methods = ['get'];
const props = { baseUrl: '/api' };

describe('Orders', () => {
  let api: jasmine.SpyObj<Api>;

  beforeEach(() => {
    api = jasmine.createSpyObj('Api', ['get', 'post']);
    api.get.and.returnValue(of([{ id: 1 }]));
    TestBed.configureTestingModule({ providers: [Orders, { provide: Api, useValue: api }] });
  });

  it('spies on a real instance', () => {
    spyOn(orders, 'refresh').and.callThrough();
  });

  it('single argument', () => {
    const bare = jasmine.createSpyObj('Api');
  });

  it('method list in a variable', () => {
    const dynamic = jasmine.createSpyObj('Api', methods);
  });

  it('property map in a variable', () => {
    const withProps = jasmine.createSpyObj('Api', ['get'], props);
    expect(withProps.baseUrl).toBe('/api');
  });
});
```

After:

```ts
import type { MockedObject } from 'vitest';

const methods = ['get'];
const props = { baseUrl: '/api' };

describe('Orders', () => {
  let api: MockedObject<Api>;

  beforeEach(() => {
    api = {
      get: vi.fn().mockName('Api.get'),
      post: vi.fn().mockName('Api.post'),
    };
    api.get.mockReturnValue(of([{ id: 1 }]));
    TestBed.configureTestingModule({ providers: [Orders, { provide: Api, useValue: api }] });
  });

  it('spies on a real instance', () => {
    vi.spyOn(orders, 'refresh');
  });

  it('single argument', () => {
    // TODO: vitest-migration: jasmine.createSpyObj called with a single argument is not supported for transformation. See: https://vitest.dev/api/vi.html#vi-fn
    const bare = jasmine.createSpyObj('Api');
  });

  it('method list in a variable', () => {
    // TODO: vitest-migration: Cannot transform jasmine.createSpyObj with a dynamic variable. Please migrate this manually. See: https://vitest.dev/api/vi.html#vi-fn
    const dynamic = jasmine.createSpyObj('Api', methods);
  });

  it('property map in a variable', () => {
    // TODO: vitest-migration: Cannot transform jasmine.createSpyObj with a dynamic property map. Please migrate this manually. See: https://vitest.dev/api/vi.html#vi-fn
    const withProps = {
      get: vi.fn().mockName('Api.get'),
    };
    expect(withProps.baseUrl).toBe('/api');
  });
});
```

When you list the methods directly in the call, the schematic creates one `vi.fn()` per method.
It names each mock (for example, `Api.get`) so you can identify it in failure messages. It also
changes `jasmine.SpyObj<Api>` to `MockedObject<Api>` and `.and.returnValue(v)` to `.mockReturnValue(v)`.

`spyOn(o, 'm').and.callThrough()` becomes `vi.spyOn(o, 'm')`. Vitest calls the original method by
default. [Jasmine's `spyOn`](/migrating-jasmine#spyon-means-the-opposite-thing-on-the-two-sides)
replaces it by default.

The TypeScript printer changes indentation to four spaces and rewrites quotes. Run Prettier to
restore your formatting. The schematic leaves out the `vi` import because `addImports` defaults to
`false`. The `@angular/build:unit-test` builder enables Vitest globals.

Look for TODO counts in the console summary or in `jasmine-vitest-<date>.md` at the project root:

```
- 3 TODO(s) added for manual review:
  - 1x createSpyObj-single-argument
  - 1x createSpyObj-dynamic-variable
  - 1x createSpyObj-dynamic-property-map
```

## The three TODOs, and the line beside each

All three messages come from `@schematics/angular` 22.1.6 and point to `vi.fn()`.
If you have the class, start with [`createSpyFromClass`](/core/create-spy-from-class) as shown above.
In `TestBed`, register the spy with [`provideAutoSpy` and retrieve it with `injectSpy`](/adapters/angular):

```ts
import { TestBed } from '@angular/core/testing';
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/angular';

TestBed.configureTestingModule({ providers: [Orders, provideAutoSpy(Api)] });
const api = injectSpy(Api);
```

### `createSpyObj-single-argument`

> jasmine.createSpyObj called with a single argument is not supported for transformation.

Pass the class instead of the name: `createSpyFromClass(Api)` spies on its prototype methods.
The schematic leaves `jasmine.createSpyObj('Api')` unchanged because it has no method list.
Under Vitest, that leftover call fails with `ReferenceError: jasmine is not defined`.

### `createSpyObj-dynamic-variable`

> Cannot transform jasmine.createSpyObj with a dynamic variable. Please migrate this manually.

Drop the list if you want spies for all prototype methods. The schematic can't read a list passed
as a variable, such as a shared `const`, a helper parameter, or the result of `Object.keys`.
If you want spies for only those methods, keep the variable and pass it to
[`onlyMethodsToSpyOn`](/core/create-spy-from-class#configuration). Type it using the class's keys
instead of `string[]`:

```ts
const methods = ['get'] satisfies Array<keyof Api>;

api = createSpyFromClass(Api, { onlyMethodsToSpyOn: methods });
```

### `createSpyObj-dynamic-property-map`

> Cannot transform jasmine.createSpyObj with a dynamic property map. Please migrate this manually.

Check the diff: the schematic rewrites the call but drops the third argument, `props`.
It leaves `{ get: vi.fn().mockName('Api.get') }` and flags the missing properties only in the TODO.
TypeScript reports the missing field if it checks the object against `MockedObject<Api>`.
At runtime, `withProps.baseUrl` is `undefined`.

Restore `baseUrl` based on how the class declares it:

- **Plain field:** `Spy<Api>` keeps the field's type. Assign `api.baseUrl = '/api'`, or pass the map
  as `provideAutoSpy(Api, { overrides: props })`.
- **`readonly` field or signal:** call
  [`mockReadonlyProp(api, 'baseUrl', '/api')`](/adapters/angular#signal-readonly-property-mocking).
  Call `restoreMockedProps()` to undo the change.
- **Getter:** set [`gettersToSpyOn: ['baseUrl']`](/core/create-spy-from-class#accessor-spies-—-accessorspies).
  Then call `api.accessorSpies.getters.baseUrl.mockReturnValue('/api')`. The property keeps its type.

## Why the two dynamic cases cannot exist here

The schematic needs the method names written directly in the call, as an array or object literal.
It can't tell which names a variable holds, and a call without a list gives it nothing to expand.

`createSpyFromClass` finds methods on `Api.prototype` and its parent prototypes when tests run.
TypeScript also uses the class to build `Spy<Api>`. Add a method and it appears on the spy at the
next run. Remove one and TypeScript flags tests that still call it.

If you don't have a class, use `createSpyObj` from [`vitest-auto-spy/jasmine`](/migrating-jasmine).
It keeps Jasmine's arguments and reads the list at runtime, so variables work. TypeScript can only
use the names it knows: a `string[]` gives you `string` keys. A single argument still raises an
error that tells you how to fix the call. Prefer `createSpyFromClass` when you have the class.

## What the literal costs afterwards

The [Angular testing guide](https://angular.dev/guide/testing/services) shows how to write these
objects by hand. Here's what changes if you switch to a class-based spy:

- **New methods.** `MockedObject<Api>` requires every member of `Api`. When you add a method, update
  each object with another `name: vi.fn().mockName('Api.name')`. `Spy<Api>` adds it automatically.
- **Return values.** With `vi.fn()`, use `api.get.mockReturnValue(of([...]))`. If the method returns
  an `Observable`, the class-based spy gives you
  [`nextWith` / `throwWith`](/core/control-helpers#observable-methods-properties-—-nextwith) and
  `calledWith('/orders').nextWith([...])`. For a `Promise`, use
  [`resolveWith` / `rejectWith`](/core/control-helpers#promise-returning-methods-—-resolvewith).
  On any method, [`mustBeCalledWith`](/core/control-helpers#synchronous-methods) fails the test if
  the arguments don't match instead of returning `undefined`.
- **Unconfigured calls.** Both return `undefined` by default. With a class-based spy, use
  [`strict: true`](/core/strict-mode) to fail on those calls, for one spy or for all tests.
- **Names in failures.** The schematic uses names like `Api.get` when you give it a base name.
  Without one (`jasmine.createSpyObj(['get'])`), it writes unnamed `vi.fn()` mocks. A class-based
  spy names each spy after its method on runners that support names.

## If you would rather stop at jasmine syntax first

To switch runners now and rewrite spies later, skip the schematic for those spies. Import
[`jasmine` from `vitest-auto-spy/jasmine`](/migrating-jasmine#jasmine-s-own-globals) in each test file
that uses it:

```ts
import { jasmine } from 'vitest-auto-spy/jasmine';

const api = jasmine.createSpyObj('Api', ['get', 'post']); // unchanged, runs under Vitest
api.get.and.returnValue(of([])); // .and, .calls, .withArgs are back
```

The import leaves `globalThis` unchanged. When you rewrite the spies, [the codemod](/utilities/codemod)
removes the import. This entry doesn't load with `bun test` or `node --test`. In a setup file, call
`enableJasmineCompat()` from `vitest-auto-spy/jasmine-compat` instead. See
[On Bun and `node:test`](/migrating-jasmine#on-bun-and-node-test).

## The record, with versions

Version history, checked against primary sources on 2026-09-02 unless noted:

- **2023-04-27: Karma's maintainers deprecate Karma.** Commit `450fdfda` in `karma-runner/karma`
  adds this notice to the README: “Karma is deprecated and is not accepting new features or general
  bug fixes.” The Angular CLI changelog doesn't deprecate Karma itself. In **22.0.0**, it deprecates
  the Webpack builders in `build-angular` and recommends `@angular/build` builders instead.
  `@angular/build:karma` is one of the replacements.
- **21.0.0 (2025-11-19): `ng new` defaults to Vitest instead of Karma and Jasmine.** You can still
  choose `karma` with `testRunner` (`2ffc527b`). The same release introduces the Jasmine-to-Vitest
  schematic (`58474ec7`).
- **22.0.0 (2026-06-03): Angular stabilizes the schematic** (`de630c2f`) and removes two experimental
  builders: `@angular-devkit/build-angular:jest` and `@angular-devkit/build-angular:web-test-runner`.
  Stabilization covers the test patterns the schematic handles. In 22.1.6 and 22.2.0, the collection
  still labels it `[EXPERIMENTAL] Refactors Jasmine tests to use Vitest APIs.` and sets
  `"hidden": true`. It doesn't appear in `ng generate --help`, so use its full name.
- **22.2.0: `ng new` uses Vitest 5.** It sets `vitest` to `^5.0.0`, up from `^4.0.8` in 22.1.x.
  The Karma-to-Vitest migration and `vitest-browser` use the same range for `@vitest/coverage-*`
  and the browser providers. `ng generate config vitest` now writes `vitest-base.config.mts`
  instead of `vitest-base.config.ts`. Checked against the `@schematics/angular` 22.2.0 tarball on
  2026-09-26.
