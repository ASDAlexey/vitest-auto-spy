/**
 * `explainSpy` — the configured arguments of a double and its recorded calls, printed side by side
 * *before* anything has failed.
 *
 * `mustBeCalledWith` already prints wanted next to actual, but only on the call that breaks. The
 * question a spec author has while the test is red for some other reason — which of my configs did
 * this call hit, and which one never fired at all — has no answer short of reading the setup back
 * and matching it by eye. This answers it: every configured list, numbered, and every recorded call
 * attributed to the config it matched or to the default it fell through to.
 *
 * It never throws. A value that is not one of this library's doubles is reported as such, because a
 * diagnostic that fails is worse than no diagnostic: it is reached from a spec that is already
 * failing for another reason.
 */
import { ArgsMap } from './args-map';
import { type MockFn, getMockAdapter } from './mock-adapter';
import { serializeValue } from './serialize-args';
import { AUTO_SPY_MARK, isMarkedMock } from './spy-mark';

/** The two `calledWith` chains, named as the spec author wrote them, in the order a call consults them. */
const CHAIN_NAMES = ['calledWith', 'mustBeCalledWith'] as const;

const HEADER = '[vitest-auto-spy] explainSpy';

const NOT_A_DOUBLE =
  'is not a spy created by vitest-auto-spy, so it has no configured arguments to read. ' +
  'Pass a double built by createSpyFromClass, createAutoMock, createFunctionSpy or mockDeep.';

const NOTHING_FOUND =
  'nothing to explain: this value holds no spy created by vitest-auto-spy. ' +
  'Pass a double built by createSpyFromClass, createAutoMock, createFunctionSpy or mockDeep.';

const NO_MATCH_OUTCOME = 'no configured arguments matched; the default value was used';

/** One spied member of a double: the mock, plus the name to print it under. */
interface SpiedMember {
  /** How the member is printed — `load`, or `get name` for the getter half of an accessor spy. */
  readonly name: string;
  /** The property it belongs to, which is what a caller names in `explainSpy(spy, 'name')`. */
  readonly property: string;
  readonly mock: MockFn;
}

