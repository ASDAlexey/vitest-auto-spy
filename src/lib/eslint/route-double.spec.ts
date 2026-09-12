/**
 * `prefer-provide-activated-route`, checked from both ends.
 *
 * The flagged shapes are transcribed from a monorepo of 11 000+ spec files, where 42 providers of a
 * hand-built `ActivatedRoute` sit across 36 of them: a lone `snapshot`, an empty `{}`, a tree of
 * `children`, a `createSpyFromClass(ActivatedRoute)` whose instance fields no longer exist, and a
 * `useFactory` assembling the two halves with `mockReadonlyPropGetter` one by one. The silent ones
 * are the library's own spellings of the same route — `provideActivatedRoute()` and every form of
 * `createActivatedRoute()` a descriptor can carry — plus the neighbouring tokens the name-based
 * reading has to leave alone.
 */
import * as tsParser from '@typescript-eslint/parser';
import { type LintMessage, Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import plugin from '../../eslint-plugin';

const RULE = 'prefer-provide-activated-route';

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
    'page.spec.ts',
  );
}

/** How many reports a snippet draws — the only number most of these cases are about. */
function count(code: string): number {
  return verify(code).length;
}

/** The text of the first report, for the cases about what the message has to say. */
function message(code: string): string {
  return verify(code)[0]?.message ?? '';
}

