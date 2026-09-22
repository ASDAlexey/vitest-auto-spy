import { VERSION } from '@angular/core';

import { DOCS_LINKS, withDocs } from './docs-links';

/**
 * The failure: one internal shape, and the check that stops working without it.
 *
 * Exported because two of the shapes cannot be probed up front — a compiled definition needs a
 * component, and the compiler may not even be loaded — so the call sites that read them raise the
 * same error at the moment they find the shape wrong.
 */
export function angularInternalsError(what: string, consequence: string): Error {
  return new Error(
    withDocs(
      `[vitest-auto-spy] @angular/core ${VERSION.full} no longer carries ${what}, which this package reads.\n` +
        `${consequence}\n` +
        'Nothing here is fixable from a spec: report the Angular version above, and pin the previous one until a release ' +
        'of this package reads the new shape.',
      DOCS_LINKS.angular,
    ),
  );
}
