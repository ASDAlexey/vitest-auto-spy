# vitest-auto-spy — Setup file

Part of the agent reference [`AGENTS.md`](../AGENTS.md): the entry points, the factories and the checklist live there. Section numbers are shared with it.

## 10. Setup file

```ts
// vitest.setup.ts
import 'vitest-auto-spy/rxjs';
// once — enables observable spies everywhere
import { setupAutoSpy } from 'vitest-auto-spy/setup';

setupAutoSpy(); // { duplicateCopies: 'throw', restoreProps: true, restoreMocks: false }
```

`setupAutoSpy()` does three things: `restoreMockedProps()` in a global `afterEach`, a duplicate-install
check that fails the run, and (opt-in) `vi.restoreAllMocks()`. Turn on `restoreMocks: true` when the
suite runs with `isolate: false`.

**The restore also runs from an `onTestFinished` net**, because the `afterEach` is not guaranteed
to. Vitest calls `afterEach` hooks in _reverse_ registration order, so the setup file's is the last
one, and a hook the spec file registered takes the chain down with it when it throws — the patches
then travel into the next test and the failure surfaces somewhere that never touched them. One spec
kept `afterEach(() => vi.restoreAllMocks())`; migrating it to `gettersToSpyOn` made the restored
getter return `undefined`, `ngOnDestroy` called it as a signal, the `TypeError` aborted the hook,
and a template error about a null profile appeared in a different `describe`. The net puts the
properties back and warns with the count and the cause. `countMockedProps()` is exported if you
would rather assert it: `afterEach(() => expect(countMockedProps()).toBe(0))`.

**A `mock*Prop` patch written in a `describe` body or a `beforeAll` is reported**, because the sweep
undoes it after the test it was applied during and nothing puts it back: the first test passes and
every one after it reads the real member. `propsOutsideHooks` grades that — `'warn'` (default),
`'throw'`, `'off'` — and `reportPropsOutsideHooks(reaction)` sets the same dial for a suite that
wires its own hooks. Move the call into `beforeEach`.

**Adopting `setupAutoSpy()` in a suite that restored its patches once per file** — one
`restoreMockedProps()` in an `afterAll` — changes a patch from "lives for the file" to "lives for one
test". On 176 files of one such suite, 3 broke, each a `mock*Prop` in a `describe` body or
`beforeAll`, and the `'warn'` report is easy to miss in a full run. Run the first time with
`setupAutoSpy({ propsOutsideHooks: 'throw' })`, fix what it names, then drop the option.

**The one that only bites at scale:** with `isolate: false`, a `setTimeout` or
`requestAnimationFrame` a component schedules and never clears keeps running after its file is done,
and fires while the **next** file is mid-test. It is reported against that innocent file, as
`Schedulers cannot synchronously execute watches while scheduling`, `signal read during notification
phase`, or an unhandled rejection naming a component the failing file never imported. If you see any
of those, suspect the previous file, not the one that failed:

```ts
setupAutoSpy({ strayTimers: true }); // wrap the schedulers, sweep the survivors in afterAll
```

The pieces are exported too — `trackStrayTimers()` (idempotent, returns the undo),
`cancelStrayTimers()` (returns how many it cancelled), `countStrayTimers()` and
`describeStrayTimers()` (each pending timer's `kind`, the `delay` of a timeout or interval, the spec
`file` that scheduled it, up to five `frames`, and `test` — the `suite > test` that scheduled it — or
`outsideTest: 'import' | 'hook'` when no test was running), all from `vitest-auto-spy/setup`. Use
`expect(countStrayTimers()).toBe(0)` in an `afterEach` to make a leak fail rather than be tidied
away, or take the per-file report from the sweep itself — `timers` carries the same origins, so the
failure diff names the file and the scheduling call:

```ts
setupAutoSpy({ strayTimers: true, onStrayTimers: ({ timers }) => expect(timers).toEqual([]) });
```

`frames` starts below the tracking wrapper and is up to forty frames deep, so a zone or an rxjs
scheduler in between does not hide the caller: project frames come first; when the call came from
dependencies only, their frames stand in. The package's own frames are never quoted, from source or
from `dist`. `onStrayTimers: 'throw'` fails the file with a message that names the file and lists
every stray as `setTimeout 300 ms, scheduled in "<test>" at <frames[0]>`, then the one fix; a handler
that prints its own message should print the same `kind`, `delay`, `file`, `test` and `frames[0]` —
they are what makes a report that only reproduces under a slow coverage run actionable the first
time.

A stray whose `file` is not the file that failed was scheduled after the previous file's sweep —
the previous file is the one to fix.

**`countStrayTimers()` cannot see a timer scheduled under fake timers, and that does not compose
away.** `vi.useFakeTimers()` assigns its own `setTimeout` over the tracking wrapper, so everything
the fake clock hands out bypasses the count entirely — which makes `expect(countStrayTimers()).toBe(0)`
vacuous in any file running on a frozen clock, `setupAutoSpy({ strayTimers: true, globalFakeTimers: true })`
included. Read `vi.getTimerCount()` for the fake clock's own backlog; the two answer different
questions and neither covers the other. A handle cleared by the number it coerces to
(`clearTimeout(+handle)`) or through its own `close()` is forgotten properly now, so those stopped
being counted as strays.

**With Vitest 4.1's `--detect-async-leaks`, run one or the other — not both silently.** The two
arrive at the same timer from opposite ends and the quiet one wins: the sweep cancels in `afterAll`,
Vitest collects its leaks afterwards, and a cancelled timeout is no longer referenced, so the run
reports **no leaks** for a file that leaks. Cancelling is still the right default — a callback firing
during a later file is the more expensive failure — so when both are on and no `onStrayTimers` is
given, the sweep prints to stderr the report `'throw'` fails with — the file, the first three timers
and the test that scheduled each — closed by one sentence saying they are missing from Vitest's
"Async Leaks" report; `onStrayTimers` gets all of them. Vitest's own report, with `strayTimers` off, points
its code frame at the `setTimeout` in the spec, because the library's own scheduler wrappers go
through `vi.defineHelper` and are dropped from the stack.

