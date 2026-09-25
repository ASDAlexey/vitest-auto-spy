/**
 * Catch the attribute a test leaves on `<html>` or `<body>`, in the test that left it.
 *
 * Under `isolate: false` every spec file in a worker renders into one jsdom document. A component
 * whose effect runs `renderer.setAttribute(document.body, 'data-reset-focus', '')` and nothing that
 * takes it off again leaves the next file a different document: in the consumer this was found in,
 * a navigation service returned early whenever `document.querySelector('[data-reset-focus]')`
 * matched, and its spec failed 34 of 209 tests — only when the two files shared a worker, about one
 * full run in six, and never on its own. No other guard sees it: nothing was added to a prototype or
 * sealed on a global, no timer, console call or rejection was left behind, and the static checks
 * read no document.
 *
 * **When it looks.** Not in an `afterEach`. A setup file registers its hooks after the TestBed's
 * own (`init-testbed.js` is the builder's first setup file), and `afterEach` hooks run in reverse,
 * so an `afterEach` check runs **before** the TestBed destroys the fixtures — and reports every
 * attribute a component would have taken off in `ngOnDestroy` or `DestroyRef.onDestroy`, plus every
 * `<style>` and root element Angular removes in the same teardown. The per-test check runs from
 * `onTestFinished`, which the runner calls after the whole `afterEach` chain and the `beforeEach`
 * cleanups whatever `sequence.hooks` says; the file check runs from a `beforeAll` cleanup, which comes
 * after every `afterAll`. Measured on a zoneless TestBed: at `afterEach` time the component's style,
 * its root element and the attribute its `DestroyRef` owned were all still there; at both of these
 * points none was.
 *
 * **What it cannot see.** A write made while the spec file is being imported happens before any hook
 * of that file, so its baseline already contains it, and it travels into the next file uncounted —
 * the same blind spot as `prototypePollution`. And a fixture left alive by
 * `teardown: { destroyAfterEach: false }` is destroyed only in the next test's `beforeEach`, so what
 * its component owns is reported against the test that rendered it.
 */
import { beforeAll, beforeEach, expect, onTestFinished } from 'vitest';

import * as DOCS_LINKS from './docs-links';
import type { GuardReaction } from './guard-reaction';
import { withDocs } from './message-link';
import { displayPath } from './message-text';
import { writeWarning } from './write-warning';

/** How {@link guardDocumentPollution} reacts to a document a test left changed. */
export type DocumentPollutionReaction = GuardReaction;

/** The object form of `documentPollution`, for a reaction plus what a project cannot clean up. */
export interface DocumentPollutionOptions {
  /** Default `'throw'`. */
  reaction?: DocumentPollutionReaction;
  /**
   * Also watch the element children of `<head>` and `<body>`. Default `false`: a module that injects a
   * stylesheet when it is first imported does so once per worker, and a node check would charge that
   * `<style>` to whichever test happened to import it first.
   */
  nodes?: boolean;
  /** Attribute names left alone, as an exact name or a tested RegExp. Matched on all three elements. */
  ignoreAttributes?: readonly (RegExp | string)[];
  /** A CSS selector for child elements left alone when `nodes` is on — `'style, link[rel=stylesheet]'`. */
  ignoreNodes?: string;
}

/** {@link DocumentPollutionOptions} with every default filled in. */
export interface ResolvedDocumentPollution {
  reaction: DocumentPollutionReaction;
  nodes: boolean;
  ignoreAttributes: readonly (RegExp | string)[];
  ignoreNodes: string | undefined;
}

/** One watched element and what it carried when the snapshot was taken. */
interface WatchedElement {
  /** The name used in the report — `<html>`, `<head>`, `<body>`. */
  readonly label: string;
  readonly element: Element;
  readonly attributes: ReadonlyMap<string, string>;
  /** The element children, when nodes are watched; `undefined` otherwise. */
  readonly children: readonly Element[] | undefined;
}

/** What {@link snapshotDocument} recorded, handed back to {@link checkDocumentPollution}. */
export interface DocumentSnapshot {
  readonly watched: readonly WatchedElement[];
  readonly options: ResolvedDocumentPollution;
  /**
   * What `ignoreNodes` answered for each child, so the check does not ask again.
   *
   * The selector is matched per child per pass, and a `<head>` that collects stylesheets is where
   * `nodes: true` is turned on in the first place — 1000 children cost 0.5 ms of `matches()` alone.
   * An element's answer cannot change between the snapshot and the check of one test without the
   * test rewriting the attribute the selector reads, which is not what a leftover looks like.
   */
  readonly ignored: WeakMap<Element, boolean>;
}

const QUOTED_VALUE_LENGTH = 80;

/** Normalise the two spellings `setupAutoSpy` accepts into one resolved form. */
export function resolveDocumentPollution(
  option: DocumentPollutionOptions | DocumentPollutionReaction | undefined,
): ResolvedDocumentPollution {
  if (typeof option === 'object') {
    return {
      reaction: option.reaction ?? 'throw',
      nodes: option.nodes ?? false,
      ignoreAttributes: option.ignoreAttributes ?? [],
      ignoreNodes: option.ignoreNodes,
    };
  }

  return { reaction: option ?? 'off', nodes: false, ignoreAttributes: [], ignoreNodes: undefined };
}

