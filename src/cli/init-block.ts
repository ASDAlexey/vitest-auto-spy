/**
 * The managed block: what `init` writes, and the markers that make writing it again idempotent.
 *
 * Everything between the markers is regenerated in full on every run; everything outside them is
 * never read and never reformatted. The `sha=` in the opening marker is over the body, so
 * `init --check` can tell "the consumer edited our block" from "the package shipped a new one".
 */
import { createHash } from 'node:crypto';

import type { Profile } from './profile';

export const MARKER_BEGIN = /<!-- vitest-auto-spy:begin[^>]*-->/;
export const MARKER_END = '<!-- vitest-auto-spy:end -->';

export function digest(body: string): string {
  return createHash('sha256').update(body).digest('hex').slice(0, 8);
}

const FRAMEWORK_BULLET: Record<Profile['framework'], string> = {
  angular:
    '- `provideAutoSpy(Class)` in the TestBed providers, `injectSpy(Class)` to read the spy back. Both live on the\n  adapter entry, not on the package root.',
  nestjs: '- `provideAutoSpy(Class)` in the testing module providers; read the spy back with `moduleRef.get(Class)`.',
  react: '- `createAutoMock<T>()` for a hook or context value; `renderShallow` when a child component only needs to exist.',
  vue: '- `createAutoMock<T>()` for a store or composable; a Pinia store is mocked by type, not by class.',
  svelte: '- `createAutoMock<T>()` for a store or a module contract; a spy over a writable store keeps its `subscribe`.',
  none: '- `createSpyFromClass(Class)` for a real class, `createAutoMock<T>()` when only the type exists.',
};

/** What the repository scan adds to the profile: facts only a read of its sources and targets gives. */
export interface BlockFacts {
  /** The setup file the test target runs, when a unit-test builder target names one. */
  readonly setupFile?: string | undefined;
  /** The Angular companion entries the repository imports from, in `exports` order. */
  readonly companions: readonly string[];
}

const NO_FACTS: BlockFacts = { companions: [] };

function rxjsBullet(profile: Profile, facts: BlockFacts): string | undefined {
  if (!profile.hasRxjs) {
    return undefined;
  }

  const target = facts.setupFile ?? profile.setupFiles[0] ?? 'the test setup file';

  return `- Observable spies (\`nextWith\`, \`observablePropsToSpyOn\`) need \`import 'vitest-auto-spy/rxjs'\` once, in\n  \`${target}\` or a module / \`.d.ts\` it loads. Without it they throw "Observable spies require rxjs".`;
}

/**
 * The block itself. Kept under 1.6 kB on purpose: Codex caps the whole root→cwd `AGENTS.md` chain
 * at `project_doc_max_bytes` (32 768 by default) and silently truncates past it, so a pointer that
 * costs a kilobyte is a pointer that survives in a repository that already has instructions.
 */
function companionsBullet(facts: BlockFacts): string | undefined {
  if (facts.companions.length === 0) {
    return undefined;
  }

  const list = facts.companions.map((entry) => `\`${entry}\``).join(', ');

  return `- Setup helpers also come from ${list}, separate entries since\n  5.21.0 that do not re-export the core.`;
}

export function renderBody(profile: Profile, facts: BlockFacts = NO_FACTS): string {
  const lines = [
    '## Tests that use `vitest-auto-spy`',
    '',
    'For a spec that uses `vitest-auto-spy`, read the short map',
    '`node_modules/vitest-auto-spy/AGENTS.md` whole, then only the `agent-docs/*.md` files it names.',
    "On a failure: `grep -n -F '<error text>' node_modules/vitest-auto-spy/agent-docs/errors.md`.",
    'Where docs and code disagree, `dist/*.d.ts` wins.',
    '',
    `- This repository imports from \`${profile.entry}\`. Each entry registers its mock adapter on`,
    '  import, so the wrong one leaves the wrong adapter installed and the spies fail at runtime.',
    FRAMEWORK_BULLET[profile.framework],
    companionsBullet(facts),
    rxjsBullet(profile, facts),
    '- `methodsToSpyOn` **adds** to the auto-discovered prototype methods; the exhaustive whitelist is',
    '  `onlyMethodsToSpyOn`. For methods on the instance, not the prototype, use `createAutoMock<T>()`.',
    '- `Spy<T>` is a mapped type and drops `#private` members, so it is not assignable to `T`. Declare',
    '  the variable as `Spy<T>`, or pass `asInstance(spy)` where the real type is required.',
    '- `npx vitest-auto-spy doctor` reports suite-level defects that never fail a run.',
  ];

  return lines.filter((line): line is string => line !== undefined).join('\n');
}