**The one that keeps a suite green while it is wrong:** zone.js replaces the global `Promise`, and a
rejection nobody handled is drained into `console.error` and no further — it never reaches
`process.on('unhandledRejection')`, the channel Vitest watches, so the runner is never told and the
file still exits 0. `compileComponents().then(() => expect(…))`, an `async` helper called without
`await`, a `TypeError` thrown inside `import('…').then(…)` in production code: each of those is a
passing test with a line of stderr behind it. One migrated suite — 1688 spec files, 11 587 tests,
green — was hiding six of them, two being assertions that were simply false.

```ts
setupAutoSpy({ strayRejections: true }); // fail the test the swallowed rejection surfaced in
```

Off by default, and it needs zone.js already loaded — this package never imports it, so the setup
file does (`import 'zone.js';`) or the Angular builder does. Without it the call **throws** rather
than quietly watching nothing. Native, non-zone rejections already fail a Vitest run, and nothing
here touches them. The pieces are exported too — `trackStrayRejections()` (idempotent, returns the
undo), `flushStrayRejections()` (takes what was captured and starts again from empty) and
`countStrayRejections()`. The count is complete; the **reasons** retained are capped at 100, so a
file rejecting in a loop cannot hold its whole run's worth of stacks. A promise rejected with
`undefined` is reported as that rather than as `[object Object]`. The `no-floating-assertion` lint
rule catches the commonest shape before it ever runs (§16).

**`onUnhandledError` is not this.** Vitest 4.0 added a config callback for errors the _runner_ hears
about, and under zone.js the runner never hears about these at all — zone.js drains the rejection
into `console.error` before `process.on('unhandledRejection')` would fire, so there is nothing for
that callback to filter. Use `onUnhandledError` to triage the native failures Vitest already reports;
use `strayRejections` to find the ones it never sees.

A rejection the runner has **already** blamed the finished test for is not reported again. An
`async` test that fails an assertion leaves its own `AssertionError` in both places, so a red run
used to print two messages per failure and the second one sent the reader hunting for a defect that
was not there. What is left is what the check is for: the rejections that fail no test at all.

**The one that gets slower the longer the run goes on:** every `vi.fn()` and `vi.spyOn()` is added
to one `Set` inside `@vitest/spy`, because that is what `vi.clearAllMocks()` walks, and nothing takes
anything out of it again. With `isolate: false` the set is created once per worker and only grows:
`clearMocks: true` then walks every mock of every file already run **before every single test**, and
the worker holds all of them at once — their recorded arguments included, and through those whole
component trees.

```ts
setupAutoSpy({ pruneMockRegistry: true }); // keep only the mocks that outlive a file
```

The part to understand before turning it on is what must **not** be pruned. A pruned mock is one
`clearMocks` can no longer see, so its calls accumulate silently — harmless for a mock that dies with
its file, a bug for the module-level `vi.fn()` in a shared `*.mock.ts` that six spec files import.
The split is therefore drawn where it is observable: what is already in the registry when a file's
hooks start was created while the module graph was evaluated and is kept; everything added after that
belongs to the file and goes when it ends. One case lands on the wrong side — a module first loaded
by a dynamic `import()` inside a test — and says so explicitly:

```ts
export const navigation = { setFocus: keepMockRegistered(vi.fn()) };
```

The mocks it keeps, it also guards. Staying registered means `vi.resetAllMocks()` reaches them too —
it walks the same set and calls `mockReset()`, which puts an implementation back only when it was
passed to `vi.fn(implementation)`; behaviour chained on with `.mockReturnValue(…)` or
`.mockReturnThis()` is simply lost. Under `isolate: false` that surfaces in a _different_ file later
in the same worker, inside application code, as `Cannot read properties of undefined` against a
shared double that spec never touched — and `vi.restoreAllMocks()` does not cause it (Vitest 4 walks
`MOCK_RESTORE` there, which only `vi.spyOn` writes to), so probing with that one comes back green and
sends the search the wrong way. The implementation a long-lived mock carried when it was classified
is therefore remembered and put back, in `beforeEach`, but only when it has gone missing.

`trackMockRegistry()` installs the hooks on its own, `pruneMockRegistry()` is the one-shot sweep (it
returns how many went), `restoreLongLivedImplementations()` is that repair (it returns how many it
put back) and `getMockRegistrySize()` reports what is left.

One entry is never pruned, and it is not one of yours: the Vitest adapter registers a single
`vi.fn()` whose `mockClear` sweeps this library's own spies. Dropping it would turn
`vi.clearAllMocks()` into a silent no-op for every double in the run, so it carries a mark the
pruner skips. Why the library needs a mock of its own for that is the next section.

**The one that answers for every file that follows:** `vi.spyOn(localStorage, 'setItem')` puts the
mock on the storage as an own property, and happy-dom's `Storage` hands each instance out wrapped
in a Proxy whose `deleteProperty` trap only knows stored items. `mockRestore()` — and
`vi.restoreAllMocks()` walking the same path — deletes through that trap, comes back green, and
does nothing: the spy keeps recording, and a later spec's own `vi.spyOn` is handed the same mock
with the previous file's calls already in it, so "not to have been called" fails every other run.
Probing by running `vi.restoreAllMocks()` rules nothing out — it is the failing path itself. Writing
`Storage.prototype`'s method back over the spy does go through the proxy; that asymmetry, define
passes and delete does not, is the repair, and it is on by default:

```ts
setupAutoSpy(); // restoreStorageSpies: true — the sweep runs at the file boundary only
```

`restoreStorageSpies()` is the one-shot (it returns the storages it repaired); a suite that
deliberately keeps a spy on a storage method for a whole worker turns the option off. jsdom breaks
the other half of the same contract — its Storage proxy turns a `defineProperty` of a method into a
stored item — which is why the gate is `vi.isMockFunction` rather than "differs from the
prototype": a junk item is left alone, a mock is repaired.

**The one that outlives its component:** a listener on `window` or `document` is not the
component's to take off. Overlays, portals and services register on the shared targets, and under
`isolate: false` whatever a file leaves registered fires during the next one — the same wrong-file
blame as a stray timer, with none of the visibility: nothing errors, the callback simply runs
against mocks and a DOM it was never written for.