function isIgnoredAttribute(name: string, ignore: readonly (RegExp | string)[]): boolean {
  return ignore.some((pattern) => (typeof pattern === 'string' ? pattern === name : pattern.test(name)));
}

// `classList.add` then `remove` leaves `class=""` where there was no attribute, and `style` does the same;
// neither is observable, so an empty one reads as absent. Any other empty value — `data-reset-focus=""` — counts.
const EMPTY_MEANS_ABSENT: ReadonlySet<string> = new Set(['class', 'style']);

function isEmptyMeansAbsent({ name, value }: Attr): boolean {
  return value === '' && EMPTY_MEANS_ABSENT.has(name);
}

function readAttributes(element: Element, ignore: readonly (RegExp | string)[]): Map<string, string> {
  return new Map(
    [...element.attributes]
      .filter((attribute) => !isIgnoredAttribute(attribute.name, ignore) && !isEmptyMeansAbsent(attribute))
      .map(({ name, value }) => [name, value]),
  );
}

function readChildren(element: Element, options: ResolvedDocumentPollution, ignored: WeakMap<Element, boolean>): Element[] | undefined {
  if (!options.nodes) {
    return undefined;
  }

  const ignore = options.ignoreNodes;
  const children: Element[] = [];

  // Walked rather than spread: jsdom's `children` is a live `HTMLCollection` that scans from the
  // start on every index, so `[...head.children]` is quadratic — 3.2 ms for a `<head>` of 1000
  // nodes against 36 µs for this walk, twice per test.
  for (let child = element.firstElementChild; child; child = child.nextElementSibling) {
    if (ignore === undefined || !isIgnoredNode(child, ignore, ignored)) {
      children.push(child);
    }
  }

  return children;
}

function isIgnoredNode(child: Element, ignore: string, ignored: WeakMap<Element, boolean>): boolean {
  const remembered = ignored.get(child);

  if (remembered !== undefined) {
    return remembered;
  }

  const matched = child.matches(ignore);

  ignored.set(child, matched);

  return matched;
}

/**
 * Record the attributes of `<html>`, `<head>` and `<body>`, and their children when asked.
 *
 * Exported — and taking the document as a parameter — for this module's own spec: the detection is
 * driven directly there, because a check wired into the run fails the very test asserting on it.
 * A `node` environment has no document, and the guard then watches nothing.
 */
export function snapshotDocument(
  options: ResolvedDocumentPollution,
  doc: Document | null | undefined = Reflect.get(globalThis, 'document'),
): DocumentSnapshot {
  const ignored = new WeakMap<Element, boolean>();

  if (!doc) {
    return { watched: [], options, ignored };
  }

  const candidates: [string, Element | null][] = [
    ['<html>', doc.documentElement],
    ['<head>', doc.head],
    ['<body>', doc.body],
  ];
  const watched = candidates.flatMap(([label, element]): WatchedElement[] =>
    element
      ? [
          {
            label,
            element,
            attributes: readAttributes(element, options.ignoreAttributes),
            children: readChildren(element, options, ignored),
          },
        ]
      : [],
  );

  return { watched, options, ignored };
}

function quote(value: string): string {
  const shown = value.length > QUOTED_VALUE_LENGTH ? `${value.slice(0, QUOTED_VALUE_LENGTH)}…` : value;

  return JSON.stringify(shown);
}

/** Put every attribute back the way the snapshot found it, and say what had moved. */
function restoreAttributes({ label, element, attributes }: WatchedElement, ignore: readonly (RegExp | string)[]): string[] {
  const current = readAttributes(element, ignore);
  const lines: string[] = [];

  current.forEach((value, name) => {
    const before = attributes.get(name);

    if (before === undefined) {
      lines.push(`${label} ${name}=${quote(value)} added`);
      element.removeAttribute(name);
    } else if (before !== value) {
      lines.push(`${label} ${name} changed from ${quote(before)} to ${quote(value)}`);
      element.setAttribute(name, before);
    }
  });

  attributes.forEach((before, name) => {
    if (!current.has(name)) {
      lines.push(`${label} ${name} removed (was ${quote(before)})`);
      element.setAttribute(name, before);
    }
  });

  return lines;
}

function describeElement(element: Element): string {
  const id = element.id ? ` id="${element.id}"` : '';
  const className = element.getAttribute('class');

  return `<${element.localName}${id}${className ? ` class="${className}"` : ''}>`;
}

/** Take added children back out, put removed ones back in their order, and say what had moved. */
function restoreChildren(
  { label, element, children }: WatchedElement,
  options: ResolvedDocumentPollution,
  ignored: WeakMap<Element, boolean>,
): string[] {
  const before = children ?? [];
  const now = readChildren(element, options, ignored) ?? [];
  const baseline = new Set(before);
  const added = now.filter((child) => !baseline.has(child));
  const removed = before.filter((child) => child.parentNode !== element);

  added.forEach((child) => child.remove());

  // Walked from the end so each node goes in front of the baseline node that follows it, which is
  // back in place by then.
  let anchor: Element | null = null;

  for (const child of [...before].reverse()) {
    if (child.parentNode !== element) {
      element.insertBefore(child, anchor);
    }

    anchor = child;
  }

  return [
    ...added.map((child) => `${label} child ${describeElement(child)} added`),
    ...removed.map((child) => `${label} child ${describeElement(child)} removed`),
  ];
}

