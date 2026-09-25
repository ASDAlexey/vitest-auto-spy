/**
 * The words the stray-console guard reports with: the quote, the likely cause, and the one action
 * that fits the phase and the methods the output went through.
 */
import * as DOCS_LINKS from './docs-links';
import { withDocs } from './message-link';
import { count, displayFrame, displayPath } from './message-text';
import type { CallBucket, StrayConsoleCall, StrayConsolePhase } from './stray-console';

/** The `vitest-auto-spy/console` spy for each method that has one. */
const ENTRY_SPIES: Readonly<Record<string, string>> = {
  debug: 'consoleDebugSpy',
  error: 'consoleErrorSpy',
  info: 'consoleInfoSpy',
  log: 'consoleLogSpy',
  timeEnd: 'consoleTimeEndSpy',
  trace: 'consoleTraceSpy',
  warn: 'consoleWarnSpy',
};

const IMPORTED_SPIES_ADVICE =
  'Importing vitest-auto-spy/console installs nothing under strayConsole: under isolate: false the import cannot tell which ' +
  'file it belongs to.';

const BEFORE_ALL_ADVICE =
  'A spy from a beforeEach is not in place yet during a beforeAll: call installConsoleSpies() at the top of the file and ' +
  'assert on it, or move the work into a beforeEach.';

const AFTER_TEST_ADVICE =
  'Something the test started finished after it — a timer, a promise, a subscription: await or flush it inside the test, or ' +
  'tear it down in an afterEach. Output from an afterAll is absorbed by installConsoleSpies() at the top of the file.';

const PHASE_SUBJECT: Record<StrayConsolePhase, string> = {
  import: 'while the file was being imported',
  beforeAll: 'in a beforeAll, before the tests it prepares',
  test: 'in a test whose afterEach never ran',
  afterTest: 'after a test had ended — from a callback that outlived it, or an afterAll —',
};

const PHASE_TAG: Record<StrayConsolePhase, string> = {
  import: 'while importing',
  beforeAll: 'in a beforeAll',
  test: '',
  afterTest: 'after its test ended',
};

function tag(call: StrayConsoleCall, withPhase: boolean, file: string | undefined): string {
  const parts: string[] = [];

  if (call.test !== undefined) {
    parts.push(`during "${call.test}"`);
  } else if (withPhase && call.phase !== undefined && call.phase !== 'test') {
    parts.push(PHASE_TAG[call.phase]);
  }

  if (call.file !== undefined && call.file !== file) {
    parts.push(`in ${displayPath(call.file)}`);
  }

  return parts.length === 0 ? '' : ` (${parts.join(', ')})`;
}

interface QuoteTags {
  readonly test: boolean;
  readonly phase: boolean;
  readonly file: string | undefined;
}

function quote(calls: readonly StrayConsoleCall[], total: number, tags: QuoteTags): string {
  const lines = calls.map((call) => {
    const label = tags.test ? tag(call, tags.phase, tags.file) : '';
    const text = call.text.split('\n').join('\n      ');

    return `  - console.${call.method}${label}: ${text}\n      ${displayFrame(call.frame)}`;
  });
  const more = total > calls.length ? [`  … and ${total - calls.length} more`] : [];

  return [...lines, ...more].join('\n');
}

function causes(calls: readonly StrayConsoleCall[]): string[] {
  const found = [...new Set(calls.flatMap((call) => (call.cause === undefined ? [] : [call.cause])))];

  return found.length === 0 ? [] : ['Likely cause:', ...found.map((cause) => `  - ${cause}`)];
}

function methodsOf(calls: readonly StrayConsoleCall[], callThrough: boolean): string[] {
  return [...new Set(calls.filter((call) => (call.callThrough ?? false) === callThrough).map((call) => call.method))];
}

