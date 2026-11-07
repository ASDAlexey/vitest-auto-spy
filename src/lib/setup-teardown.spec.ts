/**
 * The one `beforeEach`, the one `afterEach` and the net under them, driven through real runner hooks
 * on both paths the net can take: `aroundEach` where the runner has it, `onTestFinished` where not.
 */
import * as vitest from 'vitest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { expectFailures } from './expected-failure.mock';
import { type GuardRegistry, addRestore, createGuardRegistry } from './guard-registry';
import { installTeardown, noticeHookOrder, runnerAroundEach } from './setup-teardown';

const failsWith = expectFailures();

// Each test after an it.fails reads what the net did once that test failed.
describe('the teardown net, in file order', { shuffle: false }, () => {
  describe('runnerAroundEach', () => {
    it("hands back the runner's aroundEach where it has one", () => {
      expect(runnerAroundEach()).toBe(Reflect.get(vitest, 'aroundEach'));
    });

    it('answers undefined for a runner without it', () => {
      expect(runnerAroundEach({})).toBeUndefined();
    });
  });

  /** A registry whose steps write to a log, with a restore the net has to re-run. */
  function loggedRegistry(log: string[]): GuardRegistry {
    const registry = createGuardRegistry();

    registry.open.push(() => log.push('open:first'));
    registry.open.push((context) => log.push(`open:second:${typeof context.task}`));
    registry.teardown.push(() => log.push('check'));
    addRestore(registry, () => log.push('restore'));

    return registry;
  }

  function describeNet(path: string, runner: object): void {
    describe(`the net, on the ${path} path`, () => {
      const log: string[] = [];
      const closed: string[] = [];
      let opened = 0;
      let breakTeardown = false;

      installTeardown(
        loggedRegistry(log),
        {
          open: () => {
            opened += 1;
            const id = String(opened);

            return () => closed.push(id);
          },
        },
        runner,
      );

      beforeEach(() => {
        log.push('spec:beforeEach');
      });

      // Registered after the library's, so it runs first and, when it throws, skips the library's.
      afterEach(() => {
        if (breakTeardown) {
          breakTeardown = false;
          throw new Error('the spec hook that runs first, and throws');
        }
      });

      it('runs every open step in order, ahead of the spec hooks', () => {
        expect(log).toEqual(['open:first', 'open:second:object', 'spec:beforeEach']);
        log.length = 0;
      });

      it('ran the checks and then the restores after the previous test, and closed its document check', () => {
        expect(log.slice(0, 2)).toEqual(['check', 'restore']);
        expect(closed).toEqual(['1']);
        log.length = 0;
      });

      const warnings: string[] = [];

      it.fails('skips the teardown when a spec afterEach throws', () => {
        failsWith('the spec hook that runs first, and throws');
        vi.spyOn(console, 'warn').mockImplementation((message: unknown) => {
          warnings.push(String(message));
        });
        breakTeardown = true;
        log.length = 0;
      });

      it('has had the net re-run the restores alone, and say why', () => {
        vi.restoreAllMocks();

        expect(log.slice(0, 1)).toEqual(['restore']);
        expect(closed).toEqual(['1', '2', '3']);
        expect(warnings.join('\n')).toContain("setupAutoSpy()'s afterEach did not run");
      });
    });
  }

  describeNet('aroundEach', vitest);
  describeNet('onTestFinished', {});

  describe('the net, for a test whose opening step never ran', () => {
    let breakOpening = true;
    const warnings: string[] = [];

    // Registered ahead of the library's `beforeEach`, so its throw skips the opening step.
    beforeEach(() => {
      if (breakOpening) {
        breakOpening = false;
        failsWith('a setup hook that throws first');
        throw new Error('a setup hook that throws first');
      }
    });

    installTeardown(createGuardRegistry());

    it.fails('fails in the hook ahead of the library', () => {
      vi.spyOn(console, 'warn').mockImplementation((message: unknown) => {
        warnings.push(String(message));
      });
    });

    it('has had the net stay quiet about a teardown it never armed', () => {
      vi.restoreAllMocks();

      expect(warnings).toEqual([]);
    });
  });

  describe.concurrent('the net under test.concurrent', () => {
    const closed: number[] = [];
    let opened = 0;

    installTeardown(createGuardRegistry(), {
      open: () => {
        opened += 1;
        const id = opened;

        return () => closed.push(id);
      },
    });

    afterAll(() => {
      // Each test closes the document check it opened, once, whichever of them finished first.
      expect([...closed].sort((a, b) => a - b)).toEqual([1, 2]);
    });

    let finishFirst: () => void = () => undefined;
    const firstFinished = new Promise<void>((resolve) => {
      finishFirst = resolve;
    });

    it('holds its check open past the other test', async () => {
      await firstFinished;
      expect(opened).toBe(2);
    });

    it('finishes first', () => {
      expect(opened).toBeGreaterThan(0);
      finishFirst();
    });
  });

  describe('the hook order notice', () => {
    const written: string[] = [];
    const write = (message: string): void => {
      written.push(message);
    };
    const worker = (hooks: unknown): object => ({ config: { sequence: { hooks } } });

    afterEach(() => {
      written.length = 0;
      globalThis.__vitestAutoSpyHookOrderNoticed__ = undefined;
    });

    it("says nothing under the default 'stack', or where the config cannot be read", () => {
      noticeHookOrder(worker('stack'), write);
      noticeHookOrder(undefined, write);
      noticeHookOrder({}, write);

      expect(written).toEqual([]);
    });

    it("says once per worker that 'list' restores before a spec's own afterEach", () => {
      noticeHookOrder(worker('list'), write);
      noticeHookOrder(worker('parallel'), write);

      expect(written).toHaveLength(1);
      expect(written[0]).toMatch(
        /^\[vitest-auto-spy\] sequence\.hooks is 'list': Vitest runs the setup file's afterEach before a spec's own/,
      );
      expect(written[0]).toMatch(
        /Drop sequence\.hooks from the Vitest config.*Said once per worker\.\nDocs: \S+\/utilities\/setup#hook-order-differs-from-jest$/,
      );
    });

    it("says that 'parallel' races the teardown against the spec's own", () => {
      noticeHookOrder(worker('parallel'), write);

      expect(written[0]).toMatch(/sequence\.hooks is 'parallel': Vitest runs every afterEach at once/);
    });
  });
});
