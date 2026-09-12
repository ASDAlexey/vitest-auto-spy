/**
 * `vitest-auto-spy/signal-forms` — Angular's signal forms in a spec: a form built where `form()` can
 * inject, and one matcher for the errors it produces.
 *
 * ```ts
 * import { required } from '@angular/forms/signals';
 * import { createForm, registerFormMatchers } from 'vitest-auto-spy/signal-forms';
 *
 * registerFormMatchers(); // once, in the setup file
 *
 * const user = createForm({ email: '' }, (path) => required(path.email));
 *
 * expect(user.email).toHaveFieldErrors(['required']);
 * ```
 *
 * **Its own entry, and a narrow one: this is the only file of the package that reaches
 * `@angular/forms`.** `vitest-auto-spy/angular` has to keep loading in a project that never
 * installed it, so `@angular/forms` is an *optional* peer paid for by the suites that import this
 * entry — the same reason `@angular/router` lives behind `vitest-auto-spy/angular-router` and
 * `@angular/common` behind `vitest-auto-spy/angular-http`.
 *
 * Like those two it does **not** re-export the core: it is a companion to `vitest-auto-spy/angular`.
 * It registers no hooks and no adapter, so importing it has no effect until a helper is called —
 * `registerFormMatchers()` included.
 */
export { createForm, registerFormMatchers, type CreateFormOptions, type FieldErrorMatch } from './lib/signal-forms';
