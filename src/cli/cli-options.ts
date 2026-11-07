import type { ParsedArgs } from './args';
import { flagValue } from './args';
import { severityNamed } from './fail-on';
import type { OutputFormat } from './perf';
import type { Severity } from './report';

const SEVERITIES: Readonly<Record<string, Severity>> = { error: 'error', warning: 'warning', warn: 'warning', info: 'info' };

/** `--fail-on`: the quietest severity that still fails the run. */
export function failOnOf(args: ParsedArgs): Severity | undefined {
  return severityNamed(flagValue(args, 'fail-on'));
}

export function minSeverityOf(args: ParsedArgs): Severity | undefined {
  const raw = flagValue(args, 'min-severity')?.trim().toLowerCase();

  return raw === undefined ? undefined : SEVERITIES[raw];
}

/** `--format`: `text` unless asked otherwise, and `undefined` for a word that is neither. */
export function formatOf(args: ParsedArgs): OutputFormat | undefined {
  const raw = flagValue(args, 'format')?.trim().toLowerCase() ?? 'text';

  return raw === 'json' || raw === 'markdown' || raw === 'text' ? raw : undefined;
}
