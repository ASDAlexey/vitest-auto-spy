/**
 * The shape every `doctor` check speaks, and the two ways a run is rendered.
 *
 * A finding is deliberately not an `Error`: the checks in this CLI look for defects that never
 * fail anything — a spec no tsconfig covers, a pragma the runner does not read — so there is no
 * throw site to hang them off. They are collected, sorted and printed together.
 */

/** How loudly a finding is reported, and whether it makes the process exit non-zero. */
export type Severity = 'error' | 'info' | 'warning';

export interface Finding {
  /** Stable machine-readable id, e.g. `tsconfig-glob-matches-nothing`. */
  readonly check: string;
  readonly severity: Severity;
  /** Repository-relative path the finding is about, when it is about one file. */
  readonly file?: string;
  /** What is wrong, in one sentence. */
  readonly message: string;
  /** What to do about it. Every finding names its own fix — that is the point of the tool. */
  readonly fix: string;
  /** Evidence printed between the message and the fix, one line each: what the gate measured about the file. */
  readonly details?: readonly string[];
}

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
const SEVERITY_LABEL: Record<Severity, string> = { error: 'error', warning: 'warn ', info: 'info ' };

/** Errors first, then warnings, then info; inside a severity, by check id and then by file. */
export function sortFindings(findings: readonly Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];

    if (bySeverity !== 0) {
      return bySeverity;
    }

    const byCheck = a.check.localeCompare(b.check);

    return byCheck !== 0 ? byCheck : (a.file ?? '').localeCompare(b.file ?? '');
  });
}

/** `true` when the run should exit non-zero — anything above `info`. */
export function hasFailures(findings: readonly Finding[]): boolean {
  return findings.some((finding) => finding.severity !== 'info');
}

function formatOne(finding: Finding): string {
  const where = finding.file === undefined ? '' : ` ${finding.file}`;

  return [
    `${SEVERITY_LABEL[finding.severity]}  ${finding.check}${where}`,
    `       ${finding.message}`,
    ...(finding.details ?? []).map((line) => `       ${line}`),
    `       → ${finding.fix}`,
  ].join('\n');
}

/**
 * Human-readable report. Returns the empty string for an empty list so the caller can skip it.
 *
 * `minSeverity` hides the quieter findings *from the report only*: the tally line still counts them,
 * because a run that says `0 errors, 0 warnings, 14 notes` is telling the reader where to look, and
 * one that silently drops the number is telling them there is nothing there. Nothing about the exit
 * code moves either — `info` never failed anything.
 */
export function filterBySeverity(findings: readonly Finding[], minSeverity: Severity = 'info'): Finding[] {
  return findings.filter((finding) => SEVERITY_ORDER[finding.severity] <= SEVERITY_ORDER[minSeverity]);
}

export function formatFindings(findings: readonly Finding[], minSeverity: Severity = 'info'): string {
  const reported = filterBySeverity(findings, minSeverity);

  if (reported.length === 0) {
    return '';
  }

  return sortFindings(reported).map(formatOne).join('\n\n');
}

/** One-line tally: `3 errors, 1 warning, 2 notes`. */
export function summarize(findings: readonly Finding[]): string {
  const counts = { error: 0, warning: 0, info: 0 };

  for (const finding of findings) {
    counts[finding.severity] += 1;
  }

  const parts = [plural(counts.error, 'error'), plural(counts.warning, 'warning'), plural(counts.info, 'note')];

  return parts.join(', ');
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