```ts
setupAutoSpy({ strayListeners: true }); // wrap addEventListener, sweep what the file added
```

The split is the one `pruneMockRegistry` uses: a `beforeAll` marks the listeners already on
`window`/`document` — registered while the module graph was evaluated, a framework's one-time
initialisation — and the `afterAll` takes off everything added since. The pieces are exported too:
`trackStrayListeners()` (idempotent, returns the undo), `baselineStrayListeners()`,
`removeStrayListeners()` (returns how many), `countStrayListeners()` (throws before
`trackStrayListeners()` has run, like the timer counter) and `describeStrayListeners()` — each
stray's target, type, spec file, up to five frames and the same `test` / `outsideTest` as a timer,
the list `onStrayListeners({ removed, listeners })` receives when a file should fail instead:
`onStrayListeners: ({ removed }) => expect(removed).toBe(0)`, or `onStrayListeners: 'throw'`, whose
message names the file and lists each as `keydown on document, added in "<test>" at <frames[0]>`.
A listener has `type` and `target` where a timer has `kind` and `delay` — a handler that prints its own
message prints those fields instead.
With `strayTimers` on too, both reports run after both sweeps and both run even if the first throws —
a handler or `'throw'` alike; two failures surface as one `AggregateError`
(`2 file-end checks failed when a.spec.ts ended:`, each report a numbered block with its `Docs:`
line), so a throwing report never leaves a timer uncancelled. The stray-console file report runs in
the same sweep.
Under jsdom a listener registered with `{ once: true }` that already fired stays counted until
something removes it: the wrapper cannot observe the firing without breaking identity-based
`removeEventListener` from the code under test, and removing an already-fired listener is a no-op
anyway. happy-dom detaches it through the public `removeEventListener`, so there it leaves the count.

**The one no registry tracks:** `vi.stubGlobal` is undone by `unstubGlobals` and
`vi.spyOn(globalThis, …)` by `restoreMocks`, but a plain assignment —
`global.ResizeObserver = stub` — is written straight into the shared worker and read by every later
file. `guardGlobals` names the _unrepairable_ case, a non-configurable redefine; this is the net
for the repairable one:

```ts
setupAutoSpy({ restoreGlobals: true }); // one snapshot per worker, restored at every file boundary
```

`captureGlobalBaseline()` takes the snapshot — the first call is the worker's truth, a later one
does nothing, so a re-capture can never launder a replacement into the baseline. `restoreGlobals()`
is the sweep, and returns the keys it changed. Two traps it steps around, both load-bearing. A DOM
environment installs window properties on `globalThis` as accessor pairs forwarding to an override
map, so `global.ResizeObserver = stub` leaves the descriptor untouched and the restore has to write
the captured value back through the same setter, not just re-define the descriptor. And the
library's own wrappers — `setTimeout` under `strayTimers`, `addEventListener` under
`strayListeners` — are marked as theirs, so the restore steps around them instead of uninstalling
the tracking at the first boundary. Added keys are never deleted (a framework that installs a
global at import time must not lose it), and the identity globals — `location`, `document`,
`window` and their kin — are never written back at all. A leftover fake clock comes off first,
because restoring timer descriptors under an installed fake breaks both.

### What a method spy is, and the one thing that differs from `vi.fn()`

A method spy is **not** a `vi.fn()`. It is this library's own mock function: one shared prototype
carrying the whole `Mock` surface, call state allocated on the first call rather than at creation,
and no entry in any global registry. `vi.fn()` assigns some twenty-five closures as own properties
of every mock it makes and allocates six arrays up front — per method, on every double a spec
builds — and that cost is most of what a wide service used to pay for methods no test touches.

Everything a spec can observe is the same, and the suite pins it by putting the two side by side:

- `vi.isMockFunction(spy.load)`, `expect(spy.load).toHaveBeenCalledWith(…)`, `toHaveReturned`,
  `toHaveResolved`, `toHaveBeenNthCalledWith` — every matcher reads `_isMockFunction`, `mock.*` and
  `getMockName()`, all of which the spy implements with the runner's semantics.
- `spy.load.mock.calls` / `.results` / `.settledResults` / `.instances` / `.contexts` /
  `.invocationCallOrder` / `.lastCall`, `mockReturnValue`, `mockResolvedValue`,
  `mockImplementation(Once)`, `withImplementation`, `mockClear` / `mockReset` / `mockRestore`,
  `mockName`, `using`.
- `vi.clearAllMocks()`, `vi.resetAllMocks()`, and the `clearMocks` / `mockReset` config keys, which
  Vitest applies through those two functions.

**The one difference.** `mock.invocationCallOrder` counts on this library's own scale, so
`expect(a).toHaveBeenCalledBefore(b)` is exact between two auto-spies and **wrong** between an
auto-spy and a hand-written `vi.fn()` — not an error, an answer, computed from two counters that
never met. `@vitest/spy` keeps its own in a module-private variable it neither exports nor lets
anything advance, so the scales cannot be reconciled after the fact; they drift apart by however many
calls of each kind the run has already made. Measured in a converted suite: a double reporting
`[164, 165, 167, 168, 169]` beside a `vi.fn()` reporting `[28]` for its single call in the same test,
under an assertion that had been passing — because `jest-auto-spies` built both halves with
`jest.fn()`, which did share one counter. Three earlier calls of one family are enough to invert the
verdict. Nothing else in the library or in Vitest reads that field. If a suite needs the comparison,
compare two doubles of the same family, or switch the whole run back to the runner's factory:

```ts
// vitest.setup.ts
import { setSpyEngine } from 'vitest-auto-spy/setup';

setSpyEngine('runner'); // every double built afterwards is `vi.fn()` per method, as before 4.1
```

