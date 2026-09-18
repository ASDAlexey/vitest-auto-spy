/**
 * Findings as a GitLab Code Quality report, the one merge-request widget a self-managed GitLab shows
 * on every tier without a token or an outside service.
 */
import { createHash } from 'node:crypto';

import { writeTextFile } from './fs-scan';
import type { Finding, Severity } from './report';
import { filterBySeverity } from './report';

export interface CodeQualityIssue {
  readonly description: string;
  readonly check_name: string;
  readonly fingerprint: string;
  readonly severity: 'critical' | 'info' | 'major';
  readonly location: { readonly path: string; readonly lines: { readonly begin: number } };
}

const SEVERITY: Record<Severity, CodeQualityIssue['severity']> = { error: 'critical', warning: 'major', info: 'info' };

/** GitLab requires a path; a finding about the whole repository is filed under its manifest. */
const REPOSITORY_PATH = 'package.json';

/**
 * The widget tells new issues from resolved ones by fingerprint, so it must survive a re-run: the
 * numbers in a message change every time, the words around them do not.
 *
 * What a backtick encloses is exempt, because that is where this CLI puts the things a message is
 * *about* — a test name, a file, a flag. Blanking their digits collapsed `returns 200` and
 * `returns 404` into one fingerprint, and the widget then showed one of the two parametrised
 * branches and dropped the rest.
 */
function fingerprintOf(finding: Finding): string {
  const words = finding.message.replace(/`[^`]*`|\d+(?:\.\d+)?/g, (token) => (token.startsWith('`') ? token : '#'));

  return createHash('sha256')
    .update(`${finding.check}\n${finding.file ?? ''}\n${words}`)
    .digest('hex');
}

export function toCodeQuality(findings: readonly Finding[], minSeverity?: Severity): CodeQualityIssue[] {
  return filterBySeverity(findings, minSeverity).map((finding) => ({
    description: `${finding.message} Fix: ${finding.fix}`,
    check_name: finding.check,
    fingerprint: fingerprintOf(finding),
    severity: SEVERITY[finding.severity],
    location: { path: finding.file ?? REPOSITORY_PATH, lines: { begin: 1 } },
  }));
}

/** Written even when empty: an empty report is how the widget learns that last run's issues are resolved. */
export function writeCodeQuality(path: string, findings: readonly Finding[], minSeverity?: Severity): void {
  writeTextFile(path, `${JSON.stringify(toCodeQuality(findings, minSeverity), undefined, 2)}\n`);
}
