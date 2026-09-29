---
title: Testing without the DOM
description: Write Angular component specs that never read markup - assert on signals, outputs and spies, render with renderShallow, and enforce it with the templates 'never' lint option.
---

# Testing without the DOM

Some teams leave markup to end-to-end (e2e) tests. A unit test then calls the component's methods
and checks its state, its outputs and the services it called. It never reads an element. This page
shows how such a spec looks and how the lint rule keeps every spec that way.

```ts
// cart-page.spec.ts
import { describe, expect, it, vi } from 'vitest';
import { injectSpy, provideAutoSpy, renderShallow } from 'vitest-auto-spy/angular';

import { CartPage } from './cart-page';
import { CartService } from './cart.service';

describe('CartPage', () => {
  const items = [{ id: 7, price: 42 }];

  it('shows the total and removes an item', async () => {
    const { component, fixture } = renderShallow(CartPage, {
      providers: [provideAutoSpy(CartService)],
      detectChanges: false,
    });
    const cart = injectSpy(CartService);
    cart.load.nextWith(items); // load(): Observable<Item[]>
    cart.remove.resolveWith(); // remove(id): Promise<void>
    fixture.detectChanges(); // runs ngOnInit, which subscribes to load()

    expect(component.total).toHaveSignalValue(42);

    const removed = vi.fn();
    component.removed.subscribe(removed);
    await component.remove(items[0]);

    expect(component.total).toHaveSignalValue(0);
    expect(removed).toHaveBeenCalledWith(items[0]);
    expect(cart.remove).toHaveBeenCalledWith(7);
  });
});
```

The component subscribes to `CartService.load()` in `ngOnInit`. It has a `total` computed signal, a
`removed` output and an async `remove(item)` method that calls `CartService.remove(id)`.

- **`renderShallow`** creates the component in the regular `TestBed`. Child components are dropped
  and the template is blank. Signals, inputs, lifecycle hooks and dependency injection work as usual.
  Set inputs with the `inputs` option, for example `renderShallow(ProfileComponent, { inputs: { userId: 1 } })`;
  they are set before the first change detection. It returns the component and the usual
  `ComponentFixture` as `fixture`. All options are in
  [Shallow component rendering](/adapters/angular#shallow-component-rendering).
- **`detectChanges: false`** stops `renderShallow` from running the first change detection (and
  so `ngOnInit`). That gives you a moment to set the spy's answers. Then `fixture.detectChanges()`
  runs `ngOnInit`. Without the option, `ngOnInit` has already run when `renderShallow` returns.
- **`provideAutoSpy(CartService)`** puts a spy of `CartService` into dependency injection.
  **`injectSpy(CartService)`** gets that spy back, typed.
- **`nextWith(items)`** makes `load()` return an `Observable` that emits `items`. It needs the
  [RxJS](/runtimes/rxjs) entry, imported once in the setup file below. **`resolveWith()`** makes
  `remove()` resolve.

## Set up the test file

The spec needs two lines of global setup: the RxJS entry for `nextWith`, and the signal matchers
for `toHaveSignalValue`. Put them in one setup file:

```ts
// src/test-setup.ts
import { registerSignalMatchers } from 'vitest-auto-spy/angular/matchers';

import 'vitest-auto-spy/rxjs';

registerSignalMatchers();
```

With the Angular CLI (`ng test`), list the file in `angular.json`:

```jsonc
"test": {
  "builder": "@angular/build:unit-test",
  "options": {
    // keep the options already here and add this line
    "setupFiles": ["src/test-setup.ts"]
  }
}
```

With your own `vitest.config.ts` (for example with Analog), list it in `test.setupFiles` instead.

## Turn the lint policy on

Add this block to `eslint.config.js`, or merge the `rules` part into the block that already applies
the [plugin](/utilities/eslint-plugin) to your specs:

```js
// eslint.config.js
import autoSpy from 'vitest-auto-spy/eslint-plugin';

export default [
  {
    files: ['**/*.spec.ts'],
    ...autoSpy.configs.recommended,
    rules: {
      ...autoSpy.configs.recommended.rules,
      'vitest-auto-spy/prefer-render-shallow': ['warn', { templates: 'never' }],
    },
  },
];
```

Start with `'warn'` while you migrate existing specs. Switch to `'error'` once they are clean, so CI
blocks new DOM reads.

With this option, [`prefer-render-shallow`](/utilities/eslint-rules#prefer-render-shallow) reports:

- every `TestBed.createComponent`;
- every `keepTemplate: true`;
- every DOM read: `nativeElement`, `debugElement`, `By.*`, `querySelector*`, `classList`,
  `getComputedStyle`, `textContent`, `document`, `inject(DOCUMENT)` and similar;
- a `@Component` with markup (`template` or `templateUrl`) declared in the spec;
- a `template:` passed to `renderShallow`.

Every one of these messages links to this page.

**Expect to rewrite some tests.** One project rewrote 18 of 40 tests in a component spec, and its
coverage fell from 100 % to 95.7 %. Code that only the template reached no longer runs. For example,
a method that starts with `if (!this.table()) return;`, where `table = viewChild(MatTable)`, now
always returns early, because a blank template has no `MatTable`. Those lines really are untested
now; only a spec that renders the template, or an e2e test, covers them again.

## Assert on the component instead of the DOM

| Instead of checking                 | Check                                                                                   |
| ----------------------------------- | --------------------------------------------------------------------------------------- |
| the text of a row                   | the signal or `computed` the row binds: `expect(component.total).toHaveSignalValue(42)` |
| a button click                      | call the handler that `(click)` binds: `component.remove(item)`                         |
| an event the parent sees            | the output: `const removed = vi.fn(); component.removed.subscribe(removed)`             |
| a class on the host element         | the signal or input that sets it                                                        |
| an input a child component receives | the value the component computes for it: `expect(component.chartData()).toEqual([42])`  |
| a service called after a click      | the spy: `expect(injectSpy(CartService).remove).toHaveBeenCalledWith(item.id)`          |

## Test a directive

A directive attaches to an element, so something has to render one.
[`createDirectiveHost({ template, scope })`](/adapters/angular#a-host-for-a-directive-under-test) is
the one host the policy allows.

In a file that calls `createDirectiveHost`, the rule does not report DOM reads, `@Component` markup
or `template:`. So the spec may read the element the directive is on.

## When you still need the template

`viewChild`, `contentChild`, content projection and `@defer` only work when the markup exists. You
have two options:

- test that behaviour in e2e;
- keep one spec file on `renderShallow(X, { keepTemplate: true })`, with a comment at the top of the
  file that turns the rule off and says why:

```ts
/* eslint-disable vitest-auto-spy/prefer-render-shallow -- the table reads its rows through viewChild */
```
