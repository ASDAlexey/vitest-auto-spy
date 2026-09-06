#!/usr/bin/env node

/**
 * Follow every in-site link in the built documentation and fail on the ones that go nowhere.
 *
 * Nothing else catches these. VitePress resolves a markdown link at build time only far enough to
 * rewrite the path; a `#fragment` that names no heading is emitted verbatim and lands the reader at
 * the top of the right page, silently. The anchors that bite are the ones with an em dash: a heading
 * `## doctor — defects that never fail` gets the id `doctor-—-defects-that-never-fail`, and a link
 * written by hand as `#doctor-defects-that-never-fail` looks correct in the source and is dead in
 * the browser. Eighteen of them had accumulated by 4.6.0, in both locales.
 *
 * Runs on the build output, so it sees the Russian pages exactly as a reader gets them, and it is
 * wired to `postbuild` — a broken link fails the deploy instead of shipping.
 *
 * Usage:
 *   node scripts/check-docs-links.mjs [dist-dir]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.resolve(process.argv[2] ?? path.join(ROOT, 'docs-site', '.vitepress', 'dist'));
const BASE = '/vitest-auto-spy/';

function pages(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? pages(full) : entry.name.endsWith('.html') ? [full] : [];
  });
}

if (!fs.existsSync(DIST)) {
  console.error(`No build to check at ${DIST} — run \`bun run build\` in docs-site/ first.`);
  process.exit(1);
}

const html = new Map(pages(DIST).map((file) => [file, fs.readFileSync(file, 'utf-8')]));
const anchors = new Map([...html].map(([file, source]) => [file, new Set([...source.matchAll(/id="([^"]+)"/g)].map((m) => m[1]))]));

// Only the article body: the navbar, sidebar and `<head>` carry generated links — a bad one there is
// a config or bundler bug, not a broken cross-reference, and it would be reported once per page.
function body(source) {
  return (/<main[\s\S]*?<\/main>/.exec(source) ?? [''])[0];
}

function resolve(href) {
  const [pathname, fragment] = href.split('#');
  let file = path.join(DIST, pathname.slice(BASE.length - 1));

  if (pathname.endsWith('/')) file = path.join(file, 'index.html');
  else if (!path.extname(file)) file += '.html';

  return { file, fragment: fragment ? decodeURIComponent(fragment) : '' };
}

const broken = [];

for (const [file, source] of html) {
  const article = body(source);

  for (const [, href] of article.matchAll(/href="([^"]+)"/g)) {
    if (href.startsWith('#')) {
      const fragment = decodeURIComponent(href.slice(1));
      if (!anchors.get(file).has(fragment)) broken.push([file, href, 'no heading with that id on this page']);
      continue;
    }

    if (!href.startsWith(BASE)) continue;

    const { file: target, fragment } = resolve(href);

    if (!fs.existsSync(target)) {
      broken.push([file, href, 'no such page']);
      continue;
    }

    if (fragment && anchors.has(target) && !anchors.get(target).has(fragment)) {
      broken.push([file, href, 'page exists, that heading does not']);
    }
  }
}

if (broken.length > 0) {
  console.error(`${broken.length} broken link${broken.length === 1 ? '' : 's'} in the built docs:\n`);
  for (const [file, href, why] of broken) console.error(`  ${path.relative(DIST, file)} → ${href}\n    ${why}`);
  process.exit(1);
}

console.log(`docs links — ${html.size} pages, every in-site link and anchor resolves`);
