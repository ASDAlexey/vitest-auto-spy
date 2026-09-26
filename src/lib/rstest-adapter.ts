/**
 * The Rstest (`@rstest/core`) {@link MockAdapter}, built as a factory.
 *
 * Like the Bun and Node adapters, this module never imports the runner — the
 * `vitest-auto-spy/rstest` entry supplies Rstest's own utilities via
 * {@link createRstestMockAdapter}, which also keeps the factory unit-testable
 * with a stub off the real runner.
 *
 * Rstest's mock surface is Vitest-shaped, so the adapter is the shared runner one. Its sweep
 * sentinel needs no bootstrap call and no never-prune mark: Rstest walks every mock it created,
 * called or not, and the mock-registry pruner is Vitest-only and never loads here.
 */
import type { MockAdapter } from './mock-adapter';
import { type RunnerMock, createRunnerMockAdapter } from './runner-mock-adapter';
import type { Func } from './types';

/** A Rstest mock function — the surface this adapter relies on. */
export type RstestMock = RunnerMock;

/**
 * The slice of Rstest's utilities the Rstest entry injects.
 *
 * `spyOn` is deliberately not among them: accessor spies are installed by redefining the property,
 * so the runner's own accessor spy is never asked for.
 */
export interface RstestApi {
  fn(implementation?: Func): RstestMock;
}

/** Build a Rstest {@link MockAdapter} from the runner's own utilities. */
export function createRstestMockAdapter(rstest: RstestApi): MockAdapter {
  // Eager, as it always was: outside the runner `rstest.fn()` throws, and the entry should fail on import.
  return createRunnerMockAdapter({ fn: (implementation) => rstest.fn(implementation), eagerSentinel: true });
}
