import { captureAnchor } from './error-anchor';
import {
  type EmissionOptions,
  type EmissionSource,
  type WaitContext,
  rejectAsSourceError,
  subscribeAndCollect,
  timeoutError,
  unexpectedEmissionError,
} from './expect-emission';

/**
 * {@link expectNoEmission} for a spec with no `await`: subscribe, run `advance`, unsubscribe, and
 * throw if anything past `skip` / `until` arrived in between. Silence is only proven for what runs
 * synchronously — a stream that emits on a timer is the async helper's job.
 *
 * @example
 * ```ts
 * store.dispatch(noop());
 * expectNoEmissionSync(store.saved$, { skip: 1 });
 * ```
 */
export function expectNoEmissionSync<T>(source$: EmissionSource<T>, options?: Omit<EmissionOptions<T>, 'timeout'>): void {
  const anchor = captureAnchor(expectNoEmissionSync);
  const context: WaitContext = { helper: 'expectNoEmissionSync', options, expected: 1 };
  const outcome: { failure?: Error } = {};
  const fail = (error: Error): void => {
    outcome.failure ??= error;
  };
  const collector = subscribeAndCollect<T>(
    source$,
    { ...options, timeout: 0 },
    { resolve: (emitted, onSubscribe) => fail(unexpectedEmissionError(emitted, context, onSubscribe)), reject: fail },
    {
      isDone: (acceptedCount) => acceptedCount > 0,
      onComplete: silenceProven,
      onTimeout: timeoutError,
      onError: rejectAsSourceError,
      emissionsSettle: true,
      helper: context.helper,
      expected: context.expected,
    },
  );

  collector.stop();

  if (outcome.failure) {
    throw anchor(outcome.failure);
  }
}

/** A completed source can emit no more: for the sync helper that is a pass, and nothing to do. */
function silenceProven(): void {
  // nothing to settle
}