/** Wraps a body in the markers, stamping the package version and the body digest. */
export function wrapManaged(body: string, version: string): string {
  return `<!-- vitest-auto-spy:begin v=${version} sha=${digest(body)} -->\n${body}\n${MARKER_END}`;
}

export interface ManagedSpan {
  readonly start: number;
  readonly end: number;
  readonly marker: string;
  readonly inner: string;
}

/**
 * Every complete block, in order. A begin marker pairs with the first end marker after it, and only
 * when no other begin sits in between: a stray end before the block, or a begin left dangling by a
 * bad merge, stays plain text instead of swallowing the text around it.
 */
export function managedSpans(text: string): ManagedSpan[] {
  const begin = new RegExp(MARKER_BEGIN.source, 'g');
  const spans: ManagedSpan[] = [];
  let match = begin.exec(text);

  while (match !== null) {
    const open = match;
    const bodyStart = open.index + open[0].length;
    const endAt = text.indexOf(MARKER_END, bodyStart);

    if (endAt === -1) {
      break;
    }

    match = begin.exec(text);

    if (match === null || match.index > endAt) {
      spans.push({ start: open.index, end: endAt + MARKER_END.length, marker: open[0], inner: text.slice(bodyStart, endAt) });
      begin.lastIndex = endAt + MARKER_END.length;
      match = begin.exec(text);
    }
  }

  return spans;
}

export function hasManaged(text: string): boolean {
  return managedSpans(text).length > 0;
}

/**
 * A block whose body no longer matches the `sha=` its marker was stamped with was edited by hand.
 * Line endings are normalised first, so a checkout with `core.autocrlf` is not an edit.
 */
export function isHandEdited(span: ManagedSpan): boolean {
  const stamped = /\ssha=([\da-f]+)/.exec(span.marker)?.[1];
  const body = span.inner.replace(/\r\n/g, '\n').replace(/^\n/, '').replace(/\n$/, '');

  return stamped !== undefined && digest(body) !== stamped;
}

export function hasHandEditedBlock(text: string): boolean {
  return managedSpans(text).some(isHandEdited);
}

/**
 * The text with the version dropped out of the marker.
 *
 * `--check` is meant for a consumer's CI, and it compared the files byte for byte — so every release
 * of this package turned that step red on a repository whose block had not changed a word. The body
 * is what the check is about; the stamp is refreshed by the next `init` that runs for another reason.
 */
export function withoutVersion(text: string): string {
  return text.replace(new RegExp(MARKER_BEGIN.source, 'g'), (marker) => marker.replace(/\s+v=[^\s>]+/, ''));
}

/**
 * Replaces the managed block in `existing`, or appends it. Text outside the markers is preserved
 * byte for byte — a consumer's own instructions are none of this CLI's business. A second block,
 * left by a merge or a copy, is removed: one pointer is the whole point.
 */
export function applyManaged(existing: string, managed: string): string {
  const [first, ...duplicates] = managedSpans(existing);

  if (first === undefined) {
    const separator = existing.length === 0 || existing.endsWith('\n\n') ? '' : existing.endsWith('\n') ? '\n' : '\n\n';

    return `${existing}${separator}${managed}\n`;
  }

  const rest = duplicates.reduceRight((text, span) => cut(text, span), existing);

  return `${rest.slice(0, first.start)}${managed}${rest.slice(first.end)}`;
}

function cut(text: string, span: ManagedSpan): string {
  const before = text.slice(0, span.start).replace(/\n{2,}$/, '\n');

  return `${before}${text.slice(span.end).replace(/^\n+/, '')}`;
}

/** Removes every managed block and the blank line each was appended with. */
export function removeManaged(existing: string): string {
  return managedSpans(existing).reduceRight((text, span) => cut(text, span), existing);
}
