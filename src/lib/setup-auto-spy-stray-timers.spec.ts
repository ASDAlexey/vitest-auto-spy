// @vitest-environment node
/**
 * `strayTimers` against Node's own `fetch()` and against rxjs. Each block stands in for a spec file;
 * its `afterAll` is the boundary, and the block after it reads what the library's hooks threw.
 */
import { addAbortListener, once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Subject } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { reportUnhandledObservableErrors, setupAutoSpy } from './setup-auto-spy';
import { countStrayTimers, trackStrayTimers } from './stray-timers';

const { hookErrors } = vi.hoisted(() => ({ hookErrors: [] as Error[] }));

type Hook = (context: { task?: unknown }) => unknown;

// Every afterEach and afterAll of this file is caught, so a check that throws is read, not failed on.
vi.mock('vitest', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vitest')>();
  const caught = (hook: Hook, context: { task?: unknown }): unknown => {
    try {
      return hook(context);
    } catch (error) {
      hookErrors.push(error as Error);

      return undefined;
    }
  };

  return {
    ...actual,
    afterAll: (hook: Hook) => actual.afterAll(() => caught(hook, {})),
    afterEach: (hook: Hook) => actual.afterEach(({ task }) => caught(hook, { task })),
  };
});

// Node 22 adds `Symbol.dispose` to the main realm only, so undici evaluated in a `vmThreads` context
// reads `undefined` and throws on every response; give it the symbol Node's own disposables carry.
if (!Reflect.has(Symbol, 'dispose')) {
  const [dispose] = Object.getOwnPropertySymbols(addAbortListener(new AbortController().signal, () => undefined));

  Object.defineProperty(Symbol, 'dispose', { value: dispose });
}

// Loaded after the symbol is in place, which a static import would not wait for.
const { fetch: undiciFetch } = await import('undici');

const server = createServer((_request, response) => response.end('{}'));

const failUnhandled = (message: string): void => {
  const subject = new Subject<never>();

  subject.subscribe();
  subject.error(new Error(message));
};

// Every block passes the same list, as every file of a run passes the one its setup file names: the latest call's list is the one in force.
const strayTimers = { ignore: [/\bkeepAlivePoller\b/] };

function keepAlivePoller(): void {
  setTimeout(() => undefined, 30);
}

describe('a file that fetches from a local server it cannot close, and polls through a timer it ignores', () => {
  setupAutoSpy({ duplicateCopies: 'off', restoreProps: false, strayTimers, onStrayTimers: 'throw' });

  beforeAll(async () => {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
  });

  // Node's own `fetch()` shares one undici with the runner, whose timers may be armed already; the
  // package is a fresh copy per file, so its first request schedules them for sure.
  it('fetches over kept-alive connections, through Node and through the undici package', async () => {
    const { port } = server.address() as AddressInfo;

    for (const request of [fetch, undiciFetch, fetch, undiciFetch]) {
      const response = await request(`http://127.0.0.1:${port}/`);

      await response.text();
    }

    keepAlivePoller();

    expect(countStrayTimers()).toBe(0);
  });
});

describe('the file after the one that fetched', () => {
  afterAll(async () => {
    trackStrayTimers()();
    server.closeAllConnections();
    server.close();
    await once(server, 'close');
  });

  it('was not charged with the timers of fetch(), nor with the ignored one', () => {
    expect(hookErrors).toEqual([]);
  });
});

describe('a file whose Observables error with nothing to handle them', () => {
  setupAutoSpy({ duplicateCopies: 'off', restoreProps: false, strayTimers, onStrayTimers: 'throw' });

  beforeAll(() => {
    // The block before took the tracking off after this one was collected.
    trackStrayTimers(undefined, strayTimers);
  });

  afterAll(() => failUnhandled('after the last test'));

  it('errors a subject nobody handles', () => {
    failUnhandled('502 from /api');
  });

  it('had the test before it fail with that error, not the file', () => {
    expect(hookErrors).toHaveLength(1);
    expect(hookErrors[0]?.message).toMatch(
      /^\[vitest-auto-spy\] Unhandled Observable error in ".*a file whose Observables error with nothing to handle them > errors a subject nobody handles":\n {2}- Error: 502 from \/api\n/,
    );
    expect(hookErrors[0]?.cause).toEqual(new Error('502 from /api'));
    hookErrors.length = 0;
  });
});

describe('the file after the one whose Observable errored after its last test', () => {
  afterAll(() => {
    trackStrayTimers()();
  });

  it('failed that file with the error, and reported no stray timer for it', () => {
    expect(hookErrors.map((error) => error.message.split('\n').slice(0, 2).join('\n'))).toEqual([
      '[vitest-auto-spy] Unhandled Observable error outside any test:\n  - Error: after the last test',
    ]);
    hookErrors.length = 0;
  });
});

describe('a file on the global fake clock whose Observable errors with nothing to handle it', () => {
  setupAutoSpy({ duplicateCopies: 'off', restoreProps: false, strayTimers, globalFakeTimers: true });

  it('errors a subject nobody handles', () => {
    failUnhandled('under a fake clock');
  });

  it('had the test before it fail with that error', () => {
    expect(hookErrors.map((error) => error.message.split('\n').slice(0, 2).join('\n'))).toEqual([
      expect.stringMatching(
        /^\[vitest-auto-spy\] Unhandled Observable error in ".* > errors a subject nobody handles":\n {2}- Error: under a fake clock$/,
      ),
    ]);
    hookErrors.length = 0;
  });
});

describe('reportUnhandledObservableErrors', () => {
  afterAll(() => {
    trackStrayTimers()();
  });

  it('stays quiet when there is nothing to report', () => {
    expect(() => reportUnhandledObservableErrors([])).not.toThrow();
  });
});