function joined(items: readonly string[]): string {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${String(items.at(-1))}`;
}

/** What absorbs output a test wrote on purpose: the entry's spy for each method, a silent `vi.spyOn` for the rest. */
function absorbAdvice(calls: readonly StrayConsoleCall[]): string[] {
  const advice: string[] = [];
  const spiedThrough = methodsOf(calls, true);
  const printed = methodsOf(calls, false);

  spiedThrough.forEach((method) => {
    advice.push(`vi.spyOn(console, '${method}') calls through — add .mockImplementation(() => undefined).`);
  });

  if (printed.length > 0 || calls.length === 0) {
    const spies = printed.flatMap((method) => {
      const spy = ENTRY_SPIES[method];

      return spy === undefined ? [] : [spy];
    });
    const unspied = printed.filter((method) => ENTRY_SPIES[method] === undefined);
    const entry = spies.length > 0 || calls.length === 0;
    const absorb = [
      ...(entry ? [`installConsoleSpies() in a beforeEach, then assert ${joined(spies) || 'its spies'}`] : []),
      ...unspied.map((method) => `vi.spyOn(console, '${method}').mockImplementation(() => undefined)`),
    ];

    advice.push(`Absorb what the test expects — ${absorb.join('; ')} — or fix the code if the output is a defect.`);

    if (globalThis.__vitestAutoSpyResetConsoleSpies__ && entry) {
      advice.push(IMPORTED_SPIES_ADVICE);
    }
  }

  return advice;
}

/** `/root/src/app/shared.ts:1:9` out of `at fn (/root/src/app/shared.ts:1:9)`. */
function frameLocation(frame: string): string | undefined {
  return /\(([^()]+:\d+:\d+)\)$/.exec(frame)?.[1] ?? /^at (.+:\d+:\d+)$/.exec(frame)?.[1];
}

function allowPattern(call: StrayConsoleCall): string {
  const code = /\bNG0*\d{3,4}\b/.exec(call.text)?.[0];

  return code === undefined ? '/…/' : `/${code}/`;
}

/** Diagnosis and one action for output written while a module was evaluated. */
function importAdvice(call: StrayConsoleCall): string[] {
  const location = frameLocation(call.frame);
  const written =
    location === undefined
      ? 'Written while a module was evaluated, before any hook — no spy can absorb it; fix the line that wrote it.'
      : `Written while ${displayPath(location.replace(/:\d+:\d+$/, ''))} was evaluated, before any hook — no spy can ` +
        `absorb it; fix it at ${displayPath(location)}.`;
  const advice = [`${written} Under isolate: false it is reported on the first file of the worker that imports that module.`];

  if (call.frame.includes('node_modules')) {
    advice.push(`That code is a dependency: \`strayConsole: { allow: [${allowPattern(call)}] }\` lets this line through.`);
  }

  return advice;
}

/** The advice for one phase; `first` is the first call made in it, `calls` every quoted call. */
function phaseAdvice(phase: StrayConsolePhase, first: StrayConsoleCall, calls: readonly StrayConsoleCall[]): string[] {
  switch (phase) {
    case 'import':
      return importAdvice(first);
    case 'beforeAll':
      return [BEFORE_ALL_ADVICE];
    case 'afterTest':
      return [AFTER_TEST_ADVICE];
    case 'test':
      return absorbAdvice(calls.filter((call) => (call.phase ?? 'test') === 'test'));
  }
}

/** The first call of each phase, in the order they happened; a call without one reads as a test's. */
function phasesOf(calls: readonly StrayConsoleCall[]): Map<StrayConsolePhase, StrayConsoleCall> {
  const phases = new Map<StrayConsolePhase, StrayConsoleCall>();

  calls.forEach((call) => {
    const phase = call.phase ?? 'test';

    if (!phases.has(phase)) {
      phases.set(phase, call);
    }
  });

  return phases;
}

/** The file the calls were written in, when they agree; the running file otherwise. */
function fileOf(calls: readonly StrayConsoleCall[], running: string): string {
  const files = new Set(calls.map((call) => call.file));
  const [only] = files;

  return files.size === 1 && only !== undefined ? only : running;
}

function writtenTo(bucket: Readonly<CallBucket>): string {
  const methods = new Set(bucket.calls.map((call) => call.method));
  const [only] = methods;
  const target = methods.size === 1 && bucket.total === bucket.calls.length && only !== undefined ? `console.${only}` : 'the console';

  return `wrote to ${target} ${count(bucket.total, 'time')}`;
}

/** The report for one test, or — given `file` — for a file's output outside any test. Exported for its spec. */
export function describeStrayConsole(bucket: Readonly<CallBucket>, test: string | undefined, file?: string): string {
  if (file === undefined) {
    return withDocs(
      [
        `[vitest-auto-spy] "${test ?? ''}" ${writtenTo(bucket)} and nothing absorbed it:`,
        quote(bucket.calls, bucket.total, { test: false, phase: false, file }),
        ...causes(bucket.calls),
        ...absorbAdvice(bucket.calls),
      ].join('\n'),
      DOCS_LINKS.setupConsole,
    );
  }

  const phases = phasesOf(bucket.calls);
  // Only a report that quotes every call knows that all of them share one phase.
  const [only] = phases.keys();
  const single = phases.size === 1 && bucket.total === bucket.calls.length ? only : undefined;
  const written = fileOf(bucket.calls, file);
  const subject = `${displayPath(written)} ${writtenTo(bucket)} ${single ? PHASE_SUBJECT[single] : 'outside any test'}`;
  const carried =
    written === file
      ? []
      : [`It is reported at the end of ${displayPath(file)}: the file-end check of ${displayPath(written)} did not run.`];
  const advice = [...new Set([...phases].flatMap(([phase, first]) => phaseAdvice(phase, first, bucket.calls)))];

  return withDocs(
    [
      `[vitest-auto-spy] ${subject} and nothing absorbed it:`,
      quote(bucket.calls, bucket.total, { test: true, phase: single === undefined, file: written }),
      ...causes(bucket.calls),
      ...advice,
      ...carried,
    ].join('\n'),
    DOCS_LINKS.setupConsole,
  );
}
