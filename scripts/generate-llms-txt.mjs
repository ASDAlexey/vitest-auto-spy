#!/usr/bin/env node
/**
 * Generate `llms.txt` and `llms-full.txt` for the documentation site.
 *
 * `llms.txt` (https://llmstxt.org) is the convention an LLM-facing crawler looks for at the root of
 * a docs site: a short, link-only map of the documentation, so an agent can pick the one page it
 * needs instead of scraping rendered HTML. `llms-full.txt` is the whole documentation inlined as
 * one plain-text file, for the agents that would rather read everything once than fetch ten pages.
 *
 * Page order and titles come from the VitePress sidebar in `docs-site/.vitepress/config.mts`, so a
 * page added to the sidebar is picked up automatically. A markdown file that is *not* in the
 * sidebar is a hard error rather than a silent omission — a page missing from `llms.txt` is
 * invisible to every agent, which is exactly the failure this file exists to prevent.
 *
 * Usage:
 *   node scripts/generate-llms-txt.mjs           # write the files
 *   node scripts/generate-llms-txt.mjs --check    # fail if the committed files are stale
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS_DIR = join(ROOT, 'docs-site');
const OUT_DIR = join(DOCS_DIR, 'public');
const CONFIG = join(DOCS_DIR, '.vitepress', 'config.mts');

const HOSTNAME = 'https://asdalexey.github.io/vitest-auto-spy/';
const REPO = 'https://github.com/ASDAlexey/vitest-auto-spy';

/** Files under `docs-site/` that are deliberately not published pages. */
const NOT_A_PAGE = new Set(['README.md']);

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

/**
 * Read the sidebar as an ordered list of `{ group, title, link }`.
 *
 * The config is parsed as text rather than imported: importing it would pull in `vitepress`, which
 * only exists inside `docs-site/node_modules`, and this script has to run from the repo root too.
 * The shape it relies on is narrow — inside `const SIDEBAR = [ … ]` (the block `themeConfig.sidebar`
 * and the breadcrumb JSON-LD are both built from), a `text:` immediately followed by a `link:` is a
 * page, and a `text:` without one opens a group. The block ends at the closing `];` at column zero,
 * which no nested array produces.
 */
function readSidebar() {
  const source = readFileSync(CONFIG, 'utf8');
  const start = source.indexOf('const SIDEBAR = [');
  const end = source.indexOf('\n];', start);

  if (start === -1 || end === -1) {
    throw new Error(`Could not locate the sidebar block in ${relative(ROOT, CONFIG)}`);
  }

  const block = source.slice(start, end);
  const tokens = [...block.matchAll(/\b(text|link):\s*'([^']+)'/g)].map((match) => ({ kind: match[1], value: match[2] }));

  const pages = [];
  let group = '';

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token.kind !== 'text') {
      continue;
    }

    const next = tokens[index + 1];

    if (next?.kind === 'link') {
      // A page. External links (the GitHub button) are not documentation pages.
      if (next.value.startsWith('/')) {
        pages.push({ group, title: token.value, link: next.value });
      }

      index += 1;
      continue;
    }

    group = token.value;
  }

  return pages;
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

/** Split a markdown file into `{ frontmatter, body }` — frontmatter as raw YAML text. */
function splitFrontmatter(source) {
  if (!source.startsWith('---\n')) {
    return { frontmatter: '', body: source };
  }

  const end = source.indexOf('\n---', 4);

  if (end === -1) {
    return { frontmatter: '', body: source };
  }

  return { frontmatter: source.slice(4, end), body: source.slice(end + 4).replace(/^\n+/, '') };
}