**On Vitest 5 the registry story changes, and this library follows it.** Vitest 5 keeps registered
mocks behind `WeakRef`s and its `clearAllMocks()` visits only the ones _called_ since the last
sweep — so a spy that is not a `vi.fn()` has to make itself reachable to that sweep deliberately. It
does, which is why `vi.clearAllMocks()`, `vi.resetAllMocks()` and the `clearMocks: true` default
(new in Vitest 5) clear these doubles exactly as they clear the runner's own. Nothing in a spec
changes, and the peer range still starts at 2.1 — one install spans Vitest 2.1 through 5.x. From
`@angular/build` 22.2.0 (with `@analogjs/*` 2.7.5 for Analog) an Angular project runs Vitest 5 with
no npm `overrides` — bump `vitest` and every `@vitest/coverage-*` to 5 together. Worth recommending:
on a zoneless 700-spec, 11,491-test suite with this library, `ng test --coverage` went from 16.50 s to
8.91 s with v8 (−46 %) and 37.07 s to 23.92 s with istanbul (−35.5 %), Vitest 4.1.11 → 5.0.2, peak
memory unchanged; the gain is coverage processing only (none with coverage off) and is −15.5 % /
−17.7 % at 150 specs. An incentive, not a requirement — see `/core/performance`.

What each config flag does to an auto-spy, measured on both spy engines: `clearMocks` empties the
calls and keeps the configuration; `mockReset` empties the calls and drops `mockReturnValue` /
`mockImplementation` but **keeps `calledWith` rules**; `restoreMocks` never touches an auto-spy (it
only undoes `vi.spyOn`). Do not claim the flags skip auto-spies — a sweep sentinel in the Vitest
adapter routes the first two. `resetAutoSpy(spy)` is the call that drops everything, `calledWith`
included. `mockReset()` on a `vi.spyOn(…)` runs the **real** method again (Vitest ≥ 3).

What Vitest 5 does break is the runner's own doing, not this library's: with `clearMocks` on by
default, a test asserting on a call that an **earlier** test or a `beforeAll` recorded now reads
zero. Count it in a plain variable rather than in the spy, or set `clearMocks: false`.

**The one exception to "nothing in a spec changes".** `setupAutoSpy({ pruneMockRegistry: true })`
discovers long-lived mocks by walking the runner's registry, which Vitest 5 no longer exposes — the
automatic half is a no-op there. `keepMockRegistered(mock)` works on every version and is the fix;
recommend it whenever a suite on Vitest 5 loses a shared mock's implementation to
`vi.resetAllMocks()`.

`getSpyEngine()` reports the current one, `'auto-spy'` is the default, and doubles already built keep
the engine they were built with. The switch is Vitest-only: on Bun and `node:test` the runner's own
matchers recognise only the runner's own mocks, so those adapters keep using them.

Two more switches, both about the environment rather than the spies:

```ts
setupAutoSpy({ blockNetwork: true }); // fetch rejects, XHR fails, sendBeacon answers false
```

Both DOMs leak, through different holes. happy-dom implements `fetch`, so a component pulling a
remote asset really fetches it, nothing asserts on the response, and the aborts at teardown fail the
run with **no test named** — a green run exiting 1 with `DOMException [AbortError]`. jsdom
implements `XMLHttpRequest` in full, and the libraries that never left XHR (a VAST player pinging
every tracker through a hand-rolled one) reach the internet once per ping per test, printing jsdom's
`AggregateError at Object.dispatchError` for each connection that failed — so what a green run
prints depends on whether the machine has a route out.

Every channel is closed by default; the object is for narrowing it:

| option | default | what it does |
| --- | --- | --- |
| `fetch` | `true` | `fetch` rejects, naming the method, the URL and the test, and the `stubResponse` line that answers it |
| `xhr` | `'reject'` | `'reject'` fails the request (`status` 0, an `error` event); `'empty'` answers 200 with an empty body; `false` leaves XHR alone |
| `beacon` | `true` | `navigator.sendBeacon` answers `false` — only where the environment has one |

`'reject'` is the default because it is what `fetch` does: the code takes its failure branch, which
is the branch a unit test should be asserting on. `'empty'` is for a request whose response nobody
reads — a tracker ping, an analytics beacon — where failing it only trades one kind of noise for
another:

```ts
setupAutoSpy({ blockNetwork: { xhr: 'empty' } }); // the ad-player suite's setting
```

**Called twice, the last caller's mode wins.** The setup file installs from its own `beforeEach`,
which runs before the spec's, so a spec calling `blockNetwork({ xhr: 'reject' })` because the failure
branch is what it is testing used to be served the setup file's empty 200 and pass on the wrong
branch. The stubs are also installed once rather than re-journalled per test, so `restoreProps: false`
no longer grows the restore journal for the length of the run.

A `data:` URL is always let through, and it is the only thing that is: that is the scheme a spec
serves its own fixtures from (`xhr.open('GET', \`data:application/xml,\${encodeURIComponent(vast)}\`)`),
and the only one a DOM answers without a socket. A **relative** URL is not exempt either — the DOM
resolves it against the document origin, so a spec that reaches `/config`and passes is resting on
nothing listening on that port.`WebSocket`and`EventSource`are left alone: their failure is an
event on an object the code keeps and reconnects, so there is no blanket answer that is not itself
a behaviour change —`stubConstructor(globalThis, 'WebSocket', …)` is the tool for a spec with one.

- `stubResponse(init?)` (`/setup`) builds a real `Response` — never write `{ ok, json } as Response`.
  Plain data in `body` goes out as JSON with `application/json`; an `ok` that disagrees with
  `status` throws. A body can be read once: for a stub answering several calls use
  `mockImplementation(async () => stubResponse(…))`, not `mockResolvedValue`.
- **`body: null` is the JSON literal, and only `undefined` or an omitted `body` send no body.** It
  reverses what the field used to mean: `null` sent no body, so `.json()` threw
  `Unexpected end of JSON input` on it while `0`, `false`, `[]` and `{}` round-tripped — the one
  literal a reader had no reason to expect to be different, and the shape a backend answering
  "nothing here" (an empty login, an absent profile) really sends. A spec that meant "no body"
  drops the field. `{ body: null, status: 204 }` throws by name rather than letting the constructor
  raise "Response with null body status cannot have body" about a field whose old meaning was the
  opposite; 205 and 304 are the same.
- `blockNetwork` leaves `fetch` alone while `Symbol.for('fetch-interceptor')` is on `globalThis`
  (MSW `setupServer`, nock 14), so MSW handlers keep answering; XHR stays blocked for what MSW does
  not handle. MSW's `onUnhandledRequest: 'error'` exempts asset-looking URLs (`.svg`, `.json`,
  fonts…); a last `http.all('*', () => HttpResponse.error())` is the hard floor. MSW's browser
  `setupWorker` has not been checked.

