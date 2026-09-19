/**
 * The link seam a runtime message goes out with.
 *
 * Split from `docs-links.ts` for bundling, not ownership: `docs-links` is one module, so an entry
 * importing a single constant from it pulls the whole URL catalogue into its chunk. The
 * size-pinned `/observer-spy` bridge needs only the helper and one URL, so those live here and the
 * catalogue imports them back — every URL stays defined exactly once.
 */
export const DOCS = 'https://asdalexey.github.io/vitest-auto-spy';

/** The page the `/observer-spy` bridge's three reader errors send their reader to. */
export const DOCS_RXJS = `${DOCS}/runtimes/rxjs`;

/** Append a "see also" line to a message, on its own line so a terminal keeps the URL clickable. */
export function withDocs(message: string, link: string): string {
  return `${message}\nDocs: ${link}`;
}
