import { describe, expect, it } from 'vitest';

import { consoleCause } from './console-causes';

const COLLISION =
  "NG0912: Component ID generation collision detected. Components '_UiRadioGroupComponent' and " +
  "'UiRadioGroupComponent' with selector 'ui-radio-group' generated the same component ID. To fix this, you " +
  'can change the selector of one of those components or add an extra host attribute to force a different ID. ' +
  'Find more at https://v22.angular.dev/errors/NG0912';

describe('consoleCause', () => {
  it('names both classes and the selector of an NG0912 collision, and calls it two copies of one component', () => {
    const cause = consoleCause(COLLISION);

    expect(cause).toContain('`_UiRadioGroupComponent` and `UiRadioGroupComponent` (selector `ui-radio-group`)');
    expect(cause).toContain('two copies of one component');
    expect(cause).toContain('Import the component from one place.');
    expect(cause).not.toContain('allow');
    expect(cause?.split('. ').length).toBeLessThanOrEqual(2);
  });

  it('points another Angular code at the link Angular printed, without the full stop after it', () => {
    expect(consoleCause('NG0303: Can\'t set value of the "x" input. Find more at https://v22.angular.dev/errors/NG0303.')).toBe(
      'Angular explains this error at https://v22.angular.dev/errors/NG0303',
    );
  });

  it('builds the link from the code when Angular printed none', () => {
    expect(consoleCause('NG100: ExpressionChangedAfterItHasBeenChecked')).toBe(
      'Angular explains this error at https://angular.dev/errors/NG0100',
    );
  });

  it('recognises nothing else', () => {
    expect(consoleCause('load failed')).toBeUndefined();
  });
});
