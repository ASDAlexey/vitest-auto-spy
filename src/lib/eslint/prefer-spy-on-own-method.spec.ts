import { type LintMessage } from 'eslint';
import { describe, expect, it } from 'vitest';

import { ENTRY_SPECIFIERS, EXPORTED_BY } from '../../cli/checks/export-map.generated';
import { CORE_ENTRIES } from './bindings';
import { fixRule, runRule } from './run-rule';

const RULE = 'prefer-spy-on-own-method';
const IMPORT = "import { createSpyFromInstance } from 'vitest-auto-spy';\n";
const OWN = "{ onlyMethodsToSpyOn: ['seek'], passthrough: true }";

function verify(code: string): LintMessage[] {
  return runRule(RULE, code, { severity: 'warn' });
}

function autofix(code: string): string {
  return fixRule(RULE, code, { severity: 'warn' }).output;
}

/** The source after applying the one report's only suggestion. */
function suggested(code: string): string {
  const [report, ...rest] = verify(code);
  const fix = report?.suggestions?.[0]?.fix;

  expect(rest).toEqual([]);
  expect(report).not.toHaveProperty('fix');

  return fix ? `${code.slice(0, fix.range[0])}${fix.text}${code.slice(fix.range[1])}` : 'no suggestion';
}

/** Neither a fix nor a suggestion, but still one report. */
function reportOnly(code: string): LintMessage | undefined {
  const reports = verify(code);

  expect(reports).toHaveLength(1);
  expect(reports[0]).not.toHaveProperty('fix');
  expect(reports[0]?.suggestions ?? []).toEqual([]);

  return reports[0];
}

