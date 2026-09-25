/**
 * The shape every `doctor` check speaks, and the two ways a run is rendered.
 *
 * A finding is deliberately not an `Error`: the checks in this CLI look for defects that never
 * fail anything — a spec no tsconfig covers, a pragma the runner does not read — so there is no
 * throw site to hang them off. They are collected, sorted and printed together.
 */
import { docsFor } from './docs';
import { outputWidth, stripColor, wrapText } from './paint';

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

/** Under the severity label, so every line of a finding but its first starts with whitespace. */
const BODY = '       ';
const ITEM = `${BODY}  `;
const ITEM_BODY = `${ITEM}  `;

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

function fixLines(finding: Finding, width: number): string[] {
  const docs = docsFor(finding.check);

  return [...wrapText(finding.fix, width, `${BODY}  `, `${BODY}→ `), ...(docs === undefined ? [] : [`${BODY}Docs: ${docs}`])];
}

function formatOne(finding: Finding, width: number): string {
  const where = finding.file === undefined ? '' : ` ${finding.file}`;

  return [
    `${SEVERITY_LABEL[finding.severity]}  ${finding.check}${where}`,
    ...wrapText(finding.message, width, BODY),
    ...(finding.details ?? []).map((line) => `${BODY}${line}`),
    ...fixLines(finding, width),
  ].join('\n');
}

/**
 * One cause in many places: the same check with the same fix, each about a file. Printed once with
 * the files under it, and the message once too when every place says the same thing.
 */
function formatGroup({ first, members: group }: FindingGroup, width: number): string {
  const sameMessage = group.every((finding) => finding.message === first.message);
  const places = group.flatMap((finding) => [
    `${ITEM}${String(finding.file)}`,
    ...(sameMessage ? [] : wrapText(finding.message, width, ITEM_BODY)),
  ]);

  return [
    `${SEVERITY_LABEL[first.severity]}  ${first.check} — ${placesOf(group)}`,
    ...(sameMessage ? wrapText(first.message, width, BODY) : []),
    ...places,
    ...fixLines(first, width),
  ].join('\n');
}

function placesOf(group: readonly Finding[]): string {
  const files = new Set(group.map((finding) => finding.file)).size;

  return files === group.length ? `${files} files` : `${group.length} places in ${files} ${files === 1 ? 'file' : 'files'}`;
}

/** A finding that carries evidence of its own, or names no file, is never folded into another. */
function groupKey(finding: Finding, index: number): string {
  return finding.details === undefined && finding.file !== undefined
    ? `${finding.severity}\n${finding.check}\n${finding.fix}`
    : `\n${index}`;
}

export interface FindingGroup {
  readonly first: Finding;
  /** `first` included, in report order. */
  readonly members: readonly Finding[];
}

export function groupFindings(findings: readonly Finding[]): FindingGroup[] {
  const groups = new Map<string, { first: Finding; members: Finding[] }>();

  for (const [index, finding] of sortFindings(findings).entries()) {
    const key = groupKey(finding, index);
    const group = groups.get(key);

    group === undefined ? groups.set(key, { first: finding, members: [finding] }) : group.members.push(finding);
  }

  return [...groups.values()];
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

export function formatFindings(findings: readonly Finding[], minSeverity: Severity = 'info', width: number = outputWidth()): string {
  return groupFindings(filterBySeverity(findings, minSeverity))
    .map((group) => (group.members.length === 1 ? formatOne(group.first, width) : formatGroup(group, width)))
    .join('\n\n');
}

export interface Tally {
  readonly errors: number;
  readonly warnings: number;
  readonly notes: number;
}

export function tallyOf(findings: readonly Finding[]): Tally {
  return {
    errors: findings.filter((finding) => finding.severity === 'error').length,
    warnings: findings.filter((finding) => finding.severity === 'warning').length,
    notes: findings.filter((finding) => finding.severity === 'info').length,
  };
}

/**
 * One-line tally: `3 errors, 1 warning, 2 notes`, and how many of them the threshold kept off the
 * screen. The line starts with the error count, which is what a harness reading it matches on.
 */
export function summarize(findings: readonly Finding[], minSeverity: Severity = 'info'): string {
  const tally = tallyOf(findings);
  const hidden = findings.length - filterBySeverity(findings, minSeverity).length;
  const parts = [plural(tally.errors, 'error'), plural(tally.warnings, 'warning'), plural(tally.notes, 'note')];

  return `${parts.join(', ')}${hidden === 0 ? '' : ` (${hidden} not shown: --min-severity ${minSeverity})`}`;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** The `--format json` shape of one finding: the same fields, with no terminal color left in the evidence. */
export function findingJson(finding: Finding): Finding {
  return finding.details === undefined ? finding : { ...finding, details: finding.details.map(stripColor) };
}

/** Version of the `--format json` document. Raised only when a field changes meaning or goes away. */
export const REPORT_SCHEMA = 1;
