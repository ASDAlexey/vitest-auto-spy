// What an emission failure shows of the values it saw, apart from `expect-emission.ts` so the
// helper stays under the file-size budget.
import { count as countOf } from './message-text';
import { serializeValue } from './serialize-args';

/** How many values a failure shows; the rest are only counted, so a long stream retains nothing. */
export const SHOWN_VALUES = 5;

/** What the failures read off a collector: how many emissions arrived, and the first of them. */
export interface Seen {
  readonly received: number;
  readonly firstSeen: readonly unknown[];
}

/** `1, 2, 3, … 4 more` — the values a failure can show. */
function seenValues({ received, firstSeen }: Seen): string {
  const more = received > firstSeen.length ? `, … ${received - firstSeen.length} more` : '';

  return firstSeen.map((value) => serializeValue(value)).join(', ') + more;
}

/** `3 emissions (1, 2, 3)`, or `0 emissions`. */
export function describeSeen(seen: Seen): string {
  const counted = countOf(seen.received, 'emission');

  return seen.received === 0 ? counted : `${counted} (${seenValues(seen)})`;
}

/** `3 emissions received: 1, 2, 3`, or `0 emissions received`. */
export function describeReceived(seen: Seen): string {
  const counted = `${countOf(seen.received, 'emission')} received`;

  return seen.received === 0 ? counted : `${counted}: ${seenValues(seen)}`;
}
