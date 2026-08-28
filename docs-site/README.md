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

## Structure

- `index.md` — home page (hero + feature cards)
- `.vitepress/config.mts` — site config, nav and sidebar
- `core/`, `runtimes/`, `adapters/`, `utilities/` — section pages
- `recipes.md`, `migrating.md`, `api.md`, `comparison.md`, `agents.md` — top-level pages
- `public/llms.txt`, `public/llms-full.txt` — generated from the sidebar by
  `../scripts/generate-llms-txt.mjs` (it runs on `build`, and `npm run llms:check` fails CI on
  drift). Adding a page means adding it to the sidebar, not to these files.

Content is grounded in the root [`README.md`](../README.md), [`CHANGELOG.md`](../CHANGELOG.md) and,
for anything behavioural, the source and specs under `../src/`. Every page carries `title` and
`description` frontmatter — `.vitepress/config.mts` turns them into the canonical link and the
OpenGraph tags, so a page without them ships an empty description.

Nothing may be documented that has not been checked against `../src/` or run: a runnable example in
these docs is expected to be one that was actually executed.
