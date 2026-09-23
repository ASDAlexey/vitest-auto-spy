/**
 * `strict: 'survey'` counts what strict mode would refuse and prints the list once the file is over,
 * instead of stopping each test at its first unconfigured call.
 */
import '../index';
import { createAutoMock } from './auto-mock';
import { createSpyFromClass } from './create-spy-from-class';
import { STRICT_ENV, setupAutoSpy, surveyInstead } from './setup-auto-spy';
import { createStrictSurvey } from './strict-survey';

class Cart {
  total(): number {
    return 1;
  }

  clear(): void {
    /* empties */
  }
}

const written: string[] = [];
const survey = createStrictSurvey();
const loud = createStrictSurvey();

// Registered first so that, with hooks run as a stack, it reads what the two below wrote.
afterAll(() => {
  expect(written).toEqual([expect.stringMatching(/strict survey — .*setup-auto-spy-survey\.spec\.ts[\s\S]*Api\.save ×1/)]);
});

surveyInstead({ strict: 'survey' }, createStrictSurvey(), (line) => written.push(line));
surveyInstead({ strict: 'survey' }, loud, (line) => written.push(line));

vi.stubEnv(STRICT_ENV, 'survey');
setupAutoSpy({ duplicateCopies: 'off', restoreProps: false, onUnstubbedCall: survey.onCall, onUnstubbedRead: survey.onRead });
vi.unstubAllEnvs();

describe('strict survey', () => {
  it('answers undefined and counts the call instead of throwing', () => {
    const cart = createSpyFromClass(Cart);

    expect(cart.total()).toBeUndefined();
    cart.total();
    cart.clear();

    expect(survey.flush('cart.spec.ts')).toContain('Cart.total ×2\n  Cart.clear ×1');
    expect(survey.flush('cart.spec.ts')).toBeUndefined();
  });

  it('lists reads apart from calls, and names a double with no class by what it was given', () => {
    const own = createStrictSurvey();

    own.onCall({ className: undefined, method: 'load', args: [] });
    own.onCall({ className: 'Api', method: 'get', args: [] });
    own.onRead({ className: 'Router', member: 'url', kind: 'getter', count: 3 });

    expect(own.flush(undefined)).toMatch(/strict survey — this file:[\s\S]*\n {2}Api\.get ×1\n {2}load ×1\n[\s\S]*Router\.url ×3/);
  });

  it('keeps a handler the caller passed, and leaves every other strict value as it was', () => {
    const own = vi.fn();

    expect(
      surveyInstead({ strict: 'survey', onUnstubbedCall: own }, createStrictSurvey(), (line) => written.push(line)).onUnstubbedCall,
    ).toBe(own);
    expect(surveyInstead({ strict: true })).toEqual({ strict: true });
    expect(surveyInstead({})).toEqual({});
  });

  it('prints nothing for a file where nothing was refused, and the report for one where something was', () => {
    loud.onCall({ className: 'Api', method: 'save', args: [] });
    createAutoMock<{ ping(): void }>(undefined, { name: 'Pinger' });
  });
});
