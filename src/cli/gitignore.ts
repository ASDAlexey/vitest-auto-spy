/**
 * The subset of git's exclude rules the repository scan honours, applied to directories only. Pure
 * string work — `fs-scan` reads `.git/info/exclude` and every `.gitignore` and prunes the walk with the result.
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

/** The rules of one file, read relative to the directory it sits in — `''` for the scan root. */
export interface IgnoreSource {
  readonly base: string;
  readonly rules: readonly IgnoreRule[];
}

/**
 * Whether a directory is ignored by sources given lowest precedence first, as git orders them:
 * `info/exclude`, then each `.gitignore` from the root down. The last matching rule wins.
 */
export function isIgnoredBy(sources: readonly IgnoreSource[], path: string): boolean {
  let ignored = false;

  for (const { base, rules } of sources) {
    if (base === '' || path.startsWith(`${base}/`)) {
      const local = base === '' ? path : path.slice(base.length + 1);

      for (const rule of rules) {
        if (rule.pattern.test(local)) {
          ignored = !rule.negated;
        }
      }
    }
  }

  return ignored;
}

/** The last `core.excludesFile` a git config file sets, unquoted — the few lines of INI git's own reader needs here. */
export function excludesFileSetting(config: string): string | undefined {
  let section = '';
  let found: string | undefined;

  for (const line of config.split('\n')) {
    const header = /^\s*\[\s*([\w.-]+)/.exec(line)?.[1];

    if (header !== undefined) {
      section = header.toLowerCase();

      continue;
    }

    const value = /^\s*excludesfile\s*=\s*(.*)$/i.exec(line)?.[1];

    if (section === 'core' && value !== undefined) {
      found = configValue(value);
    }
  }

  return found;
}

function configValue(raw: string): string {
  const quoted = /^"((?:[^"\\]|\\.)*)"/.exec(raw)?.[1];

  return quoted === undefined ? raw.replace(/\s*[#;].*$/, '').trim() : quoted.replace(/\\(.)/g, '$1');
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
