/**
 * The one-line origin of a stray timer or listener, and the reports `onStrayTimers: 'throw'` /
 * `onStrayListeners: 'throw'` fail a file with.
 */
import * as DOCS_LINKS from './docs-links';
import { withDocs } from './message-link';
import { count, displayFrame, displayPath, taskName } from './message-text';
import { currentSpecFile } from './spec-file';
import { ownFrames, stackFrames } from './stack-frames';
import type { StrayListener } from './stray-listeners';
import type { StrayTimer } from './stray-timers';

/** Where a timer or listener was made: the running test, or the phase outside one. */
export type MadeIn = object | 'hook' | 'import' | undefined;

/**
 * Read when the timer or listener is made, and kept raw: the test's name is built only for a stray.
 * The file's `result` is still unset while it is collected, which is what tells an import from a hook.
 */
export function madeIn(): MadeIn {
  const current: unknown = Reflect.get(Object(Reflect.get(globalThis, '__vitest_worker__')), 'current');

  if (typeof current !== 'object' || current === null) {
    return undefined;
  }

  if (Reflect.get(current, 'type') === 'test') {
    return current;
  }

  return Reflect.get(current, 'result') === undefined ? 'import' : 'hook';
}

/** The optional fields a stray carries for the place it was made in, read off {@link madeIn}. */
/** The spec file and phase a timer or listener is made in, read at the moment it is made. */
export function originNow(): { readonly file: unknown; readonly where: MadeIn } {
  return { file: currentSpecFile(), where: madeIn() };
}

/** What a stray's report carries about its origin: the file, the test or phase, and the first frames past the wrapper. */
export function describeOriginOf(
  origin: { readonly file: unknown; readonly where: MadeIn; readonly trace: { readonly stack?: string } },
  wrapper: RegExp,
): { file: string | undefined; frames: string[]; test?: string; outsideTest?: 'hook' | 'import' } {
  const frames = stackFrames(origin.trace.stack).filter((frame) => !wrapper.test(frame));

  return { file: typeof origin.file === 'string' ? origin.file : undefined, frames: ownFrames(frames, 5), ...describeMadeIn(origin.where) };
}

export function describeMadeIn(where: MadeIn): { test?: string; outsideTest?: 'hook' | 'import' } {
  if (where === undefined) {
    return {};
  }

  return typeof where === 'string' ? { outsideTest: where } : { test: taskName(where) };
}

const TIMER_NAMES: Record<StrayTimer['kind'], string> = {
  timeout: 'setTimeout',
  interval: 'setInterval',
  frame: 'requestAnimationFrame',
};

interface Origin {
  readonly file: string | undefined;
  readonly frames: readonly string[];
  readonly test?: string;
  readonly outsideTest?: 'hook' | 'import';
}

function where(verb: string, { test, outsideTest }: Origin): string {
  if (test !== undefined) {
    return `, ${verb} in "${test}"`;
  }

  if (outsideTest === 'import') {
    return `, ${verb} while the file was imported`;
  }

  return outsideTest === 'hook' ? `, ${verb} outside any test (a beforeAll, an afterAll or a late callback)` : '';
}

function fileNote(file: string | undefined, reportFile: string | undefined): string {
  if (file === undefined) {
    return ', outside any spec file';
  }

  return file === reportFile ? '' : `, in ${displayPath(file)}`;
}

function describeOrigin(what: string, verb: string, origin: Origin, reportFile: string | undefined): string {
  const frame = origin.frames[0];

  return `${what}${where(verb, origin)}${fileNote(origin.file, reportFile)}${frame === undefined ? '' : ` ${displayFrame(frame)}`}`;
}

/** `setTimeout 300 ms, scheduled in "cart > loads" at load (src/cart.ts:12:5)`, the first frame only. */
export function describeStrayTimer(timer: StrayTimer, reportFile?: string): string {
  const name = TIMER_NAMES[timer.kind];

  return describeOrigin(timer.delay === undefined ? name : `${name} ${timer.delay} ms`, 'scheduled', timer, reportFile);
}

