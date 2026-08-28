/**
 * Say what is different about two arrays of records, when the runner's own diff cannot.
 *
 * Comparing a list of collected records against an expected list is the ordinary shape of a test
 * for anything that accumulates: an analytics queue, an audit log, a command history, a reducer's
 * emissions. And the ordinary *cause* of a mismatch is not "the wrong element" but "one field moved
 * in all of them" — a timestamp, an id, a counter.
 *
 * That is precisely the failure the reporter renders worst. It collapses the objects, so what
 * arrives is
 *
 * ```text
 * expected [ { event_timestamp: 1, …(5) }, …(8) ] to deeply equal [ { …(6) }, … ]
 * ```
 *
 * — nine elements, one changed field, and nothing on screen to say which. The usual next step is a
 * `console.dir(…, { depth: null })` and another run, twice.
 *
 * {@link diffByField} answers the question the failure was asking: which field, in how many
 * elements, and with what on each side. It is deliberately a plain function rather than a matcher,
 * because it is reached for *after* a failure — wrap the assertion the moment it goes red, keep it
 * or drop it afterwards.
 */
import { serializeValue } from './serialize-args';

/** One field that did not match, and where. */
interface FieldDifference {
  field: string;
  indexes: number[];
  actual: unknown[];
  expected: unknown[];
}

/** How many example values one line of the report shows before it gives up on listing them. */
const MAX_EXAMPLES = 6;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Both elements as records, when both are — the only case in which per-field comparison means anything. */
function recordPair(actual: unknown, expected: unknown): [Record<string, unknown>, Record<string, unknown>] | undefined {
  return isRecord(actual) && isRecord(expected) ? [actual, expected] : undefined;
}

function differs(actual: unknown, expected: unknown): boolean {
  return serializeValue(actual) !== serializeValue(expected);
}

/** Collect, per field, the indexes at which the two arrays disagree. */
function collectDifferences(actual: readonly unknown[], expected: readonly unknown[]): FieldDifference[] {
  const byField = new Map<string, FieldDifference>();

  actual.forEach((actualElement, index) => {
    const expectedElement = expected[index];
    const pair = recordPair(actualElement, expectedElement);

    if (!pair) {
      addDifference(byField, 'the element', index, actualElement, expectedElement);

      return;
    }

    const [actualRecord, expectedRecord] = pair;

    // Every key either side has, so a field missing from one of them is still compared.
    [...new Set([...Object.keys(actualRecord), ...Object.keys(expectedRecord)])].forEach((field) =>
      addDifference(byField, field, index, actualRecord[field], expectedRecord[field]),
    );
  });

  return [...byField.values()];
}

function addDifference(byField: Map<string, FieldDifference>, field: string, index: number, actual: unknown, expected: unknown): void {
  if (!differs(actual, expected)) {
    return;
  }

  const existing = byField.get(field) ?? { field, indexes: [], actual: [], expected: [] };

  existing.indexes.push(index);
  existing.actual.push(actual);
  existing.expected.push(expected);
  byField.set(field, existing);
}

/** `1, 2, 3, …` — or `1 everywhere`, which is the shape a frozen clock or a constant id produces. */
function describeValues(values: readonly unknown[]): string {
  const rendered = values.map((value) => serializeValue(value));
  const distinct = [...new Set(rendered)];

  // "everywhere" only says something once there is more than one of them — and that something is
  // the tell this helper exists to surface.
  if (distinct.length === 1 && rendered.length > 1) {
    return `${distinct[0]} everywhere`;
  }

  const shown = rendered.slice(0, MAX_EXAMPLES).join(', ');

  return rendered.length > MAX_EXAMPLES ? `${shown}, …` : shown;
}

function describeField({ field, indexes, actual, expected }: FieldDifference, total: number): string {
  const where =
    indexes.length === total ? `all ${total}` : `${indexes.length}/${total} (index ${indexes.slice(0, MAX_EXAMPLES).join(', ')})`;

  return `  \`${field}\` differs in ${where}: actual ${describeValues(actual)}, expected ${describeValues(expected)}`;
}

/**
 * Describe how two arrays of records disagree, field by field — or `undefined` when they match.
 *
 * ```ts
 * const sent = analytics.send.mock.calls.map(([event]) => event);
 *
 * expect(diffByField(sent, expectedEvents)).toBeUndefined();
 * // AssertionError: expected '9 of 9 elements differ.
 * //   `event_timestamp` differs in all 9: actual 1 everywhere, expected 2, 3, 4, 5, 6, 7, …' to be undefined
 * ```
 *
 * "Everywhere" against a run of values is the tell worth recognising: under fake timers every
 * `Date.now()` inside one test answers the same, so a test about *order* or *duration* needs
 * `useCountingClock()` rather than a frozen one.
 *
 * Equality is this library's own stable serialization — the same one `calledWith` matches arguments
 * with — so key order does not count as a difference, and `Date`, `Map`, `Set` and circular
 * references are all comparable.
 */
export function diffByField(actual: readonly unknown[], expected: readonly unknown[]): string | undefined {
  if (actual.length !== expected.length) {
    return `lengths differ: ${actual.length} actual, ${expected.length} expected.`;
  }

  const differences = collectDifferences(actual, expected);

  if (differences.length === 0) {
    return undefined;
  }

  const affected = new Set(differences.flatMap(({ indexes }) => indexes));
  const lines = differences.map((difference) => describeField(difference, actual.length));

  return [`${affected.size} of ${actual.length} elements differ.`, ...lines].join('\n');
}
