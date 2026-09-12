import * as tsParser from '@typescript-eslint/parser';
import { type LintMessage, Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import plugin from '../../eslint-plugin';

const RULE = 'no-compile-components';

const linter = new Linter({ configType: 'flat' });

const INLINED = { builder: 'inline-resources' };

function verify(code: string, options?: object): LintMessage[] {
  return linter.verify(
    code,
    [
      {
        files: ['**/*.ts'],
        languageOptions: { parser: tsParser },
        plugins: { 'vitest-auto-spy': plugin },
        rules: { [`vitest-auto-spy/${RULE}`]: options ? ['error', options] : 'error' },
      },
    ],
    'card.component.spec.ts',
  );
}

/** The source after accepting the first report's suggestion — ESLint merges its edits into one — or `undefined` without one. */
function suggested(code: string): string | undefined {
  const fix = verify(code, INLINED)[0]?.suggestions?.[0]?.fix;

  return fix && `${code.slice(0, fix.range[0])}${fix.text}${code.slice(fix.range[1])}`;
}

describe(RULE, () => {
  it('reports nothing until the project says its builder inlines resources', () => {
    const code = 'beforeEach(async () => {\n  await TestBed.configureTestingModule({ imports: [Card] }).compileComponents();\n});';

    expect(verify(code)).toEqual([]);
    expect(verify(code, {})).toEqual([]);
    expect(verify(code, INLINED)).toHaveLength(1);
  });

  it('rejects a builder it does not know', () => {
    expect(() => verify('TestBed.compileComponents();', { builder: 'karma' })).toThrow(/should be equal to one of the allowed values/);
  });

  it('reports every spelling of the call, and says why it waits for the option', () => {
    const [report] = verify('await TestBed.compileComponents();', INLINED);

    expect(report?.message).toMatch(/usually redundant here[\s\S]*inline-resources[\s\S]*reports nothing until the option/);
    expect(report?.message).toContain('#how-to-mock-a-components-children');
    expect(verify('TestBed.configureTestingModule({}).compileComponents().then(() => render());', INLINED)).toHaveLength(1);
    expect(verify('function ready() {\n  return getTestBed().compileComponents();\n}', INLINED)).toHaveLength(1);
    expect(verify('const ready = bed.compileComponents();', INLINED)).toHaveLength(1);
  });

  it('names the async-metadata exception the builder cannot settle, and the way to keep such a call', () => {
    const [report] = verify('await TestBed.compileComponents();', INLINED);

    expect(report?.message).toContain('@defer');
    expect(report?.message).toContain('unresolved metadata');
    expect(report?.message).toContain('eslint-disable-next-line vitest-auto-spy/no-compile-components');
  });

  it('carries the exception into the suggestion, which is the text a bulk edit reads', () => {
    expect(verify('await TestBed.compileComponents();', INLINED)[0]?.suggestions?.[0]?.desc).toContain('@defer');
  });

  it('drops the call and the async of a hook that awaits nothing else', () => {
    expect(
      suggested('beforeEach(async () => {\n  await TestBed.configureTestingModule({ imports: [Card] }).compileComponents();\n});'),
    ).toBe('beforeEach(() => {\n  TestBed.configureTestingModule({ imports: [Card] });\n});');
    expect(
      suggested('beforeAll(async function () {\n  TestBed.configureTestingModule({});\n  await TestBed.compileComponents();\n});'),
    ).toBe('beforeAll(function () {\n  TestBed.configureTestingModule({});\n  \n});');
    expect(suggested('it("renders", async() => {\n  await TestBed.compileComponents();\n})')).toBe('it("renders", () => {\n  \n})');
  });

  it('keeps the async where something else in the hook still awaits', () => {
    expect(suggested('beforeEach(async () => {\n  await TestBed.compileComponents();\n  await fixture.whenStable();\n});')).toBe(
      'beforeEach(async () => {\n  \n  await fixture.whenStable();\n});',
    );
    expect(suggested('beforeEach(async () => {\n  await TestBed.compileComponents();\n  for await (const x of source) use(x);\n});')).toBe(
      'beforeEach(async () => {\n  \n  for await (const x of source) use(x);\n});',
    );
    expect(suggested('beforeEach(async () => {\n  await (await bed()).compileComponents();\n});')).toBe(
      'beforeEach(async () => {\n  await bed();\n});',
    );
  });

  it('keeps the async of a function that is not a hook or a test', () => {
    expect(suggested('const setup = async () => {\n  await TestBed.compileComponents();\n};')).toBe('const setup = async () => {\n  \n};');
    expect(suggested('beforeEach(waitForAsync(async () => {\n  await TestBed.compileComponents();\n}));')).toBe(
      'beforeEach(waitForAsync(async () => {\n  \n}));',
    );
    expect(suggested('it.only("x", async () => {\n  await TestBed.compileComponents();\n});')).toBe('it.only("x", async () => {\n  \n});');
    expect(suggested('await TestBed.compileComponents();')).toBe('');
  });

  it('removes a call that is not awaited, leaving the async alone', () => {
    expect(suggested('beforeEach(waitForAsync(() => {\n  TestBed.configureTestingModule({}).compileComponents();\n}));')).toBe(
      'beforeEach(waitForAsync(() => {\n  TestBed.configureTestingModule({});\n}));',
    );
  });

  it('offers no edit where the promise is used', () => {
    expect(suggested('TestBed.compileComponents().then(() => render());')).toBeUndefined();
    expect(suggested('const ready = TestBed.compileComponents();')).toBeUndefined();
    expect(suggested('beforeEach(() => TestBed.configureTestingModule({}).compileComponents());')).toBeUndefined();
  });

  it('stays silent on a name that is not the call', () => {
    expect(verify('TestBed[compileComponents]();', INLINED)).toEqual([]);
    expect(verify('compileComponents();', INLINED)).toEqual([]);
    expect(verify('TestBed.compileComponents;', INLINED)).toEqual([]);
  });
});
