/**
 * The subset of `.gitignore` the repository scan honours: the root file only, applied to
 * directories only. Pure string work — `fs-scan` reads the file and prunes the walk with the result.
 */

export interface IgnoreRule {
  readonly negated: boolean;
  readonly pattern: RegExp;
}

/**
 * The rules of one `.gitignore`, in file order. `undefined` when a negation cannot be read: dropping
 * a `!` rule would prune a directory git keeps, so such a file is not honoured at all.
 */
export function parseGitignore(text: string): IgnoreRule[] | undefined {
  const rules: IgnoreRule[] = [];

  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();

    if (line === '' || line.startsWith('#')) {
      continue;
    }

    const negated = line.startsWith('!');
    const pattern = toRegExp(negated ? line.slice(1) : line);

    if (pattern !== undefined) {
      rules.push({ negated, pattern });
    } else if (negated) {
      return undefined;
    }
  }

  return rules;
}

/** Whether the rules ignore a directory, given as a root-relative POSIX path. The last match wins. */
export function isIgnoredDirectory(rules: readonly IgnoreRule[], path: string): boolean {
  let ignored = false;

  for (const rule of rules) {
    if (rule.pattern.test(path)) {
      ignored = !rule.negated;
    }
  }

  return ignored;
}

function toRegExp(line: string): RegExp | undefined {
  const body = line.replace(/\/+$/, '');

  if (body === '' || line.includes('\\')) {
    return undefined;
  }

  const anchored = body.includes('/');
  const segments = (body.startsWith('/') ? body.slice(1) : body).split('/');
  let source = '';

  for (const [index, segment] of segments.entries()) {
    const last = index === segments.length - 1;

    if (segment === '**') {
      source += last ? '.*' : '(?:[^/]+/)*';

      continue;
    }

    const converted = segmentSource(segment);

    if (converted === undefined) {
      return undefined;
    }

    source += last ? converted : `${converted}/`;
  }

  try {
    return new RegExp(`^${anchored ? '' : '(?:.*/)?'}${source}$`);
  } catch {
    return undefined;
  }
}

function segmentSource(segment: string): string | undefined {
  let source = '';
  let index = 0;

  while (index < segment.length) {
    const char = segment.charAt(index);

    if (char === '[') {
      const negated = /^[!^]/.test(segment.slice(index + 1));
      const start = index + (negated ? 2 : 1);
      const end = segment.indexOf(']', start + 1);
      const members = segment.slice(start, end);

      if (end === -1 || members.includes('[')) {
        return undefined;
      }

      source += `[${negated ? '^' : ''}${members.replace(/[\]^]/g, '\\$&')}]`;
      index = end + 1;

      continue;
    }

    source += char === '*' ? '[^/]*' : char === '?' ? '[^/]' : char.replace(/[$()+.^{|}]/, '\\$&');
    index += 1;
  }

  return source;
}
