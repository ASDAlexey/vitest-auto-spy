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

function rxjsBullet(profile: Profile): string | undefined {
  if (!profile.hasRxjs) {
    return undefined;
  }

  const target = profile.setupFiles[0] ?? 'the test setup file';

  return `- Observable spies (\`nextWith\`, \`observablePropsToSpyOn\`) need \`import 'vitest-auto-spy/rxjs'\` once, in\n  \`${target}\`. Without it they throw "Observable spies require rxjs".`;
}

/**
 * The block itself. Kept under 1.6 kB on purpose: Codex caps the whole root→cwd `AGENTS.md` chain
 * at `project_doc_max_bytes` (32 768 by default) and silently truncates past it, so a pointer that
 * costs a kilobyte is a pointer that survives in a repository that already has instructions.
 */
export function renderBody(profile: Profile): string {
  const lines = [
    '## Tests that use `vitest-auto-spy`',
    '',
    'Read `node_modules/vitest-auto-spy/AGENTS.md` before writing or fixing a spec that uses',
    '`vitest-auto-spy` — it is the authoritative reference for the API, the configuration semantics',
    'and the common mistakes. Where it and the code disagree, `dist/*.d.ts` wins.',
    '',
    `- This repository imports from \`${profile.entry}\`. Each entry registers its mock adapter on`,
    '  import, so the wrong one leaves the wrong adapter installed and the spies fail at runtime.',
    FRAMEWORK_BULLET[profile.framework],
    rxjsBullet(profile),
    '- `methodsToSpyOn` **adds** to the auto-discovered prototype methods; the exhaustive whitelist is',
    '  `onlyMethodsToSpyOn`. For methods that live on the instance rather than the prototype, use',
    '  `createAutoMock<T>()`.',
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

export function hasManaged(text: string): boolean {
  return MARKER_BEGIN.test(text) && text.includes(MARKER_END);
}

/**
 * Replaces the managed block in `existing`, or appends it. Text outside the markers is preserved
 * byte for byte — a consumer's own instructions are none of this CLI's business.
 */
export function applyManaged(existing: string, managed: string): string {
  if (!hasManaged(existing)) {
    const separator = existing.length === 0 || existing.endsWith('\n\n') ? '' : existing.endsWith('\n') ? '\n' : '\n\n';

    return `${existing}${separator}${managed}\n`;
  }

  const start = existing.search(MARKER_BEGIN);
  const end = existing.indexOf(MARKER_END) + MARKER_END.length;

  return `${existing.slice(0, start)}${managed}${existing.slice(end)}`;
}

/** Removes the managed block and the blank line it was appended with. */
export function removeManaged(existing: string): string {
  if (!hasManaged(existing)) {
    return existing;
  }

  const start = existing.search(MARKER_BEGIN);
  const end = existing.indexOf(MARKER_END) + MARKER_END.length;
  const before = existing.slice(0, start).replace(/\n{2,}$/, '\n');

  return `${before}${existing.slice(end).replace(/^\n+/, '')}`;
}
