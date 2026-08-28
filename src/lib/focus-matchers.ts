/**
 * `toHaveFocus` — a focus assertion that says what went wrong.
 *
 * Focus tests are written in one of two shapes, and both report nothing useful:
 *
 * ```ts
 * expect(document.activeElement).toBe(button);          // two enormous DOM dumps, no visible diff
 * expect(activeFocus() === getElement(row)).toBe(val);  // collapsed to a boolean before `expect`
 * ```
 *
 * The second is the common one in a TV / keyboard-navigation suite, and its failure message is
 * `expected false to deeply equal true` — which is compatible with every cause there is. The three
 * causes worth telling apart are: the expected element does not exist (by far the most frequent,
 * and indistinguishable from the others above), focus is still on `<body>` because nothing claimed
 * it, and focus is on a different element than the one expected.
 *
 * The matcher names which of the three happened, and describes both nodes by tag, id and class
 * rather than by dumping their subtrees.
 */
import { expect } from 'vitest';

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- declaration merging requires the type parameter list (defaults included) to match Vitest's own `interface Matchers<T = any>` exactly.
  interface Matchers<T = any> {
    /** Assert that this element is `document.activeElement`. */
    toHaveFocus(): T;
  }
}

/** What a matcher hands back to the runner. */
interface MatcherResult {
  pass: boolean;
  message: () => string;
}

/** A one-line signature of a node: `button#save.primary`, or `<body>` — never a subtree dump. */
function describeNode(node: unknown): string {
  if (node === null || node === undefined) {
    return String(node);
  }

  if (!(node instanceof Element)) {
    return `a non-element (${typeof node})`;
  }

  const id = node.id ? `#${node.id}` : '';
  const classes = node.classList.length > 0 ? `.${[...node.classList].join('.')}` : '';

  return `${node.tagName.toLowerCase()}${id}${classes}`;
}

function focusResult(received: unknown): MatcherResult {
  if (!(received instanceof Element)) {
    return {
      pass: false,
      message: (): string =>
        `expected an element to have focus, received ${describeNode(received)}.\n` +
        'A query that found nothing is the most common cause — assert the element exists before asserting on focus.',
    };
  }

  const active = received.ownerDocument.activeElement;
  const pass = active === received;

  return {
    pass,
    message: (): string => {
      if (pass) {
        return `expected ${describeNode(received)} not to have focus, but it does`;
      }

      const detached = !received.ownerDocument.contains(received) ? ' (and it is not in the document)' : '';

      return (
        `expected ${describeNode(received)} to have focus${detached}, but focus is on ${describeNode(active)}.\n` +
        'Nothing claimed focus if that is `body` — check that the fixture rendered and that the ' +
        'directive that focuses ran (an `afterNextRender` needs `await fixture.whenStable()`).'
      );
    },
  };
}

/**
 * Register {@link toHaveFocus} with the runner. Call once, from your setup file.
 *
 * ```ts
 * registerFocusMatchers(); // once, in the setup file
 *
 * expect(fixture.nativeElement.querySelector('.play')).toHaveFocus();
 * ```
 */
export function registerFocusMatchers(): void {
  expect.extend({
    toHaveFocus(received: unknown): MatcherResult {
      return focusResult(received);
    },
  });
}
