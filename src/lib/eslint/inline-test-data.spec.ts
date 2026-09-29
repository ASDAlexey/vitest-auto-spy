import { type LintMessage } from 'eslint';
import { describe, expect, it } from 'vitest';

import { runRule } from './run-rule';

const RULE = 'no-inline-test-data';

function verify(code: string, run: { filename?: string; options?: object } = {}): LintMessage[] {
  const messages = runRule(RULE, code, { filename: run.filename ?? 'order.service.spec.ts', options: run.options });

  expect(messages.filter((message) => message.ruleId === null)).toEqual([]);

  return messages;
}

/** An object literal of `lines` lines, one property per line between the braces. */
const literalOf = (lines: number): string =>
  `{\n${Array.from({ length: lines - 2 }, (_, index) => `  field${String(index)}: ${String(index)},`).join('\n')}\n}`;

describe(RULE, () => {
  it('reports a data literal longer than 20 lines, once for the outermost one', () => {
    const messages = verify(`const order = { items: [${literalOf(25)}] };`);

    expect(messages).toHaveLength(1);
    expect(messages[0]?.message).toMatch(/^This literal spans 25 lines of test data \(the limit is 20\)[\s\S]*\*\.mock\.ts/);
    expect(messages[0]?.message).toContain('/utilities/eslint-rules#no-inline-test-data');
    expect(verify(`const order = ${literalOf(20)};`)).toEqual([]);
  });

  it('reports the third spelling of the same literal, whatever its size and its whitespace', () => {
    const messages = verify(`
      service.save({ id: 1, name: 'Ann' });
      service.save({id:1,name:'Ann'});
      expect(store.save).toHaveBeenCalledWith({ id: 1, name: 'Ann' });
    `);

    expect(messages.map((message) => message.line)).toEqual([3, 4]);
    expect(messages[0]?.message).toMatch(/^`\{id:1,name:'Ann'\}` is written 3 times in this file \(first at line 2\)/);
    expect(verify('save({ [key]: 1, x: -1 });\nsave({ [key]: 1, x: -1 });\nsave({ [key]: 1, x: -1 });')).toHaveLength(2);
  });

  it('reports a repeated literal once, not once more for each repeated piece of it', () => {
    const order = "{ id: 1, lines: [{ sku: 'a', qty: 2 }] }";
    const messages = verify(`save(${order});\nsave(${order});\nsave(${order});`);

    expect(messages.map((message) => message.message.slice(0, 16))).toEqual(['`{ id: 1, lines:', '`{ id: 1, lines:']);
  });

  it('leaves two spellings, empty literals and different values alone', () => {
    expect(verify("save({ id: 1, a: 'x' });\nsave({ id: 1, a: 'x' });\nsave({ id: 2, a: 'x' });")).toEqual([]);
    expect(verify('save({});\nsave({});\nsave({});\nsave([]);\nsave([]);\nsave([]);')).toEqual([]);
  });

  it('does not ask to name a wrapper around bindings or a single option, however often it repeats', () => {
    const wrappers = ['[node]', '{ property }', '{ object: mock, id: -offset }', "{ method: 'GET' }", '{ returns: { load: undefined } }'];

    for (const literal of wrappers) {
      expect(verify(`call(${literal});\ncall(${literal});\ncall(${literal});`)).toEqual([]);
    }
  });

  it('does not count wiring, doubles, case tables or vi.mock factories as data', () => {
    const wiring = `TestBed.configureTestingModule({ providers: [${literalOf(25)}], imports: [{ a: 1 }] });`;
    const double = `const api = { load: () => of(1), save() {}, nested: { run: function () {} }, ${literalOf(25).slice(1)};`;
    const table = `it.each([${literalOf(25)}])('works', () => {});`;
    const factory = `vi.mock('./api', () => (${literalOf(25)}));`;
    const holes = 'save([, { id: 1 }]);\nsave([, { id: 2 }]);';

    for (const code of [wiring, double, table, factory, holes]) {
      expect(verify(code)).toEqual([]);
    }
  });

  it('reads through casts, satisfies and spreads to the literal that holds the data', () => {
    const cast = `const order = { ...(${literalOf(25)} as Order) } satisfies Order;`;

    expect(verify(cast)).toHaveLength(1);
  });

  it('stays silent in the mock files it points at', () => {
    const code = `export const order = ${literalOf(25)};\nsave({ a: 1 });\nsave({ a: 1 });\nsave({ a: 1 });`;

    for (const filename of ['order.mock.ts', 'order.mocks.ts', 'order.fixture.ts', 'src/__mocks__/api.ts']) {
      expect(verify(code, { filename })).toEqual([]);
    }
  });

  it('takes its limits from maxLines, repeats and minValues', () => {
    expect(verify(`const order = ${literalOf(6)};`, { options: { maxLines: 5 } })).toHaveLength(1);
    expect(verify('save({ id: 1, n: 2 });\nsave({ id: 1, n: 2 });', { options: { repeats: 2 } })).toHaveLength(1);
    expect(verify('save({ id: 1, n: 2 });\nsave({ id: 1, n: 2 });\nsave({ id: 1, n: 2 });', { options: { repeats: 4 } })).toEqual([]);
    expect(
      verify("call({ method: 'GET' });\ncall({ method: 'GET' });\ncall({ method: 'GET' });", { options: { minValues: 1 } }),
    ).toHaveLength(2);
  });
});
