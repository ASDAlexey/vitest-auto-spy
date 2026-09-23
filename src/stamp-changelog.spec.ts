import { readFileSync } from 'node:fs';

import { stampChangelog } from '../scripts/stamp-changelog.mjs';

const BASE = 'https://github.com/o/r/compare/';

const changelog = [
  '# Changelog',
  '',
  '## [Unreleased]',
  '',
  '### Fixed',
  '',
  '- a fix',
  '',
  '## [1.1.0] - 2026-01-01',
  '',
  '- older',
  '',
  `[Unreleased]: ${BASE}v1.1.0...HEAD`,
  `[1.1.0]: ${BASE}v1.0.0...v1.1.0`,
  '',
].join('\n');

describe('stampChangelog', () => {
  it('moves Unreleased under the version, leaves an empty Unreleased on top and repoints the links', () => {
    expect(stampChangelog(changelog, '1.2.0', '2026-02-02')).toBe(
      [
        '# Changelog',
        '',
        '## [Unreleased]',
        '',
        '## [1.2.0] - 2026-02-02',
        '',
        '### Fixed',
        '',
        '- a fix',
        '',
        '## [1.1.0] - 2026-01-01',
        '',
        '- older',
        '',
        `[Unreleased]: ${BASE}v1.2.0...HEAD`,
        `[1.2.0]: ${BASE}v1.1.0...v1.2.0`,
        `[1.1.0]: ${BASE}v1.0.0...v1.1.0`,
        '',
      ].join('\n'),
    );
  });

  it('is a no-op for a version that already has a section', () => {
    const stamped = stampChangelog(changelog, '1.2.0', '2026-02-02');

    expect(stampChangelog(stamped, '1.2.0', '2026-03-03')).toBe(stamped);
  });

  it('fails the release on a changelog it cannot stamp', () => {
    expect(() => stampChangelog('# Changelog\n', '1.2.0', '2026-02-02')).toThrow('no "## [Unreleased]" heading');
    expect(() => stampChangelog('# Changelog\n## [Unreleased]\n', '1.2.0', '2026-02-02')).toThrow('link to repoint');
  });

  it('runs inside `npm version`, which commits what the lifecycle script stages', () => {
    const { scripts } = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };

    expect(scripts['version']).toContain('node scripts/stamp-changelog.mjs');
    expect(scripts['version']).toMatch(/git add [^&]*CHANGELOG\.md/);
  });

  it('accepts the repository changelog as it stands', () => {
    const text = readFileSync('CHANGELOG.md', 'utf8');

    expect(stampChangelog(text, '999.0.0', '2026-01-01')).toContain('\n## [999.0.0] - 2026-01-01\n');
  });
});
