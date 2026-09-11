/**
 * `vi.spyOn(component, 'ngOnInit')` — a spy Angular never calls, because a view runs the hook it read
 * off the class prototype. `warn`: an instance spy is still reached by a spec calling the hook itself.
 */
import { defineRule } from './define-rule';
import { type EsCallExpression, type EsNode, isMemberCall, isRunnerCall, memberName } from './rule-types';

// `ngOnChanges` is left out on purpose: Angular calls it as `this.ngOnChanges(changes)`, which does
// reach an instance spy.
const HOOKS = new Set([
  'ngOnInit',
  'ngOnDestroy',
  'ngDoCheck',
  'ngAfterContentInit',
  'ngAfterContentChecked',
  'ngAfterViewInit',
  'ngAfterViewChecked',
]);

const SPY_ON = new Set(['spyOn']);
const OBJECT = new Set(['Object']);
const GET_PROTOTYPE_OF = new Set(['getPrototypeOf']);

function isPrototype(node: EsNode): boolean {
  return memberName(node) === 'prototype' || isMemberCall(node, OBJECT, GET_PROTOTYPE_OF);
}

/** The hook a `spyOn` call names as a literal, when it names one. */
function spiedHook(node: EsCallExpression): string | undefined {
  const [target, key] = node.arguments;
  const name: unknown = key?.type === 'Literal' ? Reflect.get(key, 'value') : undefined;

  return target && !isPrototype(target) && typeof name === 'string' && HOOKS.has(name) ? name : undefined;
}

/** `vi.spyOn(component, 'ngOnInit')` → a stub that never runs and a call that is never recorded. */
export const noInstanceLifecycleSpy = defineRule({
  anchor: '-a-lifecycle-hook',
  description: 'Spy on an Angular lifecycle hook through the class prototype — Angular never calls the one on an instance',
  messages: {
    noInstanceLifecycleSpy:
      'This spy replaces `{{hook}}` on one instance, and Angular does not call it there: a view runs the `{{hook}}` it read off the ' +
      "class's prototype when the component was created. So after `fixture.detectChanges()` the spy has no calls, and a " +
      '`.mockImplementation(…)` on it never runs — the real hook does. Spy on the prototype before the component is created ' +
      "(`vi.spyOn(MyComponent.prototype, '{{hook}}')` ahead of `TestBed.createComponent`), or assert what the hook does rather " +
      'than that it ran. A spec that calls `{{hook}}()` itself, or a service whose `ngOnDestroy` the injector calls, does reach ' +
      'the instance spy — which is why this is a warning.',
  },
  create: (context) => ({
    CallExpression: (node: EsCallExpression): void => {
      const hook = isRunnerCall(node, SPY_ON) ? spiedHook(node) : undefined;

      if (hook) {
        context.report({ node, messageId: 'noInstanceLifecycleSpy', data: { hook } });
      }
    },
  }),
});
