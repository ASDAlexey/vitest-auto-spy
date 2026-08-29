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

  return [`${SEVERITY_LABEL[finding.severity]}  ${finding.check}${where}`, `       ${finding.message}`, `       → ${finding.fix}`].join(
    '\n',
  );
}

/** Human-readable report. Returns the empty string for an empty list so the caller can skip it. */
export function formatFindings(findings: readonly Finding[]): string {
  if (findings.length === 0) {
    return '';
  }

  return sortFindings(findings).map(formatOne).join('\n\n');
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
