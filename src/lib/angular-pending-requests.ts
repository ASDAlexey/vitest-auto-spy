/**
 * The report for requests nobody answered, shared by `provideHttpTesting()` and the diagnostics group
 * so the two checks that find the same leak describe it the same way.
 */
import { count } from './message-text';

/** One request the controller was still holding. */
export interface PendingRequest {
  method: string;
  urlWithParams: string;
  cancelled: boolean;
}

/** What differs between the two callers: the line that answers a request, and the opt-in for cancelled ones. */
export interface PendingReportWording {
  /** `when` is `end of "test"` at teardown, or names the call that asked mid-test. */
  when: string;
  answer(request: PendingRequest, withMethod: boolean): string;
  ignoreCancelled: string;
}

function describe(request: PendingRequest): string {
  return `${request.method} ${request.urlWithParams}`;
}

/** The report, or `undefined` when there is nothing to say. */
export function pendingRequestsReport(requests: readonly PendingRequest[], wording: PendingReportWording): string | undefined {
  const [first] = requests;

  if (first === undefined) {
    return undefined;
  }

  const diagnosis =
    requests.length === 1
      ? `${describe(first)} was never answered (${wording.when}).`
      : `${count(requests.length, 'request')} were never answered (${wording.when}): ${requests.map(describe).join(', ')}.`;
  const why = `The code under test is still waiting on ${requests.length === 1 ? 'it' : 'them'}, so nothing after that call ran; left open, the next test would match ${requests.length === 1 ? 'it' : 'them'}.`;
  const answerable = requests.find((request) => !request.cancelled);
  const cancelled = requests.filter((request) => request.cancelled);
  const lines = [`[vitest-auto-spy] ${diagnosis}`, why];

  if (answerable !== undefined) {
    const shared = requests.some((other) => other !== answerable && other.urlWithParams === answerable.urlWithParams);

    lines.push(`Answer ${requests.length === 1 ? 'it' : 'each'} in the spec: ${wording.answer(answerable, shared)}.`);
  }

  if (cancelled.length > 0) {
    const which =
      cancelled.length === requests.length && requests.length > 1
        ? 'All of them were'
        : `${cancelled.map(describe).join(', ')} ${cancelled.length === 1 ? 'was' : 'were'}`;

    lines.push(`${which} cancelled by the code under test; when that is intended, pass ${wording.ignoreCancelled}.`);
  }

  return lines.join('\n');
}
