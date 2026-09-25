/**
 * `VITEST_AUTO_SPY_STRICT` flips `strict` for a narrow run without editing the setup file. It wins
 * over the option — here the option says `false` — because the point is to measure a slice under the
 * other setting.
 */
import '../index';
import { createSpyFromClass } from './create-spy-from-class';
import { takeStrictViolations } from './function-spy';
import { STRICT_ENV, setupAutoSpy, strictFromEnvironment } from './setup-auto-spy';

class Cart {
  total(): number {
    return 1;
  }
}

vi.stubEnv(STRICT_ENV, '1');
setupAutoSpy({ duplicateCopies: 'off', restoreProps: false, strict: false });
vi.unstubAllEnvs();

it('arms strict mode over the option the setup file passed', () => {
  expect(() => createSpyFromClass(Cart).total()).toThrow(/Cart\.total\(\) was called; this strict double has nothing configured/);
  expect(takeStrictViolations()).toHaveLength(1);
});

it('reads 1/true, 0/false and survey, and nothing else', () => {
  expect(strictFromEnvironment({ [STRICT_ENV]: ' TRUE ' })).toBe(true);
  expect(strictFromEnvironment({ [STRICT_ENV]: '0' })).toBe(false);
  expect(strictFromEnvironment({ [STRICT_ENV]: 'false' })).toBe(false);
  expect(strictFromEnvironment({ [STRICT_ENV]: 'Survey' })).toBe('survey');
  expect(strictFromEnvironment({ [STRICT_ENV]: 'yes' })).toBeUndefined();
  expect(strictFromEnvironment({})).toBeUndefined();
  expect(strictFromEnvironment(undefined)).toBeUndefined();
});
