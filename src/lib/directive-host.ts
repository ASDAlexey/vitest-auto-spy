/**
 * A host component for testing a directive — correct for the compiler *and* for the TestBed.
 *
 * Testing an attribute directive means declaring a small host in the spec, and under the native
 * `@angular/build:unit-test` builder the obvious way to write one is wrong in a way nothing
 * reports. The two halves of Angular disagree about where `imports` is resolved:
 *
 *  - `imports` on a **`@Component`** is resolved by the AOT compiler at build time, and the flat
 *    list of dependencies is baked into `ɵcmp`. An `NgModule` there works.
 *  - `imports` on **`TestBed.configureTestingModule`** is resolved by `TestBedCompiler` at runtime,
 *    from `ɵmod` — and `ɵɵsetNgModuleScope` is not emitted into a test bundle, so every NgModule has
 *    an empty runtime scope. The same line contributes nothing.
 *
 * So `imports: [DirectivesModule]` is alive in one place and dead in the other, and the failure —
 * `NG0303: Can't bind to 'appTruncate' since it isn't a known property of 'div'` — points at the
 * `@NgModule` where the directive is correctly declared. A host written `standalone: false` is worse
 * still: it is compiled outside any scope at all, so it has no `NgClass`, no `AsyncPipe`, nothing.
 *
 * This factory is that knowledge, applied: the host is always standalone, and `scope` becomes the
 * **component's** imports rather than the testing module's.
 */
import { Component, type Type } from '@angular/core';

/** What Angular accepts in a standalone component's `imports`: a class, or a nested array of them. */
type ScopeEntry = Type<unknown> | readonly ScopeEntry[];

/** What the host needs to exist. */
export interface DirectiveHostOptions<Props extends object> {
  /** The host template — the place the directive under test is used. */
  template: string;
  /**
   * What the template may use: the `NgModule` that declares the directive, a standalone directive
   * or component, a pipe. Becomes the host component's own `imports`.
   */
  scope?: readonly ScopeEntry[];
  /** Initial values for the host's inputs, and the type `componentInstance` is read through. */
  props?: Props;
  /** Host element selector, when the template of a parent refers to it. Defaults to `auto-spy-host`. */
  selector?: string;
}

/**
 * Build a standalone host component for a directive under test.
 *
 * ```ts
 * const Host = createDirectiveHost({
 *   template: `<div [appTruncate]="enabled" [truncateText]="text"></div>`,
 *   scope: [DirectivesModule],
 *   props: { enabled: false, text: 'hello' },
 * });
 *
 * TestBed.configureTestingModule({ imports: [Host] });
 *
 * const fixture = TestBed.createComponent(Host);
 * fixture.componentInstance.enabled = true; // typed from `props`
 * ```
 *
 * `props` are copied onto each instance, so two fixtures never share them; a nested object is
 * copied by reference, as an object literal in a spec always is.
 */
export function createDirectiveHost<Props extends object = Record<never, never>>(options: DirectiveHostOptions<Props>): Type<Props> {
  const props = options.props ?? {};

  class DirectiveHost {
    constructor() {
      Object.assign(this, { ...props });
    }
  }

  const decorate = Component({
    selector: options.selector ?? 'auto-spy-host',
    // Always standalone, and this is the entire point: only a standalone component has its
    // `imports` resolved by the compiler and written into `ɵcmp`, which is what makes an NgModule
    // in `scope` contribute anything at all.
    standalone: true,
    imports: [...(options.scope ?? [])],
    template: options.template,
  });

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the class is built here and the decorator returns it unchanged; `Props` describes the fields the constructor copies on, which no runtime construction can prove to the compiler.
  return decorate(DirectiveHost) as Type<Props>;
}
