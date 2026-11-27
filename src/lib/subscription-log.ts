import { type Observable, defer, finalize } from 'rxjs';

export interface SubscriptionEvent<Key> {
  readonly type: 'subscribe' | 'unsubscribe';
  readonly key: Key;
  readonly subscription: number;
}

export interface SubscriptionLog<Key> {
  readonly events: readonly SubscriptionEvent<Key>[];
  track<T>(key: Key, source: Observable<T>): Observable<T>;
}

export function createSubscriptionLog<Key = string>(): SubscriptionLog<Key> {
  const events: SubscriptionEvent<Key>[] = [];
  let nextId = 0;

  return {
    events,
    track: (key, source) =>
      defer(() => {
        const subscription = ++nextId;
        events.push({ type: 'subscribe', key, subscription });

        return source.pipe(finalize(() => events.push({ type: 'unsubscribe', key, subscription })));
      }),
  };
}
