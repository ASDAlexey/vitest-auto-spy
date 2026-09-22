import { type LintMessage } from 'eslint';
import { describe, expect, it } from 'vitest';

import { runRule } from './run-rule';

const RULE = 'no-mock-cast';

function verify(code: string): LintMessage[] {
  return runRule(RULE, code);
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

describe('no-mock-cast', () => {
  it('flags a member of a double read through a cast to Mock', () => {
    const code = `import { Mock } from 'vitest';\n(TestBed.inject(Metrics).send as Mock).mockReturnValue(1);`;
    const text = message(code);

    expect(count(code)).toBe(1);
    expect(text).toContain('`Mock` with no parameters is `Mock<any>`');
    expect(text).toContain('toHaveBeenCalledWith` stops comparing arguments');
    expect(text).toContain('injectSpy(Service).method');
    expect(text).toContain('vi.mocked(object.method)');
  });

  it('names the worse form apart: the cast sits on the member that installs the answer', () => {
    const code = `import { Mock } from 'vitest';\n(shelves.getByGid.mockReturnValue as Mock)(of(shelf));`;
    const text = message(code);

    expect(count(code)).toBe(1);
    expect(text).toContain('cast is on `mockReturnValue` itself');
    expect(text).toContain("Spy<Service, { overload: { method: 'first' } }>");
    expect(text).toContain('not the method’s own return type');
  });

  it('reads MockInstance and the older cast spelling', () => {
    expect(count(`import { MockInstance } from 'vitest';\n(svc.load as MockInstance).mockClear();`)).toBe(1);
    expect(count(`import { Mock } from 'vitest';\n(<Mock>svc.load).mockClear();`)).toBe(1);
  });

  it('reports a parameterised Mock too — the signature written a second time', () => {
    const code = `import { Mock } from 'vitest';\n(svc.load as Mock<[string], void>).mockClear();`;

    expect(count(code)).toBe(1);
    expect(message(code)).toContain('parameterised `Mock<[…], R>` is no repair');
  });

  it('suggests reading the spy out of DI, importing the helper when the name is free', () => {
    const code = `import { Mock } from 'vitest';\n(TestBed.inject(Metrics).send as Mock).mockClear();`;

    expect(verify(code)[0]?.suggestions?.[0]?.desc).toContain('injectSpy(Metrics).send');
    expect(applied(code)).toContain(`import { injectSpy } from 'vitest-auto-spy/angular';`);
    expect(applied(code)).toContain(`(injectSpy(Metrics).send).mockClear();`);
  });

  it('follows a name the file settled with a TestBed.inject, and keeps the whole member path', () => {
    const code =
      `import { Mock } from 'vitest';\nimport { injectSpy } from 'vitest-auto-spy/angular';\n` +
      `const metrics = TestBed.inject(Metrics);\n(metrics.send.mockReturnValue as Mock)(1);`;

    expect(applied(code)).toContain(`(injectSpy(Metrics).send.mockReturnValue)(1);`);
  });

  it('reports without an edit when the rewrite would have to be invented', () => {
    const withoutToken = `import { Mock } from 'vitest';\n(TestBed.inject().send as Mock).mockClear();`;
    const withFlags = `import { Mock } from 'vitest';\n(TestBed.inject(Metrics, null, flags).send as Mock).mockClear();`;
    const computed = `import { Mock } from 'vitest';\n(TestBed.inject(Metrics)[name] as Mock).mockClear();`;
    const unknownReceiver = `import { Mock } from 'vitest';\n(metrics.send as Mock).mockClear();`;
    const taken = `import { Mock } from 'vitest';\nconst injectSpy = 1;\n(TestBed.inject(Metrics).send as Mock).mockClear();`;

    [withoutToken, withFlags, computed, unknownReceiver, taken].forEach((code) => {
      expect(count(code)).toBe(1);
      expect(verify(code)[0]?.suggestions ?? []).toHaveLength(0);
    });
  });

  it('leaves a Mock that is not the runner’s alone', () => {
    expect(count(`import { Mock } from './domain/mock';\n(order.mock as Mock).id;`)).toBe(0);
    expect(count(`interface Mock { id: string }\nconst m = (order.mock as Mock).id;`)).toBe(0);
    // Ambient or globally declared runner types are the runner's, which is what a bare name means.
    expect(count(`(svc.load as Mock).mockClear();`)).toBe(1);
  });

  it('leaves alone what is not a member of a double', () => {
    expect(count(`import { Mock } from 'vitest';\nconst load = fn as Mock;`)).toBe(0);
    expect(count(`import { Mock } from 'vitest';\nconst load = vi.fn() as Mock;`)).toBe(0);
    expect(count(`import { Mock } from 'vitest';\nlet load: Mock;`)).toBe(0);
    expect(count(`import { Mocked } from 'vitest';\nconst svc = double as Mocked<Cart>;`)).toBe(0);
  });
});
