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

  it('reports the third spelling of the same literal regardless of formatting', () => {
    const messages = verify(`
      service.save({ id: 1, name: 'Ann' });
      service.save({id:1,name:'Ann'});
      expect(store.save).toHaveBeenCalledWith({ id: 1, name: 'Ann' });
    `);

    expect(messages.map((message) => message.line)).toEqual([3, 4]);
    expect(messages[0]?.message).toMatch(/^`\{id:1,name:'Ann'\}` is written 3 times in this file \(first at line 2\)/);
  });

  it('matches static keys and nested values independently of their source spelling', () => {
    const messages = verify(
      [
        "save({ name: 'Ann', counts: [10, -2, 16] });",
        'save(({ "name": "\\x41nn", counts: [0b1010, -(0b10), 0x10,], }));',
        "save({ name: ('Ann'), /* counts */ 'counts': [(0o12), -2, 1_6] });",
      ].join('\n'),
    );

    expect(messages.map((message) => message.line)).toEqual([2, 3]);
  });

  it('normalizes signed and unsigned bigint literals', () => {
    const decimal = 'save({ balance: -16n, total: 32n });\n';
    const hex = 'save({ balance: -0x10n, total: 0x20n });';

    expect(verify(decimal.repeat(2) + hex).map((message) => message.line)).toEqual([2, 3]);
  });

  it('matches the cooked text of untagged templates without matching strings', () => {
    const plain = 'save({ name: `Ann`, id: 1 });\n';
    const escaped = 'save({ name: `\\x41nn`, id: 1 });';
    const string = "save({ name: 'Ann', id: 1 });";

    expect(verify(plain.repeat(2) + escaped).map((message) => message.line)).toEqual([2, 3]);
    expect(verify(plain.repeat(2) + string)).toEqual([]);
  });

  it.each([
    ['object property order', '{ id: 1, name: "Ann" }', '{ name: "Ann", id: 1 }'],
    ['array element order', '[1, 2, 3, 4]', '[2, 1, 3, 4]'],
    ['an array hole and explicit undefined', '[, 1, 2, 3, 4]', '[undefined, 1, 2, 3, 4]'],
    ['member paths', '{ id: user.profile.id, n: 1 }', '{ id: user.account.id, n: 1 }'],
    ['assertion and satisfies wrappers', '{ id: 1, n: 2 } as Order', '{ id: 1, n: 2 } satisfies Order'],
    ['assertion and non-null wrappers on member paths', '{ id: user.id as number, n: 1 }', '{ id: user.id!, n: 1 }'],
    ['exact type text', '{ id: 1, n: 2 } as Order<number>', '{ id: 1, n: 2 } as Order< number >'],
  ])('distinguishes %s', (_difference, first, second) => {
    const repeated = `save(${first});\n`.repeat(2);

    expect(verify(`${repeated}save(${second});`)).toEqual([]);
    expect(verify(`${repeated}save((${first}));`).map((message) => message.line)).toEqual([2, 3]);
  });

  it('normalizes values inside matching TypeScript wrappers', () => {
    const messages = verify(
      [
        'save({ id: (user as User).id!, n: 16 } satisfies Order);',
        'save(({ "id": (user as User).id!, n: 0x10, } satisfies Order));',
        'save({ id: (user as User).id!, n: (0b10000) } satisfies Order);',
      ].join('\n'),
    );

    expect(messages.map((message) => message.line)).toEqual([2, 3]);
  });

  it.each([
    ['computed keys', '{ ["id"]: 1, name: "Ann" }'],
    ['object spreads', '{ ...base, id: 1, name: "Ann" }'],
    ['array spreads', '[...base, 1, 2, 3, 4]'],
    ['duplicate static keys', '{ id: 1, "id": 2, name: "Ann" }'],
    ['prototype keys', '{ "__proto__": null, id: 1, name: "Ann" }'],
    ['member reads from calls', '{ id: loadOrder().id, name: "Ann" }'],
    ['nested calls', '{ nested: { id: loadId() }, name: "Ann", qty: 2 }'],
    ['regular expressions', '{ pattern: /a/i, id: 1, name: "Ann" }'],
    ['interpolated templates', '{ label: `order ${id}`, id: 1, name: "Ann" }'],
    ['tagged templates', '{ label: tag`order`, id: 1, name: "Ann" }'],
    ['accessors', '{ get id() { return 1; }, name: "Ann", qty: 2 }'],
    ['binary expressions', '{ id: 1 + 2, name: "Ann", qty: 2 }'],
  ])('does not count candidates containing %s', (_unsupported, literal) => {
    expect(verify(`save(${literal});\n`.repeat(3))).toEqual([]);
  });

  it.each(['{ id: target, n: 1 }', '{ nested: [{ id: target.id, n: 1 }] }'])(
    'does not combine references to shadowed bindings in %s',
    (literal) => {
      const call = `save(${literal});`;
      const repeated = `const target = { id: 1 };\n${call}\n{ ${call} }\n{ const target = { id: 2 }; ${call} }`;

      expect(verify(repeated)).toEqual([]);
      expect(verify(`${repeated}\n${call}`).map((message) => message.line)).toEqual([3, 5]);
    },
  );

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
    const namedWiring = `const providers = [${literalOf(25)}]; TestBed.configureTestingModule({ providers });`;
    const double = `const api = { load: () => of(1), save() {}, nested: { run: function () {} }, ${literalOf(25).slice(1)};`;
    const table = `it.each([${literalOf(25)}])('works', () => {});`;
    const factory = `vi.mock('./api', () => (${literalOf(25)}));`;
    const holes = 'save([, { id: 1 }]);\nsave([, { id: 2 }]);';

    for (const code of [wiring, namedWiring, double, table, factory, holes]) {
      expect(verify(code)).toEqual([]);
    }
  });

  it('keeps typed-double configuration beside its live spy but still reports repeated payloads', () => {
    for (const factory of [
      'createSpyFromClass',
      'createSpyFromInstance',
      'createSpyClass',
      'createAutoMock',
      'provideAutoSpy',
      'overrideAutoSpy',
    ]) {
      expect(verify(`${factory}(Api, { returns: ${literalOf(25)} });`)).toEqual([]);
    }

    expect(verify(`provideAutoSpyForToken(API, undefined, { returns: ${literalOf(25)} });`)).toEqual([]);
    expect(verify(`createSpyFromClass(Api, { returns: { load: { id: 1, name: 'Ann' } } });`.repeat(3))).toHaveLength(2);
    expect(verify(`save(Api, ${literalOf(25)});`)).toHaveLength(1);
  });

  it('keeps typed Angular provider factories inline without exempting ordinary data factories', () => {
    const entries = Array.from({ length: 25 }, (_, index) => `  provideAutoSpy(Service${String(index)}),`).join('\n');

    for (const type of ['Array<Provider | EnvironmentProviders>', 'Provider[]', 'readonly Provider[]', 'ReadonlyArray<Provider>']) {
      expect(verify(`const createProviders = (): ${type} => [\n${entries}\n];`)).toEqual([]);
      expect(verify(`function createProviders(): ${type} { return [\n${entries}\n]; }`)).toEqual([]);
    }

    expect(verify(`const createData = (): Array<Order> => [\n${literalOf(25)}\n];`)).toHaveLength(1);
    expect(verify(`const createProviders = () => [\n${literalOf(25)}\n];`)).toHaveLength(1);
    expect(verify(`function setup(): Provider[] { const data = ${literalOf(25)}; return []; }`)).toHaveLength(1);
    expect(verify(`function setup(): Provider[] { consume(${literalOf(25)}); return []; }`)).toHaveLength(1);
    expect(verify(`function setup(): Provider[] { return make(() => (${literalOf(25)})); }`)).toHaveLength(1);
    expect(verify(`function setup(value = ${literalOf(25)}): Provider[] { return []; }`)).toHaveLength(1);
  });

  it('reads through casts, satisfies and spreads to the literal that holds the data', () => {
    const cast = `const order = { ...(${literalOf(25)} as Order) } satisfies Order;`;

    expect(verify(cast)).toHaveLength(1);
  });

  it('stays silent in the mock files it points at', () => {
    const code = `export const order = ${literalOf(25)};\nsave({ a: 1 });\nsave({ a: 1 });\nsave({ a: 1 });`;

    for (const filename of ['order.mock.ts', 'order.mocks.ts', 'order.mock-data.ts', 'order.fixture.ts', 'src/__mocks__/api.ts']) {
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

  it('asks to move the smallest part of a long expected value that brings it under the limit', () => {
    const expected = `{\n  id: 1,\n  ...base,\n  address: ${literalOf(10)},\n  items: ${literalOf(12)} as Item,\n}`;
    const [message, ...rest] = verify(`expect(order).toMatchObject(${expected});`);

    expect(rest).toEqual([]);
    expect(message?.message).toMatch(
      /^This expected value spans 26 lines \(the limit is 20\)\. It is what the test checks, so keep its shape inline and move `\{ field0: 0, field1: 1,[^`]*` at line 4 to/,
    );
    expect(verify(`expect(api.post).toHaveBeenCalledWith('/orders', expect.objectContaining(${expected}));`)[0]?.message).toContain(
      'keep its shape inline',
    );
    expect(verify(`expect(rows).toEqual([\n${literalOf(8)},\n${literalOf(13)},\n]);`)[0]?.message).toMatch(/move `[^`]*` at line 2 to/);
    expect(verify(`expect(rows).toEqual([\n${literalOf(3)},\n${literalOf(22)},\n]);`)[0]?.message).toMatch(/move `[^`]*` at line 5 to/);

    const noSingleMove = `{\n  billing: ${literalOf(4)},\n  shipping: ${literalOf(5)},\n  ${literalOf(19).slice(2)}`;

    expect(verify(`expect(order).toEqual(${noSingleMove});`)[0]?.message).toMatch(
      /spans 28 lines.* move `\{ field0: 0, field1: 1, field2: 2, \}` at line 6 to/,
    );
  });

  it('names the word list inside a long rule config rather than the config under test', () => {
    const words = Array.from({ length: 11 }, (_, index) => `          'word${String(index)}',`).join('\n');
    const config = [
      'expect(rules()).toMatchObject({',
      "  'x/naming': [",
      "    'error',",
      '    {',
      '      disallowedWords: [',
      words,
      '      ],',
      '      mustNotMatch,',
      '      severity: {',
      "        level: 'high',",
      '        scope: [',
      "          'spec',",
      "          'mock',",
      '        ],',
      '      },',
      '    },',
      '  ],',
      '});',
    ].join('\n');

    expect(verify(config)[0]?.message).toMatch(/spans 28 lines.* move `\[ 'word0', 'word1',[^`]*` at line 5 to/);

    const text = [
      'expect(page).toEqual({',
      '  title: 1,',
      '  body: `',
      ...Array.from({ length: 22 }, () => '    line'),
      '  `,',
      '});',
    ].join('\n');

    expect(verify(text)[0]?.message).toMatch(/move `` line line[^`]*` at line 3 to/);
  });

  it('asks for a spec-local const when the part to move is written only once, and a mock file when it repeats', () => {
    const items = literalOf(22).replace('field0: 0,', "field0: 'a b',");
    const expected = `expect(order).toMatchObject({\n  id: 1,\n  items: ${items},\n});`;
    const equivalent = items.replace("field0: 'a b',", '"field0": "a\\x20b",').replace('field1: 1,', '/* count */ field1: (0x1),');
    const different = items.replace("'a b'", "'ab'");

    for (const code of [expected, `${expected}\nsend(${different});`]) {
      expect(verify(code)[0]?.message).toMatch(
        /move `[^`]*` at line 3 to a `const` in this spec; it is written only here, so it needs no `\*\.mock\.ts` file\./,
      );
    }

    expect(verify(`${expected}\nsend((${equivalent}));`)[0]?.message).toMatch(
      /move `[^`]*` at line 3 to a `\*\.mock\.ts` file next to the spec\./,
    );
  });

  it.each([
    ['a shadowed binding', 'id: target.id', '{ const target = { id: 2 }; send(PART); }'],
    ['an unsupported spread', '...target', 'send(PART);'],
  ])('does not suggest a mock file for an expected part with %s', (_description, entry, otherUse) => {
    const part = `{ ${entry},\n${literalOf(22).slice(2)}`;
    const code = `const target = { id: 1 };\nexpect(order).toEqual({\n  items: ${part},\n});\n${otherUse.replace('PART', part)}`;

    expect(verify(code)[0]?.message).toMatch(/at line 3 to a `const` in this spec/);
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

  it('suggests a spec-local const for a value repeated only as the expected value of a matcher', () => {
    const error = "{ name: 'HttpErrorResponse', status: 401, error: { code: 'expired' } }";
    const messages = verify(`
      it('rejects the expired token', async () => {
        await expect(load()).rejects.toMatchObject(${error});
      });
      it('rejects the expired refresh', async () => {
        await expect(refresh()).rejects.not.toEqual(${error});
      });
      it('logs the expired token', () => {
        expect(log).toHaveBeenCalledWith('auth', [${error}]);
      });
    `);

    expect(messages.map((message) => message.line)).toEqual([6, 9]);
    expect(messages[0]?.message).toMatch(
      /^`\{ name: 'HttpErrorResponse', status: 40…` is expected 3 times in this file \(first at line 3\)\. It is what these tests check, so keep it in the spec: name it once in a `const`/,
    );
  });

  it('leaves a short expected object of a few primitive keys alone, but not one also fed in', () => {
    const error = "{ name: 'HttpErrorResponse', status: 401 }";
    const expected = [
      `await expect(load()).resolves.toMatchObject(${error});`,
      `await expect(save()).rejects.toMatchObject(${error});`,
      `expect(errors).toEqual([${error}]);`,
    ];

    expect(verify(expected.join('\n'))).toEqual([]);

    const fed = verify(`fail(${error});\n${expected.join('\n')}`);

    expect(fed).toHaveLength(3);
    expect(fed[0]?.message).toMatch(/Export it once from a `\*\.mock\.ts` file/);
  });

  it('suggests a spec-local const for a repeated literal that reads a binding the spec declares', () => {
    const target = verify(`const TARGET = 'x';\n${"run(['-a', 'Google Chrome', TARGET]);\n".repeat(3)}`);

    expect(target.map((message) => message.line)).toEqual([3, 4]);
    expect(target[0]?.message).toMatch(
      /^`\['-a', 'Google Chrome', TARGET\]` is written 3 times in this file \(first at line 2\) and reads `TARGET`, which this spec declares\. Name it once in a `const` beside `TARGET`/,
    );

    for (const literal of ['{ id: user.id!, name: "Ann" }', '{ id: (user as User).id, n: 1 }']) {
      const code = `const user = { id: 1 };\n${`save(${literal});\n`.repeat(3)}`;

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
