#!/usr/bin/env node
// The gate proves the library works; this proves the *package* does.
//
// Every spec in `src/**` imports source. tsup then splits that source across one bundle per entry
// point, and a bundler decision no source test can observe is enough to break a shipped feature:
// 5.0.0 published an `explainSpy` that answered `nothing configured` for every double, because
// `ArgsMap` was inlined into `dist/index.js` and `dist/diagnostics.js` alike and the
// `map instanceof ArgsMap` behind the report compared a spy's copy against the reporter's. Green
// suite, green gate, 100 % coverage, dead feature.
//
// So this runs against `dist/`, from plain Node, and asks two questions a source test cannot:
// does every entry still load, and does a helper from one entry still understand a double built by
// another? Each entry loads in its own child process, because importing an entry registers a mock
// adapter and two of them in one process would answer for each other.
//
// Usage: node scripts/smoke-dist.mjs [--json]     (run `npm run build` first)
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('..', import.meta.url);
const DIST = new URL('dist/', ROOT);

// Four entries refuse to load outside the host they patch, by design and with a message saying so.
// They are named here with their reason rather than skipped quietly, and the suite that does cover
// each one is the gate for it.
const REQUIRES_HOST = new Map([
  ['./bun', 'imports bun:test — covered by npm run test:bun'],
  ['./rstest', 'imports @rstest/core — covered by npm run test:rstest'],
  ['./bun-angular', 'imports bun:test — covered by npm run test:bun:angular'],
  ['./angular-http', 'needs a Vitest run context — covered by the default suite'],
  ['./zone', 'needs zone.js/testing and runner globals — covered by npm run test:zone'],
]);

/**
 * Cross-entry behaviour: a double built by `builder`, read by a helper from `reader`.
 *
 * Each case is a whole program run in its own process — the string is the body of a module, so a
 * case can import exactly the entries it is about and nothing else.
 */