/** `keydown on document, added in "dialog > opens" at open (src/dialog.ts:8:3)`, the first frame only. */
export function describeStrayListener(listener: StrayListener, reportFile?: string): string {
  return describeOrigin(`${listener.type} on ${listener.target}`, 'added', listener, reportFile);
}

/** The file every stray came from, or the running one when they disagree. */
function reportFileOf(origins: readonly Origin[]): string | undefined {
  const files = new Set(origins.map((origin) => origin.file));
  const [only] = files;

  if (files.size === 1 && only !== undefined) {
    return only;
  }

  const running = currentSpecFile();

  return typeof running === 'string' ? running : undefined;
}

interface StrayReport {
  readonly noun: string;
  readonly state: string;
  readonly lines: readonly string[];
  readonly total: number;
  readonly reportFile: string | undefined;
}

function strayReport({ noun, state, lines, total, reportFile }: StrayReport): string {
  const subject = reportFile === undefined ? 'A spec file' : displayPath(reportFile);
  const more = total > lines.length && lines.length > 0 ? [`  … and ${total - lines.length} more`] : [];

  return [`[vitest-auto-spy] ${subject} left ${count(total, noun)} ${state} when it ended${lines.length > 0 ? ':' : '.'}`]
    .concat(
      lines.map((line) => `  - ${line}`),
      more,
    )
    .join('\n');
}

function allInTests(origins: readonly Origin[]): boolean {
  return origins.length > 0 && origins.every((origin) => origin.test !== undefined);
}

/**
 * The diagnosis and the advice for timers a file left pending; `limit` caps the list for a warning.
 * Without the Docs line, which the caller adds with the section it belongs to.
 */
export function strayTimersReport(cancelled: number, timers: readonly StrayTimer[], limit = Infinity): string {
  const reportFile = reportFileOf(timers);
  const one = cancelled === 1;
  const place = allInTests(timers) ? 'in the test that scheduled it' : 'where it was scheduled';
  const drain = allInTests(timers) ? ' — or run it out with fake timers before the test ends' : '';

  return [
    strayReport({
      noun: 'timer',
      state: 'pending',
      lines: timers.slice(0, limit).map((timer) => describeStrayTimer(timer, reportFile)),
      total: cancelled,
      reportFile,
    }),
    `${one ? 'It was' : 'They were'} cancelled so ${one ? 'it cannot' : 'none can'} fire in the next file. ` +
      `Clear ${one ? 'it' : 'each'} ${place} — clearTimeout, unsubscribe, fixture.destroy()${drain}.`,
  ].join('\n');
}

/** What `onStrayTimers: 'throw'` fails the file with: every stray, not only the first few. */
export function strayTimersError(cancelled: number, timers: readonly StrayTimer[]): Error {
  return new Error(withDocs(strayTimersReport(cancelled, timers), DOCS_LINKS.setupTimers));
}

/** What `onStrayListeners: 'throw'` fails the file with: every stray, not only the first few. */
export function strayListenersError(removed: number, listeners: readonly StrayListener[]): Error {
  const reportFile = reportFileOf(listeners);
  const one = removed === 1;
  const place = allInTests(listeners) ? 'in the test that added it' : 'where it was added';

  return new Error(
    withDocs(
      [
        strayReport({
          noun: 'window/document listener',
          state: 'attached',
          lines: listeners.map((listener) => describeStrayListener(listener, reportFile)),
          total: removed,
          reportFile,
        }),
        `${one ? 'It was' : 'They were'} removed so ${one ? 'it cannot' : 'none can'} fire in the next file. ` +
          `Remove ${one ? 'it' : 'each'} ${place} — removeEventListener with the same capture flag, an AbortSignal, fixture.destroy().`,
      ].join('\n'),
      DOCS_LINKS.setupListeners,
    ),
  );
}
