import { type LintMessage } from 'eslint';
import { describe, expect, it } from 'vitest';

import { runRule } from './run-rule';

const RULE = 'no-vacuous-absence-assertion';

function verify(code: string): LintMessage[] {
  return runRule(RULE, code);
}

function count(code: string): number {
  return verify(code).length;
}

function message(code: string): string {
  return verify(code)[0]?.message ?? '';
}

/** The shape the rule was measured on: a capture, a subscription, and assertions silence satisfies. */
function capturing(assertions: string, declaration = 'let chips = [];'): string {
  return `
    it('yields an empty list', () => {
      ${declaration}

      load$(links).subscribe((result) => (chips = result));

      ${assertions}
    });
  `;
}

describe('no-vacuous-absence-assertion', () => {
  it('flags a test whose every assertion holds on the value the declaration left behind', () => {
    const code = capturing('expect(chips).toEqual([]);\nexpect(music.getMusicShelfById).not.toHaveBeenCalled();');
    const text = message(code);

    expect(count(code)).toBe(1);
    expect(text).toContain('`chips` is written by nothing but the `subscribe` callback');
    expect(text).toContain('(`[]`)');
    expect(text).toContain('expectNoEmission(source$)');
    expect(text).toContain('vitest-auto-spy');
  });

  it('reads the initialiser through the whitespace it was written with', () => {
    expect(count(capturing('expect(chips).toEqual([ ]);'))).toBe(1);
    expect(count(capturing('expect(chips).toStrictEqual([]);'))).toBe(1);
  });

  it('reads a capture the callback fills with push', () => {
    const code = `
      it('collects nothing', () => {
        const seen = [];

        source$.subscribe((value) => seen.push(value));

        expect(seen).toEqual([]);
      });
    `;

    expect(count(code)).toBe(1);
  });

  it('names the spy separately when the subscriber itself is the vi.fn()', () => {
    const code = `
      it('stays silent', () => {
        const seen = vi.fn();

        source$.subscribe(seen);

        expect(seen).not.toHaveBeenCalled();
      });
    `;

    expect(count(code)).toBe(1);
    expect(message(code)).toContain('is a `vi.fn()` handed to `subscribe` and called by nothing else');
  });

  it('reads the spy through an observer object, and through toHaveBeenCalledTimes(0)', () => {
    expect(
      count(`it('x', () => { const seen = vi.fn(); source$.subscribe({ next: seen }); expect(seen).toHaveBeenCalledTimes(0); });`),
    ).toBe(1);
    expect(count(`it('x', () => { const seen = vi.fn(); source$.subscribe(seen); expect(seen).not.toHaveBeenCalledWith(1); });`)).toBe(1);
  });

  it('matches the absence matcher against what the declaration holds, not against its family', () => {
    // `let emitted;` holds `undefined`, so `toBeNull()` there is an assertion that does fail on silence.
    expect(count(capturing('expect(chips).toBeUndefined();', 'let chips;'))).toBe(1);
    expect(count(capturing('expect(chips).not.toBeDefined();', 'let chips;'))).toBe(1);
    expect(count(capturing('expect(chips).toBeNull();', 'let chips;'))).toBe(0);
    expect(count(capturing('expect(chips).toBeNull();', 'let chips = null;'))).toBe(1);
    expect(count(capturing('expect(chips).toBeFalsy();', 'let chips = null;'))).toBe(1);
    expect(count(capturing('expect(chips).not.toBeTruthy();', 'let chips = null;'))).toBe(1);
    expect(count(capturing('expect(chips).toBeFalsy();', 'let chips = [];'))).toBe(0);
    expect(count(capturing('expect(chips).not.toBeTruthy();', 'let chips = [];'))).toBe(0);
    expect(count(capturing('expect(chips).toHaveLength(0);'))).toBe(1);
    expect(count(capturing('expect(chips).toHaveLength(0);', 'let chips = null;'))).toBe(0);
    expect(count(capturing('expect(chips).toContain(1);'))).toBe(0);
  });

  it('reads a count only where it is the literal zero', () => {
    const spy = (matcher: string): string => `it('x', () => { const seen = vi.fn(); source$.subscribe(seen); expect(seen).${matcher}; });`;

    expect(count(spy('toHaveBeenCalledTimes(0)'))).toBe(1);
    expect(count(spy('toHaveBeenCalledTimes(1)'))).toBe(0);
    expect(count(spy('toHaveBeenCalledTimes(times)'))).toBe(0);
    expect(count(spy('toHaveBeenCalledTimes()'))).toBe(0);
    expect(count(spy('toHaveBeenCalledTimes(0, 0)'))).toBe(0);
  });

  it('says nothing where one assertion in the test can fail on silence', () => {
    // The "not yet, and now yes" shape — 58 assertions in 21 files of the suite this was measured on.
    expect(
      count(`
        it('resolves once the route matches', () => {
          let emitted;

          service.banner$().subscribe((value) => (emitted = value));

          expect(emitted).toBeUndefined();

          emitNavigationEnd('/path');

          expect(emitted).toBe('gid');
        });
      `),
    ).toBe(0);
    // A positive sibling on the same spy.
    expect(
      count(`
        it('x', () => {
          const seen = vi.fn();

          source$.subscribe(seen);

          expect(seen).not.toHaveBeenCalled();
          expect(seen.mock.calls).toEqual(expected);
        });
      `),
    ).toBe(0);
    expect(count(capturing('expect(chips).toEqual(["all"]);'))).toBe(0);
    expect(count(capturing('expect(chips.length).toBe(0);'))).toBe(0);
    expect(count(capturing('expect(chips).toEqual();'))).toBe(0);
  });

  it('says nothing about a value the test waited for, where absence fails on its own', () => {
    expect(count(`it('x', async () => { const chips = await firstValueFrom(load$()); expect(chips).toEqual([]); });`)).toBe(0);
    expect(count(`it('x', async () => { const chips = await expectEmission(load$()); expect(chips).toEqual([]); });`)).toBe(0);
    expect(count(`it('x', async () => { await expect(load$()).resolves.toBeUndefined(); });`)).toBe(0);
  });

  it('says nothing where the absence is asserted of something no subscription wrote', () => {
    expect(count(`it('x', () => { service.load(); expect(store.write).not.toHaveBeenCalled(); });`)).toBe(0);
    // A capture exists, but the only assertion is about a collaborator: nothing here rests on it.
    expect(
      count(`it('x', () => { let chips = []; load$().subscribe((r) => (chips = r)); expect(dep.load).not.toHaveBeenCalled(); });`),
    ).toBe(0);
    expect(count(`it('x', () => { let chips = []; load$().subscribe((r) => (chips = r)); });`)).toBe(0);
  });

  it('says nothing when the capture is not the subscription’s alone', () => {
    // Assigned by the test as well, so it no longer holds what the declaration put there.
    expect(
      count(`it('x', () => { let chips = []; chips = seed; load$().subscribe((r) => (chips = r)); expect(chips).toEqual([]); });`),
    ).toBe(0);
    // Declared by the block above — a `let` a `beforeEach` fills is not this test's capture.
    expect(
      count(`
        describe('x', () => {
          let chips = [];

          it('y', () => {
            load$().subscribe((r) => (chips = r));

            expect(chips).toEqual([]);
          });
        });
      `),
    ).toBe(0);
    // A name nothing in the file declares, and one that is the test callback's own parameter.
    expect(count(`it('x', () => { load$().subscribe((r) => (leaked = r)); expect(leaked).toBeUndefined(); });`)).toBe(0);
    expect(count(`it('x', (ctx) => { load$().subscribe((r) => (ctx = r)); expect(ctx).toBeUndefined(); });`)).toBe(0);
  });

  it('says nothing about a subscriber that is not a vi.fn() the test kept to itself', () => {
    const spy = (setup: string): string => `it('x', () => { ${setup} source$.subscribe(seen); expect(seen).not.toHaveBeenCalled(); });`;

    expect(count(spy('const seen = vi.fn();'))).toBe(1);
    expect(count(spy('let seen;'))).toBe(0);
    expect(count(spy('const seen = (value) => value;'))).toBe(0);
    expect(count(spy('const seen = vi.fn(); seen(1);'))).toBe(0);
    expect(count(`it('x', () => { source$.subscribe(seen); expect(seen).not.toHaveBeenCalled(); });`)).toBe(0);
    expect(
      count(
        `describe('d', () => { const seen = vi.fn(); it('x', () => { source$.subscribe(seen); expect(seen).not.toHaveBeenCalled(); }); });`,
      ),
    ).toBe(0);
    expect(
      count(`it('x', () => { const seen = vi.fn(); source$.subscribe({ error: seen }); expect(seen).not.toHaveBeenCalled(); });`),
    ).toBe(0);
  });

  it('says nothing about a test that asserts through a helper of its own', () => {
    expect(
      count(`
        const expectChips = (chips) => expect(chips).toEqual(['all']);

        it('x', () => {
          let chips = [];

          load$().subscribe((r) => (chips = r));

          expectChips(chips);
          expect(chips).toEqual([]);
        });
      `),
    ).toBe(0);
    // A call this file does not declare is not a helper, so it settles nothing either way.
    expect(count(capturing('buildLinks();\nexpect(chips).toEqual([]);'))).toBe(1);
  });

  it('counts this library’s stream assertions, which fail on a source that stays silent', () => {
    const shape = (assertion: string): string => `
      it('completes without a value', async () => {
        const next = vi.fn();
        source$.subscribe({ next });
        ${assertion}
        expect(next).not.toHaveBeenCalled();
      });
    `;

    // `NEVER` in place of the source fails each of these by timeout, so the test is not vacuous.
    expect(count(shape('await expectCompletion(source$);'))).toBe(0);
    expect(count(shape('expect(await expectEmission(other$)).toBe(1);'))).toBe(0);
    expect(count(shape('await expectEmissions(other$, 2);'))).toBe(0);
    expect(count(shape('await expectError(source$);'))).toBe(0);
    // Asserting the silence itself is the repair, not a positive sibling.
    expect(count(shape('await expectNoEmission(source$);'))).toBe(1);
  });

  it('reads the marked spellings of a test name, and a wrapped body', () => {
    expect(count(capturing('expect(chips).toEqual([]);').replace('it(', 'it.only('))).toBe(1);
    expect(count(capturing('expect(chips).toEqual([]);').replace("it('yields an empty list',", "it.each([1])('yields %s',"))).toBe(1);
    expect(count(`it('x', fakeAsync(() => { let chips = []; load$().subscribe((r) => (chips = r)); expect(chips).toEqual([]); })); `)).toBe(
      1,
    );
  });

  it('reads nothing outside a test body', () => {
    expect(count(`beforeEach(() => { let chips = []; load$().subscribe((r) => (chips = r)); expect(chips).toEqual([]); });`)).toBe(0);
    expect(count(`describe('d', () => { let chips = []; load$().subscribe((r) => (chips = r)); expect(chips).toEqual([]); });`)).toBe(0);
    expect(
      count(`describe('d', fakeAsync(() => { let chips = []; load$().subscribe((r) => (chips = r)); expect(chips).toEqual([]); }));`),
    ).toBe(0);
    expect(count(`leaked = 1;\nexpect(leaked).toBeUndefined();`)).toBe(0);
    expect(count(`wrap((r) => { let chips = []; load$().subscribe((v) => (chips = v)); expect(chips).toEqual([]); })(arg);`)).toBe(0);
    expect(count(`(() => { let chips = []; load$().subscribe((v) => (chips = v)); expect(chips).toEqual([]); })();`)).toBe(0);
  });

  it('leaves alone an assertion chain it cannot read to the end', () => {
    expect(count(capturing('report(expect(chips).toBe);\nexpect(chips).toEqual([]);'))).toBe(0);
    expect(count(capturing('expect(chips);\nexpect(chips).toEqual([]);'))).toBe(0);
    expect(count(capturing('expect(chips)[matcher]([]);\nexpect(chips).toEqual([]);'))).toBe(0);
    expect(count(capturing('expect().toBeUndefined();\nexpect(chips).toEqual([]);'))).toBe(0);
  });

  it('ignores the writes and the calls that are neither a capture nor a helper', () => {
    expect(count(capturing('state.ready = true;\nfixture.detectChanges();\ngroups.items.push(1);\nexpect(chips).toEqual([]);'))).toBe(1);
  });
});
