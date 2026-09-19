/**
 * Assertions inside a `subscribe` callback, which only run if the stream emits. Both arms are
 * here: the report, and the done-callback rewrite the suggestion applies.
 */
import { type LintMessage } from 'eslint';
import { describe, expect, it } from 'vitest';

import { runRule } from './run-rule';

const RULE = 'no-expect-in-subscribe';

/** Lint one snippet with only this rule enabled. */
function verify(code: string): LintMessage[] {
  return runRule(RULE, code);
}

/** The rule ids reported for a snippet. */
function lint(code: string): string[] {
  return verify(code).map((message) => message.ruleId ?? 'parse-error');
}

/** The full message text of the first report, for the rules that must point at the README. */
function firstMessage(code: string): string {
  return verify(code)[0]?.message ?? '';
}

/** What the editor would offer for the first report. */
function suggestionsFor(code: string): string[] {
  return (verify(code)[0]?.suggestions ?? []).map((suggestion) => suggestion.desc);
}

/** The source as it would read after accepting the first report's first suggestion. */
function applySuggestion(code: string): string {
  const suggestion = verify(code)[0]?.suggestions?.[0];

  if (!suggestion) {
    return code;
  }

  const [start, end] = suggestion.fix.range;

  return `${code.slice(0, start)}${suggestion.fix.text}${code.slice(end)}`;
}

describe('no-expect-in-subscribe', () => {
  it('flags an assertion that only runs if the stream emits', () => {
    expect(lint('source$.subscribe((value) => expect(value).toBe(1));')).toHaveLength(1);
  });

  it('reports the subscribe once, whatever it asserts inside', () => {
    const code = 'source$.subscribe((value) => { expect(value).toBe(1); expect(value).toBeTruthy(); expect(other).toBe(2); });';

    expect(lint(code)).toHaveLength(1);
    expect(firstMessage(code)).toContain('all 3 of these');
  });

  it('counts an assertion however it is buried, and keeps two subscribes apart', () => {
    // The walk up to the enclosing `subscribe` passes a member call, a plain call and a computed
    // one on the way; none of them is the callback that matters.
    const code = 'a$.subscribe(() => { assertThat(expect(1).toBe(1)); });\nb$.subscribe(() => { helpers[key](expect(2).toBe(2)); });';

    expect(lint(code)).toHaveLength(2);
  });

  it('tells the three repairs apart, because they are three different edits', () => {
    // The subscription is the last thing the test does: invert it.
    expect(firstMessage('source$.subscribe((value) => expect(value).toBe(1));')).toContain('await firstValueFrom(source$)');
    // Something after it is what makes the stream emit — the commonest Angular spec there is.
    const triggered = [
      "it('x', async () => {",
      '  source$.subscribe((value) => { expect(value).toBe(1); });',
      '  req.flush(payload);',
      '});',
    ].join('\n');

    expect(firstMessage(triggered)).toContain('Hold the promise instead');
    // The failure branch resolves on nothing: it is `rejects`, positionally or by name.
    expect(firstMessage('source$.subscribe({ error: (e) => expect(e).toBe(err) });')).toContain('.rejects.');
    expect(firstMessage('source$.subscribe((v) => v, (e) => expect(e).toBe(err));')).toContain('.rejects.');
    expect(firstMessage('source$.subscribe({ next: (v) => expect(v).toBe(1) });')).toContain('await firstValueFrom(source$)');
  });

  it('handles an assertion that is inside the chain but in no handler at all', () => {
    // Inside the `pipe`, which is the subscribe call's callee rather than one of its arguments.
    expect(firstMessage('source$.pipe(tap((v) => expect(v).toBe(1))).subscribe(spy);')).toContain('await firstValueFrom');
  });

  it('handles a subscription that is not a statement of its own', () => {
    // Kept for later unsubscription, so there is no statement list to look past.
    expect(firstMessage("it('x', () => { const sub = source$.subscribe((v) => expect(v).toBe(1)); });")).toContain('await firstValueFrom');
    // …and the same with no enclosing statement of any kind above it.
    expect(firstMessage('const sub = source$.subscribe((v) => expect(v).toBe(1));')).toContain('await firstValueFrom');
  });

  it('finds assertions parked in a helper the callback calls', () => {
    const viaHelper = [
      'const assertShape = (data) => {',
      '  expect(data.items).toHaveLength(3);',
      "  expect(data.title).toBe('x');",
      '};',
      '',
      'source$.subscribe((data) => assertShape(data));',
    ].join('\n');

    expect(lint(viaHelper)).toHaveLength(1);
    expect(firstMessage(viaHelper)).toContain('all 2 of these');
    // A function declaration is the same helper spelled differently.
    expect(firstMessage('function assertShape(d) { expect(d).toBe(1); }\nsource$.subscribe((d) => assertShape(d));')).toContain(
      'all 1 of these',
    );
  });

  it('counts a helper declared inside the callback once, not twice', () => {
    const inner = 'source$.subscribe((d) => { const check = () => { expect(d).toBe(1); }; check(); });';

    expect(firstMessage(inner)).toContain('all 1 of these');
  });

  it('leaves a call that resolves to no local function alone', () => {
    expect(lint('source$.subscribe((d) => notDeclaredHere(d));')).toEqual([]);
    expect(lint('const size = 5;\nsource$.subscribe(() => size());')).toEqual([]);
    expect(lint('const noop = () => undefined;\nsource$.subscribe(() => noop());')).toEqual([]);
  });

  it('leaves an awaited assertion alone', () => {
    expect(lint('expect(await expectEmission(source$)).toBe(1);')).toEqual([]);
  });
});