`restoreTimerGlobals` is on by default and needs no thought unless you turn it off: uninstalling
fake timers under happy-dom **deletes** `Date` instead of restoring it (the global is inherited from
the realm, not owned by `globalThis`), and with `isolate: false` the next file dies inside Vitest's
own `useFakeTimers` with `Cannot read properties of undefined (reading 'now')`. If you see that,
the file in the stack is not the cause.

`restoreWebStorage` is the other repair that is on by default. Vitest copies a DOM environment's
globals onto `globalThis` behind `if (k in global) return KEYS.includes(k)`, and neither
`localStorage` nor `sessionStorage` is in `KEYS` — both used to arrive only because Node put neither
on `globalThis`, so the first half of that condition was false. Node's own Web Storage made the key
exist, and the environment's storage stopped arriving: `setItem is not a function` on Node 25,
`undefined` on Node 26, under jsdom and happy-dom alike, because the filter runs before either. The
suite stays green until a spec touches storage, so this lands as "CI moved to a new Node and eleven
unrelated specs died". The repair writes a key, reads it back and removes it — a storage that
survives that is left alone, whoever implemented it — and it installs nothing in a `node`
environment, which is supposed to have no Web Storage at all.

`hookTimeoutHint` is on by default too, and it is the one that pays off on the day a suite lands in
CI. Jest resolves **one** budget — `hook.timeout || getState().testTimeout` for a hook,
`test.timeout || getState().testTimeout` for a body — while Vitest resolves `hookTimeout` on its
own and defaults it to 10 000 ms. Carry a preset's `testTimeout: 30000` into the runner config and
stop there, and every hook in the suite silently runs on a third of what its tests get. Worse, the
failure is filed against the wrong thing: a `beforeEach` timeout is attributed to the **test**, with
the test's duration pinned at the limit, so the report reads `× should create 10045ms` and sends the
reader looking for ten seconds of work inside a body that never ran. The hint appends both numbers
and the field to set. It says nothing when the budgets agree — then the hook really is slow — and
nothing for `beforeEach(fn, 300)`, which chose its own limit. `beforeAll` is out of reach by
construction: its timeout is reported as a failed _suite_, every test is skipped and no `afterEach`
runs.

**When migrating a runner config off Jest, set both timeouts side by side**, and treat the single
Jest number as belonging to both fields:

```ts
test: {
  testTimeout: 30_000,
  // Jest had one budget for both; Vitest defaults this to 10_000 on its own.
  hookTimeout: 30_000,
}
```

`frozenClockHint` is the same seam aimed at the other half of a timeout. A frozen clock turns
waiting into waiting forever — `await new Promise(r => setTimeout(r, 10))` never resolves unless
something advances it — and the runner's own advice ("pass a timeout value as the last argument") is
the one repair that cannot work: the callback is not late, it is never scheduled to run. Under
`globalFakeTimers` nothing in the spec says the clock is fake at all, so the timeout lands in a file
that never mentions a timer. The hint reports `vi.isFakeTimers()` and `vi.getTimerCount()` — facts,
not a guess — and stays silent when the clock is real or its queue is empty.

The shape that reaches this with no timer in sight is an HTTP spec. `setImmediate` is among the
globals `vi.useFakeTimers()` replaces by default, and Express ends a request that matched no route
through `finalhandler`, which schedules on `setImmediate`. So the 404 is never written and the test
dies on its timeout: in such a file, "the test hung" means _the route did not match_, not "the
server is slow". One thing this cannot see through — a spec whose own `afterEach` calls
`vi.useRealTimers()`, because hooks run in reverse registration order and the clock is real again by
the time the hint reads it. Nothing is reported then, rather than something wrong.

`angularBuildHint` is the third read-only hint, and the only one that speaks before a test rather
than after one. `@angular/build` in `[22.1.5, 22.1.7)` builds the unit-test bundle with esbuild code
splitting off — every spec a self-contained bundle, `--coverage` growing by hundreds of megabytes
with no plateau (791 chunks / 596 MB on a 784-spec suite) — and the builder says nothing. The
`doctor` check `angular-build-splitting-off` reports it, but has to be run; this line is printed
from inside the affected run, to stderr, once per worker. The builder is recognised by the marker
its own `vitest-mock-patch` setup file sets (`Symbol.for('@angular/cli/vitest-mock-patch')` on
`globalThis`, before any user setup file), so a plain Vitest run reads nothing; under the builder
the version comes from the nearest `node_modules/@angular/build/package.json` above the working
directory. That read is the one place the library touches the disk — one file, read-only, through
`process.getBuiltinModule` so `/setup` still loads with no `process` — and `scripts/check-dist.mjs`
allows `node:fs` in `dist/setup.js` for exactly that. Silent outside the builder, outside the
window, and on a Node before `getBuiltinModule`. `setupAutoSpy({ angularBuildHint: false })` turns
it off.

**Strict for one run:** `VITEST_AUTO_SPY_STRICT=1 npx vitest run <slice>` makes `setupAutoSpy()` arm
`strict` whatever the setup file passed (`0` turns it off, `survey` counts instead of throwing); a second `setupAutoSpy()` in an extra setup
file also works now, without grading the first call's network stubs as patched outside a hook.

**Moving a suite to `strict`:** most of the churn is the same few methods configured file by file.
Run the suite once in survey mode, which refuses nothing and ends each file with the list strict mode
would have refused, most frequent first (`setupAutoSpy({ strict: 'survey' })` is the same in code):

```bash
VITEST_AUTO_SPY_STRICT=survey npx vitest run
```

The top of that list — `SvgIconService.getIcon`, `NotificationsService.open` — goes into the setup
file once, `registerAutoSpyDefaults(NotificationsService, { returns: { open: undefined } })`, and
every double of the class answers it; the tail is what each spec configures itself.

**One setup file for the builder and for plain Vitest:** the builder initialises `TestBed` before any
setup file, so a second `initTestEnvironment()` throws "Cannot set base providers because it has
already been called". Guard it with `isAngularUnitTestBuilder()` from `/setup` — the same marker the
hint reads — and name the file in the target's `setupFiles`, which is the only way the builder runs
it (`doctor` reports `builder-setup-unreached` otherwise).

