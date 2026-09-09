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

function checkCrossEntry(entries) {
  const bySubpath = new Map(entries.map(({ subpath, file }) => [subpath, new URL(file.replace('./dist/', ''), DIST).href]));
  const failures = [];

  for (const testCase of CROSS_ENTRY) {
    const constants = testCase.entries
      .map((subpath) => `const ${subpath.replace('./', '').toUpperCase().replaceAll('-', '_')} = ${JSON.stringify(bySubpath.get(subpath))};`)
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
