import { type LintMessage } from 'eslint';
import { describe, expect, it } from 'vitest';

import { runRule } from './run-rule';

const RULE = 'no-reflect-member-access';

function verify(code: string): LintMessage[] {
  return runRule(RULE, code, { globals: { globalThis: 'readonly', window: 'readonly' } });
}

function count(code: string): number {
  return verify(code).length;
}

function message(code: string): string {
  return verify(code)[0]?.message ?? '';
}

function applied(code: string): string {
  const [report] = verify(code);
  const suggestion = report?.suggestions?.[0];

  if (!suggestion) {
    return '';
  }

  const [start, end] = suggestion.fix.range;

  return `${code.slice(0, start)}${suggestion.fix.text}${code.slice(end)}`;
}

describe('no-reflect-member-access', () => {
  it('flags a read of a member off a subject the test holds', () => {
    const code = `const component = fixture.componentInstance;\nexpect(Reflect.get(component, 'viewTimeMin')()).toBe(0);`;
    const text = message(code);

    expect(count(code)).toBe(1);
    expect(text).toContain('`viewTimeMin`');
    expect(text).toContain('nothing checks it');
    expect(text).toContain('no-private-member-access');
  });

  it('names the second failure mode on a write rather than repeating the first', () => {
    const code = `let service = build();\nReflect.set(service, 'savedData', null);`;
    const text = message(code);

    expect(count(code)).toBe(1);
    expect(text).toContain('installs an **own** property over the prototype');
    expect(text).toContain('dead');
    expect(text).toContain('mockValueProp');
    expect(text).toContain("`component['member']` keeps the key where the compiler checks it");
  });

  it('names the literal as the place for the key when the target is a fixture the spec built', () => {
    const code = `const link: MusicLink = {};\nReflect.set(link, 'linkType', linkType);`;
    const text = message(code);

    expect(count(code)).toBe(1);
    expect(text).toContain('onto an object literal this spec built');
    expect(text).toContain("{ linkType: value as Model['linkType'] }");
    expect(text).not.toContain('mockValueProp');
    // A read of a fixture is the ordinary finding.
    expect(message(`const link = {};\nReflect.get(link, 'linkType');`)).toContain('reads `linkType`');
  });

  it('reads a member chain and a call result as the subject they are', () => {
    expect(count(`const player = render();\nReflect.get(player.componentInstance, 'playerConfig');`)).toBe(1);
    expect(count(`Reflect.get(TestBed.createComponent(Cmp).componentInstance, 'hidden');`)).toBe(1);
  });

  it('reports every accessor of one call, and counts a file rather than a line', () => {
    const code = `const c = build();\nReflect.set(c, 'a', 1);\nReflect.get(c, 'b');\nReflect.get(c, 'a');`;

    expect(count(code)).toBe(3);
  });

  it('reads a subject the file computed, whatever its shape', () => {
    // No identifier at the root, so there is no binding to ask about and no double to recognise.
    expect(count(`Reflect.set(TestBed.createComponent(Cmp).componentInstance, 'hidden', true);`)).toBe(1);
    // A parameter is a local binding holding nothing this file can read.
    expect(count(`const patch = (subject: object): void => { Reflect.set(subject, 'hidden', true); };`)).toBe(1);
  });

  it('leaves a call that names no member alone', () => {
    expect(count(`const c = build();\nReflect.get(c);`)).toBe(0);
  });

  it('leaves the environment alone, which is what the idiom is for', () => {
    expect(count(`Reflect.get(window, 'process');`)).toBe(0);
    expect(count(`Reflect.set(window, 'ENVIRONMENT_REMOTE', { R: '2' });`)).toBe(0);
    expect(count(`Reflect.set(globalThis, '__wbcTestInstance', sdk);`)).toBe(0);
    expect(count(`Reflect.get(window.process, 'env');`)).toBe(0);
    // A name nothing in the file declares is the environment's, whether or not the config names it.
    expect(count(`Reflect.set(unknownGlobal, 'flag', true);`)).toBe(0);
  });

  it('leaves the environment alone under a name of the spec’s own, when its declaration says so', () => {
    expect(count(`let win: Window;\nwin = TestBed.inject(WINDOW);\nReflect.get(win, 'kinfo');`)).toBe(0);
    expect(count(`const root: typeof globalThis = globalThis;\nReflect.set(root, '__probe', 1);`)).toBe(0);
    expect(count(`let win: Window & { extra?: number };\nReflect.get(win, 'kinfo');`)).toBe(0);
    // Any other annotation is a subject like the rest.
    expect(count(`let service: Service;\nReflect.get(service, 'cache');`)).toBe(1);
    expect(count(`let service: Service & Other;\nReflect.get(service, 'cache');`)).toBe(1);
    expect(count(`let service: typeof other;\nReflect.get(service, 'cache');`)).toBe(1);
    expect(count(`let service: ns.Window;\nReflect.get(service, 'cache');`)).toBe(1);
  });

  it('leaves a module namespace alone — patching one is vi.mock’s business', () => {
    const code = `import * as vpnDetector from './vpn';\nReflect.set(vpnDetector, 'initializeVPNDetector', mock);`;

    expect(count(code)).toBe(0);
    expect(count(`import { helpers } from './h';\nReflect.get(helpers, 'build');`)).toBe(0);
  });

  it('leaves a computed key alone, since no name is written out to repair', () => {
    expect(count(`const c = build();\nReflect.get(c, method);`)).toBe(0);
    expect(count(`const c = build();\nconst read = (p: string) => Reflect.get(c, p);`)).toBe(0);
    expect(count(`const c = build();\nReflect.set(c, key, 1);`)).toBe(0);
    expect(count(`const c = build();\nReflect.get(c, 1);`)).toBe(0);
  });

  it('leaves the other members of Reflect alone', () => {
    expect(count(`const c = build();\nReflect.apply(c.method, c, []);`)).toBe(0);
    expect(count(`const c = build();\nReflect.has(c, 'hidden');`)).toBe(0);
    expect(count(`const c = build();\nReflect.deleteProperty(c, 'hidden');`)).toBe(0);
    expect(count(`const c = build();\nReflect.construct(c, []);`)).toBe(0);
    expect(count(`const c = build();\nreader.get(c, 'hidden');`)).toBe(0);
  });

  it('says something sharper about a write onto a double, and offers the helper', () => {
    const code = `const spy = injectSpy(FocusManager);\nReflect.set(spy, 'currentFocus', signal(null));`;
    const text = message(code);

    expect(count(code)).toBe(1);
    expect(text).toContain('behind the library’s back');
    expect(text).toContain("mockValueProp(spy, 'currentFocus', value)");
    expect(text).toContain('provideAutoSpy');
  });

  it('reads the double through the provider it was built as', () => {
    const code = `const loaderProvider = provideAutoSpyForToken(TOKEN);\nReflect.set(loaderProvider.useValue, 'load', load);`;

    expect(message(code)).toContain('behind the library’s back');
  });

  it('suggests the helper, importing it when the name is free', () => {
    const code = `const spy = injectSpy(X);\nReflect.set(spy, 'url', '/a');`;

    expect(verify(code)[0]?.suggestions?.[0]?.desc).toContain('mockValueProp');
    expect(applied(code)).toBe(
      `import { mockValueProp } from 'vitest-auto-spy';\nconst spy = injectSpy(X);\nmockValueProp(spy, 'url', '/a');`,
    );
  });

  it('writes no import when the file already has the helper, and no edit when the name is taken', () => {
    const taken = `const mockValueProp = 1;\nconst spy = injectSpy(X);\nReflect.set(spy, 'url', '/a');`;

    expect(applied(`import { mockValueProp } from 'vitest-auto-spy';\nconst spy = injectSpy(X);\nReflect.set(spy, 'url', '/a');`)).toBe(
      `import { mockValueProp } from 'vitest-auto-spy';\nconst spy = injectSpy(X);\nmockValueProp(spy, 'url', '/a');`,
    );
    expect(count(taken)).toBe(1);
    expect(verify(taken)[0]?.suggestions ?? []).toHaveLength(0);
  });

  it('offers no helper for a read, or for a subject that is not a double', () => {
    expect(verify(`const spy = injectSpy(X);\nReflect.get(spy, 'url');`)[0]?.suggestions ?? []).toHaveLength(0);
    expect(verify(`const component = fixture.componentInstance;\nReflect.set(component, 'url', '/a');`)[0]?.suggestions ?? []).toHaveLength(
      0,
    );
  });
});