describe('prefer-provide-activated-route', () => {
  it('flags the hand-built snapshot half this rule exists for', () => {
    // Verbatim shape from the monorepo: only the half the author read first.
    const code = `
      TestBed.configureTestingModule({
        providers: [{ provide: ActivatedRoute, useValue: { snapshot: { queryParams: { ['q']: 'mock' } } } }],
      });
    `;

    expect(count(code)).toBe(1);
  });

  it('flags an empty object double — a route whose every read is undefined', () => {
    // Verbatim: a component spec that overrides the template and reads nothing off the route.
    const code = `
      TestBed.configureTestingModule({
        providers: [
          { provide: MainHtmlPreloaderService, useValue: {} },
          { provide: ActivatedRoute, useValue: {} },
        ],
      });
    `;

    expect(count(code)).toBe(1);
  });

  it('flags a tree of children handed over as the whole route', () => {
    // Verbatim: the snapshot half again, in the shape a router outlet test writes.
    const code = `
      TestBed.configureTestingModule({
        providers: [
          {
            provide: ActivatedRoute,
            useValue: {
              children: [
                { routeConfig: { path: 'search' }, children: [] },
                { routeConfig: { path: 'report' }, children: [] },
              ],
            },
          },
        ],
      });
    `;

    expect(count(code)).toBe(1);
  });

  it('flags a spy factory, which reads the prototype the route keeps nothing on', () => {
    // Verbatim: the most common spelling in the monorepo, four occurrences and counting.
    const code = `
      TestBed.configureTestingModule({
        providers: [{ provide: ActivatedRoute, useValue: createSpyFromClass(ActivatedRoute, { observablePropsToSpyOn: ['queryParams'] }) }],
      });
    `;

    expect(count(code)).toBe(1);
  });

  it('flags a stub class and a factory as surely as a value', () => {
    expect(
      count(`
        TestBed.configureTestingModule({ providers: [{ provide: ActivatedRoute, useClass: RouteStub }] });
      `),
    ).toBe(1);
    expect(
      count(`
        TestBed.configureTestingModule({ providers: [{ provide: ActivatedRoute, useExisting: RouteStub }] });
      `),
    ).toBe(1);
  });

  it('follows a name parked above the TestBed', () => {
    const code = `
      const routeStub = { snapshot: { params: {} } };

      TestBed.configureTestingModule({
        providers: [{ provide: ActivatedRoute, useValue: routeStub }],
      });
    `;

    expect(count(code)).toBe(1);
  });

  it('flags a factory assembling the halves one by one', () => {
    // Verbatim shape: the stream half bolted onto the snapshot half with the prop helpers.
    const code = `
      TestBed.configureTestingModule({
        providers: [
          {
            provide: ActivatedRoute,
            useFactory: (): Record<string, unknown> => {
              const mock: Record<string, unknown> = { snapshot: { params: {} } };
              mockReadonlyPropGetter(mock, 'params', () => of({}));
              mockReadonlyPropGetter(mock, 'queryParams', () => of({}));
              return mock;
            },
          },
        ],
      });
    `;

    expect(count(code)).toBe(1);
  });

  it('flags provideAutoSpy on the route class itself', () => {
    expect(count('TestBed.configureTestingModule({ providers: [provideAutoSpy(ActivatedRoute)] });')).toBe(1);
    expect(message('TestBed.configureTestingModule({ providers: [provideAutoSpy(ActivatedRoute)] });')).toContain('instance field');
  });

  it('names the slot the double arrived in and the helper that replaces it', () => {
    const reported = message(`
      TestBed.configureTestingModule({
        providers: [{ provide: ActivatedRoute, useValue: { snapshot: { params: {} } } }],
      });
    `);

    expect(reported).toContain('`useValue`');
    expect(reported).toContain('provideActivatedRoute');
    expect(reported).toContain('injectActivatedRoute');
  });

  it('stays silent on provideActivatedRoute itself', () => {
    expect(count("TestBed.configureTestingModule({ providers: [provideActivatedRoute({ params: { id: '1' } })] });")).toBe(0);
  });

  it('stays silent on the standalone factory, in every slot it can arrive in', () => {
    expect(
      count(
        "TestBed.configureTestingModule({ providers: [{ provide: ActivatedRoute, useValue: createActivatedRoute({ params: { id: '7' } }).route }] });",
      ),
    ).toBe(0);
    expect(
      count(
        "TestBed.configureTestingModule({ providers: [{ provide: ActivatedRoute, useFactory: () => createActivatedRoute({ fragment: 'x' }).route }] });",
      ),
    ).toBe(0);
  });

  it('stays silent on the standalone factory parked in a name, destructured or whole', () => {
    expect(
      count(`
        const { route } = createActivatedRoute({ params: { id: '7' } });

        TestBed.configureTestingModule({ providers: [{ provide: ActivatedRoute, useValue: route }] });
      `),
    ).toBe(0);
    expect(
      count(`
        const double = createActivatedRoute({ params: { id: '7' } });

        TestBed.configureTestingModule({ providers: [{ provide: ActivatedRoute, useValue: double.route }] });
      `),
    ).toBe(0);
  });

  it('leaves neighbouring tokens alone', () => {
    expect(
      count(`
        TestBed.configureTestingModule({
          providers: [
            { provide: ActivatedRouteSnapshot, useValue: { params: {} } },
            { provide: Router, useValue: createSpyFromClass(Router) },
          ],
        });
      `),
    ).toBe(0);
    expect(count('TestBed.configureTestingModule({ providers: [provideAutoSpy(ProductService)] });')).toBe(0);
    expect(count('TestBed.configureTestingModule({ providers: [provideAutoSpy()] });')).toBe(0);
  });

  it('reports a name the file does not define and a slot the descriptor does not name', () => {
    // A double imported from a setup module: nothing in this file settles it, so it is reported.
    expect(
      count(`
        import { routeStub } from './test-setup';

        TestBed.configureTestingModule({ providers: [{ provide: ActivatedRoute, useValue: routeStub }] });
      `),
    ).toBe(1);
    // `multi: true` carries no slot at all; the report says `value`.
    expect(count('TestBed.configureTestingModule({ providers: [{ provide: ActivatedRoute, multi: true }] });')).toBe(1);
    expect(message('TestBed.configureTestingModule({ providers: [{ provide: ActivatedRoute, multi: true }] });')).toContain('`value`');
    // A member off a call the file does not know: the subtree walk finds nothing to exempt.
    expect(count('TestBed.configureTestingModule({ providers: [{ provide: ActivatedRoute, useValue: buildRoute().route }] });')).toBe(1);
    // A member off a global — no binding to read, so nothing settles it and the report stands.
    expect(count('TestBed.configureTestingModule({ providers: [{ provide: ActivatedRoute, useValue: globalThis.routeStub }] });')).toBe(1);
    // A bare undeclared name: the scope holds nothing for it, and the report stands.
    expect(count('TestBed.configureTestingModule({ providers: [{ provide: ActivatedRoute, useValue: routeFromSomewhereElse }] });')).toBe(
      1,
    );
    // Declared empty and never filled: the declaration has no init, the writes none.
    expect(
      count(`
        let route: ActivatedRoute;

        TestBed.configureTestingModule({ providers: [{ provide: ActivatedRoute, useValue: route }] });
      `),
    ).toBe(1);
  });

  it('reports once per descriptor, not once per nested literal', () => {
    const code = `
      TestBed.configureTestingModule({
        providers: [
          { provide: ActivatedRoute, useValue: { snapshot: { params: { id: '1' }, queryParams: {} }, children: [] } },
        ],
      });
    `;

    expect(count(code)).toBe(1);
  });
});
