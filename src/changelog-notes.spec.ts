import { hasSizeNote, pendingChangelog } from '../scripts/changelog-notes.mjs';
import { trimChangelog } from '../scripts/pack-changelog.mjs';

const BASE = 'https://github.com/o/r/compare/';

const changelog = [
  '# Changelog',
  '',
  '## [Unreleased]',
  '',
  '- pending',
  '',
  '## [2.1.0] - 2026-02-01',
  '',
  '- current major',
  '',
  '## [1.0.0] - 2026-01-01',
  '',
  '- previous major',
  '',
  `[Unreleased]: ${BASE}v2.1.0...HEAD`,
  `[2.1.0]: ${BASE}v1.0.0...v2.1.0`,
  `[1.0.0]: ${BASE}v0.9.0...v1.0.0`,
  '',
].join('\n');

describe('pendingChangelog', () => {
  it('keeps Unreleased and any section above the released version', () => {
    const text = changelog.replace('## [2.1.0]', '## [2.2.0] - 2026-03-01\n\n- written ahead\n\n## [2.1.0]');

    expect(pendingChangelog(text, '2.1.0')).toContain('- pending');
    expect(pendingChangelog(text, '2.1.0')).toContain('- written ahead');
    expect(pendingChangelog(text, '2.1.0')).not.toContain('- current major');
  });
});

describe('hasSizeNote', () => {
  const pending = [
    '- `vitest-auto-spy/angular` on its own weighs +2.7 kB min+gzip',
    '  because it imports the root.',
    '- a /react typo',
  ].join('\n');

  it('accepts a wrapped list item that names the entry and its size', () => {
    expect(hasSizeNote(pending, './angular')).toBe(true);
  });

  it('does not let one entry stand in for a longer subpath', () => {
    expect(hasSizeNote(pending, './angular-http')).toBe(false);
    expect(hasSizeNote(pending, './angular/doubles')).toBe(false);
  });

  it('wants a size word, not only the name', () => {
    expect(hasSizeNote(pending, './react')).toBe(false);
  });

  it('reads the root entry and "every entry"', () => {
    expect(hasSizeNote('- The root entry is 710 B heavier', '.')).toBe(true);
    expect(hasSizeNote('- every entry grows 1.2 kB', './setup')).toBe(true);
  });
});

describe('trimChangelog', () => {
  it('drops older majors and their link definitions and points at the full file', () => {
    const trimmed = trimChangelog(changelog, 2);

    expect(trimmed).toContain('- current major');
    expect(trimmed).not.toContain('- previous major');
    expect(trimmed).toContain(`[2.1.0]: ${BASE}v1.0.0...v2.1.0`);
    expect(trimmed).toContain(`[Unreleased]: ${BASE}v2.1.0...HEAD`);
    expect(trimmed).not.toContain('[1.0.0]:');
    expect(trimmed).toContain('Releases before 2.0.0 are in the');
  });

  it('leaves a changelog with nothing older untouched', () => {
    expect(trimChangelog(changelog, 1)).toBe(changelog);
  });
});
