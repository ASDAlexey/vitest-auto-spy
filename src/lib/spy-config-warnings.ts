/**
 * The two misconfiguration reports the class and the instance factories share.
 *
 * Both factories resolve the same configuration, so a restricting list that names nothing and an
 * accessor list that names a method are the same mistake on either path — and before these moved
 * here, the instance path made both silently. The wording lives in one place so the two paths
 * cannot drift apart.
 */
import type { ResolvedSpyConfiguration } from './create-spy-from-class';
import { DOCS_LINKS, withDocs } from './docs-links';
import { reportMisconfiguration } from './misconfiguration';

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

  reportMisconfiguration(
    withDocs(
      `[vitest-auto-spy] ${factory}: onlyMethodsToSpyOn names method(s) that are not on ` +
        `the class prototype: ${unknown.join(', ')}. A spy was created for each, but the real code will never call ` +
        `it — check for typos. If the callable lives on the instance (an arrow property, a signal() field, an ngrx ` +
        `signalStore() method), prototype discovery cannot see it: name it in \`instanceMethodsToSpyOn\`, which adds ` +
        `to the discovered methods instead of replacing them.`,
      DOCS_LINKS.createSpyFromClass,
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
      `[vitest-auto-spy] ${factory}: gettersToSpyOn/settersToSpyOn name(s) that are ` +
        `methods of the class: ${shadowed.join(', ')}. A spied accessor was installed over each, so the method is no ` +
        `longer callable on the spy. Name it in methodsToSpyOn instead — or, if it is a signal() field read as a ` +
        `property, patch it with mockSignalProp(service, 'x', initial), which keeps everything downstream reactive.`,
      DOCS_LINKS.createSpyFromClass,
    ),
  );
}