describe('no-expect-in-subscribe — the done-callback rewrite', () => {
  /** The template that accounted for 111 of 133 violations in one migration batch. */
  const wrapped = [
    "it('maps the products', () =>",
    '  new Promise<void>((done) => {',
    '    service.getProducts(id).subscribe((products) => {',
    '      expect(products).toEqual(expected);',
    '      done();',
    '    });',
    '  }));',
  ].join('\n');

  it('suggests awaiting the first emission, and imports firstValueFrom', () => {
    expect(suggestionsFor(wrapped)).toEqual(['Await the stream instead of resolving a done callback: firstValueFrom()']);
    expect(applySuggestion(wrapped)).toBe(
      [
        "import { firstValueFrom } from 'rxjs';",
        "it('maps the products', async () => {",
        '  const products = await firstValueFrom(service.getProducts(id));',
        '',
        '  expect(products).toEqual(expected);',
        '});',
      ].join('\n'),
    );
  });

  it('keeps the depth the test already sits at, and the shape of what it lifts', () => {
    const nested = [
      "describe('products', () => {",
      "  it('maps them', () =>",
      '    new Promise<void>((done) => {',
      '      service.getProducts().subscribe((products) => {',
      '        expect(products).toEqual([',
      '          { id: 1 },',
      '        ]);',
      '',
      '        expect(spy).toHaveBeenCalled();',
      '        done();',
      '      });',
      '    }));',
      '});',
    ].join('\n');

    expect(applySuggestion(nested)).toBe(
      [
        "import { firstValueFrom } from 'rxjs';",
        "describe('products', () => {",
        "  it('maps them', async () => {",
        '    const products = await firstValueFrom(service.getProducts());',
        '',
        '    expect(products).toEqual([',
        '      { id: 1 },',
        '    ]);',
        '',
        '    expect(spy).toHaveBeenCalled();',
        '  });',
        '});',
      ].join('\n'),
    );
  });

  it('awaits without binding a value when the callback takes none', () => {
    const code = [
      "it('completes', () =>",
      '  new Promise<void>((done) => {',
      '    service.reload().subscribe(() => {',
      '      expect(spy).toHaveBeenCalled();',
      '      done();',
      '    });',
      '  }));',
    ].join('\n');

    expect(applySuggestion(code)).toContain('  await firstValueFrom(service.reload());');
  });

  it('uses the firstValueFrom the file already imports', () => {
    const code = `import { firstValueFrom } from 'rxjs';\n${wrapped}`;

    expect(
      applySuggestion(code)
        .split('\n')
        .filter((line) => line.startsWith('import')).length,
    ).toBe(1);
  });

  it('declines every shape that only looks like the template', () => {
    /** Rebuild the template with one part swapped out. */
    const variant = (executor: string, handler: string, body: string[]): string =>
      ["it('x', () =>", `  new Promise<void>(${executor} {`, `    source$.subscribe(${handler} {`, ...body, '    });', '  }));'].join('\n');

    const assertions = ['      expect(value).toBe(1);', '      done();'];

    // No settle parameter to key the rewrite on, or more than one.
    expect(suggestionsFor(variant('() =>', '(value) =>', assertions))).toEqual([]);
    expect(suggestionsFor(variant('(done, fail) =>', '(value) =>', assertions))).toEqual([]);
    expect(suggestionsFor(variant('({ done }) =>', '(value) =>', assertions))).toEqual([]);
    // A destructured emission, or a handler taking more than one argument.
    expect(suggestionsFor(variant('(done) =>', '({ value }) =>', assertions))).toEqual([]);
    expect(suggestionsFor(variant('(done) =>', '(value, index) =>', assertions))).toEqual([]);
    // `done` reached twice: one of the two paths would be dropped.
    expect(suggestionsFor(variant('(done) =>', '(value) =>', ['      if (value) { done(); }', '      done();']))).toEqual([]);
    // Nothing kept but the settle call, and a settle call that is not the last statement.
    expect(suggestionsFor(variant('(done) =>', '(value) =>', ['      done();']))).toEqual([]);
    expect(suggestionsFor(variant('(done) =>', '(value) =>', ['      done();', '      expect(value).toBe(1);']))).toEqual([]);
    // A callback that never settles the promise: the test hangs, and there is no first emission to
    // key the rewrite on either.
    expect(
      suggestionsFor(variant('(done) =>', '(value) =>', ['      expect(value).toBe(1);', '      expect(value).toBeTruthy();'])),
    ).toEqual([]);
    // A last statement that is not a call at all, or not even an expression.
    expect(suggestionsFor(variant('(done) =>', '(value) =>', ['      expect(value).toBe(1);', '      done;']))).toEqual([]);
    expect(suggestionsFor(variant('(done) =>', '(value) =>', ['      expect(value).toBe(1);', '      if (value) { done(); }']))).toEqual(
      [],
    );
    // A settle call that is handed something — a rejection, or a value the promise resolves with.
    expect(suggestionsFor(variant('(done) =>', '(value) =>', ['      expect(value).toBe(1);', '      done(value);']))).toEqual([]);
    // `firstValueFrom` already means something else in this file.
    expect(suggestionsFor(`const firstValueFrom = 1;\n${wrapped}`)).toEqual([]);
  });

  it('declines an executor that does anything besides subscribing', () => {
    // The extra statement is usually the one that *triggers* the source, and it has to run while
    // something is already listening — which an await cannot promise.
    const triggered = [
      "it('x', () =>",
      '  new Promise<void>((done) => {',
      '    source$.subscribe((value) => {',
      '      expect(value).toBe(1);',
      '      done();',
      '    });',
      '    trigger();',
      '  }));',
    ].join('\n');

    expect(suggestionsFor(triggered)).toEqual([]);
    // A concise executor body has no statement list to lift from at all.
    expect(suggestionsFor("it('x', () => new Promise<void>((done) => source$.subscribe(() => done())));")).toEqual([]);
  });

  it('rewrites a single-handler observer, choosing the awaiter that matches it', () => {
    const observer = (handler: string, extra = ''): string =>
      [
        "it('x', () =>",
        '  new Promise<void>((done) => {',
        `    source$.subscribe({ ${handler}: (${extra}) => {`,
        '      expect(spy).toHaveBeenCalled();',
        '      done();',
        '    } });',
        '  }));',
      ].join('\n');

    expect(applySuggestion(observer('next', 'value'))).toContain('await firstValueFrom(source$);');
    // `complete` fires after an empty stream too, which `firstValueFrom` rejects on.
    expect(applySuggestion(observer('complete'))).toContain('await lastValueFrom(source$, { defaultValue: undefined });');
    expect(applySuggestion(observer('complete'))).toContain("import { lastValueFrom } from 'rxjs';");
  });

  it('declines a subscribe whose argument is not a lone handler', () => {
    const wrap = (subscribe: string): string =>
      ["it('x', () =>", '  new Promise<void>((done) => {', `    ${subscribe}`, '  }));'].join('\n');

    // Two handlers: a one-off codemod that looked for `done()` as the last line of *a* callback
    // found it in `complete`, took `next` for the body, and broke the file.
    expect(suggestionsFor(wrap('source$.subscribe({ next: (v) => { expect(v).toBe(1); }, complete: () => { done(); } });'))).toEqual([]);
    // The failure branch is a different assertion, not a different call.
    expect(suggestionsFor(wrap('source$.subscribe({ error: (e) => { expect(e).toBeDefined(); done(); } });'))).toEqual([]);
    // Positional `next, error`.
    expect(suggestionsFor(wrap('source$.subscribe((v) => { expect(v).toBe(1); done(); }, (e) => done());'))).toEqual([]);
    // A handler that is not a block-bodied function, and an argument that is neither.
    expect(suggestionsFor(wrap('source$.subscribe({ next: assert });'))).toEqual([]);
    expect(suggestionsFor(wrap('source$.subscribe(handlers);'))).toEqual([]);
  });

  it('declines a test callback that takes the Vitest context', () => {
    const withContext = [
      "it('x', ({ task }) =>",
      '  new Promise<void>((done) => {',
      '    source$.subscribe((value) => {',
      '      expect(value).toBe(task.name);',
      '      done();',
      '    });',
      '  }));',
    ].join('\n');

    expect(suggestionsFor(withContext)).toEqual([]);
  });
});