One more field of the same family differs quietly and changes only the report:
`slowTestThreshold` is `5` in Jest (**seconds**) and `300` in Vitest (**milliseconds**), so a
migrated suite starts marking most of its files slow. That is a unit change, not a regression.

Fake timers:

```ts
import { advanceTimers, setupFakeTimers } from 'vitest-auto-spy/setup';

setupFakeTimers(); // install + restore, paired
await advanceTimers(5_000); // advance AND drain the microtasks a bare advanceTimersByTime leaves
```

Coming from a Jest project that had `fakeTimers: { enableGlobally: true }`, every one of its tests
was written against a frozen clock. Turning that back on file by file is a thousand edits; turn it
on once instead:

```ts
setupAutoSpy({ globalFakeTimers: true }); // or a vi.useFakeTimers() config
```

Both ends are guarded, which is the half a hand-written pair of hooks gets wrong: a spec that drives
the clock itself would otherwise reach a second `vi.useRealTimers()`, and that one leaves the
environment without `clearInterval` — which explodes during teardown of whichever file runs next.

`globalFakeTimers` also keeps the clock fake **between** tests, and that half is not decoration: a
`beforeAll` inside a nested `describe` runs after the previous test's `afterEach`, so a
`beforeEach`-only pair leaves it on real timers and the block fails with `the timers APIs are not
mocked` without touching a timer itself. For one `describe` instead of the whole run:
`setupFakeTimers(config, { betweenTests: true })`.