/** One configured argument list of one spy, numbered across both of its chains. */
interface ConfigLine {
  readonly index: number;
  /** `calledWith(1)` — the chain call that registered it, which is the line the reader wrote. */
  readonly text: string;
  readonly matches: (actualArgs: unknown[]) => boolean;
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

/** `1,'a'` — an argument list without the brackets the serializer wraps it in, so it reads as a call. */
function bareArgs(bracketed: string): string {
  return bracketed.substring(1, bracketed.length - 1);
}

/** `load(1,'a')` — one call in the shape the spec wrote it. */
function asCall(name: string, args: unknown[]): string {
  return `${name}(${bareArgs(serializeValue(args))})`;
}

/**
 * The spy's own name, for the shape that carries no other one: `explainSpy(users.load)`.
 *
 * Read through `getMockName`, which every runner-backed mock in this library answers, rather than
 * `Function.name` — a mock is an anonymous function on most runtimes, and the name the factory was
 * given is the method name a reader is looking for.
 */
function mockNameOf(mock: MockFn): string {
  const read: unknown = Reflect.get(mock, 'getMockName');
  const name: unknown = typeof read === 'function' ? read.call(mock) : undefined;

  return typeof name === 'string' && name !== 'vi.fn()' ? name : 'spy';
}

/**
 * The argument maps behind a spy's two chains, in lookup order.
 *
 * Read off the spy's mark, which is where `function-spy` keeps the state a chain writes into. A
 * mock branded with plain `true` — the accessor spies, a hand-marked double — carries no state and
 * answers with nothing configured, which is the truth about it.
 */
function chainsOf(mock: MockFn): { name: string; map: ArgsMap }[] {
  const mark: unknown = Reflect.get(mock, AUTO_SPY_MARK);
  const state: unknown = isObject(mark) ? Reflect.get(mark, 'state') : undefined;

  if (!isObject(state)) {
    return [];
  }

  const chains: { name: string; map: ArgsMap }[] = [];

  for (const name of CHAIN_NAMES) {
    const chain: unknown = Reflect.get(state, name);
    const map: unknown = isObject(chain) ? Reflect.get(chain, 'argsToValuesMap') : undefined;

    if (map instanceof ArgsMap) {
      chains.push({ name, map });
    }
  }

  return chains;
}

/** Both chains' configs flattened into one numbering, so a call can be attributed to a single number. */
function configLines(mock: MockFn): ConfigLine[] {
  const lines: ConfigLine[] = [];

  for (const chain of chainsOf(mock)) {
    for (const entry of chain.map.configuredEntries()) {
      lines.push({
        index: lines.length + 1,
        text: `${chain.name}(${bareArgs(entry.args)})`,
        matches: (actualArgs: unknown[]): boolean => entry.matches(actualArgs),
      });
    }
  }

  return lines;
}

/** `load — 3 calls, 2 configured, none matched` — the whole state of one member in one line. */
function headline(name: string, callCount: number, configCount: number, matchedCount: number): string {
  const calls = callCount === 0 ? 'never called' : `${callCount} ${callCount === 1 ? 'call' : 'calls'}`;

  if (configCount === 0) {
    return `${name} — ${calls}, nothing configured`;
  }

  // The two states a reader most often arrives in deserve saying outright, not leaving to be
  // inferred from a list of configs next to a list of calls that share no number.
  const verdict = callCount > 0 && matchedCount === 0 ? ', none matched' : '';

  return `${name} — ${calls}, ${configCount} configured${verdict}`;
}

function explainMember(member: SpiedMember): string {
  const configs = configLines(member.mock);
  const calls = getMockAdapter().getCalls(member.mock);
  const hits = calls.map((args) => configs.find((config) => config.matches(args)));
  const lines = [headline(member.name, calls.length, configs.length, hits.filter((hit) => hit !== undefined).length)];

  if (configs.length > 0) {
    lines.push('  configured:', ...configs.map((config) => `    #${config.index} ${config.text}`));
  }

  if (calls.length > 0) {
    lines.push('  calls:', ...calls.map((args, position) => callLine(member.name, args, position, configs.length, hits[position])));
  }

  return lines.join('\n');
}

/** One recorded call and what answered it — nothing to attribute when the spy has no configs at all. */
function callLine(name: string, args: unknown[], position: number, configCount: number, hit: ConfigLine | undefined): string {
  const call = `    #${position + 1} ${asCall(name, args)}`;

  if (configCount === 0) {
    return call;
  }

  return `${call} -> ${hit ? `matched #${hit.index}` : NO_MATCH_OUTCOME}`;
}

/** The accessor spies a class-based double keeps in its `accessorSpies` bag, read without touching the live accessors. */
function accessorMembers(spy: object): SpiedMember[] {
  const bag: unknown = Object.getOwnPropertyDescriptor(spy, 'accessorSpies')?.value;

  if (!isObject(bag)) {
    return [];
  }

  return [...bagHalf(bag, 'getters', 'get'), ...bagHalf(bag, 'setters', 'set')];
}

function bagHalf(bag: object, half: 'getters' | 'setters', label: string): SpiedMember[] {
  const record: unknown = Reflect.get(bag, half);

  if (!isObject(record)) {
    return [];
  }

  return Object.entries(record).flatMap(([property, mock]) =>
    isMarkedMock(mock) ? [{ name: `${label} ${property}`, property, mock }] : [],
  );
}

/**
 * Every spied member of an assembled double, in own-key order.
 *
 * Live accessors are skipped and never read: an accessor spy would record a call just for being
 * looked at, and an un-materialised lazy method would be built only to report that it has nothing.
 */
function collectMembers(spy: object): SpiedMember[] {
  const found: SpiedMember[] = [];

  for (const key of Object.keys(spy)) {
    const descriptor = Object.getOwnPropertyDescriptor(spy, key);

    if (!descriptor || descriptor.get || descriptor.set) {
      continue;
    }

    const { value } = descriptor;

    if (isMarkedMock(value)) {
      found.push({ name: key, property: key, mock: value });
    }
  }

  return [...found, ...accessorMembers(spy)];
}

/**
 * The members `explainSpy(spy, 'name')` asks about.
 *
 * The accessor bag is consulted first so a getter-backed property is answered from the bag rather
 * than by invoking it. Everything else is an ordinary property read, which is what materialises a
 * lazy method or an untouched `createAutoMock` key — neither records a call.
 */
function membersNamed(spy: object, property: string): SpiedMember[] {
  const accessors = accessorMembers(spy).filter((member) => member.property === property);

  if (accessors.length > 0) {
    return accessors;
  }

  const value: unknown = Reflect.get(spy, property);

  return isMarkedMock(value) ? [{ name: property, property, mock: value }] : [];
}

function sections(spy: object, method: string | undefined): string[] {
  const members = method === undefined ? collectMembers(spy) : membersNamed(spy, method);

  if (members.length > 0) {
    return members.map(explainMember);
  }

  // Reached last, because a `mockDeep` node is a spy *and* a container: `explainSpy(api.repo, 'find')`
  // asks about the child, not about the node printed under the child's name.
  if (isMarkedMock(spy)) {
    return [explainMember({ name: method ?? mockNameOf(spy), property: method ?? '', mock: spy })];
  }

  return [method === undefined ? NOTHING_FOUND : `${method} ${NOT_A_DOUBLE}`];
}

/**
 * Explain what a double is configured to answer and what it was actually asked.
 *
 * With no `method`, every spied member that the double exposes is reported; with one, only that
 * member. The result is a report to print — `console.log(explainSpy(users))` — not something to
 * assert on.
 *
 * @example
 * ```ts
 * const users = createSpyFromClass(UserService);
 * users.load.calledWith(1).resolveWith('ok');
 *
 * await users.load(2);
 *
 * console.log(explainSpy(users, 'load'));
 * // [vitest-auto-spy] explainSpy
 * //
 * // load — 1 call, 1 configured, none matched
 * //   configured:
 * //     #1 calledWith(1)
 * //   calls:
 * //     #1 load(2) -> no configured arguments matched; the default value was used
 * ```
 *
 * @param spy A double, or a single function spy off one.
 * @param method Restrict the report to one member.
 * @returns A human-readable report; never throws, whatever it was handed.
 */
export function explainSpy(spy: object, method?: string): string {
  return `${HEADER}\n\n${sections(spy, method).join('\n\n')}`;
}
