---
title: explainSpy
description: Print what a spy is configured to answer next to what it was actually called with, before anything has failed. Lives on the /diagnostics entry.
---

# explainSpy

`explainSpy(spy)` prints a report: which argument lists a spy is configured for, and which of them
each call actually hit. Use it while debugging a red test, when you wonder why a spy returned the
default value.

```ts
import { createSpyFromClass } from 'vitest-auto-spy';
import { explainSpy } from 'vitest-auto-spy/diagnostics';

const users = createSpyFromClass(UserApi);
users.load.calledWith(1).resolveWith('ada');

await users.load(2);

console.log(explainSpy(users, 'load'));
```

```text
[vitest-auto-spy] explainSpy

load — 1 call, 1 configured, none matched
  configured:
    #1 calledWith(1)
  calls:
    #1 load(2) -> no configured arguments matched; the default value was used
```

## The question it answers

`mustBeCalledWith` (a `calledWith` that throws on any other arguments) prints wanted and actual
arguments, but only for the call that fails. When a test
is red for another reason, you want to know: which of my `calledWith` setups did this call hit, and
which one never fired? Without this helper you scroll back to the setup and compare argument lists by
eye.

`explainSpy` reads the spy's `calledWith` / `mustBeCalledWith` setups and numbers them. Then it
matches each recorded call against them and says which setup it hit, or that it hit none and got the
default value.

## Reading the report

- **The headline**, `load — 3 calls, 2 configured`, sums up one method in one line. Two states are
  spelled out: `nothing configured` (every call got the default value) and `none matched` (there were
  calls, and not one hit a setup).
- **`configured:`** lists every setup as the call that created it, so `#2 calledWith(Any<String>)`
  is the line you wrote. `calledWith` and `mustBeCalledWith` share one numbering.
- **`calls:`** lists every call in order, with the setup it matched. When nothing is configured, the
  match is left out, because it would be the same on every line.

A fuller report, from `explainSpy(users)` with no method named:

```text
[vitest-auto-spy] explainSpy

load — 3 calls, 2 configured
  configured:
    #1 calledWith(1)
    #2 calledWith(Any<String>)
  calls:
    #1 load(1) -> matched #1
    #2 load(2) -> no configured arguments matched; the default value was used
    #3 load('ada') -> matched #2

save — 1 call, nothing configured
  calls:
    #1 save('ada')

remove — never called, 1 configured
  configured:
    #1 mustBeCalledWith(9)
```

## What it accepts

```ts
explainSpy(spy); // every spied member of the object
explainSpy(spy, 'load'); // just that member
explainSpy(spy.load); // a single method spy; the report uses the spy's name
```

| Argument | Type                                                                    | Meaning                            |
| -------- | ----------------------------------------------------------------------- | ---------------------------------- |
| `spy`    | an object of spies (from `createSpyFromClass` etc.) or one spied method | What to explain                    |
| `member` | `string` (optional)                                                     | Only this member of the spy object |

- Spies from `createSpyFromClass`, `createAutoMock`, `createFunctionSpy` and `mockDeep` all work. A
  `mockDeep` child works as `explainSpy(api.repo, 'find')` or `explainSpy(api.repo.find)`.
- A getter or setter spy is reported as `get name` / `set name`. Naming it
  (`explainSpy(users, 'name')`) does not call the getter, so it records no extra call.
- A method the test never called and never configured is left out. It would only report that there
  is nothing to report.

## It never throws

You call `explainSpy` from a test that is already failing, so it never throws itself. A plain
`vi.fn()`, or any value that is not a spy from this library, is reported in the text:

```text
[vitest-auto-spy] explainSpy

nothing to explain: this value is a plain runner mock (vi.fn()) and holds no spy created by
vitest-auto-spy. `adoptMock(mock)` gives it the library's helpers.
```

`null` and `undefined` (for example a `let` that no `beforeEach` assigned) are reported the same way.

**Common mistake:** asserting on the report text. It is meant to be printed; the wording may improve
between releases.
