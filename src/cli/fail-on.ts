import type { Finding, Severity } from './report';

const RANK: Readonly<Record<Severity, number>> = { error: 0, warning: 1, info: 2 };

const NAMES: Readonly<Record<string, Severity>> = { error: 'error', warning: 'warning', warn: 'warning', info: 'info' };

/** `--fail-on` and `--min-severity` share one vocabulary; `undefined` for a word that is none of it. */
export function severityNamed(raw: string | undefined): Severity | undefined {
  return raw === undefined ? undefined : NAMES[raw.trim().toLowerCase()];
}

/** Whether a finding at `threshold` or louder is in the list. */
export function failsOn(findings: readonly Finding[], threshold: Severity): boolean {
  return findings.some((finding) => RANK[finding.severity] <= RANK[threshold]);
}