const CROSS_ENTRY = [
  {
    name: 'diagnostics/explainSpy reads a double built by the root entry',
    entries: ['./node', './diagnostics'],
    body: `
      const { createSpyFromClass } = await import(NODE);
      const { explainSpy } = await import(DIAGNOSTICS);

      class Cart {
        checkout(_id) { return ''; }
      }

      const cart = createSpyFromClass(Cart);
      cart.checkout.calledWith(1).mockReturnValue('one');
      cart.checkout(1);

      const report = explainSpy(cart, 'checkout');
      assert(report.includes('calledWith(1)'), 'the configured argument list is missing from the report');
      assert(report.includes('matched #1'), 'the recorded call was not attributed to the config it hit');
    `,
  },
  {
    name: 'rxjs helpers reach a double built by the root entry',
    entries: ['./node', './rxjs'],
    body: `
      const { createSpyFromClass } = await import(NODE);
      await import(RXJS);

      class Api {
        list() { return null; }
      }

      const api = createSpyFromClass(Api);
      assert(typeof api.list.nextWith === 'function', 'nextWith was not added to an observable method');

      let seen;
      api.list.nextWith([1, 2]);
      api.list().subscribe((value) => { seen = value; });
      assert(JSON.stringify(seen) === '[1,2]', 'nextWith did not emit through the built package');
    `,
  },
  {
    // The stream state is built on the first stream helper and lives behind the spy's mark, while
    // the reset that has to drop it lives in the core entry. Two bundles, one object — and the
    // buffer is what makes a miss silent: the `ReplaySubject` sits in a closure the value container
    // cannot reach, so a value from one test replays into the next one *ahead of* what that test
    // configured, and the spec fails on a value it never asked for.
    name: 'resetAutoSpy from the root entry drops the replay buffer configured through rxjs',
    entries: ['./node', './rxjs'],
    body: `
      const { createSpyFromClass, resetAutoSpy } = await import(NODE);
      await import(RXJS);

      class Feed {
        items() { return null; }
      }

      const feed = createSpyFromClass(Feed);

      feed.items.nextWith('first');
      let before;
      feed.items().subscribe((value) => { before = value; });
      assert(before === 'first', 'the stream did not emit before the reset');

      resetAutoSpy(feed);
      feed.items.throwWith(new Error('boom'));

      const seen = [];
      let failed;
      feed.items().subscribe({ next: (value) => seen.push(value), error: (error) => { failed = error.message; } });

      assert(seen.length === 0, 'the pre-reset value replayed into the next configuration: ' + JSON.stringify(seen));
      assert(failed === 'boom', 'the stream configured after the reset did not error');
    `,
  },
  {
    name: 'a strict double throws the catalogued message, not a bare TypeError',
    entries: ['./node'],
    body: `
      const { createSpyFromClass } = await import(NODE);

      class Cart {
        remove(_id) {}
      }

      const cart = createSpyFromClass(Cart, { strict: true });

      let message = '';
      try {
        cart.remove(7);
      } catch (error) {
        message = error.message;
      }

      assert(message.includes('Nothing configured Cart.remove'), 'strict mode did not name the class and method');
      assert(message.includes('Called as: Cart.remove(7)'), 'strict mode did not render the arguments');
    `,
  },
  {
    // A setup file registers from the package root and a Vue/React/Svelte spec creates from its own
    // entry — two bundles, and a module-level registry would leave the second one with an empty map
    // and no error to say so.
    name: 'defaults registered through the root entry reach a double built by another entry',
    entries: ['./node', './vue'],
    body: `
      const { registerAutoSpyDefaults, clearAutoSpyDefaults } = await import(NODE);
      const { createSpyFromClass } = await import(VUE);

      class Session {
        get token() { return ''; }
      }

      registerAutoSpyDefaults(Session, { gettersToSpyOn: ['token'] });

      const session = createSpyFromClass(Session);
      assert(Boolean(session.accessorSpies?.getters?.token), 'the registration did not reach the other entry point');

      clearAutoSpyDefaults(Session);
      const plain = createSpyFromClass(Session);
      assert(!plain.accessorSpies?.getters?.token, 'clearing through one entry did not reach the other');
    `,
  },
  {
    // The outside-a-hook report spans two bundles by construction — `setupAutoSpy` ships only from
    // `./setup` and the `mock*Prop` helpers only from the core entries — so the epoch it compares
    // has to be one counter for both. The epoch is advanced from a `beforeEach`, which plain Node
    // has no way to reach; what this can check is the shared counter the two sides agree on, and a
    // per-bundle one fails it before the sweep is ever involved.
    name: 'the outside-a-hook epoch is one counter for every entry point',
    entries: ['./node', './setup'],
    body: `
      const { mockValueProp, restoreMockedProps, reportPropsOutsideHooks } = await import(NODE);
      await import(SETUP);

      const target = { value: 'real' };
      mockValueProp(target, 'value', 'fake');

      const epoch = globalThis.__vitestAutoSpyPropEpoch__;
      assert(epoch !== undefined, 'the patch was stamped from a counter private to one bundle');

      // What the sweep in the other bundle does between two tests.
      epoch.current += 1;

      const warnings = [];
      const realWarn = console.warn;
      console.warn = (...args) => warnings.push(args.join(' '));
      restoreMockedProps();
      console.warn = realWarn;

      assert(warnings.length === 1, 'the sweep did not judge the patch against the shared counter');
      assert(target.value === 'real', 'the sweep did not put the real property back');

      reportPropsOutsideHooks('off');
      assert(globalThis.__vitestAutoSpyOutsideHookReaction__ === 'off', 'the reaction was set on a bundle-private variable');
    `,
  },
  // Every suite-wide switch is written by one bundle and read by another: `setupAutoSpy` ships in
  // `./setup`, while `dist/index.js` and `dist/angular.js` each carry their own copy of the factories.
  {
    name: 'a suite-wide strict default reaches doubles built by the root, a framework entry and angular',
    entries: ['.', './vue', './angular'],
    body: `
      const { createSpyFromClass } = await import(INDEX);
      const vue = await import(VUE);
      const { provideAutoSpy } = await import(ANGULAR);

      class Cart {
        total() { return 0; }
      }

      // What \`setupAutoSpy({ strict: true })\` writes; the holder is shared by every bundle that reads it.
      (globalThis.__vitestAutoSpyStrictDefault__ ??= { config: undefined }).config = { strict: true, onUnstubbedCall: undefined };

      for (const [label, cart] of [['index', createSpyFromClass(Cart)], ['vue', vue.createSpyFromClass(Cart)], ['angular', provideAutoSpy(Cart).useValue]]) {
        let message = '';
        try {
          cart.total();
        } catch (error) {
          message = error.message;
        }
        assert(message.includes('Nothing configured Cart.total'), 'the strict default did not reach a double built by ' + label);
      }
    `,
  },
  {
    name: 'takeStrictViolations from ./setup sees a strict throw of a double the root and angular built',
    entries: ['.', './angular', './setup'],
    body: `
      const { createSpyFromClass } = await import(INDEX);
      const { provideAutoSpy } = await import(ANGULAR);
      const { takeStrictViolations } = await import(SETUP);

      class Cart {
        total() { return 0; }
      }

      takeStrictViolations();

      for (const cart of [createSpyFromClass(Cart, { strict: true }), provideAutoSpy(Cart, { strict: true }).useValue]) {
        try {
          cart.total();
        } catch {
          // swallowed on purpose: the recorder is what is under test
        }
      }

      assert(takeStrictViolations().length === 2, 'a strict throw from another bundle was not recorded where ./setup reads it');
    `,
  },
  {
    name: 'setSpyEngine from ./setup reaches the adapter the root entry registered',
    entries: ['.', './setup'],
    body: `
      const { createSpyFromClass } = await import(INDEX);
      const { setSpyEngine } = await import(SETUP);

      class Cart {
        total() { return 0; }
      }

      const fast = Object.getPrototypeOf(createSpyFromClass(Cart).total);

      setSpyEngine('runner');
      const runner = Object.getPrototypeOf(createSpyFromClass(Cart).total);
      setSpyEngine('auto-spy');

      assert(fast !== runner, 'the engine set through ./setup was not the one the root adapter read');
    `,
  },
  {
    name: 'misconfiguration: throw reaches the root, a framework entry and angular',
    entries: ['.', './vue', './angular'],
    body: `
      const { createSpyFromClass } = await import(INDEX);
      const vue = await import(VUE);
      const { provideAutoSpy } = await import(ANGULAR);

      class Basket {
        total() { return 0; }
        clear() {}
      }

      const config = { onlyMethodsToSpyOn: ['total'], returns: { clear: undefined } };
      globalThis.__vitestAutoSpyMisconfiguration__ = 'throw';

      for (const [label, build] of [['index', () => createSpyFromClass(Basket, config)], ['vue', () => vue.createSpyFromClass(Basket, config)], ['angular', () => provideAutoSpy(Basket, config)]]) {
        let message = '';
        try {
          build();
        } catch (error) {
          message = error.message;
        }
        assert(message.includes("returns names 'clear'"), 'the misconfiguration grade did not reach ' + label);
      }
    `,
  },
  {
    // Under the stray-console guard an import cannot scope a spy to a file, so it must install nothing.
    name: 'the console entry installs nothing on import while the stray-console guard owns the console',
    entries: ['./console'],
    body: `
      globalThis.__vitestAutoSpyStrayConsole__ = { host: console };
      const { consoleErrorSpy, installConsoleSpies } = await import(CONSOLE);

      assert(console.error !== consoleErrorSpy, 'the import installed a spy the guard would have seen nothing through');
      installConsoleSpies();
      assert(console.error === consoleErrorSpy, 'installConsoleSpies() did not put the same spy on the console');
    `,
  },
  {
    // The other direction: spies an import installed before the guard armed are taken off by `./setup`,
    // which never imports `./console` and reaches them only through the slots the two bundles share.
    name: 'guardStrayConsole from ./setup takes off the spies the console entry installed on import',
    entries: ['./console', './setup'],
    body: `
      const { consoleErrorSpy } = await import(CONSOLE);
      const installed = console.error === consoleErrorSpy;
      const { guardStrayConsole } = await import(SETUP);

      // The guard arms before it registers its afterEach, and plain Node has no runner to register on.
      try {
        guardStrayConsole('throw');
      } catch (error) {
        assert(/failed to find the runner/.test(error.message), 'arming the guard failed: ' + error.message);
      }

      assert(installed, 'the console entry installed nothing on import with no guard armed');
      assert(globalThis.__vitestAutoSpyStrayConsole__ !== undefined, 'guardStrayConsole did not arm the shared guard');
      assert(console.error !== consoleErrorSpy, 'the guard left the import-time spy standing on the console');
    `,
  },
  {
    // `./setup` reports from the ledger the factory bundles note reads on; the window it opens from a
    // `beforeEach` is set by hand, since plain Node has no runner.
    name: 'a read nobody configured is noted on the one shared ledger by the root and angular bundles alike',
    entries: ['.', './angular'],
    body: `
      const { createSpyFromClass } = await import(INDEX);
      const { provideAutoSpy } = await import(ANGULAR);

      const ledger = (globalThis.__vitestAutoSpyUnconfiguredReads__ ??= { reported: false, handler: undefined, open: false, entries: new Map() });
      ledger.reported = true;
      ledger.open = true;

      class Router {
        get url() { return '/'; }
      }

      const config = { strict: true, gettersToSpyOn: ['url'] };
      void createSpyFromClass(Router, config).url;
      void provideAutoSpy(Router, config).useValue.url;

      const noted = [...ledger.entries.values()];
      assert(noted.length === 2, 'a read went to a ledger private to one bundle: ' + noted.length + ' of 2 noted');
      assert(noted.every((entry) => entry.guard.className === 'Router' && entry.member === 'url'), 'the ledger named the wrong member');
    `,
  },
  {
    name: 'restoreMockedProps from the root entry takes back a storage stubWebStorage installed',
    entries: ['.', './dom-stubs'],
    body: `
      const { restoreMockedProps } = await import(INDEX);
      const { stubWebStorage } = await import(DOM_STUBS);

      const before = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
      const storage = stubWebStorage('localStorage', { items: { theme: 'dark' } });

      globalThis.localStorage.setItem(1, 'one');
      assert(globalThis.localStorage.getItem('theme') === 'dark', 'the seeded item did not reach the installed storage');
      const snapshot = storage.snapshot();
      assert(snapshot.theme === 'dark' && snapshot['1'] === 'one', 'snapshot() missed a write: ' + JSON.stringify(snapshot));

      restoreMockedProps();

      const after = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
      assert(after?.value === before?.value && after?.get === before?.get, 'the root entry did not undo the patch the dom-stubs entry made');
    `,
  },
  // `dist/index.js` carries its own `fast-spy`, the framework entries share another, and 5.4.0 put
  // the helper bundle on the wrong copy's prototype: whichever entry loaded first built spies with no
  // `calledWith`. Both load orders, because the claim record has to hold in either.
  ...[
    ['INDEX', 'VUE'],
    ['VUE', 'INDEX'],
  ].map(([first, second]) => ({
    name: `spies from ${first.toLowerCase()} and ${second.toLowerCase()} in one process both keep their helpers`,
    entries: ['.', './vue'],
    body: `
      const loaded = [await import(${first}), await import(${second})];

      class Cart {
        total(_id) { return 0; }
        load() { return Promise.resolve(0); }
      }

      for (const [index, { createSpyFromClass }] of loaded.entries()) {
        const cart = createSpyFromClass(Cart);
        const label = index === 0 ? '${first.toLowerCase()}' : '${second.toLowerCase()}';

        assert(typeof cart.total.calledWith === 'function', 'calledWith is missing from a spy built by ' + label);
        assert(typeof cart.total.mustBeCalledWith === 'function', 'mustBeCalledWith is missing from a spy built by ' + label);
        assert(typeof cart.load.resolveWith === 'function', 'resolveWith is missing from a spy built by ' + label);

        cart.total.calledWith(1).mockReturnValue(7);
        assert(cart.total(1) === 7 && cart.total(2) !== 7, 'calledWith on a spy built by ' + label + ' did not match by argument');
      }
    `,
  })),
];

