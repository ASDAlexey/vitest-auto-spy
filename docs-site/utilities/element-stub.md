---
title: Element stub and missing DOM APIs
description: createElementStub gives an HTMLElement for ElementRef whose spies keep state, and fillMissingDomApis fills the members jsdom and happy-dom leave out, once, from the setup file.
---

# Element stub and missing DOM APIs

Two helpers from `vitest-auto-spy/dom-stubs`:

- `createElementStub()` gives you a fake element to test a directive or service through
  `ElementRef`, without rendering anything;
- `fillMissingDomApis()` adds the DOM members jsdom and happy-dom lack, such as `PointerEvent` or
  `scrollIntoView`, once, in your setup file.

```ts
import { ElementRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { createElementStub } from 'vitest-auto-spy/dom-stubs';

it('highlights on enter', () => {
  const host = createElementStub({ classes: ['card'] });

  TestBed.configureTestingModule({ providers: [{ provide: ElementRef, useValue: new ElementRef(host.element) }] });
  const directive = TestBed.runInInjectionContext(() => new HighlightDirective());

  directive.onEnter();

  expect(host.classList.add).toHaveBeenCalledWith('highlighted');
  expect(host.classes()).toEqual(['card', 'highlighted']);
});
```

## An element for `ElementRef` — `createElementStub`

Returns a fake `HTMLElement` whose methods are spies that keep state: `classList.contains` answers what
`classList.add` put in, `getAttribute` returns what `setAttribute` wrote, and `dispatchEvent` reaches the listeners.

| Option       | Type                     | Default | Meaning                                                               |
| ------------ | ------------------------ | ------- | --------------------------------------------------------------------- |
| `tagName`    | `string`                 | `'div'` | The tag, lower case; `tagName` and `nodeName` return it in upper case |
| `classes`    | `string[]`               | none    | Classes the element starts with                                       |
| `attributes` | `Record<string, string>` | none    | Attributes it starts with                                             |
| `style`      | `Record<string, string>` | none    | Inline styles by CSS property name: `{ 'background-color': 'red' }`   |
| `overrides`  | `Partial<HTMLElement>`   | none    | Any other member your code reads: `offsetWidth`, `querySelector`      |

What the returned handle has:

| Member                                                                               | What it is                                                                           |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `element`                                                                            | The element; pass it to `new ElementRef(…)`                                          |
| `classList.add` / `remove` / `toggle` / `contains` / `replace`                       | Spies                                                                                |
| `style.setProperty` / `getPropertyValue` / `removeProperty`                          | Spies                                                                                |
| `setAttribute`, `getAttribute`, `removeAttribute`, `hasAttribute`, `toggleAttribute` | Spies                                                                                |
| `addEventListener`, `removeEventListener`, `dispatchEvent`, `focus`, `blur`, `click` | Spies                                                                                |
| `classes()`, `attributes()`, `styles()`                                              | Current state; `styles()` sees `setProperty` and `style.width = '10px'` alike        |
| `listenerCount(type)`                                                                | How many listeners are registered for `type`                                         |
| `emit(event)`                                                                        | Fires an event on the listeners, without recording a call on the `dispatchEvent` spy |

```ts
host.emit('mouseleave'); // fires the listeners; records nothing on dispatchEvent
```

`emit` reaches listeners added with `addEventListener` on the stub. Without rendering, Angular does
not attach `@HostListener` handlers, so call such a handler directly, as `directive.onEnter()` does
above.

The hand-written alternative, `{ nativeElement: { classList: { add: vi.fn() } } }`, is typed `any`,
has only the members its author thought of, and returns `undefined` for the rest.

**Common mistake:** your code reads a member the stub does not implement. It throws with the
member's name:

```text
[vitest-auto-spy] createElementStub: the code under test read <div>.offsetWidth, which the stub does not implement. Pass it in: createElementStub({ overrides: { offsetWidth: … } }).
```

Pass that member in `overrides: { offsetWidth: 120, querySelector: vi.fn() }`.

Nothing is patched, so there is nothing to restore. Without a DOM environment the stub still works;
only the missing-member check is off, because there is no `HTMLElement` to read the member list from.

## The members the DOM environment leaves out — `fillMissingDomApis`

Adds DOM members that jsdom and happy-dom lack. Call it once in the setup file, before
`setupAutoSpy()`:

```ts
// vitest.setup.ts
import { fillMissingDomApis } from 'vitest-auto-spy/dom-stubs';
import { setupAutoSpy } from 'vitest-auto-spy/setup';

fillMissingDomApis();
setupAutoSpy();
```

It fills:

- `PointerEvent`;
- a `ResizeObserver` that does nothing;
- `scrollTo` / `scrollBy` / `scrollIntoView` on elements and `scroll` / `scrollTo` / `scrollBy` on
  `window`, that do nothing (jsdom's own only log "Not implemented");
- `getComputedStyle`, where there is none;
- `document.doctype`.

| Option               | Type      | Default | Meaning                                                              |
| -------------------- | --------- | ------- | -------------------------------------------------------------------- |
| `cheapComputedStyle` | `boolean` | `false` | Replace `getComputedStyle` with one that reads only the inline style |

How it behaves:

- It fills only what is missing. An environment that implements a member keeps its own.
- Every fill can still be replaced with `vi.stubGlobal` or `mockValueProp`.
- It returns the names it filled. A second call is safe and returns none.
- Without a `document`, it does nothing.
- `cheapComputedStyle: true` is fast and never logs for a pseudo-element. But a stylesheet rule no
  longer shows in what it returns, which is why it is off by default.

**Common mistake:** calling it after `setupAutoSpy()`, or adding these globals by hand inside a test
file. The [global-patch guard](/utilities/setup#_20-globals-put-back-at-the-file-boundary) then
blames a test for a global the setup file installed. Filled before `setupAutoSpy()`, they count as
part of the environment.