Whatever you turn on, the hooks belong to the spec file whose collection imported the setup module.
If something keeps that module in the cache across files — `@angular/build:unit-test` before 22.2.0
under `--coverage` serves every test file as a wrapper around the built bundle, so the setup module
is never re-evaluated — only the first file of each worker gets them, and the rest fail somewhere
unrelated. 22.2.0 runs setup files per spec file under `--coverage` as well (angular-cli#34143). On
an older builder, run coverage with `--isolate`, or call `setupAutoSpy()` from something evaluated
per file.

### Freezing and counting the clock

```ts
import { mockNow, mockSystemTime, useCountingClock, withSystemTime } from 'vitest-auto-spy/setup';

mockSystemTime('2025-04-30T00:00:00Z');   // works whether or not fakes are already installed
await withSystemTime('2025-04-30T00:00:00Z', async () => { … });   // scoped, restores itself
const clock = useCountingClock();          // Date.now() → 1, 2, 3 …, reset before every test
mockNow(() => nextTimestamp());            // any Date.now source, re-applied before every test
```

**An assertion that contains a date must set the clock.** Otherwise the expected string is computed
from `new Date()` and the test starts failing on its own some days after it was written — which
reads as a regression and is not one.

`vi.spyOn(globalThis, 'Date')` is not the way. Fake timers already own that global, so it throws
`Date is not a constructor` with a stack in production code and no mention of timers.
`mockSystemTime` does the right thing either way.

Two rules about which of these composes with which, both of them earned:

- **`withSystemTime` puts the previous time back**, including when fake timers were already running.
  Its undo used to be a no-op there, so the clock stayed where the callback left it for the rest of
  the test.
- **`mockSystemTime()` installs `Date` and nothing else**, so `advanceTimers()` under it has nothing
  to advance. It used to pass having done nothing; it now refuses and names `setupFakeTimers()`.
  `setupFakeTimers(config)` installs the config it was given rather than deferring to whatever fakes
  were already up — a nested call, a global pair plus a local one, and the `Date`-only case all now
  end with the clock the call asked for, where the outer configuration used to win silently.

`useCountingClock` exists because under fake timers every call inside one test reports the _same_
"now", so a spec that asserts on **order** or **duration** — analytics batches, tracing, a rate
limiter, a TTL cache — cannot express its expectation at all. Patching `Date.now` by hand does not
survive: `vi.useFakeTimers()` installs a fresh `Date` on every call, so a module-scope or `beforeAll`
patch is left on an object nothing reads, and the naive undo re-attaches a dead clock's `now` to the
live one.

### Asserting focus

```ts
registerFocusMatchers(); // once, in the setup file

expect(fixture.nativeElement.querySelector('.play')).toHaveFocus();
```

The two idioms it replaces both fail unhelpfully: `expect(document.activeElement).toBe(el)` prints
two whole DOM subtrees, and `expect(el === document.activeElement).toBe(true)` prints
`expected false to deeply equal true`. The matcher separates the causes instead — the query found
nothing, the element is not in the document, focus is still on `<body>` (nothing claimed it), or
focus is on another element, which it names as `button#save.primary` rather than as a subtree.

### Shared fixtures are functions, not constants

Under `isolate: false` a module is evaluated **once per worker**, so this is one set of spies shared
by every file that imports it, registered against whichever file got there first — and the others'
`clearMocks` never reaches them. The symptom is a 30-second timeout, in a different file each run.

```ts
// ❌ __mocks__/context.ts
export const mockActionContext = { actions: { navigateToSection: vi.fn() } };
export const checkoutProvider = { provide: CheckoutState, useValue: { load: vi.fn() } };

// ✅
export const createActionContext = () => ({ actions: { navigateToSection: vi.fn() } });
export const createCheckoutProvider = () => ({ provide: CheckoutState, useValue: { load: vi.fn() } });
```

A spec file must **export nothing**: under `isolate: false` an exported spec file is imported by its
neighbours and loses its own suite. Put shared doubles in a `*.mock.ts` next to them, as factories.
The `no-shared-module-level-mock` lint rule (§16) finds these mechanically.

### A stub must be re-installed for every test

Every stub this library installs is taken off again by `restoreMockedProps()` after each test — that
is what keeps it out of the next file. So a stub installed once at `describe` level, or in a
`beforeAll`, is gone from the second test on, and what fails is an assertion about the component
with the stub sitting ten lines above it, apparently in force. The same ordering bites the other way:
a project-wide setup file installs its defaults in a root `beforeEach`, and root hooks run **before**
a file's own — so a `beforeAll` in a spec loses to them silently, while a `beforeEach` wins.

```ts
import { installPerTest } from 'vitest-auto-spy/setup';

const observers = installPerTest(() => stubIntersectionObserver({ autoEmit: true }));

it('…', () => expect(observers().last.targets).toEqual([host]));
```

It hands back a **reader**, not the handle: the handle is a different object each test.

### Naming the file that sealed a global

```ts
setupAutoSpy({ guardGlobals: 'throw' }); // or 'warn' while a suite is being cleaned up
```

`Object.defineProperty(document, 'cookie', { value })` defaults `configurable` to `false`, so the
property can no longer be redefined _or_ deleted. Under `isolate: false` every later file in the
worker inherits it, and what fails is some library, every other run, with nothing naming the file
that did it. The guard compares `globalThis`, `document`, `navigator`, `location`, `screen` and the
DOM prototypes a Jest-era stub reaches for — `Element`, `HTMLElement`, `HTMLCanvasElement`,
`HTMLMediaElement`, `Node`, `EventTarget` — around every test, symbol keys included, and reports only
what appeared and cannot be removed.

**Its blind spot is an existing name redefined in place.** The guard reads a descriptor only for a
key that was not there before, so `Object.defineProperty(document, 'cookie', { value, configurable: false })`
over the `cookie` the environment already has is invisible to it: the name was in the snapshot, and
only its configurability changed. What it catches is the addition — the shape that actually breaks a
later file, because the next `defineProperty` of a name nothing expected is the one that throws.
The snapshot is taken once per file, in `beforeAll`, rather than per test, and the comparison is also
run after every `afterAll`, so a write made in a `beforeAll` or an `afterAll` is reported too.

### Naming the file that polluted `Object.prototype`

```ts
setupAutoSpy(); // prototypePollution: 'throw' by default — 'warn' sweeps and only reports
```

Vitest walks a file's hooks with `for…in` in `mergeHooks`, so one own enumerable key on
`Object.prototype` is spread as if it were an array during **collect**:
`TypeError: Spread syntax requires ...iterable[Symbol.iterator] to be a function`, with no stack —
every frame of it is filtered out by `stackIgnorePatterns`. Under `isolate: false` the key outlives
its file, so **every later spec file in that worker fails to collect** while the run still reports
success: `145 failed | 1613 passed` over `11880 passed | 0 failed`, zero failing tests because those
files never ran. The guard compares `Object.prototype` / `Array.prototype` / `Function.prototype`
around every test, takes the key back off and names the file. The write is nearly always accidental:
`Object.getPrototypeOf(instance)` **is** `Object.prototype` when `instance` is an object literal from
a `useValue` provider or a test double — patch the prototype of the class the object came from.
`guardPrototypePollution(reaction)` from `/setup` registers the same check on its own, for a suite
that does not call `setupAutoSpy()`.

**A key an earlier file left behind is taken back before the next one is collected.** The per-test
comparison cannot see a write made while a spec file was being imported or collected, or in its
`afterAll` — all three happen outside any test, and the file that then fails to collect is the
innocent one. `setupAutoSpy()` therefore also checks at the moment it is called, which is the one
seam Vitest leaves between files: the key is deleted, a line goes to **stderr** naming it, and
**nothing fails** — the file that would fail is not the file that wrote it. A key that refuses to be
deleted is adopted into the baseline rather than reported once per file for the rest of the run. The
in-file check still throws at its default grade; the file's own baseline is taken in `beforeAll` and
re-checked after every `afterAll`, so a write made in either is covered as well.

### Naming the test that left an attribute on `<body>`

```ts
setupAutoSpy({ documentPollution: 'throw' }); // default 'off'; 'throw' under preset: 'strict'
setupAutoSpy({ documentPollution: { reaction: 'throw', nodes: true, ignoreAttributes: [/^data-cdk-/], ignoreNodes: 'style' } });
```

Under `isolate: false` every spec file in a worker shares one document. An attribute a component set
on `<body>` — `renderer.setAttribute(document.body, 'data-reset-focus', '')` in an `effect` — that
nothing took off changes the branch a later file's code takes, so that file fails, only when the two
share a worker and never alone. The guard records the attributes of `<html>`, `<head>` and `<body>`
before each test and compares them from `onTestFinished` — **after** the TestBed destroyed the
fixtures in its own `afterEach`, so what a component removes in `ngOnDestroy` / `DestroyRef.onDestroy`
is never reported. Every attribute added, changed or removed is named with both values, put back,
and fails that test. An empty `class` or `style` reads as the attribute being absent, in both
directions — `classList.add` followed by `remove` leaves `class=""` where there was none and nothing
observable changed; any other empty value, `data-reset-focus=""` included, is still reported.
A change made in a `beforeAll` and never undone fails the file, checked from a
`beforeAll` cleanup after every `afterAll`. `nodes: true` also watches the child elements of `<head>`
and `<body>`; it is off by default because a module that injects a stylesheet on first import does
so once per worker. Blind spots: a write made while the spec file is imported, and a fixture kept
alive by `teardown: { destroyAfterEach: false }` (reported against the test that rendered it).
`guardDocumentPollution(option)` from `/setup` registers the same check on its own. Vitest only, like
every `/setup` guard — `bun:test`, `node:test` and Rstest have no setup entry to host it.

### Failing on console output nothing absorbed

```ts
setupAutoSpy({ strayConsole: 'throw' }); // default 'off'; 'warn' prints the same report without failing
```

Any call to a console method that writes (`log`, `info`, `warn`, `error`, `debug`, `trace`, `table`,
`dir`, `dirxml`, `timeLog`, `timeEnd`, `count`; `group` with a label; a falsy `assert`) made during a
test that nothing absorbed fails **that test**, quoting the method, the first three lines and the first
frame outside `node_modules`, and naming the spy that absorbs it:

```
[vitest-auto-spy] "CartService > reports a failed load" wrote to console.error 1 time and nothing absorbed it:
  - console.error: Error: load failed
      at CartService.load (src/app/cart.service.ts:41:15)
Absorb what the test expects — installConsoleSpies() in a beforeEach, then assert consoleErrorSpy — or fix the code if the output is a defect.
Docs: https://asdalexey.github.io/vitest-auto-spy/utilities/setup#_16-console-output-nothing-absorbed
```

- **Absorbed** means the call never reached the console: a `/console` spy installed for the test or
  the file, `vi.spyOn(console, m).mockImplementation(…)`, any replacement that does not call
  through. A bare `vi.spyOn(console, m)` calls through and **counts** — the report says so and names
  `.mockImplementation(() => undefined)`; a method with no `/console` spy (`table`, `dir`) gets a
  silent `vi.spyOn` instead.
- **This library's own `'warn'`-grade reports are not stray console output.** `guardGlobals`,
  `prototypePollution`, `unconfiguredReads`, `swallowedStrictCalls`, `misconfiguration`, the
  duplicate-copy report, the skipped-teardown net and the `test.concurrent` notice write past the
  guard's wrapper, so `'warn'` stays a warning under `strayConsole: 'throw'` instead of failing the
  test it is advising about. A `vi.spyOn(console, 'warn')` a test installs still absorbs them — the
  channel checks that the guard's own wrapper is the installed method and steps aside when anything
  sits on top of it.
- Output **outside any test** — collection/import, `beforeAll` / `afterAll`, a callback after its
  test ended — fails the **file** at its end, in the same sweep as the timer and listener reports. The
  report names the phase — `while the file was being imported`, `in a beforeAll`,
  `after a test had ended`, or `outside any test` when they mix — and gives that phase's advice: for
  import-time output, the module and the line to fix. A recognised line (`NG0912`, any `NGxxxx`)
  adds a `Likely cause:` block. It always names the file that wrote the output: when that file's end
  never ran (its own `afterAll` threw), the next file reports it and says
  `It is reported at the end of b.spec.ts: the file-end check of a.spec.ts did not run.`
- Every console method a test replaced is put back after it; one a file replaced, after the file.
- Under the guard, **importing `vitest-auto-spy/console` installs nothing** — call
  `installConsoleSpies()` in a `beforeEach` (or at the top of the file). Spies an import installed
  before the guard armed are taken off.
- `strayConsole: { allow: ['…', /…/] }` is the last resort, for a line from a dependency no spec can
  reach — the import-time report offers it, with the pattern, only when the quoted frame is inside
  `node_modules`. Output written to `process.stdout` / `process.stderr` directly, and jsdom's own
  virtual console, is not seen. `NG0912` is not noise to allow: it means two copies of one component
  in the bundle, fixed by importing the component from one place.
- The wrapper forwards every call unchanged, so Vitest's attribution and `onConsoleLog` still work.
  `guardStrayConsole(reaction)` registers the same guard on its own.

### One grade for everything — `preset: 'strict'`

```ts
setupAutoSpy({ preset: 'strict' });
```

Sets `duplicateCopies`, `propsOutsideHooks`, `guardGlobals`, `prototypePollution`, `documentPollution`,
`strayConsole` and `misconfiguration` to `'throw'`, turns `strayTimers` on, and `strayRejections` on when zone.js is
loaded. An option passed alongside still wins. **Not** included: `strict` (strict doubles change what
an unconfigured call returns — a semantic switch, not a grade; the name was taken, hence `preset`) and
`unconfiguredReads`, its read side (survey with `onUnstubbedRead` before turning it on),
`blockNetwork` (changes the code under test), `restoreMocks` (drops `beforeAll` spies), failing on
stray-timer counts (the sweep fails the file from `afterAll`, and a callback scheduled after the
previous file's sweep is charged to the next — opt in with `onStrayTimers: 'throw'`, whose message
names the file and the test that scheduled each one, or `onStrayTimers: ({ timers }) => expect(timers).toEqual([])`), and
`enableAngularDiagnostics()`, which lives in `/angular/diagnostics` — call it in the same setup file as the Angular half of strict.

`misconfiguration: 'throw'` on its own makes the library's misuse reports — an `onlyMethodsToSpyOn`
typo, `gettersToSpyOn` naming a method, a `returns` key no spy answers to, `injectSpy` handed a real
instance, a `jasmine.DEFAULT_TIMEOUT_INTERVAL` write, `providedMethodNames`, a `nextWithValues()` on an
observable property something already subscribed to — throw at the call site,
every occurrence. The grade is process-wide and released after the file. The printed grade of the
`injectSpy` warning is de-duplicated per token **per spec file**, no longer per worker.

`withoutStrayTimerTracking(work)` runs setup work whose timers `strayTimers` neither counts nor
cancels — jsdom answers every Web Storage write with a real `setTimeout(…, 0)`, and the library's own
storage probe runs under it.

**`test.concurrent` earns one warning per worker, and it is worth reading rather than silencing.**
The per-test guards assume one test at a time: the document snapshot, the console window and the
unconfigured-read counter are opened and judged per test, so with two in flight a finding can be
charged to the other one — or cleared before anything sees it. The restores still run for every
test, and the skipped-teardown net now remembers per test rather than per file, which is the half
that was simply wrong. Run the files that need a guard sequentially, or keep `test.concurrent` for
files whose setup passes `strayConsole: 'off'`, `documentPollution: 'off'` and
`unconfiguredReads: 'off'`.

**What `/setup` costs per test**, measured on happy-dom over 10 000 empty tests (2026-09-17, Node
24): the default `setupAutoSpy()` **19 µs**, `guardGlobals` **59 µs** (it snapshots once per file
now, not once per test), `documentPollution` **23 µs** — it shares the `onTestFinished` the teardown
net registers anyway — and `preset: 'strict'` **67 µs**. `documentPollution: { nodes: true }` over a
`<head>` of 1000 children is **0.19 ms** per test rather than 7.1 ms, because the children are walked
as a sibling chain instead of through a live `HTMLCollection`; an `ignoreNodes` selector's answer for
an element is decided at snapshot time and reused for that test.

### Hook order differs from Jest

Vitest runs `afterEach` hooks as a stack (innermost / last-registered first); Jest ran them in
declaration order. A ported suite where a spec's `afterEach` depends on a patch the setup file
installed needs `sequence: { hooks: 'list' }` in the Vitest config, or the setup file's teardown runs
first and the spec's hook operates on an already-restored environment.
