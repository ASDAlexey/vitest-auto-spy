#!/usr/bin/env node

/**
 * Parse the YAML frontmatter of every page under `docs-site/`.
 *
 * Nothing in `npm run check` opens that frontmatter — the only reader is `vitepress build`, which
 * lives in the pages workflow and runs after the gate. So a landing page whose frontmatter stopped
 * parsing is discovered on `master`, with the deploy already red, by a message that names a byte
 * offset and no cause. It has happened: a feature card's `details:` grew the phrase
 * `cannot express: Vitest 4.1's mockThrow`, and that `: ` inside an unquoted scalar made the parser
 * read the rest of the sentence as a second mapping key — `incomplete explicit mapping pair;
 * a key node is missed`, `docs-site/index.md` line 32, column 241.
 *
 * The landing page is where this keeps biting, because its `features[].details` are paragraphs of
 * prose sitting in YAML, edited on every release by whoever documents a new export.
 *
 * Same parser as the build (VitePress reads frontmatter through js-yaml), so a file that passes
 * here parses there. On failure this names the file, the line, the offending fragment and the fix,
 * none of which the parser's own message carries.
 *
 * Usage:
 *   node scripts/check-docs-frontmatter.mjs
 */
import { load } from 'js-yaml';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS_DIR = join(ROOT, 'docs-site');

/** Directory names that hold no authored page. `public/` is generated, `.vitepress/` is build output and config. */
const SKIP_DIRS = new Set(['node_modules', 'public', 'cache', 'dist']);

/** Every markdown file under `docs-site/`, including the ones that are not sidebar pages. */
function markdownFiles(dir) {
  const found = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) {
      continue;
    }

    const path = join(dir, entry.name);

    if (entry.isDirectory()) {
      found.push(...markdownFiles(path));
    } else if (entry.name.endsWith('.md')) {
      found.push(path);
    }
  }

  return found;
}

/**
 * The frontmatter block as raw YAML, or `undefined` when the file has none.
 *
 * The body is markdown that contains `---` rules of its own, so the block is the first one and it
 * has to start at byte zero — the same rule the site build applies.
 */
function frontmatter(source) {
  if (!source.startsWith('---\n')) {
    return undefined;
  }

  const end = source.indexOf('\n---', 4);

  return end === -1 ? undefined : source.slice(4, end);
}

/**
 * The cause, in the words of whoever has to fix it.
 *
 * js-yaml reports where it gave up, not what was written wrong, and for prose in frontmatter the
 * answer is nearly always a character that is punctuation in English and syntax in YAML.
 */
function diagnose(line) {
  const value = /^\s*[\w.-]+:[ \t]+(?!["'|>])(.*)$/.exec(line ?? '');

  if (value === null) {
    return 'Quote the value, or move it into a block scalar (`key: >-` with the text indented below).';
  }

  const colon = /[^\s:]: \S/.exec(value[1]);

  if (colon !== null) {
    const around = value[1].slice(Math.max(0, colon.index - 28), colon.index + 32);

    return (
      `A colon followed by a space inside an unquoted scalar starts another key: …${around}… ` +
      'Use a semicolon or a dash in the prose, or quote the whole value.'
    );
  }

  return 'The value is an unquoted scalar. Quote it, or use a block scalar (`key: >-` with the text indented below).';
}

function main() {
  const problems = [];

  for (const path of markdownFiles(DOCS_DIR)) {
    const block = frontmatter(readFileSync(path, 'utf8'));

    if (block === undefined) {
      continue;
    }

    try {
      load(block);
    } catch (error) {
      // Marks are relative to the block, which starts on line 2 of the file.
      const line = (error.mark?.line ?? 0) + 2;
      const column = (error.mark?.column ?? 0) + 1;
      const source = block.split('\n')[line - 2];

      problems.push(
        `${relative(ROOT, path)}:${line}:${column} — frontmatter does not parse, so \`vitepress build\` fails.\n` +
          `  ${error.reason ?? error.message}\n` +
          `  ${diagnose(source)}`,
      );
    }
  }

  if (problems.length > 0) {
    for (const problem of problems) {
      console.error(`check-docs-frontmatter: ${problem}`);
    }
    process.exit(1);
  }

  console.log('check-docs-frontmatter: frontmatter parses in every page under docs-site/.');
}

main();
