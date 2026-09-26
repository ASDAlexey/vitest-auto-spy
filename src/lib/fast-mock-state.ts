/**
 * The call state behind a fast spy's `mock` — six arrays, seeded on the first call rather than at
 * creation, and sized for the handful of calls most spied methods ever see.
 */

/**
 * One entry of `mock.results`, in the runner's own discriminated shape — a union rather than a
 * loose record, because a spy has to be assignable to the runner's `MockInstance` for a matcher's
 * signature to accept it.
 */
export type FastMockResult =
  { type: 'incomplete'; value: undefined } | { type: 'return'; value: unknown } | { type: 'throw'; value: unknown };

/** One entry of `mock.settledResults` — see {@link FastMockResult}. */
export type FastMockSettledResult =
  { type: 'fulfilled'; value: unknown } | { type: 'incomplete'; value: undefined } | { type: 'rejected'; value: unknown };

/**
 * What the spy actually pushes and then fills in.
 *
 * The published entry is a union whose `type` decides its `value`, and an entry is recorded as
 * `incomplete` and completed in place after the call returns — which the union, correctly, does not
 * allow. So the recording side keeps this mutable shape and the accessors publish it as the union.
 */
export interface RecordedResult {
  type: FastMockResult['type'] | FastMockSettledResult['type'];
  value: unknown;
}

/** The `mock` property of a fast spy — Vitest's `MockContext`, same fields and same `lastCall`. */
export interface FastMockState {
  calls: unknown[][];
  contexts: unknown[];
  instances: unknown[];
  invocationCallOrder: number[];
  results: FastMockResult[];
  settledResults: FastMockSettledResult[];
  readonly lastCall: unknown[] | undefined;
}

/**
 * What all six fields of a state hold until something writes or reads them — one shared array that
 * is never handed out and never written to, so an unseeded state owns no arrays of its own.
 */
const UNSEEDED: never[] = [];

/** How many calls a freshly seeded array holds before it has to grow — the length of the literal in {@link seeded}. */
const SEEDED_CAPACITY = 4;

/**
 * A one-element array with room for three more.
 *
 * The first `push` into `[]` reserves seventeen slots, six arrays per called spy. A four-element
 * literal trimmed to one keeps its four-slot store and stays PACKED, where `new Array(4)` is HOLEY.
 */
function seeded<T>(first: T): T[] {
  const array = [first, first, first, first];

  // `pop`, not `length = 1`: the length setter drops into the runtime and costs five times as much.
  array.pop();
  array.pop();
  array.pop();

  return array;
}

/**
 * A full seeded array plus `next`, rebuilt the way `[]` grows — seventeen slots.
 *
 * A `push` past four slots would reserve twenty-three, more than a spy never seeded ever held.
 */
function regrown<T>(full: T[], next: T): T[] {
  const array: T[] = [];

  for (const entry of full) {
    array.push(entry);
  }

  array.push(next);

  return array;
}

/**
 * A spy's call state.
 *
 * Each of the six arrays is exposed through an accessor over a raw field, so that a state object a
 * spec is holding answers with the emptied array after a sweep — which is what the runner's own
 * state does, since its `mockClear` assigns over the same object. A sweep here touches no spy at
 * all, so something has to notice it, and reading is where that has to happen: {@link sync} is the
 * spy's hook for it. The spy's own hot path writes through {@link record}, having already noticed.
 *
 * The six fields are seeded together or not at all: a read or an assignment materialises all of
 * them as empty arrays, so an array a spec obtained is the one every later call appends to. Until
 * then the first call seeds them small and {@link record} may swap them for a larger copy.
 */
export abstract class FastMockStateBase implements FastMockState {
  recordedCalls: unknown[][] = UNSEEDED;
  recordedContexts: unknown[] = UNSEEDED;
  recordedInstances: unknown[] = UNSEEDED;
  recordedOrder: number[] = UNSEEDED;
  recordedResults: RecordedResult[] = UNSEEDED;
  recordedSettledResults: RecordedResult[] = UNSEEDED;
  /** Whether an accessor has handed the arrays out since they were last emptied. */
  handedOut = false;

