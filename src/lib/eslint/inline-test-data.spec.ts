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

  it('does not count a short tuple as a record, and reports the literal around it once per copy', () => {
    const ranges = [
      'select({ from: [1, 1], to: [1, 5] });',
      'select({ from: [1, 1], to: [2, 3] });',
      'select({ from: [2, 3], to: [1, 5] });',
      "expect(ids).toEqual(['0', '1']);",
      "expect(ids).toEqual(['0', '1']);",
      "expect(ids).toEqual(['0', '1']);",
    ];

    expect(verify(ranges.join('\n'))).toEqual([]);

    const repeated = verify('select({ from: [1, 1], to: [1, 5] });\n'.repeat(3));

    expect(repeated.map((message) => [message.line, message.message.slice(0, 12)])).toEqual([
      [2, '`{ from: [1,'],
      [3, '`{ from: [1,'],
    ]);
  });

  it('still counts a longer array, or one whose items are longer than an id', () => {
    expect(verify('save([1, 2, 3, 4]);\n'.repeat(3))).toHaveLength(2);
    expect(verify("save(['first-id', 'second-id']);\n".repeat(3))).toHaveLength(2);
  });

  it('does not report a copy again when it sits inside a literal already reported', () => {
    const order = "save({ id: 1, line: { sku: 'a', qty: 2 } });\n".repeat(3);
    const alone = verify(`check({ sku: 'a', qty: 2 });\n${order}`);

    expect(alone.map((message) => message.line)).toEqual([3, 4]);

    const outside = verify(`${"check({ sku: 'a', qty: 2 });\n".repeat(3)}${order}`);

    expect(outside.map((message) => message.message.slice(0, 9))).toEqual(["`{ sku: '", "`{ sku: '", '`{ id: 1,', '`{ id: 1,']);
  });

  it('leaves a small bag of boolean flags alone, but not a larger one or one with a value in it', () => {
    const flags = [
      'rmSync(dir, { recursive: true, force: true });',
      "configure({ production: false, enableSentry: true, 'strict': true });",
    ];

    for (const call of flags) {
      expect(verify(`${call}\n`.repeat(3))).toEqual([]);
    }

    expect(verify('configure({ a: true, b: false, c: true, d: true });\n'.repeat(3))).toHaveLength(2);
    expect(verify("configure({ enabled: true, name: 'x' });\n".repeat(3))).toHaveLength(2);
  });

  it('asks to move the largest part of a long expected value and keep its shape inline', () => {
    const expected = `{\n  id: 1,\n  ...base,\n  address: ${literalOf(10)},\n  items: ${literalOf(12)} as Item,\n}`;
    const [message, ...rest] = verify(`expect(order).toMatchObject(${expected});`);

    expect(rest).toEqual([]);
    expect(message?.message).toMatch(
      /^This expected value spans 26 lines \(the limit is 20\)\. It is what the test checks, so keep its shape inline and move its largest part, `\{ field0: 0, field1: 1,[^`]*` at line 14,/,
    );
    expect(verify(`expect(api.post).toHaveBeenCalledWith('/orders', expect.objectContaining(${expected}));`)[0]?.message).toContain(
      'keep its shape inline',
    );
    expect(verify(`expect(rows).toEqual([\n${literalOf(8)},\n${literalOf(13)},\n]);`)[0]?.message).toMatch(
      /largest part, `[^`]*` at line 10,/,
    );
  });

  it('asks to check fewer entries of a long expected value that has no large part to move', () => {
    const flat = `{\n  nested: { id: 1 },\n  ${literalOf(22).slice(2)}`;

    for (const code of [`expect(order).toStrictEqual(${literalOf(25)});`, `expect(order).toEqual(${flat});`]) {
      expect(verify(code)[0]?.message).toMatch(
        /^This expected value spans \d+ lines \(the limit is 20\)\. It is what the test checks, so check only the entries/,
      );
    }
  });

  it('keeps calling a long literal data when it is what the test feeds in, even to expect()', () => {
    for (const code of [`expect(${literalOf(25)}).toBeDefined();`, `expect(order).toEqual(load(${literalOf(25)}));`]) {
      expect(verify(code)[0]?.message).toMatch(/^This literal spans 25 lines of test data/);
    }
  });

  it('suggests a spec-local const for a repeated literal that reads a binding the spec declares', () => {
    const target = verify(`const TARGET = 'x';\n${"run(['-a', 'Google Chrome', TARGET]);\n".repeat(3)}`);

    expect(target.map((message) => message.line)).toEqual([3, 4]);
    expect(target[0]?.message).toMatch(
      /^`\['-a', 'Google Chrome', TARGET\]` is written 3 times in this file \(first at line 2\) and reads `TARGET`, which this spec declares\. Name it once in a `const` beside `TARGET`/,
    );

    const spread = verify(`const EMPTY = { keys: [] };\n${"check({ ...EMPTY, invalidKeys: ['a', 'b'] });\n".repeat(3)}`);

    expect(spread[0]?.message).toContain('reads `EMPTY`');

    for (const literal of ['{ id: user.id!, name: "Ann" }', '{ [KEY]: 1, name: "Ann" }', '{ id: (user as User).id, n: 1 }']) {
      const code = `const user = { id: 1 };\nconst KEY = 'k';\n${`save(${literal});\n`.repeat(3)}`;

      expect(verify(code)[0]?.message).toMatch(/which this spec declares/);
    }
  });

  it('keeps the mock-file advice when the literal only names imports, globals, keys and types', () => {
    const cases = [
      `import { TARGET } from './target';\n${"run(['-a', 'Google Chrome', TARGET]);\n".repeat(3)}`,
      `const TARGET = 1;\ninterface Local { TARGET: number; name: string }\n${"save({ TARGET: 1, name: 'Ann' } as Local);\n".repeat(3)}`,
      `const id = 1;\n${"save({ id: config.id, name: 'Ann' });\n".repeat(3)}`,
    ];

    for (const code of cases) {
      const messages = verify(code);

      expect(messages).toHaveLength(2);
      expect(messages[0]?.message).toMatch(/Export it once from a `\*\.mock\.ts` file/);
    }
  });
});