describe(RULE, () => {
  it('rewrites a member read off the call, the one-line and the multi-line spelling alike', () => {
    expect(autofix(`${IMPORT}const seek = createSpyFromInstance(player, ${OWN}).seek;`)).toBe(
      "import { spyOnOwnMethod } from 'vitest-auto-spy';\nconst seek = spyOnOwnMethod(player, 'seek');",
    );
    expect(
      autofix(
        `${IMPORT}const seek = createSpyFromInstance(\n  fixture.componentInstance,\n  {\n    passthrough: true,\n    onlyMethodsToSpyOn: [\n      'seek',\n    ],\n  },\n)['seek'];\nexpect(seek).toHaveBeenCalled();`,
      ),
    ).toBe(
      "import { spyOnOwnMethod } from 'vitest-auto-spy';\nconst seek = spyOnOwnMethod(fixture.componentInstance, 'seek');\nexpect(seek).toHaveBeenCalled();",
    );
  });

  it('rewrites a destructuring and a bare statement', () => {
    expect(autofix(`${IMPORT}const { seek } = createSpyFromInstance(player, ${OWN});`)).toBe(
      "import { spyOnOwnMethod } from 'vitest-auto-spy';\nconst seek = spyOnOwnMethod(player, 'seek');",
    );
    expect(autofix(`${IMPORT}const { seek: onSeek } = createSpyFromInstance(player, ${OWN});`)).toBe(
      "import { spyOnOwnMethod } from 'vitest-auto-spy';\nconst onSeek = spyOnOwnMethod(player, 'seek');",
    );
    expect(autofix(`${IMPORT}createSpyFromInstance(player, ${OWN});\nexpect(player.seek).toHaveBeenCalled();`)).toBe(
      "import { spyOnOwnMethod } from 'vitest-auto-spy';\nspyOnOwnMethod(player, 'seek');\nexpect(player.seek).toHaveBeenCalled();",
    );
  });

  it('rewrites a variable read only as that member, and every read with it', () => {
    const code = `${IMPORT}it('seeks', () => {\n  const spy = createSpyFromInstance(player, ${OWN});\n  player.play();\n  expect(spy.seek).toHaveBeenCalledWith(1);\n  spy['seek'].mockClear();\n});`;

    expect(autofix(code)).toBe(
      "import { spyOnOwnMethod } from 'vitest-auto-spy';\nit('seeks', () => {\n  const spy = spyOnOwnMethod(player, 'seek');\n  player.play();\n  expect(spy).toHaveBeenCalledWith(1);\n  spy.mockClear();\n});",
    );
    expect(
      autofix(
        `${IMPORT}let spy;\nbeforeEach(() => {\n  spy = createSpyFromInstance(player, ${OWN});\n});\nit('x', () => expect(spy.seek).toHaveBeenCalled());`,
      ),
    ).toBe(
      "import { spyOnOwnMethod } from 'vitest-auto-spy';\nlet spy;\nbeforeEach(() => {\n  spy = spyOnOwnMethod(player, 'seek');\n});\nit('x', () => expect(spy).toHaveBeenCalled());",
    );
  });

  it('carries a Spy<X> annotation as Spy<X>[m], as a suggestion', () => {
    expect(
      suggested(`let spy: Spy<Player>;\nbeforeEach(() => {\n  spy = createSpyFromInstance(player, ${OWN});\n});\nspy.seek.mockClear();`),
    ).toBe(
      "import { spyOnOwnMethod } from 'vitest-auto-spy';\nlet spy: Spy<Player>['seek'];\nbeforeEach(() => {\n  spy = spyOnOwnMethod(player, 'seek');\n});\nspy.mockClear();",
    );
  });

  it('reports without an edit where the annotation, the type arguments or the name stand in the way', () => {
    for (const annotation of ['Player', 'ns.Spy<Player>', 'Spy', 'Spy<Player, { overload: {} }>']) {
      reportOnly(`const spy: ${annotation} = createSpyFromInstance(player, ${OWN});\nspy.seek();`);
    }

    reportOnly(`const { seek }: Spy<Player> = createSpyFromInstance(player, ${OWN});`);
    reportOnly(`createSpyFromInstance<Player>(player, ${OWN});`);
    reportOnly(`const spyOnOwnMethod = 1;\ncreateSpyFromInstance(player, ${OWN});`);
  });

  it('names the helper and the method in the message', () => {
    const [report] = verify(`createSpyFromInstance(player, ${OWN});`);

    expect(report?.message).toMatch(/spyOnOwnMethod\(target, 'seek'\)[\s\S]*\/utilities\/eslint-rules#prefer-spy-on-own-method/);
  });

  it('rewrites the void whitelist-and-seed pair on any target', () => {
    const options = "{ onlyMethodsToSpyOn: ['close'], returns: { close: undefined } }";

    expect(autofix(`${IMPORT}const { close } = createSpyFromInstance(select, ${options});`)).toBe(
      "import { spyOnVoidMethod } from 'vitest-auto-spy';\nconst close = spyOnVoidMethod(select, 'close');",
    );
    expect(
      autofix(
        `${IMPORT}const el = document.createElement('div');\ncreateSpyFromInstance(el, {\n  onlyMethodsToSpyOn: ['scrollIntoView'],\n  returns: { 'scrollIntoView': undefined },\n});`,
      ),
    ).toBe(
      "import { spyOnVoidMethod } from 'vitest-auto-spy';\nconst el = document.createElement('div');\nspyOnVoidMethod(el, 'scrollIntoView');",
    );
    expect(verify(`createSpyFromInstance(el, ${options});`)[0]?.message).toContain("spyOnVoidMethod(target, 'close')");
  });

  it('suggests spyOnVoidMethod for a bare void seed on a real event or element', () => {
    const seed = '{ returns: { preventDefault: undefined } }';

    for (const target of [
      "new MouseEvent('click')",
      "new Event('submit') as Event",
      'fixture.nativeElement',
      'hostFixture.debugElement.nativeElement',
      "fixture.debugElement.query(By.css('a')).nativeElement",
      "fixture.nativeElement.querySelector('button')!",
      'document',
      'window',
      'document.body',
      "document.createElementNS(ns, 'svg')",
    ]) {
      expect(suggested(`createSpyFromInstance(${target}, ${seed}).preventDefault;`)).toBe(
        `import { spyOnVoidMethod } from 'vitest-auto-spy';\nspyOnVoidMethod(${target}, 'preventDefault');`,
      );
    }

    expect(
      suggested(`let event;\nbeforeEach(() => { event = new KeyboardEvent('keydown'); });\ncreateSpyFromInstance(event, ${seed});`),
    ).toContain("spyOnVoidMethod(event, 'preventDefault');");
    expect(verify(`createSpyFromInstance(document, ${seed});`)[0]?.message).toMatch(/discovery spies every other method/);
  });

  it('never guesses at a double or an object it cannot see is real', () => {
    const seed = '{ returns: { preventDefault: undefined } }';

    for (const target of [
      'createAutoMock<Event>()',
      'createSpyFromClass(Event)',
      '{} as unknown as Event',
      'event',
      'component',
      'elementRef.nativeElement',
      'component.nativeElement',
      'makeEvent()',
      'events.find(isClick)',
      'new Emitter()',
      'new events.CustomEvent()',
      'document.head',
      'Event',
    ]) {
      expect(verify(`createSpyFromInstance(${target}, ${seed});`)).toEqual([]);
    }

    expect(verify(`const event = other;\ncreateSpyFromInstance(event, ${seed});`)).toEqual([]);
    expect(verify(`const document = createMock<Document>();\ncreateSpyFromInstance(document, ${seed});`)).toEqual([]);
    expect(verify(`class MouseEvent {}\ncreateSpyFromInstance(new MouseEvent(), ${seed});`)).toEqual([]);
  });

  it('stays silent on every option set the helpers do not spell', () => {
    for (const options of [
      "{ onlyMethodsToSpyOn: ['seek', 'play'], passthrough: true }",
      "{ onlyMethodsToSpyOn: ['seek'] }",
      "{ methodsToSpyOn: ['seek'], passthrough: true }",
      "{ onlyMethodsToSpyOn: ['seek'], passthrough: false }",
      "{ onlyMethodsToSpyOn: ['seek'], passthrough: flag }",
      "{ onlyMethodsToSpyOn: ['seek'], passthrough: true, strict: true }",
      '{ onlyMethodsToSpyOn: methods, passthrough: true }',
      '{ onlyMethodsToSpyOn: [name], passthrough: true }',
      "{ onlyMethodsToSpyOn: ['a-b'], passthrough: true }",
      '{ onlyMethodsToSpyOn: [,], passthrough: true }',
      "{ ...base, onlyMethodsToSpyOn: ['seek'] }",
      "{ onlyMethodsToSpyOn: ['close'], returns: { play: undefined } }",
      "{ onlyMethodsToSpyOn: ['close'], returns: { close: null } }",
      "{ onlyMethodsToSpyOn: ['close'], returns: { close: nothing } }",
      "{ onlyMethodsToSpyOn: ['close'], returns: { close: undefined, play: undefined } }",
      "{ onlyMethodsToSpyOn: ['close'], returns: { ...seeds } }",
      "{ onlyMethodsToSpyOn: ['close'], returns: seeds }",
      "{ returns: { 'a-b': undefined } }",
      '{ passthrough: true }',
      'options',
    ]) {
      expect(verify(`createSpyFromInstance(document, ${options}).seek;`)).toEqual([]);
    }

    expect(verify(`createSpyFromInstance(player, ${OWN}, extra);`)).toEqual([]);
    expect(verify('createSpyFromInstance(player);')).toEqual([]);
    expect(verify('createSpyFromInstance();')).toEqual([]);
    expect(verify(`spies.createSpyFromInstance(player, ${OWN});`)).toEqual([]);
    expect(verify(`createSpyFromClass(Player, ${OWN});`)).toEqual([]);
    expect(verify(`function createSpyFromInstance() {}\ncreateSpyFromInstance(player, ${OWN});`)).toEqual([]);
  });

  it('stays silent where the result is used for more than the one member', () => {
    for (const code of [
      `const spy = createSpyFromInstance(player, ${OWN});\nspy.seek();\nspy.play();`,
      `const spy = createSpyFromInstance(player, ${OWN});\nspy.seek = vi.fn();`,
      `const spy = createSpyFromInstance(player, ${OWN});\nhandOver(spy);`,
      `const spy = createSpyFromInstance(player, ${OWN});\nspy[key]();`,
      `let spy = createSpyFromInstance(player, ${OWN});\nspy = other;`,
      `export const spy = createSpyFromInstance(player, ${OWN});`,
      `using spy = createSpyFromInstance(player, ${OWN});`,
      `const { seek, play } = createSpyFromInstance(player, ${OWN});`,
      `const {} = createSpyFromInstance(player, ${OWN});`,
      `const { play } = createSpyFromInstance(player, ${OWN});`,
      `const { seek: { calls } } = createSpyFromInstance(player, ${OWN});`,
      `const { seek = fallback } = createSpyFromInstance(player, ${OWN});`,
      `const { ...rest } = createSpyFromInstance(player, ${OWN});`,
      `const [first] = createSpyFromInstance(player, ${OWN});`,
      `createSpyFromInstance(player, ${OWN}).play;`,
      `createSpyFromInstance(player, ${OWN}).seek = vi.fn();`,
      `return createSpyFromInstance(player, ${OWN});`,
      `this.spy = createSpyFromInstance(player, ${OWN});`,
      `const held = (spy = createSpyFromInstance(player, ${OWN}));`,
      `spy = createSpyFromInstance(player, ${OWN});`,
      `function setUp(spy) {\n  spy = createSpyFromInstance(player, ${OWN});\n}`,
      `let { spy } = {};\nspy = createSpyFromInstance(player, ${OWN});`,
    ]) {
      expect(verify(code)).toEqual([]);
    }
  });

  it('writes the helper into the import the factory came from, and takes the factory out with its last use', () => {
    expect(
      autofix(`import { createSpyFromInstance, restoreSpiedInstance } from 'vitest-auto-spy/bun';\ncreateSpyFromInstance(player, ${OWN});`),
    ).toBe("import { restoreSpiedInstance, spyOnOwnMethod } from 'vitest-auto-spy/bun';\nspyOnOwnMethod(player, 'seek');");
    expect(
      autofix(`import { asSpy, createSpyFromInstance, setupAutoSpy } from 'vitest-auto-spy';\ncreateSpyFromInstance(player, ${OWN});`),
    ).toBe("import { asSpy, setupAutoSpy, spyOnOwnMethod } from 'vitest-auto-spy';\nspyOnOwnMethod(player, 'seek');");
    // A list that is not in order keeps its order: the helper takes the factory's place.
    expect(
      autofix(`import { setupAutoSpy, createSpyFromInstance, asSpy } from 'vitest-auto-spy';\ncreateSpyFromInstance(player, ${OWN});`),
    ).toBe("import { setupAutoSpy, spyOnOwnMethod, asSpy } from 'vitest-auto-spy';\nspyOnOwnMethod(player, 'seek');");
    expect(autofix(`import autoSpy, { createSpyFromInstance } from 'vitest-auto-spy';\ncreateSpyFromInstance(player, ${OWN});`)).toBe(
      "import autoSpy, { spyOnOwnMethod } from 'vitest-auto-spy';\nspyOnOwnMethod(player, 'seek');",
    );
    // The pass that rewrites the last use takes the factory out; two rewritten in one pass leave it behind.
    expect(autofix(`${IMPORT}createSpyFromInstance(a, ${OWN});\ncreateSpyFromInstance(b, ${OWN});`)).toBe(
      "import { spyOnOwnMethod } from 'vitest-auto-spy';\nspyOnOwnMethod(a, 'seek');\nspyOnOwnMethod(b, 'seek');",
    );
    expect(
      autofix(`${IMPORT}createSpyFromInstance(a, ${OWN});\ncreateSpyFromInstance(b, ${OWN});\ncreateSpyFromInstance(c, ${OWN});`),
    ).toBe(
      "import { createSpyFromInstance, spyOnOwnMethod } from 'vitest-auto-spy';\nspyOnOwnMethod(a, 'seek');\nspyOnOwnMethod(b, 'seek');\nspyOnOwnMethod(c, 'seek');",
    );
  });

  it('imports from the root for a factory that came through a barrel, and adds nothing already imported', () => {
    expect(autofix(`import { createSpyFromInstance } from '@app/testing';\ncreateSpyFromInstance(player, ${OWN});`)).toBe(
      "import { spyOnOwnMethod } from 'vitest-auto-spy';\n\nspyOnOwnMethod(player, 'seek');",
    );
    expect(
      autofix(`import { createSpyFromInstance, spyOnOwnMethod } from 'vitest-auto-spy';\ncreateSpyFromInstance(player, ${OWN});`),
    ).toBe("import { spyOnOwnMethod } from 'vitest-auto-spy';\nspyOnOwnMethod(player, 'seek');");
    expect(autofix(`import { spyOnOwnMethod } from 'vitest-auto-spy';\ncreateSpyFromInstance(player, ${OWN});`)).toBe(
      "import { spyOnOwnMethod } from 'vitest-auto-spy';\nspyOnOwnMethod(player, 'seek');",
    );
    expect(autofix(`createSpyFromInstance(player, ${OWN});`)).toBe(
      "import { spyOnOwnMethod } from 'vitest-auto-spy';\nspyOnOwnMethod(player, 'seek');",
    );
  });

  it('knows exactly the entries that export the helpers', () => {
    const entries = ENTRY_SPECIFIERS.split(' ');
    const exporting = (name: string): string[] => (EXPORTED_BY[name] ?? '').split(' ').map((index) => entries[Number(index)] ?? '');

    expect(exporting('spyOnOwnMethod')).toEqual([...CORE_ENTRIES]);
    expect(exporting('spyOnVoidMethod')).toEqual([...CORE_ENTRIES]);
    ['asSpy', 'createMock', 'mockReadonlyPropGetter', 'mockValueProp', 'settleDynamicImport'].forEach((helper) => {
      expect(exporting(helper)).toEqual(expect.arrayContaining([...CORE_ENTRIES]));
    });
  });
});
