import { resolve } from 'node:path';

import { flagList, flagValue, parseArgs } from './args';
import { isSpecFile } from './checks/graph';
import { failOnOf, formatOf, minSeverityOf } from './cli-options';
import { writeCodeQuality } from './code-quality';
import { doctorDocument, runDoctor } from './doctor';
import { failsOn } from './fail-on';
import type { CliIo } from './main';
import { outputWidth, painterFor } from './paint';
import { readProfile } from './profile';
import { formatFindings, summarize } from './report';
import { doctorMarkdown } from './report-markdown';

export function doctorCommand(cwd: string, argv: readonly string[], io: CliIo): number {
  const args = parseArgs(argv);
  const profile = readProfile(cwd);
  const ignored = new Set(flagList(args, 'ignore'));
  const findings = runDoctor(profile).filter((finding) => !ignored.has(finding.check));
  const minSeverity = minSeverityOf(args);
  const codeQuality = flagValue(args, 'code-quality');
  const exitCode = failsOn(findings, failOnOf(args) ?? 'warning') ? 1 : 0;
  const specFiles = profile.files.filter(isSpecFile).length;

  if (codeQuality !== undefined) {
    writeCodeQuality(resolve(cwd, codeQuality), findings, minSeverity);
  }

  const format = formatOf(args);

  if (format === 'json' || format === 'markdown') {
    const document = doctorDocument(profile, findings, exitCode);

    io.out(format === 'markdown' ? doctorMarkdown(document) : JSON.stringify(document, undefined, 2));

    return exitCode;
  }

  io.out(`vitest-auto-spy doctor — ${cwd}`);
  io.out(`${profile.files.length} files scanned, ${specFiles} of them spec files — runner: ${profile.runner}, entry: ${profile.entry}\n`);

  const report = findings.length === 0 ? 'No problems found.' : formatFindings(findings, minSeverity, outputWidth(), painterFor(undefined));

  if (report !== '') {
    io.out(`${report}\n`);
  }

  io.out(summarize(findings, minSeverity));

  return exitCode;
}