/** Read one top-level scalar out of frontmatter. Enough for `title:` / `description:`. */
function frontmatterValue(frontmatter, key) {
  const match = frontmatter.match(new RegExp(`^${key}:[ \\t]*(.+)$`, 'm'));

  if (!match) {
    return '';
  }

  return match[1].trim().replace(/^['"]|['"]$/g, '');
}

/** Absolute URL of a docs page, given its sidebar link (`/core/introduction`). */
function pageUrl(link) {
  return `${HOSTNAME}${link.replace(/^\//, '')}`;
}

/** Filesystem path of a docs page, given its sidebar link. */
function pagePath(link) {
  const clean = link.replace(/^\//, '');

  return join(DOCS_DIR, clean === '' ? 'index.md' : `${clean}.md`);
}

/**
 * Rewrite a page body for plain-text consumption:
 * relative links become absolute, and VitePress containers become plain markdown.
 */
function flatten(body, link) {
  const dir = link.replace(/\/[^/]*$/, '');

  return (
    body
      // `::: tip Title` … `:::` → a bold lead-in, which reads the same without VitePress.
      .replace(/^:::[ \t]*(danger|info|tip|warning)[ \t]*(.*)$/gm, (_all, kind, title) => `**${title || kind.toUpperCase()}**`)
      .replace(/^:::[ \t]*$/gm, '')
      // `{#anchor}` heading suffixes are a VitePress-only affordance.
      .replace(/[ \t]*\{#[\w-]+\}[ \t]*$/gm, '')
      // Relative markdown links → absolute site URLs, so a copied excerpt still resolves.
      .replace(/\]\((\.\.?\/[^)\s]+|\/[^)\s]+)\)/g, (_all, href) => {
        const [path, hash = ''] = href.split('#');
        const absolute = path.startsWith('/') ? path : resolve('/', dir, path);

        return `](${HOSTNAME}${absolute.replace(/^\//, '').replace(/\.md$/, '')}${hash ? `#${hash}` : ''})`;
      })
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

/** Every published markdown page under `docs-site/`, as sidebar-style links. */
function discoverPages() {
  const found = [];

  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'public') {
        continue;
      }

      const path = join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(path);
        continue;
      }

      if (entry.name.endsWith('.md') && !NOT_A_PAGE.has(entry.name)) {
        found.push(`/${relative(DOCS_DIR, path).replace(/\\/g, '/').replace(/\.md$/, '')}`);
      }
    }
  };

  walk(DOCS_DIR);

  return found;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

const HEADER = `# vitest-auto-spy

> Auto-generate fully-typed test spies from a class, a type or nothing at all — one API across
> Vitest, \`bun test\` and \`node:test\`, plus Angular/NestJS/React/Vue/Svelte adapters. A drop-in
> successor to \`jest-auto-spies\`. Zero runtime dependencies.

- Install: \`npm i -D vitest-auto-spy\`
- Repository: ${REPO}
- Documentation: ${HOSTNAME}
- Offline agent cheat sheet, shipped inside the package: \`node_modules/vitest-auto-spy/AGENTS.md\`
- Everything below inlined as one file: ${HOSTNAME}llms-full.txt

The one-line orientation: \`createSpyFromClass(Class)\` when a class exists, \`createAutoMock<T>()\`
when only a type does, \`createMock<T>(partial)\` when the double is read rather than called. Each
spied method earns helpers from its return type — \`calledWith\`/\`mustBeCalledWith\` always,
\`resolveWith\`/\`rejectWith\` for a \`Promise\`, \`nextWith\`/\`throwWith\` for an \`Observable\`.
`;

function buildIndex(pages) {
  const groups = new Map();

  for (const page of pages) {
    const { frontmatter } = splitFrontmatter(readFileSync(pagePath(page.link), 'utf8'));
    const description = frontmatterValue(frontmatter, 'description');
    const group = page.group || 'Documentation';

    if (!groups.has(group)) {
      groups.set(group, []);
    }

    groups.get(group).push(`- [${page.title}](${pageUrl(page.link)})${description ? `: ${description}` : ''}`);
  }

  const sections = [...groups].map(([group, lines]) => `## ${group}\n\n${lines.join('\n')}`);

  return `${HEADER}\n${sections.join('\n\n')}\n\n## Optional\n\n- [Changelog](${REPO}/blob/master/CHANGELOG.md): every released change, newest first.\n- [Full README](${REPO}#readme): the same material as one page, with extra recipes.\n`;
}

/**
 * The home page carries its content in frontmatter (`layout: home`), so there is no body to
 * flatten. Rebuild it as prose: the hero tagline, then one bullet per feature card.
 */
function buildOverview() {
  const { frontmatter } = splitFrontmatter(readFileSync(join(DOCS_DIR, 'index.md'), 'utf8'));
  const tagline = frontmatterValue(frontmatter, '  tagline');
  const features = [...frontmatter.matchAll(/-\s+icon:[^\n]*\n\s+title:[ \t]*(.+)\n\s+details:[ \t]*(.+)\n(?:\s+link:[ \t]*(.+)\n?)?/g)];

  const bullets = features.map(([, title, details, link]) => {
    const target = link?.trim() ? ` — ${HOSTNAME}${link.trim().replace(/^\//, '')}` : '';

    return `- **${title.trim()}** — ${details.trim()}${target}`;
  });

  return `# Overview\n\n${tagline}\n\n${bullets.join('\n')}`;
}

function buildFull(pages) {
  const chunks = [`${HEADER}\n---\n`, buildOverview()];

  for (const page of pages) {
    if (page.link === '/') {
      continue;
    }

    const { body } = splitFrontmatter(readFileSync(pagePath(page.link), 'utf8'));

    chunks.push(`---\n\nSource: ${pageUrl(page.link)}\n\n${flatten(body, page.link)}`);
  }

  return `${chunks.join('\n\n')}\n`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const check = process.argv.includes('--check');
  const pages = readSidebar();
  const linked = new Set(pages.map((page) => page.link));
  const missing = discoverPages().filter((link) => !linked.has(link) && link !== '/index');

  if (missing.length > 0) {
    throw new Error(
      `These docs pages are not in the VitePress sidebar, so they would be missing from llms.txt:\n` +
        `${missing.map((link) => `  - docs-site${link}.md`).join('\n')}\n` +
        `Add them to \`sidebar\` in ${relative(ROOT, CONFIG)}, or to NOT_A_PAGE in this script.`,
    );
  }

  const outputs = [
    ['llms.txt', buildIndex(pages)],
    ['llms-full.txt', buildFull(pages)],
  ];

  for (const [name, content] of outputs) {
    const path = join(OUT_DIR, name);

    if (check) {
      let current = '';

      try {
        current = readFileSync(path, 'utf8');
      } catch {
        current = '';
      }

      if (current !== content) {
        throw new Error(`${name} is stale — run \`npm run llms\` and commit the result.`);
      }

      continue;
    }

    writeFileSync(path, content);
    process.stdout.write(`${relative(ROOT, path)} — ${pages.length} pages, ${(content.length / 1024).toFixed(1)} KB\n`);
  }

  if (check) {
    process.stdout.write('llms.txt and llms-full.txt are up to date\n');
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
