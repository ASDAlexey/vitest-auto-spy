/**
 * The two misconfiguration reports the class and the instance factories share.
 *
 * Both factories resolve the same configuration, so a restricting list that names nothing and an
 * accessor list that names a method are the same mistake on either path — and before these moved
 * here, the instance path made both silently. The wording lives in one place so the two paths
 * cannot drift apart.
 */
import type { ResolvedSpyConfiguration } from './create-spy-from-class';
import * as DOCS_LINKS from './docs-links';
import { withDocs } from './message-link';
import { reportMisconfiguration } from './misconfiguration';

function editDistance(from: string, to: string): number {
  let previous = Array.from({ length: to.length + 1 }, (_, index) => index);

  for (let row = 1; row <= from.length; row += 1) {
    const current = [row];

    for (let column = 1; column <= to.length; column += 1) {
      const substitution = Number(previous[column - 1]) + (from[row - 1] === to[column - 1] ? 0 : 1);

      current.push(Math.min(Number(previous[column]) + 1, Number(current[column - 1]) + 1, substitution));
    }

    previous = current;
  }

  return Number(previous[to.length]);
}

/** The candidate a typo most likely meant: `'lod'` → `'load'`; nothing when none is close. */
export function closestName(name: string, candidates: Iterable<PropertyKey>): string | undefined {
  let best: string | undefined;
  let bestDistance = Math.max(1, Math.floor(name.length / 3)) + 1;

  for (const candidate of candidates) {
    const distance = typeof candidate === 'string' ? editDistance(name.toLowerCase(), candidate.toLowerCase()) : bestDistance;

    if (distance < bestDistance) {
      best = String(candidate);
      bestDistance = distance;
    }
  }

  return best;
}

/** `CartService` out of `createSpyFromClass(CartService)`. */
export function ownerOf(factory: string): string {
  return factory.slice(factory.indexOf('(') + 1, -1);
}

/**
 * Report (a warning, or a throw under `misconfiguration: 'throw'`) a name in a *restricting* list
 * the target lacks a callable for. Under `onlyMethodsToSpyOn` a typo does not just add a useless
 * spy — it leaves the real method unspied, and the code under test then calls something that is
 * not there.
 *
 * `available` is the caller's notion of the target's callables: prototype methods on the class
 * path, the live object's own callable fields included on the instance path.
 */
export function warnOnUnknownMethods(factory: string, requested: string[], available: ReadonlySet<PropertyKey>): void {
  const unknown = requested.filter((name) => !available.has(name));

  if (unknown.length === 0) {
    return;
  }

  const owner = ownerOf(factory);
  const guesses = unknown.map((name) => ({ name, guess: closestName(name, available) }));
  const listed = guesses.map(({ name, guess }) => (guess === undefined ? `'${name}'` : `'${name}' (did you mean '${guess}'?)`)).join(', ');
  const unmatched = guesses.filter(({ guess }) => guess === undefined).map(({ name }) => `'${name}'`);

  reportMisconfiguration(
    withDocs(
      `[vitest-auto-spy] ${factory}: onlyMethodsToSpyOn names ${listed}, not a method of ${owner}. ` +
        'The spy is there, but the code under test never calls it.' +
        (unmatched.length === 0
          ? ''
          : ` If the constructor assigns it (an arrow property, a signal() field, a signalStore() method), ` +
            `move it to instanceMethodsToSpyOn: [${unmatched.join(', ')}], which adds to the discovered methods.`),
      DOCS_LINKS.createSpyFromClassInstanceMethods,
    ),
  );
}
/**
 * Warn when `gettersToSpyOn` / `settersToSpyOn` names a **method** of the target.
 *
 * The type no longer rejects a name by the type of its value — it cannot, because "is an accessor"
 * is a fact about the descriptor, and filtering by "not callable" is exactly what made every
 * signal-valued getter (`get isCompactMode(): Signal<boolean>`) unnameable. What is left to check is
 * the one case that is unambiguously a mistake rather than a style: naming a method installs a
 * spied accessor *over* it, so the method is no longer there to call.
 *
 * A plain instance field is deliberately not reported. Spying its accessors is a supported use, and
 * a field cannot be told from a typo without constructing the class — which this library never does.
 */
export function warnOnAccessorNamingAMethod(factory: string, config: ResolvedSpyConfiguration, methods: ReadonlySet<PropertyKey>): void {
  // Both callers gate the call on the lists being non-empty, so the only question left is the names.
  const shadowed = [...new Set([...config.gettersToSpyOn, ...config.settersToSpyOn])].filter((name) => methods.has(name));

  if (shadowed.length === 0) {
    return;
  }

  reportMisconfiguration(
    withDocs(
      `[vitest-auto-spy] ${factory}: gettersToSpyOn/settersToSpyOn names ${shadowed.map((name) => `'${name}'`).join(', ')}, ` +
        `a method of ${ownerOf(factory)}, so the spied accessor put over it leaves nothing to call. ` +
        `Name it in methodsToSpyOn instead; for a signal() field read as a property, mockSignalProp(double, '${shadowed[0]}', initial).`,
      DOCS_LINKS.createSpyFromClassAccessors,
    ),
  );
}