function fail(message) {
  process.stderr.write(`smoke-dist: ${message}\n`);
}

function entryPaths() {
  const manifest = JSON.parse(readFileSync(new URL('package.json', ROOT), 'utf8'));

  return Object.entries(manifest.exports).flatMap(([subpath, target]) => {
    const file = typeof target === 'string' ? target : (target.import?.default ?? target.import ?? target.default);

    return typeof file === 'string' && file.endsWith('.js') ? [{ subpath, file }] : [];
  });
}

/** Run one module body in a child, so an adapter it registers cannot leak into the next case. */
function runInChild(source) {
  return spawnSync(process.execPath, ['--input-type=module', '--eval', source], {
    cwd: fileURLToPath(ROOT),
    encoding: 'utf8',
  });
}

const PRELUDE = `
  const assert = (ok, message) => {
    if (!ok) {
      process.stderr.write(message + '\\n');
      process.exit(1);
    }
  };
`;

function checkEntriesLoad(entries) {
  const failures = [];

  for (const { subpath, file } of entries) {
    if (REQUIRES_HOST.has(subpath)) {
      continue;
    }

    const target = new URL(file.replace('./dist/', ''), DIST);
    const source = `
      const module = await import(${JSON.stringify(target.href)});
      const names = Object.keys(module);
      if (names.length === 0) {
        process.stderr.write('the entry loaded but exports nothing\\n');
        process.exit(1);
      }
    `;

    const result = runInChild(source);

    if (result.status !== 0) {
      failures.push({ subpath, reason: (result.stderr || '').trim().split('\n').slice(0, 4).join(' | ') });
    }
  }

  return failures;
}

