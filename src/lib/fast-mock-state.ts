/**
 * The call state behind a fast spy's `mock` — six arrays, seeded on the first call rather than at
 * creation, and sized for the handful of calls most spied methods ever see. Until something reads
 * the state, `results` holds bare values, and `settledResults` and `instances` are derived from it.
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

/** What an unread state's `results` holds for a call that is still running. */
const INCOMPLETE: object = Object.freeze({});

/** What an unread state's `results` holds for a call that threw; a returned value is held bare. */
class Thrown {
  readonly value: unknown;

  constructor(value: unknown) {
    this.value = value;
  }
}

/** How many calls a freshly seeded array holds before it has to grow — the length of the literal in {@link seeded}. */
const SEEDED_CAPACITY = 4;

/** The second step, before the arrays grow the way `[]` does — see {@link doubled}. */
const DOUBLED_CAPACITY = 8;

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
 * A full seeded array plus `next`, in an eight-slot store: a spy called five to eight times holds
 * half of what the jump straight to seventeen cost it.
 */
function doubled<T>(full: T[], next: T): T[] {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- `full` is a full seeded array, so all four indices hold an entry.
  const array = [full[0] as T, full[1] as T, full[2] as T, full[3] as T, next, next, next, next];

  array.pop();
  array.pop();
  array.pop();

  return array;
}

/**
 * A full doubled array plus `next`, rebuilt the way `[]` grows — seventeen slots.
 *
 * A `push` past eight slots would reserve nearly thirty, more than a spy never seeded ever held.
 */
function regrown<T>(full: T[], next: T): T[] {
  const array: T[] = [];

  for (const entry of full) {
    array.push(entry);
  }

  array.push(next);

  return array;
}

/** The `mock.results` entry for what an unread state recorded — see {@link INCOMPLETE}. */
function toResult(raw: unknown): RecordedResult {
  if (raw === INCOMPLETE) {
    return { type: 'incomplete', value: undefined };
  }

  return raw instanceof Thrown ? { type: 'throw', value: raw.value } : { type: 'return', value: raw };
}

