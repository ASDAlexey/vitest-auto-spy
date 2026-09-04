---
title: explainSpy
description: Print what a double is configured to answer next to what it was actually asked - before anything has failed. Lives on the `/diagnostics` entry.
---

# explainSpy

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

`mustBeCalledWith` already prints wanted next to actual — but only on the call that breaks. The
question a spec author has while the test is red for some _other_ reason is different: which of my
configs did this call hit, and which one never fired at all. Until now the only way to answer it was
to scroll back to the setup and match argument lists by eye.

`explainSpy` builds the answer instead. It reads the double's `calledWith` / `mustBeCalledWith`
configs, numbers them, pairs each recorded call against them, and says which config the call hit —
or that it hit none and the default value was used.

## Reading the report

- **The headline** — `load — 3 calls, 2 configured` — is the whole state of one member in one line.
  Two states are called out because they are the ones a reader most often arrives in and a bare list
  answers badly: `nothing configured` (every call returned the default) and `none matched` (N calls,
  and not one of them reached a config).
- **`configured:`** lists every registered argument list as the chain call that registered it, so
  `#2 calledWith(Any<String>)` is the line you wrote. Both chains share one numbering, so a call
  names a single number whichever chain answered it.
- **`calls:`** lists every recorded invocation in order, each with the config it matched. When
  nothing is configured the verdict is dropped — it would say the same thing on every line.

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
explainSpy(spy); // every spied member that the double exposes
explainSpy(spy, 'load'); // just that member
explainSpy(spy.load); // a single function spy, named from the mock
```

- `createSpyFromClass`, `createAutoMock`, `createFunctionSpy` and `mockDeep` doubles are all
  understood; a `mockDeep` child is reached either as `explainSpy(api.repo, 'find')` or as
  `explainSpy(api.repo.find)`.
- An accessor spy is reported as `get name` / `set name`, read from the double's `accessorSpies`
  bag — naming it (`explainSpy(users, 'name')`) never invokes the live accessor, which would record
  a call just for being looked at.
- A lazy method nobody has touched is left out rather than materialised: it would be built only to
  report that it has nothing to report.

## It never throws

`explainSpy` is reached from a spec that is already failing, so a diagnostic that fails on the way
is worse than no diagnostic. A plain `vi.fn()`, or any value that is not one of this library's
doubles, is reported in the text rather than raised:

```text
[vitest-auto-spy] explainSpy

nothing to explain: this value holds no spy created by vitest-auto-spy. Pass a double built by
createSpyFromClass, createAutoMock, createFunctionSpy or mockDeep.
```

The result is a report to print, not something to assert on — the wording is a diagnostic and is
free to improve between releases.
