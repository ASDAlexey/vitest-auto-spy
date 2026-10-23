import { type StackAnchor, captureAnchor, ownFailure } from './error-anchor';
import {
  type CallbackSubscribable,
  type EmissionOptions,
  type EmissionSource,
  type SubscribableLike,
  rejectAsSourceError,
  subscribeAndCollect,
  timeoutError,
} from './expect-emission';

/** Options for a synchronous assertion: there is no timeout or asynchronous observation window. */
export type SyncEmissionOptions<T> = Omit<EmissionOptions<T>, 'timeout'>;

/**
 * Read exactly one synchronous emission, including everything the `advance` action emits.
 * Unlike `expectEmission`, a second emission fails instead of being ignored.
 *
 * @example
 * expect(expectEmissionSync(component.page, { advance: () => component.next() })).toBe(3);
 */
export function expectEmissionSync<T>(source$: CallbackSubscribable<T>, options?: SyncEmissionOptions<T>): T;
export function expectEmissionSync<T>(source$: SubscribableLike<T>, options?: SyncEmissionOptions<T>): T;
export function expectEmissionSync<T>(source$: EmissionSource<T>, options?: SyncEmissionOptions<T>): T {
  const values = collectSync(source$, 1, options, 'expectEmissionSync', captureAnchor(expectEmissionSync));

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- collectSync verified exactly one emission; undefined is also a legitimate emitted value.
  return values[0] as T;
}

/**
 * Read exactly `count` synchronous emissions and unsubscribe before returning.
 * Use `skip` / `until` to select emissions, and `advance` to trigger the action after subscribing.
 * Silence, missing values and extra values all fail. Timers and microtasks require the async helpers.
 */
export function expectEmissionsSync<T>(source$: CallbackSubscribable<T>, count: number, options?: SyncEmissionOptions<T>): T[];
export function expectEmissionsSync<T>(source$: SubscribableLike<T>, count: number, options?: SyncEmissionOptions<T>): T[];
export function expectEmissionsSync<T>(source$: EmissionSource<T>, count: number, options?: SyncEmissionOptions<T>): T[] {
  return collectSync(source$, count, options, 'expectEmissionsSync', captureAnchor(expectEmissionsSync));
}

function collectSync<T>(
  source$: EmissionSource<T>,
  count: number,
  options: SyncEmissionOptions<T> | undefined,
  helper: string,
  anchor: StackAnchor,
): T[] {
  const name = `${helper}(${options?.label ?? 'source$'})`;
  const failure = (message: string, cause?: unknown): Error => anchor(ownFailure(`[vitest-auto-spy] ${name}: ${message}`, { cause }));

  if (!Number.isInteger(count) || count < 1) {
    throw failure(`count must be a positive integer; received ${String(count)}. Use expectNoEmissionSync for zero emissions.`);
  }

  const values: T[] = [];
  const { advance, ...selection } = options ?? {};
  let rejected: Error | undefined;
  const reject = (error: Error): void => {
    rejected ??= anchor(error);
  };
  const mismatch = (): Error => failure(`expected exactly ${count} synchronous emissions, received ${values.length}.`);
  const collector = subscribeSync(source$, count, selection, values, helper, reject, mismatch);

  try {
    if (rejected === undefined) {
      advance?.();
    }
  } catch (error) {
    reject(failure(`the \`advance\` callback threw: ${String(error)}. The subscription was torn down; see \`cause\`.`, error));
  } finally {
    collector.stop();
  }

  if (rejected !== undefined) {
    throw rejected;
  }

  if (values.length !== count) {
    throw mismatch();
  }

  return values;
}

function completed(): void {
  // Completion ends collection; the exact count is checked after the action.
}

function subscribeSync<T>(
  source$: EmissionSource<T>,
  count: number,
  selection: Omit<SyncEmissionOptions<T>, 'advance'>,
  values: T[],
  helper: string,
  reject: (error: Error) => void,
  mismatch: () => Error,
): ReturnType<typeof subscribeAndCollect<T>> {
  return subscribeAndCollect(
    source$,
    {
      ...selection,
      timeout: 0,
      until: (value: T): boolean => {
        if (selection.until !== undefined && !selection.until(value)) {
          return false;
        }

        values.push(value);

        return true;
      },
    },
    { resolve: () => reject(mismatch()), reject },
    {
      isDone: (accepted) => accepted > count,
      onComplete: completed,
      onTimeout: timeoutError,
      onError: rejectAsSourceError,
      emissionsSettle: true,
      helper,
      expected: count,
    },
  );
}
