/**
 * `no-sync-testbed-await`, from both ends.
 *
 * The flagged shapes are what a 1862-file Angular suite was left with once `no-compile-components`
 * had taken 448 `compileComponents()` calls out of it: an `await` in front of a
 * `configureTestingModule` chain, and the `async` that await had forced on the hook. They are
 * transcribed from the 14 reports the rule draws across 10 files of that consumer — a bare
 * `resetTestingModule()`, a chain ending in `overrideComponent` or `overrideProvider`. The silent
 * ones are the calls that really do hand back a promise — `compileComponents`, the fixture's
 * `whenStable` family — and every receiver this file cannot read as the TestBed.
 */
import * as tsParser from '@typescript-eslint/parser';
import { type LintMessage, Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import plugin from '../../eslint-plugin';

const RULE = 'no-sync-testbed-await';

const linter = new Linter({ configType: 'flat' });

/** Lint one snippet with only this rule enabled. */
function verify(code: string): LintMessage[] {
  return linter.verify(
    code,
    [
      {
        files: ['**/*.ts'],
        languageOptions: { parser: tsParser },
        plugins: { 'vitest-auto-spy': plugin },
        rules: { [`vitest-auto-spy/${RULE}`]: 'error' },
      },
    ],
    'card.component.spec.ts',
  );
}

/** How many reports a snippet draws. */
function count(code: string): number {
  return verify(code).length;
}

/** The source after accepting the first report's suggestion — ESLint merges its edits into one. */
function suggested(code: string): string | undefined {
  const fix = verify(code)[0]?.suggestions?.[0]?.fix;

  return fix && `${code.slice(0, fix.range[0])}${fix.text}${code.slice(fix.range[1])}`;
}

describe(RULE, () => {
  it('reports the await a compileComponents removal leaves behind', () => {
    const code = 'beforeEach(async () => {\n  await TestBed.configureTestingModule({ imports: [Card] });\n});';

    expect(count(code)).toBe(1);
    expect(verify(code)[0]?.message).toContain('`configureTestingModule(…)` answers the TestBed, not a promise');
  });

  it('names the promises that keep their await, and the two members it never decides for', () => {
    const message = verify('await TestBed.createComponent(Card);')[0]?.message ?? '';

    expect(message).toContain('compileComponents()');
    expect(message).toContain('whenStable()');
    expect(message).toContain('TestBed.inject(TOKEN)');
    expect(message).toContain('runInInjectionContext');
    expect(message).toContain('#how-to-mock-a-service-behind-angular-di');
  });

  it('reports every member Angular declares as answering the TestBed or a fixture', () => {
    const members = [
      'configureTestingModule({})',
      'overrideComponent(Card, {})',
      'overrideDirective(Focus, {})',
      'overrideModule(CardModule, {})',
      'overridePipe(DatePipe, {})',
      'overrideProvider(Api, { useValue: {} })',
      "overrideTemplate(Card, '')",
      "overrideTemplateUsingTestingModule(Card, '')",
      'resetTestingModule()',
      'createComponent(Card)',
      'getLastFixture()',
    ];

    members.forEach((member) => expect(count(`await TestBed.${member};`)).toBe(1));
  });

  it('reads the whole chain, and the accessor form of the receiver', () => {
    expect(count('await TestBed.configureTestingModule({}).overrideProvider(Api, { useValue: {} }).createComponent(Card);')).toBe(1);
    expect(count('await getTestBed().configureTestingModule({});')).toBe(1);
    expect(count('await getTestBed().createComponent(Card);')).toBe(1);
  });

  it('follows a name the file settles, in either spelling', () => {
    expect(
      count(`
        const bed = TestBed.configureTestingModule({ imports: [Card] });

        await bed.overrideProvider(Api, { useValue: {} });
      `),
    ).toBe(1);
    expect(
      count(`
        let bed;

        beforeEach(() => {
          bed = getTestBed();
        });

        it('renders', async () => {
          await bed.createComponent(Card);
        });
      `),
    ).toBe(1);
  });

  it('stays silent on the calls that really do return a promise', () => {
    expect(count('await TestBed.compileComponents();')).toBe(0);
    expect(count('await TestBed.configureTestingModule({}).compileComponents();')).toBe(0);
    expect(count("await TestBed.overrideTemplate(Card, '').compileComponents();")).toBe(0);
    expect(count('await fixture.whenStable();')).toBe(0);
    expect(count('await fixture.whenRenderingDone();')).toBe(0);
    expect(count('await fixture.getDeferBlocks();')).toBe(0);
    expect(count('await render(Card);')).toBe(0);
  });

  it('leaves inject and runInInjectionContext alone, whatever they hand back', () => {
    // Verbatim from the consumer: a token whose value is a promise, awaited on purpose.
    expect(count('const result = await TestBed.inject(VPN_DETECT_RESULT);')).toBe(0);
    expect(count('await TestBed.inject(ApplicationInitStatus).donePromise;')).toBe(0);
    expect(count('await TestBed.runInInjectionContext(() => loadProfile());')).toBe(0);
  });

  it('reports no member whose receiver it cannot read as the TestBed', () => {
    // `inject` is not a link of the chain, so what it answered decides nothing here.
    expect(count('await TestBed.inject(PageObject).createComponent(Card);')).toBe(0);
    expect(count('await page.createComponent(Card);')).toBe(0);
    expect(count('await this.bed.createComponent(Card);')).toBe(0);
    expect(count('await bed()().createComponent(Card);')).toBe(0);
    expect(count('await buildBed().createComponent(Card);')).toBe(0);
  });

  it('reads a name as written, and a computed key as no name at all', () => {
    expect(count('await TestBed[member]({});')).toBe(0);
    expect(count("await TestBed['configureTestingModule']({});")).toBe(0);
    expect(count('await TestBed[link]().createComponent(Card);')).toBe(0);
    expect(count('await TestBed.configureTestingModule;')).toBe(0);
    expect(count('await createComponent(Card);')).toBe(0);
  });

  it('declines a name that only leads back to itself', () => {
    expect(count('let bed = bed;\n\nawait bed.createComponent(Card);')).toBe(0);
    expect(count('await bed.createComponent(Card);')).toBe(0);
  });

  it('reports one await of a hook and leaves its neighbour alone', () => {
    // Verbatim from the consumer: the reset waits for nothing, the chain below it ends in a promise.
    const code = `
      it('does not create the view on the server', async () => {
        await TestBed.resetTestingModule();
        await TestBed.configureTestingModule({
          declarations: [HostComponent, IfIsBrowserDirective],
        }).compileComponents();
      });
    `;

    expect(count(code)).toBe(1);
    expect(verify(code)[0]?.line).toBe(3);
  });

  it('keeps the async of a hook whose other await is a dynamic import', () => {
    // Verbatim: the import is a real promise, so only the TestBed line loses its await.
    expect(
      suggested(
        'beforeEach(async () => {\n  const { Domain } = await import("@app/domain");\n  await TestBed.configureTestingModule({ providers: [provideAutoSpy(Domain)] });\n});',
      ),
    ).toBe(
      'beforeEach(async () => {\n  const { Domain } = await import("@app/domain");\n  TestBed.configureTestingModule({ providers: [provideAutoSpy(Domain)] });\n});',
    );
  });

  it('drops the await and the async of a hook that awaits nothing else', () => {
    expect(suggested('beforeEach(async () => {\n  await TestBed.configureTestingModule({ imports: [Card] });\n});')).toBe(
      'beforeEach(() => {\n  TestBed.configureTestingModule({ imports: [Card] });\n});',
    );
    expect(suggested('it("renders", async function () {\n  await TestBed.createComponent(Card);\n});')).toBe(
      'it("renders", function () {\n  TestBed.createComponent(Card);\n});',
    );
  });

  it('keeps the async where something else in the hook still awaits', () => {
    expect(
      suggested('beforeEach(async () => {\n  await TestBed.configureTestingModule({});\n  await TestBed.compileComponents();\n});'),
    ).toBe('beforeEach(async () => {\n  TestBed.configureTestingModule({});\n  await TestBed.compileComponents();\n});');
  });

  it('keeps the async of a function the runner does not own', () => {
    expect(suggested('const setup = async () => {\n  await TestBed.configureTestingModule({});\n};')).toBe(
      'const setup = async () => {\n  TestBed.configureTestingModule({});\n};',
    );
    expect(suggested('beforeEach(waitForAsync(async () => {\n  await TestBed.configureTestingModule({});\n}));')).toBe(
      'beforeEach(waitForAsync(async () => {\n  TestBed.configureTestingModule({});\n}));',
    );
  });

  it('edits the shapes an await can sit in without breaking either of them', () => {
    expect(suggested('const fixture = await TestBed.createComponent(Card);')).toBe('const fixture = TestBed.createComponent(Card);');
    // Parentheses are not ESTree nodes but they are inside the await expression's range, so
    // replacing that range with the text of the argument takes them with it.
    expect(suggested('await (TestBed.createComponent(Card));')).toBe('TestBed.createComponent(Card);');
    expect(suggested('await TestBed.configureTestingModule({}).createComponent(Card);')).toBe(
      'TestBed.configureTestingModule({}).createComponent(Card);',
    );
  });

  it('offers one suggestion, and says what it removes', () => {
    const [report] = verify('await TestBed.createComponent(Card);');

    expect(report?.suggestions).toHaveLength(1);
    expect(report?.suggestions?.[0]?.desc).toBe('Remove the await — the TestBed call answers the TestBed, not a promise');
  });
});
