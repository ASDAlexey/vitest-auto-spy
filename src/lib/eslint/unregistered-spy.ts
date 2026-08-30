/**
 * `injectSpy(X)` for a token nothing registered as an auto-spy.
 *
 * ```ts
 * TestBed.configureTestingModule({
 *   imports: [RouterTestingModule],          // provides a real ActivatedRoute
 *   providers: [provideAutoSpy(UserService)],
 * });
 *
 * const route = injectSpy(ActivatedRoute);   // the real one, with spy helpers that are not there
 * ```
 *
 * The library already says this at run time — `injectSpy` checks what the injector handed back and
 * warns that it is a plain instance — but a warning on stderr is the weakest place to say it. It
 * does not fail the run, it scrolls past in a suite of a thousand files, and it arrives only for
 * the tests that actually executed the line. In one consumer monorepo the same warning is printed
 * by dozens of spec files on every CI run and has never been acted on.
 *
 * Nothing about the check needs types, so it belongs where the mistake is written. The whole
 * question is name resolution: which tokens did this file register, and which token is being asked
 * for.
 *
 * **The rule is quiet unless it can see the whole picture**, because a false positive here costs
 * more than the warning it replaces. Three preconditions, all of them "this file registers doubles
 * in the shape we can read":
 *
 * - the file calls `provideAutoSpy` at least once — otherwise it configures DI in some way this
 *   does not model, and a missing token says nothing;
 * - no `providers` array contains a spread or a provider factory other than `provideAutoSpy`
 *   (`providers: [...sharedMocks]` is how a shared mock module is pulled in, and what it registers
 *   is out of sight);
 * - the file does not call `createWithAutoSpies`, `renderShallow` or `TestBed.overrideProvider`,
 *   each of which registers doubles somewhere this scan does not look.
 *
 * A token provided by hand — `{ provide: X, useValue: someObject }` — is recorded as *provided but
 * unreadable* rather than reported: `prefer-provide-auto-spy` is the rule for that shape, and two
 * rules firing on one line would only teach people to disable both.
 */
import {
  type EsArrayExpression,
  type EsCallExpression,
  type EsNode,
  type EsObjectExpression,
  type RuleContext,
  findProperty,
  isCallExpression,
  isIdentifier,
  isMemberExpression,
  isObjectExpression,
  propertyValue,
} from './rule-types';

/** The call that registers an auto-spy with Angular DI. */
const PROVIDE_AUTO_SPY = 'provideAutoSpy';

/** The call that reads one back out, typed. */
const INJECT_SPY = 'injectSpy';

/** Factories whose result *is* an auto-spy, wherever a `useValue` names one. */
const AUTO_SPY_FACTORIES: ReadonlySet<string> = new Set(['createAutoMock', 'createSpyFromClass', 'createMock', 'mockDeep']);

/** Helpers that build a testing module of their own, so this file's arrays are not the whole story. */
const OPAQUE_HELPERS: ReadonlySet<string> = new Set(['createWithAutoSpies', 'renderShallow']);

/** What one file's registrations add up to. */
export interface SpyRegistrations {
  /** Tokens registered as an auto-spy, as source text. */
  readonly autoSpies: Set<string>;
  /** Tokens provided in a shape this scan cannot classify — never reported. */
  readonly opaqueTokens: Set<string>;
  /** Every `injectSpy(X)` in the file, with the token as source text. */
  readonly injections: { node: EsCallExpression; token: string }[];
  /** Whether the file registered anything through `provideAutoSpy`. */
  sawProvideAutoSpy: boolean;
  /** Whether anything in the file puts registrations out of reach. */
  opaque: boolean;
}

/** A fresh, empty tally. */
export function emptyRegistrations(): SpyRegistrations {
  return { autoSpies: new Set(), opaqueTokens: new Set(), injections: [], sawProvideAutoSpy: false, opaque: false };
}

/** The name a call is made under, when it is a plain `name(...)` and not `a.b(...)`. */
function calleeName(node: EsCallExpression): string | undefined {
  return isIdentifier(node.callee) ? node.callee.name : undefined;
}

/** Whether a call is `TestBed.overrideProvider(...)`, which registers a double this scan never sees. */
function isOverrideProvider(node: EsCallExpression): boolean {
  const { callee } = node;

  return (
    isMemberExpression(callee) &&
    isIdentifier(callee.object) &&
    callee.object.name === 'TestBed' &&
    isIdentifier(callee.property) &&
    callee.property.name === 'overrideProvider'
  );
}

/**
 * Record one call.
 *
 * Called for every `CallExpression` in the file, which is why the three questions it asks are all
 * cheap: a name, a member name, and one argument.
 */
export function readCall(context: RuleContext, node: EsCallExpression, tally: SpyRegistrations): void {
  const name = calleeName(node);
  const [first] = node.arguments;

  if (isOverrideProvider(node) || (name !== undefined && OPAQUE_HELPERS.has(name))) {
    tally.opaque = true;

    return;
  }

  if (first === undefined) {
    return;
  }

  if (name === PROVIDE_AUTO_SPY) {
    tally.sawProvideAutoSpy = true;
    tally.autoSpies.add(context.sourceCode.getText(first));

    return;
  }

  if (name === INJECT_SPY) {
    tally.injections.push({ node, token: context.sourceCode.getText(first) });
  }
}

/** Whether a `useValue` expression is one of the auto-spy factories, called in place. */
function isAutoSpyValue(value: EsNode): boolean {
  return isCallExpression(value) && isIdentifier(value.callee) && AUTO_SPY_FACTORIES.has(value.callee.name);
}

/** Classify one `{ provide: X, useValue: … }` literal. */
function readProviderObject(context: RuleContext, element: EsObjectExpression, tally: SpyRegistrations): void {
  const provide = findProperty(element, 'provide');

  if (provide === undefined) {
    tally.opaque = true;

    return;
  }

  const token = context.sourceCode.getText(propertyValue(provide));
  const useValue = findProperty(element, 'useValue');

  if (useValue !== undefined && isAutoSpyValue(propertyValue(useValue))) {
    tally.autoSpies.add(token);

    return;
  }

  tally.opaqueTokens.add(token);
}

/**
 * Record one `providers: [...]` array.
 *
 * An element this cannot classify does not merely go unrecorded — it makes the **file** opaque.
 * What it hides is not one token but an unknown number of them, and a scan that guessed otherwise
 * would report every token the hidden entry registers.
 */
export function readProviders(context: RuleContext, array: EsArrayExpression, tally: SpyRegistrations): void {
  for (const element of array.elements) {
    if (element === null) {
      tally.opaque = true;

      continue;
    }

    if (isObjectExpression(element)) {
      readProviderObject(context, element, tally);
    } else if (!isCallExpression(element) || calleeName(element) !== PROVIDE_AUTO_SPY) {
      tally.opaque = true;
    }
  }
}

/**
 * The `injectSpy` calls worth reporting, once the whole file has been read.
 *
 * Empty whenever a precondition failed, which is the point: the answer to "did this file register
 * that token?" is only worth having from a file whose registrations were all legible.
 */
export function unregisteredInjections(tally: SpyRegistrations): { node: EsCallExpression; token: string }[] {
  if (tally.opaque || !tally.sawProvideAutoSpy) {
    return [];
  }

  return tally.injections.filter(({ token }) => !tally.autoSpies.has(token) && !tally.opaqueTokens.has(token));
}
