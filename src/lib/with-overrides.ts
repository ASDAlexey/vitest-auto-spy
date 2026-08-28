/**
 * A fixture built from a model instance, with some fields changed.
 *
 * Angular codebases model their API responses as classes with getters — `get isSubscribed()`,
 * `get isExpired()` — computed from the raw fields. A spec that needs "the same subscription, but
 * expired" then has two options, and both are broken in ways that are hard to see:
 *
 *  - `{ ...subscription, isExpired: true }` drops every getter, because spread copies own
 *    enumerable properties and a prototype accessor is neither. The literal still satisfies the
 *    model's *type* only if the getters were optional; where it does compile, the component reads
 *    `undefined` from a flag it should have got a value from.
 *  - `Object.assign(new SubscriptionModel(), fields)` keeps the getters *live*, so each one runs
 *    against a half-filled instance — and a getter written for real data throws on a fixture, from
 *    inside the model, with a stack that names neither the spec nor the field it was missing.
 *
 * {@link withOverrides} takes the third option: read every accessor once, right now, while the
 * model is still whole, and hand back a plain object carrying the results as data.
 */

/** Every key readable off `model`: own enumerable properties plus accessors anywhere on its chain. */
function readableKeys(model: object): string[] {
  const keys = new Set(Object.keys(model));

  let current: object | null = Object.getPrototypeOf(model);

  while (current && current !== Object.prototype) {
    Object.entries(Object.getOwnPropertyDescriptors(current)).forEach(([key, descriptor]) => {
      if (descriptor.get) {
        keys.add(key);
      }
    });

    current = Object.getPrototypeOf(current);
  }

  return [...keys];
}

/**
 * Snapshot a model instance as plain data, then apply `overrides`.
 *
 * ```ts
 * const expired = withOverrides(SUBSCRIPTION, { isExpired: true });
 * ```
 *
 * A getter that throws contributes `undefined` rather than failing the snapshot: it is reading data
 * a fixture may legitimately not carry, and a spec that goes on to assert on that field will say so
 * far more clearly than a stack inside the model would.
 *
 * The result is a plain object, so its getters no longer recompute — which is the point. Build the
 * next variation from the original model, not from a snapshot.
 */
export function withOverrides<T extends object>(model: T, overrides: Partial<T> = {}): T {
  const snapshot: Record<string, unknown> = {};

  readableKeys(model).forEach((key) => {
    try {
      snapshot[key] = Reflect.get(model, key);
    } catch {
      // A getter written for real data, reading through a field the fixture does not have.
      snapshot[key] = undefined;
    }
  });

  Object.assign(snapshot, overrides);

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the snapshot carries every key of `T` the instance could answer, as data; the assertion is what makes it usable where the model's own type is expected, and is this helper's whole purpose.
  return snapshot as T;
}
