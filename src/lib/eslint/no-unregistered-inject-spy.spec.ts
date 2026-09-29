/** An `injectSpy` whose token nothing in the file registered. */
import { type LintMessage } from 'eslint';
import { describe, expect, it } from 'vitest';

import { runRule } from './run-rule';

const RULE = 'no-unregistered-inject-spy';

/** Lint one snippet with only this rule enabled, configured when options are given. */
function verify(code: string, options?: object): LintMessage[] {
  return runRule(RULE, code, { options });
}

/** The rule ids reported for a snippet. */
function lint(code: string): string[] {
  return verify(code).map((message) => message.ruleId ?? 'parse-error');
}

/** The full message text of the first report, for the rules that must point at the README. */
function firstMessage(code: string): string {
  return verify(code)[0]?.message ?? '';
}

describe('no-unregistered-inject-spy', () => {
  /** The shape the rule exists for: one token registered, another injected. */
  const unregistered = `
    TestBed.configureTestingModule({
      imports: [RouterTestingModule],
      providers: [provideAutoSpy(UserService)],
    });

    const users = injectSpy(UserService);
    const route = injectSpy(ActivatedRoute);
  `;

  it('reports an injectSpy whose token nothing registered', () => {
    expect(lint(unregistered)).toEqual([`vitest-auto-spy/${RULE}`]);
    expect(firstMessage(unregistered)).toContain('ActivatedRoute');
  });

  it('accepts a token registered through provideAutoSpy or an auto-spy useValue', () => {
    const registered = `
      TestBed.configureTestingModule({
        providers: [provideAutoSpy(UserService), { provide: Clock, useValue: createAutoMock<Clock>() }],
      });

      injectSpy(UserService);
      injectSpy(Clock);
    `;

    expect(lint(registered)).toEqual([]);
  });

  it('says nothing about a token provided by hand — that is prefer-provide-auto-spy’s line', () => {
    const handRolled = `
      TestBed.configureTestingModule({
        providers: [provideAutoSpy(UserService), { provide: Clock, useValue: { now: () => 0 } }],
      });

      injectSpy(Clock);
    `;

    expect(lint(handRolled)).toEqual([]);
  });

  it('stays quiet in a file that never registers an auto-spy at all', () => {
    const noRegistrations = `
      TestBed.configureTestingModule({ providers: [] });

      injectSpy(ActivatedRoute);
    `;

    expect(lint(noRegistrations)).toEqual([]);
  });

  it.each([
    ['a spread of shared providers', 'providers: [provideAutoSpy(UserService), ...sharedMocks]'],
    ['an unknown provider factory', 'providers: [provideAutoSpy(UserService), provideRouterStubs()]'],
    ['a bare identifier', 'providers: [provideAutoSpy(UserService), routerProvider]'],
    ['a hole', 'providers: [provideAutoSpy(UserService), , ]'],
    ['an object with no provide key', 'providers: [provideAutoSpy(UserService), { useValue: 1 }]'],
  ])('stays quiet when the providers array contains %s', (_label, providers) => {
    const code = `
      TestBed.configureTestingModule({ ${providers} });

      injectSpy(ActivatedRoute);
    `;

    expect(lint(code)).toEqual([]);
  });

  it.each([
    ['a hoisted const passed by shorthand', 'const providers = [provideAutoSpy(UserService), routerProvider];', '{ providers }'],
    ['a hoisted const under a quoted key', 'const shared = [provideAutoSpy(UserService), ...sharedMocks];', "{ 'providers': shared }"],
    [
      'a const that is pushed to later',
      'const providers = [provideAutoSpy(UserService)]; providers.push(routerProvider);',
      '{ providers }',
    ],
    ['a let assigned twice', 'let providers = []; providers = [provideAutoSpy(UserService), routerProvider];', '{ providers }'],
    ['an import', "import { providers } from './shared';", '{ providers }'],
    ['a name nothing declares', 'provideAutoSpy(UserService);', '{ providers: sharedProviders }'],
    ['a factory call', 'provideAutoSpy(UserService);', '{ providers: buildProviders() }'],
  ])('stays quiet when the providers come from %s it cannot fully read', (_label, before, module) => {
    const code = `
      ${before}
      TestBed.configureTestingModule(${module});

      injectSpy(ActivatedRoute);
    `;

    expect(lint(code)).toEqual([]);
  });

  it.each([
    ['a hoisted const passed by shorthand', '{ providers }'],
    ['a hoisted const under a quoted key', "{ 'providers': providers }"],
  ])('reads the providers through %s', (_label, module) => {
    const code = `
      const providers = [provideAutoSpy(UserService), { provide: Clock, useValue: createAutoMock<Clock>() }];
      TestBed.configureTestingModule(${module});

      injectSpy(UserService);
      injectSpy(Clock);
      injectSpy(ActivatedRoute);
    `;

    expect(verify(code).map((message) => message.message.split('`')[1])).toEqual(['ActivatedRoute']);
  });

  it.each([
    ['createWithAutoSpies', 'createWithAutoSpies(HostComponent, [UserService]);'],
    ['renderShallow', 'renderShallow(HostComponent);'],
    ['TestBed.overrideProvider', 'TestBed.overrideProvider(ActivatedRoute, { useValue: {} });'],
  ])('stays quiet when %s builds the module elsewhere', (_label, statement) => {
    const code = `
      TestBed.configureTestingModule({ providers: [provideAutoSpy(UserService)] });
      ${statement}

      injectSpy(ActivatedRoute);
    `;

    expect(lint(code)).toEqual([]);
  });

  it('is unmoved by the calls around it — zero-argument, member and chained', () => {
    const noise = `
      TestBed.configureTestingModule({ providers: [provideAutoSpy(UserService)] });
      TestBed.resetTestingModule();
      TestBed.inject(UserService);
      fixture.debugElement.query(By.css('a'));
      helpers.build();

      injectSpy(ActivatedRoute);
    `;

    expect(lint(noise)).toEqual([`vitest-auto-spy/${RULE}`]);
  });

  it('reads the token of the Nest form, which takes the module ref first', () => {
    const nest = (injected: string): string => `
      const moduleRef = await Test.createTestingModule({ providers: [provideAutoSpy(UserService)] }).compile();
      const users = injectSpy(moduleRef, ${injected});
    `;

    expect(lint(nest('UserService'))).toEqual([]);
    expect(lint(nest('UserService as ClassType<UserService>'))).toEqual([]);
    expect(firstMessage(nest('AuditService'))).toContain('`injectSpy(AuditService)`');
  });

  it('reads a token through a cast', () => {
    expect(lint('provideAutoSpy(UserService);\ninjectSpy(<ClassType<UserService>>UserService);')).toEqual([]);
  });
});
