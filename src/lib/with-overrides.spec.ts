import { describe, expect, it } from 'vitest';

import { withOverrides } from './with-overrides';

class SubscriptionModel {
  constructor(
    readonly id: string,
    readonly endsAt: string | null,
  ) {}

  get isSubscribed(): boolean {
    return this.endsAt !== null;
  }

  /** A getter written for real data: it throws on a fixture that has no `endsAt`. */
  get endsOn(): string {
    if (this.endsAt === null) {
      throw new Error('endsAt is required');
    }

    return this.endsAt.slice(0, 10);
  }
}

describe('withOverrides', () => {
  it('materialises the getters a spread would have dropped', () => {
    const snapshot = withOverrides(new SubscriptionModel('a', '2026-01-01T00:00:00Z'));

    expect({ ...snapshot }).toMatchObject({ id: 'a', isSubscribed: true, endsOn: '2026-01-01' });
  });

  it('applies the overrides last, and returns something typed as the model', () => {
    const expired: SubscriptionModel = withOverrides(new SubscriptionModel('a', '2026-01-01T00:00:00Z'), { isSubscribed: false });

    expect(expired.isSubscribed).toBe(false);
    expect(expired.id).toBe('a');
  });

  it('does not fail on a getter that throws — the field is simply absent', () => {
    const snapshot = withOverrides(new SubscriptionModel('a', null));

    expect(snapshot.isSubscribed).toBe(false);
    expect(snapshot.endsOn).toBeUndefined();
  });

  it('leaves a plain object alone', () => {
    expect(withOverrides({ id: 'a' }, { id: 'b' })).toEqual({ id: 'b' });
  });
});
