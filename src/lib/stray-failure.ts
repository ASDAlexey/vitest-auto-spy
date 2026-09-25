/**
 * The one-line origin of a stray timer or listener, and the error `onStrayTimers: 'throw'` /
 * `onStrayListeners: 'throw'` fail a file with.
 */
import { DOCS_LINKS, withDocs } from './docs-links';
import type { StrayListener } from './stray-listeners';
import type { StrayTimer } from './stray-timers';

/** `timeout (300 ms) from cart.spec.ts at load (src/cart.ts:12:5)`, the first frame only. */
export function describeStrayTimer({ kind, delay, file, frames }: StrayTimer): string {
  const scheduled = delay === undefined ? kind : `${kind} (${delay} ms)`;

  return `${scheduled} from ${file ?? 'no spec file'} ${frames[0] ?? ''}`.trimEnd();
}

/** `keydown on document from dialog.spec.ts at open (src/dialog.ts:8:3)`, the first frame only. */
export function describeStrayListener({ type, target, file, frames }: StrayListener): string {
  return `${type} on ${target} from ${file ?? 'no spec file'} ${frames[0] ?? ''}`.trimEnd();
}

function strayFailure(summary: string, lines: readonly string[]): Error {
  return new Error(withDocs(`[vitest-auto-spy] ${summary}${lines.map((line) => `\n  - ${line}`).join('')}`, DOCS_LINKS.setup));
}

/** What `onStrayTimers: 'throw'` fails the file with: every stray, not only the first few. */
export function strayTimersError(cancelled: number, timers: readonly StrayTimer[]): Error {
  return strayFailure(
    `${cancelled} scheduled callback(s) outlived the spec file that scheduled them. setupAutoSpy cancelled them; ` +
      "onStrayTimers: 'throw' fails the file. Clear each one where it was scheduled:",
    timers.map(describeStrayTimer),
  );
}

/** What `onStrayListeners: 'throw'` fails the file with: every stray, not only the first few. */
export function strayListenersError(removed: number, listeners: readonly StrayListener[]): Error {
  return strayFailure(
    `${removed} window/document listener(s) outlived the spec file that added them. setupAutoSpy removed them; ` +
      "onStrayListeners: 'throw' fails the file. Remove each one where it was added:",
    listeners.map(describeStrayListener),
  );
}
