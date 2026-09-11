import * as tsParser from '@typescript-eslint/parser';
import { type LintMessage, Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import plugin from '../../eslint-plugin';

const RULE = 'no-instance-lifecycle-spy';

const linter = new Linter({ configType: 'flat' });

function verify(code: string): LintMessage[] {
  return linter.verify(
    code,
    [
      {
        files: ['**/*.ts'],
        languageOptions: { parser: tsParser },
        plugins: { 'vitest-auto-spy': plugin },
        rules: { [`vitest-auto-spy/${RULE}`]: 'warn' },
      },
    ],
    'card.component.spec.ts',
  );
}

describe(RULE, () => {
  it('reports a hook spied on an instance, with vi or jest', () => {
    expect(verify("vi.spyOn(component, 'ngOnInit');")).toHaveLength(1);
    expect(verify("jest.spyOn(fixture.componentInstance, 'ngOnDestroy').mockImplementation(() => undefined);")).toHaveLength(1);
    expect(
      ['ngDoCheck', 'ngAfterContentInit', 'ngAfterContentChecked', 'ngAfterViewInit', 'ngAfterViewChecked'].flatMap((hook) =>
        verify(`vi.spyOn(component, '${hook}');`),
      ),
    ).toHaveLength(5);
  });

  it('names the hook and both repairs', () => {
    const [report] = verify("const spy = vi.spyOn(component, 'ngAfterViewInit');");

    expect(report?.message).toMatch(
      /replaces `ngAfterViewInit` on one instance[\s\S]*MyComponent\.prototype, 'ngAfterViewInit'[\s\S]*assert what the hook does/,
    );
    expect(report?.message).toContain('#how-to-mock-a-lifecycle-hook');
  });

  it('stays silent on a spy taken through the prototype', () => {
    expect(verify("vi.spyOn(CardComponent.prototype, 'ngOnInit');")).toEqual([]);
    expect(verify("vi.spyOn(Object.getPrototypeOf(component), 'ngOnDestroy');")).toEqual([]);
  });

  it('stays silent on a method that is not a hook the view reads off the prototype', () => {
    // Angular calls `ngOnChanges` as `this.ngOnChanges(changes)`, so an instance spy on it is reached.
    expect(verify("vi.spyOn(component, 'ngOnChanges');")).toEqual([]);
    expect(verify("vi.spyOn(component, 'load');")).toEqual([]);
  });

  it('stays silent where the call names no hook it can read', () => {
    expect(verify('vi.spyOn(component, hookName);')).toEqual([]);
    expect(verify('vi.spyOn(component, 1);')).toEqual([]);
    expect(verify('vi.spyOn(component);')).toEqual([]);
    expect(verify('vi.spyOn();')).toEqual([]);
    expect(verify("sinon.spyOn(component, 'ngOnInit');")).toEqual([]);
    expect(verify("component.ngOnInit('ngOnInit');")).toEqual([]);
  });
});