  get calls(): unknown[][] {
    return this.read().recordedCalls;
  }

  set calls(value: unknown[][]) {
    this.materialise().recordedCalls = value;
  }

  get contexts(): unknown[] {
    return this.read().recordedContexts;
  }

  set contexts(value: unknown[]) {
    this.materialise().recordedContexts = value;
  }

  get instances(): unknown[] {
    return this.read().recordedInstances;
  }

  set instances(value: unknown[]) {
    this.materialise().recordedInstances = value;
  }

  get invocationCallOrder(): number[] {
    return this.read().recordedOrder;
  }

  set invocationCallOrder(value: number[]) {
    this.materialise().recordedOrder = value;
  }

  get results(): FastMockResult[] {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see `RecordedResult`: the entries are completed in place, so they are recorded mutably and published as the union.
    return this.read().recordedResults as FastMockResult[];
  }

  set results(value: FastMockResult[]) {
    this.materialise().recordedResults = value;
  }

  get settledResults(): FastMockSettledResult[] {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see `results`.
    return this.read().recordedSettledResults as FastMockSettledResult[];
  }

  set settledResults(value: FastMockSettledResult[]) {
    this.materialise().recordedSettledResults = value;
  }

  get lastCall(): unknown[] | undefined {
    const calls = this.calls;

    return calls[calls.length - 1];
  }

  /** Append one call — the six entries the spy's hot path produces, seeding the arrays on the first. */
  record(args: unknown[], order: number, result: RecordedResult, settled: RecordedResult, context: unknown): void {
    if (this.recordedCalls === UNSEEDED) {
      this.recordedCalls = seeded(args);
      this.recordedOrder = seeded(order);
      this.recordedResults = seeded(result);
      this.recordedSettledResults = seeded(settled);
      this.recordedContexts = seeded(context);
      this.recordedInstances = seeded(context);

      return;
    }

    // Swapping the arrays is invisible only while no accessor has handed them out since the seed.
    if (this.recordedCalls.length === SEEDED_CAPACITY && !this.handedOut) {
      this.recordedCalls = regrown(this.recordedCalls, args);
      this.recordedOrder = regrown(this.recordedOrder, order);
      this.recordedResults = regrown(this.recordedResults, result);
      this.recordedSettledResults = regrown(this.recordedSettledResults, settled);
      this.recordedContexts = regrown(this.recordedContexts, context);
      this.recordedInstances = regrown(this.recordedInstances, context);

      return;
    }

    this.recordedCalls.push(args);
    this.recordedOrder.push(order);
    this.recordedResults.push(result);
    this.recordedSettledResults.push(settled);
    this.recordedContexts.push(context);
    this.recordedInstances.push(context);
  }

  /** Replace the last call's context with the instance a construction produced. */
  recordInstance(instance: unknown): void {
    // A constructor that cleared its own spy has left nothing to complete, and the marker is shared.
    if (this.recordedCalls === UNSEEDED) {
      return;
    }

    this.recordedContexts[this.recordedContexts.length - 1] = instance;
    this.recordedInstances[this.recordedInstances.length - 1] = instance;
  }

  /** Drop everything recorded, keeping the object identity a spec may be holding. */
  empty(): void {
    this.handedOut = false;
    this.recordedCalls = UNSEEDED;
    this.recordedContexts = UNSEEDED;
    this.recordedInstances = UNSEEDED;
    this.recordedOrder = UNSEEDED;
    this.recordedResults = UNSEEDED;
    this.recordedSettledResults = UNSEEDED;
  }

  /** Bring the owning spy up to date with the sweeps before anything is read. */
  protected abstract sync(): void;

  read(): this {
    this.sync();

    return this.materialise();
  }

  materialise(): this {
    this.handedOut = true;

    if (this.recordedCalls === UNSEEDED) {
      this.recordedCalls = [];
      this.recordedContexts = [];
      this.recordedInstances = [];
      this.recordedOrder = [];
      this.recordedResults = [];
      this.recordedSettledResults = [];
    }

    return this;
  }
}
