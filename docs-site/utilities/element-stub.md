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

For code that checks `instanceof`, pass the element class:

```ts
import { createElementStub } from 'vitest-auto-spy/dom-stubs';

const input = createElementStub({ elementClass: HTMLInputElement, tagName: 'input', overrides: { value: '15' } });

expect(input.element).toBeInstanceOf(HTMLInputElement);
expect(input.element.value).toBe('15'); // inferred as HTMLInputElement
```

`elementClass` uses the class's prototype without calling its constructor. TypeScript infers `T` from the class.
`tagName` remains independent and defaults to `'div'`; set it to `'input'` for an input stub.
The supplied class adds no implementations. Configure missing properties and methods, such as `value` or `select`, in `overrides`.
Existing stub methods, such as `focus`, remain usable. Reading an unconfigured class member throws with its name.

| Option         | Type                        | Default | Meaning                                                               |
| -------------- | --------------------------- | ------- | --------------------------------------------------------------------- |
| `elementClass` | `{ readonly prototype: T }` | none    | Element class for `instanceof`; infers the element type               |
| `tagName`      | `string`                    | `'div'` | The tag, lower case; `tagName` and `nodeName` return it in upper case |
| `classes`      | `string[]`                  | none    | Classes the element starts with                                       |
| `attributes`   | `Record<string, string>`    | none    | Attributes it starts with                                             |
| `style`        | `Record<string, string>`    | none    | Inline styles by CSS property name: `{ 'background-color': 'red' }`   |
| `overrides`    | `Partial<T>`                | none    | Any other member your code reads: `offsetWidth`, `querySelector`      |

### `mockElementRefProp` — an element for a signal query

Replace an optional or required `ElementRef` signal query and get the element spies in one call.
For example, `component.dateTrigger` has type `Signal<ElementRef<HTMLButtonElement> | undefined>`.
Its `focusTrigger()` method calls `focus()` on the queried element.

```ts
import { mockElementRefProp } from 'vitest-auto-spy/angular/doubles';

const trigger = mockElementRefProp(component, 'dateTrigger', {
  elementClass: HTMLButtonElement,
  tagName: 'button',
});
component.focusTrigger();
expect(trigger.focus).toHaveBeenCalledExactlyOnceWith();
```

This replaces a local element factory followed by `mockSignalProp(component, 'dateTrigger', new ElementRef(element))`.
The query determines the element type. Options are those of `createElementStub` and cannot change that type.
The handle also returns `ref` (the installed `ElementRef`) and `query` (a writable test signal).
Use `trigger.query.set(undefined)` to represent a missing optional query; required queries reject `undefined` in TypeScript.
Queries returning component or directive instances, and `viewChildren`, need `mockSignalProp` instead.

Patch before rendering a template, effect, or `computed` that consumes the original query.
Patching an already consumed query throws. This helper creates no rendered element and does not resolve Angular queries.
`setupAutoSpy()` restores the original query after each test. Without it, add cleanup:

```ts
import { afterEach } from 'vitest';
import { restoreMockedProps } from 'vitest-auto-spy';

afterEach(() => restoreMockedProps());
```

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

`createElementStub` itself patches nothing and needs no cleanup. Without a DOM environment the stub still works.
The missing-member check needs `HTMLElement` or a supplied `elementClass` to read the member list from.

## Events for direct handler calls

Use `createDomEvent` to supply readonly targets without a cast or `Object.defineProperty` in each test.
Here, `component.onBlur()` reads `currentTarget` and removes the `active` class.

```ts
import { createDomEvent, createElementStub, createInputEvent } from 'vitest-auto-spy/dom-stubs';

const input = createElementStub({ tagName: 'input', classes: ['active'] });
component.onBlur(createDomEvent('blur', { currentTarget: input.element }));
expect(input.classes()).toEqual([]);

component.onInput(createInputEvent('15'));
expect(component.value()).toBe('15');
```

`createDomEvent(type, init?)` returns a native `Event`. `bubbles` and `cancelable` default to `true`.
The optional `target` and `currentTarget` stay fixed. For propagation tests, omit them and dispatch on a real DOM element.

`createInputEvent(value, init?)` returns an `Event` of type `'input'` with an input stub as `target`.
It supports `instanceof HTMLInputElement` when that class exists. The supplied value wins over `init.element.overrides.value`.
Pass stub options through `element`, for example `{ element: { overrides: { disabled: true } } }`.
Pass other native event flags directly in `init`.

**Common mistake:** expecting `data`, `inputType`, or a browser input event constructor check to work.
This helper returns `Event`, not `InputEvent`. Use a native `InputEvent` when testing those browser features.

## Text paste and drop events

Replace local clipboard and drag event factories when a handler only reads plain text.
Here, `onPaste` and `onDrop` read the text and cancel the event.

```ts
import { createDropEvent, createPasteEvent } from 'vitest-auto-spy/dom-stubs';

const paste = createPasteEvent('15');
component.onPaste(paste);
expect(paste.defaultPrevented).toBe(true);

component.onDrop(createDropEvent('20'));
expect(component.value()).toBe('20');
```

Both accept `(text: string | null, init?: EventInit)` and default to bubbling, cancelable events.
`null` gives `clipboardData: null` or `dataTransfer: null`, so you can test absent data.
`getData('text')` and `getData('text/plain')` return the supplied text, ignoring case; other formats return `''`.
`types` is a readonly `['text/plain']` array. These events can also be dispatched on DOM elements.

The transfer supports only `getData()` and `types`. Reading `files`, `items`, `setData`, or any other transfer member throws.
These are native `Event` instances with the text transfer property added.
They need no `ClipboardEvent`, `DragEvent`, or `DataTransfer` constructor and do not pass those constructor checks.
For files, coordinates, transfer writes, or browser drag behavior, supply your own event.

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
