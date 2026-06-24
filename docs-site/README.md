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
- `core/`, `runtimes/`, `adapters/` — section pages
- `migrating.md`, `api.md`, `comparison.md` — top-level pages

Content is grounded in the root [`README.md`](../README.md) and
[`CHANGELOG.md`](../CHANGELOG.md). Stub pages carry `<!-- TODO: expand -->` markers where
deeper content still needs to be written.
