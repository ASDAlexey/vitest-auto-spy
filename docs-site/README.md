# vitest-auto-spy docs site

The documentation site for [`vitest-auto-spy`](https://www.npmjs.com/package/vitest-auto-spy),
built with [VitePress](https://vitepress.dev).

This is a standalone package: it has its own `package.json` and is independent of the
library's build. Nothing here is published to npm.

## Run locally

```bash
npm install   # install VitePress (run once, inside docs-site/)
npm run dev    # start the dev server with hot reload
```

Then open the printed local URL (default <http://localhost:5173>).

## Other commands

```bash
npm run build     # build the static site into .vitepress/dist
npm run preview   # preview the production build locally
```

`build` also runs `../scripts/check-docs-links.mjs` over the output and fails on any in-site link or
`#anchor` that resolves to nothing — in either locale. Anchors keep the em dash (`## doctor — …`
becomes `doctor-—-…`), so a link that drops it looks right in the source and is dead in the browser;
that is the class of bug this catches.

## Structure

- `index.md` — home page (hero + feature cards)
- `.vitepress/config.mts` — site config, nav and sidebar
- `core/`, `runtimes/`, `adapters/`, `utilities/` — section pages
- `recipes.md`, `migrating.md`, `api.md`, `comparison.md`, `agents.md` — top-level pages
- `ru/` — the Russian locale: a hand-written translation of every English page, committed and
  indexed on its own. `npm run ru:sync` (repo root) creates a placeholder for an English page that
  has none yet; `npm run ru:check` is in the gate and fails on a placeholder, on a heading that lost
  its English anchor, and on a link that leaves `/ru/`. After translating a page run
  `node scripts/sync-ru-pages.mjs --anchors` — it writes the English anchors back onto the
  translated headings, so no cross-page link has to be touched.
- `public/llms.txt`, `public/llms-full.txt` — generated from the sidebar by
  `../scripts/generate-llms-txt.mjs` (it runs on `build`, and `npm run llms:check` fails CI on
  drift). Adding a page means adding it to the sidebar, not to these files.

## Translating a page into Russian

One glossary, so two pages do not name the same thing differently. The landing was translated first
and is the precedent the rest follows.

| English         | Russian                                                            |
| --------------- | ------------------------------------------------------------------ |
| spy (noun)      | спай — never «шпион»; the verb is «поставить спай», not «шпионить» |
| test double     | дубль                                                              |
| suite           | сюита                                                              |
| runner          | раннер                                                             |
| collaborator    | коллаборатор                                                       |
| helper          | хелпер                                                             |
| peer dependency | peer-зависимость                                                   |
| barrel          | barrel-модуль — never «бочка»                                      |
| Related         | Смотрите также                                                     |

Translate prose, the frontmatter `title`/`description`, and comments inside examples. Leave
identifiers, imports, CLI flags, config keys, the error strings the library actually throws (readers
grep for them) and `describe`/`it` titles in English. Never hand-write `{#anchor}`: translate the
heading text and run `node ../scripts/sync-ru-pages.mjs --anchors`, which copies the English anchors
onto the Russian headings so no inbound link has to change.

Content is grounded in the root [`README.md`](../README.md), [`CHANGELOG.md`](../CHANGELOG.md) and,
for anything behavioural, the source and specs under `../src/`. Every page carries `title` and
`description` frontmatter — `.vitepress/config.mts` turns them into the canonical link and the
OpenGraph tags, so a page without them ships an empty description.

Nothing may be documented that has not been checked against `../src/` or run: a runnable example in
these docs is expected to be one that was actually executed.