const OUTSIDE_ANY_TEST = ', outside any test,';

// Cheap on purpose: Angular's dev mode publishes `ng`, and a CDK overlay or an `ng-` attribute says the same.
function looksLikeAngular(lines: readonly string[]): boolean {
  return Reflect.get(globalThis, 'ng') !== undefined || lines.some((line) => /\bcdk-|\bng-|_ngcontent|_nghost/.test(line));
}

function undoAdvice(lines: readonly string[], scope: string): string {
  if (looksLikeAngular(lines)) {
    return 'Undo it in the teardown of what set it: ngOnDestroy / DestroyRef.onDestroy of the component, or destroy the fixture that owns it.';
  }

  return scope.endsWith(OUTSIDE_ANY_TEST)
    ? 'Undo it in an afterAll of this file.'
    : 'Undo it in an afterEach of this spec, or in the cleanup of the code that made it.';
}

function report(lines: readonly string[], scope: string): string {
  return withDocs(
    `[vitest-auto-spy] ${scope} left the shared document changed:\n${lines.map((line) => `  - ${line}`).join('\n')}\n` +
      `It has been put back, because every later spec file in this worker shares this document. ${undoAdvice(lines, scope)}`,
    DOCS_LINKS.setupDocument,
  );
}

/**
 * Compare the document with the snapshot, put it back, and react to whatever had moved.
 *
 * Exported alongside {@link snapshotDocument} so the reaction can be exercised without a hook failing
 * the test asserting on it. `'warn'` goes to stderr rather than `console.warn`: the file-level check
 * runs after the file's last test, where Vitest drops intercepted console output.
 */
export function checkDocumentPollution(snapshot: DocumentSnapshot, scope: string, write: (message: string) => void = writeWarning): void {
  const { options } = snapshot;
  const lines = snapshot.watched.flatMap((watched) => [
    ...restoreAttributes(watched, options.ignoreAttributes),
    ...restoreChildren(watched, options, snapshot.ignored),
  ]);

  if (lines.length === 0) {
    return;
  }

  const message = report(lines, scope);

  if (options.reaction === 'throw') {
    throw new Error(message);
  }

  write(message);
}

/** The running test and its file, for the per-test report. Exported, with {@link fileScope}, for its spec. */
export function testScope(): string {
  const { currentTestName, testPath } = expect.getState();

  return `"${currentTestName ?? 'this test'}" (${testPath === undefined ? 'this file' : displayPath(testPath)})`;
}

/** The running file, for a leftover no test made. */
export function fileScope(): string {
  const { testPath } = expect.getState();

  return `${testPath === undefined ? 'this file' : displayPath(testPath)}${OUTSIDE_ANY_TEST}`;
}

/**
 * Watch `<html>`, `<head>` and `<body>` for attributes — and, when asked, children — a test leaves
 * changed, put them back, and name the test that changed them.
 *
 * Registers the hooks itself; `setupAutoSpy({ documentPollution: … })` is how a project turns it on,
 * and `preset: 'strict'` turns it on at `'throw'`. Off by default: a leftover attribute breaks a later
 * file only when something reads it, and a suite that has lived with a few must not go red on upgrade.
 *
 * @param option `'throw'` fails the test (or, for a `beforeAll` leftover, the file), `'warn'` puts the
 *   document back and only reports it, `'off'` registers nothing — including the repair.
 */
export function guardDocumentPollution(option: DocumentPollutionOptions | DocumentPollutionReaction): void {
  const watch = watchDocumentPollution(option);

  if (!watch) {
    return;
  }

  beforeEach(() => {
    const check = watch.open();

    onTestFinished(check);
  });
}

/** The per-test half of the guard, for a caller that already owns a `beforeEach` and an `onTestFinished`. */
export interface DocumentWatch {
  /** Take the snapshot; the returned check puts the document back and reports, and belongs in `onTestFinished`. */
  open(): () => void;
}

/**
 * Register the file-level check and hand back the per-test half.
 *
 * `setupAutoSpy` folds the check into the `onTestFinished` it registers anyway: the runner takes a
 * stack for every registration (`withTimeout(handler, …, new Error(…))`), so a second one costs
 * about 7 µs per test for a callback that runs in the same place as the first.
 */
export function watchDocumentPollution(option: DocumentPollutionOptions | DocumentPollutionReaction): DocumentWatch | undefined {
  const options = resolveDocumentPollution(option);

  if (options.reaction === 'off') {
    return undefined;
  }

  beforeAll(() => {
    const file = snapshotDocument(options);

    return (): void => checkDocumentPollution(file, fileScope());
  });

  return {
    open: (): (() => void) => {
      const test = snapshotDocument(options);

      return (): void => checkDocumentPollution(test, testScope());
    },
  };
}
