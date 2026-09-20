/**
 * A call-order journal: one recorder every collaborator reports to, so the ORDER of calls across
 * many objects is itself the value a spec asserts.
 *
 * A spy answers whether its one method ran. Order across collaborators is a different question —
 * it lives *between* the spies, and the shapes available for it degrade quickly. One
 * `toHaveBeenCalled` per spy passes in any order: three green checks that would accept the
 * sequence backwards. `toHaveBeenCalledBefore` pins it only pairwise — a chain that grows with the
 * square of the collaborators, says nothing about a call the spec forgot to name, and fails with
 * "expected spy to be called before spy" rather than with the sequence that actually ran:
 *
 * ```ts
 * const dropCache = vi.fn();
 * const flushTelemetry = vi.fn();
 * const stopEngine = vi.fn();
 *
 * shutdown();
 *
 * expect(dropCache).toHaveBeenCalled(); // true in any of the six orders
 * expect(flushTelemetry).toHaveBeenCalled();
 * expect(stopEngine).toHaveBeenCalled();
 * ```
 *
 * One journal the code under test writes into makes the sequence a single comparable value, and a
 * failure prints the real order as a diff:
 *
 * ```ts
 * expect(log.result()).toBe('drop-cache; flush-telemetry; stop-engine');
 * ```
 *
 * Ported from Angular's own `Log` (`packages/core/testing/src/logger.ts`), which Angular keeps
 * three copies of — core, router, forms — because it is the idiomatic answer wherever the subject
 * is a sequence: lifecycle hooks, guards, resolvers, teardown. The log is a collaborator, not a
 * spy on one — the production code records its own sequence into it, in Angular through DI:
 *
 * ```ts
 * const PANEL_LOG = new InjectionToken<CallLog<'init' | 'ready' | 'destroy'>>('panel log');
 *
 * @Component({ selector: 'panel', template: '' })
 * class Panel {
 *   private readonly log = inject(PANEL_LOG);
 *
 *   ngOnInit(): void { this.log.add('init'); }
 *   ngAfterViewInit(): void { this.log.add('ready'); }
 *   ngOnDestroy(): void { this.log.add('destroy'); }
 * }
 *
 * const log = createLog<'init' | 'ready' | 'destroy'>();
 *
 * TestBed.configureTestingModule({ providers: [{ provide: PANEL_LOG, useValue: log }] });
 * TestBed.createComponent(Panel).destroy();
 *
 * expect(log.result()).toBe('init; ready; destroy');
 * ```
 *
 * Nothing here knows Angular or any runner — the module imports nothing — so the same journal
 * works unchanged on Vitest, `bun test` and `node:test`.
 *
 * `T` is constrained to strings on purpose. The journal's worth in a failure is its rendering —
 * `result()` joins the entries with `'; '` — and what `fn()` labels a callback with is a name, a
 * word a human reads in that line. A literal union makes the vocabulary part of the type:
 * `createLog<'init' | 'ready' | 'destroy'>()` rejects a step the log never declared, where the
 * unconstrained log would record the typo and hand back a green test.
 */

/** The journal {@link createLog} hands back: the record, and the ways to write into it. */
export interface CallLog<T extends string = string> {
  /** Append one entry — a collaborator's report of where it got to. */
  add(value: T): void;

  /**
   * A callback that records `value` when it runs. For the places that want a handler rather than
   * a call — event listeners, lifecycle hooks, guard methods — `log.fn('save')` hands one over
   * already labelled. It is typed as taking nothing, so it slots wherever a handler fits and
   * ignores whatever the caller passes it.
   */
  fn(value: T): () => void;

  /** Drop every entry: a fresh journal without a fresh identity, for reuse across tests. */
  clear(): void;

  /**
   * The entries so far, in the order they were recorded. Each read is an independent copy — a
   * reference held before later calls stays the journal of that moment, and nothing a spec does
   * to a returned array rewrites the record. This is the one deliberate divergence from Angular's
   * `Log`, whose entries sit in a public, live, mutable array.
   */
  readonly items: readonly T[];

  /** The journal as one line — entries joined with `'; '`, `''` when nothing was recorded. */
  result(): string;
}

/**
 * Start a call-order journal.
 *
 * ```ts
 * const log = createLog<'boot' | 'run' | 'halt'>();
 *
 * log.add('boot');
 * controller.onStart = log.fn('run');
 * controller.stop(); // runs onStart
 *
 * expect(log.result()).toBe('boot; run');
 * ```
 */
export function createLog<T extends string = string>(): CallLog<T> {
  const entries: T[] = [];

  return {
    add(value: T): void {
      entries.push(value);
    },

    fn(value: T): () => void {
      return (): void => {
        entries.push(value);
      };
    },

    clear(): void {
      entries.length = 0;
    },

    get items(): readonly T[] {
      return [...entries];
    },

    result(): string {
      return entries.join('; ');
    },
  };
}