/** What `settledResults` holds for a call whose result is known: a thrown call rejected, a returned one fulfilled. */
function deriveSettled(result: RecordedResult): RecordedResult {
  if (result.type === 'return') {
    return { type: 'fulfilled', value: result.value };
  }

  return result.type === 'throw' ? { type: 'rejected', value: result.value } : { type: 'incomplete', value: undefined };
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
 * Until the state is {@link live}, a call records four arrays and no result object: `results` holds
 * the returned value itself, a {@link Thrown}, or {@link INCOMPLETE}; `instances` is `contexts` entry
 * for entry, and a settled result follows from its result unless it is a `Promise` — which is why a
 * returned `Promise` makes the state live as well. Going live builds the result objects in place,
 * derives the other two and records all six from then on, so an array a spec obtained is the one
 * every later call appends to. Until then the first call seeds the arrays small and {@link record}
 * may swap them for a larger copy.
 */
export abstract class FastMockStateBase implements FastMockState {
  recordedCalls: unknown[][] = UNSEEDED;
  recordedContexts: unknown[] = UNSEEDED;
  recordedInstances: unknown[] = UNSEEDED;
  recordedOrder: number[] = UNSEEDED;
  /** Bare values until the state is {@link live}, `RecordedResult` objects from then on. */
  recordedResults: unknown[] = UNSEEDED;
  recordedSettledResults: RecordedResult[] = UNSEEDED;
  /** Whether an accessor has handed the arrays out since they were last emptied. */
  handedOut = false;
  /** Whether `settledResults` and `instances` are recorded per call rather than derived on the first read. */
  live = false;

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

  /**
   * Append one call, seeding the arrays on the first. A {@link live} state passes the call's two
   * entries; before that there are none, and `results` holds {@link INCOMPLETE} until {@link complete}.
   */
  record(args: unknown[], order: number, context: unknown, entry?: RecordedResult, settled?: RecordedResult): void {
    const result: unknown = entry ?? INCOMPLETE;

    if (this.recordedCalls === UNSEEDED) {
      this.recordedCalls = seeded(args);
      this.recordedOrder = seeded(order);
      this.recordedResults = seeded(result);
      this.recordedContexts = seeded(context);

      if (settled !== undefined) {
        this.recordedSettledResults = seeded(settled);
        this.recordedInstances = seeded(context);
      }

      return;
    }

    // Swapping the arrays is invisible only while no accessor has handed them out since the seed.
    const length = this.recordedCalls.length;

    if ((length === SEEDED_CAPACITY || length === DOUBLED_CAPACITY) && !this.handedOut) {
      const grow = length === SEEDED_CAPACITY ? doubled : regrown;

      this.recordedCalls = grow(this.recordedCalls, args);
      this.recordedOrder = grow(this.recordedOrder, order);
      this.recordedResults = grow(this.recordedResults, result);
      this.recordedContexts = grow(this.recordedContexts, context);

      if (settled !== undefined) {
        this.recordedSettledResults = grow(this.recordedSettledResults, settled);
        this.recordedInstances = grow(this.recordedInstances, context);
      }

      return;
    }

    this.recordedCalls.push(args);
    this.recordedOrder.push(order);
    this.recordedResults.push(result);
    this.recordedContexts.push(context);

    if (settled !== undefined) {
      this.recordedSettledResults.push(settled);
      this.recordedInstances.push(context);
    }
  }

  /** {@link record} for a live state, with the seeding and growth steps skipped once the arrays are handed out. */
  recordLive(args: unknown[], order: number, context: unknown, result: RecordedResult, settled: RecordedResult): void {
    // A returned `Promise` makes a state live before anything read it, so its arrays may still be seeded or unseeded.
    if (!this.handedOut) {
      this.record(args, order, context, result, settled);

      return;
    }

    this.recordedCalls.push(args);
    this.recordedOrder.push(order);
    this.recordedResults.push(result);
    this.recordedContexts.push(context);
    this.recordedSettledResults.push(settled);
    this.recordedInstances.push(context);
  }

  /** Replace the last call's context with the instance a construction produced. */
  recordInstance(instance: unknown): void {
    // A constructor that cleared its own spy has left nothing to complete, and the marker is shared.
    if (this.recordedCalls === UNSEEDED) {
      return;
    }

    this.recordedContexts[this.recordedContexts.length - 1] = instance;

    if (this.live) {
      this.recordedInstances[this.recordedInstances.length - 1] = instance;
    }
  }

  /**
   * Complete a call recorded at `index` before the state went live, and hand back its settled entry
   * if a read inside the call has made it live since.
   *
   * Nothing but the position identifies the call, and that is enough: every other call still
   * running started earlier, so it sits at a lower index or was dropped by a clear inside this one.
   */
  complete(index: number, thrown: boolean, value: unknown): RecordedResult | undefined {
    const results = this.recordedResults;

    if (!this.live) {
      if (results[index] === INCOMPLETE) {
        results[index] = thrown ? new Thrown(value) : value;
      }

      return undefined;
    }

    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- a live state holds `RecordedResult` objects, or whatever a spec assigned.
    const entry = results[index] as RecordedResult | undefined;

    if (entry?.type !== 'incomplete') {
      return undefined;
    }

    entry.type = thrown ? 'throw' : 'return';
    entry.value = value;

    return this.recordedSettledResults[index];
  }

  /** Drop everything recorded, keeping the object identity a spec may be holding. */
  empty(): void {
    this.handedOut = false;
    this.live = false;
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

  /** Record all six arrays from now on, deriving the two skipped ones from what was recorded so far. */
  goLive(): void {
    if (this.live) {
      return;
    }

    this.live = true;

    if (this.recordedCalls !== UNSEEDED) {
      const results = this.recordedResults;

      for (let index = 0; index < results.length; index++) {
        results[index] = toResult(results[index]);
      }

      this.recordedInstances = this.recordedContexts.slice();
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- converted to entries just above.
      this.recordedSettledResults = (results as RecordedResult[]).map(deriveSettled);
    }
  }

  materialise(): this {
    this.handedOut = true;
    this.goLive();

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