/** `./angular-http` → `ANGULAR_HTTP`; the package root, which has no name of its own, is `INDEX`. */
function constantName(subpath) {
  return subpath === '.' ? 'INDEX' : subpath.replace('./', '').toUpperCase().replaceAll('-', '_');
}

function checkCrossEntry(entries) {
  const bySubpath = new Map(entries.map(({ subpath, file }) => [subpath, new URL(file.replace('./dist/', ''), DIST).href]));
  const failures = [];

  for (const testCase of CROSS_ENTRY) {
    const constants = testCase.entries
      .map((subpath) => `const ${constantName(subpath)} = ${JSON.stringify(bySubpath.get(subpath))};`)
      .join('\n');

    const result = runInChild(`${PRELUDE}\n${constants}\n${testCase.body}`);

    if (result.status !== 0) {
      failures.push({ name: testCase.name, reason: (result.stderr || '').trim().split('\n')[0] });
    }
  }

  return failures;
}

if (!existsSync(new URL('index.js', DIST))) {
  fail('dist/ is missing or empty — run `npm run build` first.');
  process.exit(1);
}

const entries = entryPaths();
const loadFailures = checkEntriesLoad(entries);
const crossFailures = checkCrossEntry(entries);

if (process.argv.includes('--json')) {
  process.stdout.write(`${JSON.stringify({ loadFailures, crossFailures }, null, 2)}\n`);
}

for (const { subpath, reason } of loadFailures) {
  fail(`the ${subpath} entry does not load from dist/: ${reason}`);
}

for (const { name, reason } of crossFailures) {
  fail(`${name}: ${reason}`);
}

if (loadFailures.length > 0 || crossFailures.length > 0) {
  process.exit(1);
}

const checked = entries.length - REQUIRES_HOST.size;
const skipped = [...REQUIRES_HOST].map(([subpath, reason]) => `  ${subpath} — ${reason}`).join('\n');

process.stdout.write(`smoke-dist: ${checked} entries load, ${CROSS_ENTRY.length} cross-entry checks pass\n`);
process.stdout.write(`not loadable outside their host, by design:\n${skipped}\n`);
