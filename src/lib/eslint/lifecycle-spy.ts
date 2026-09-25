/**
 * `vi.spyOn(component, 'ngOnInit')` — a spy Angular never calls, because a view runs the hook it read
 * off the class prototype. `warn`: an instance spy is still reached by a spec calling the hook itself.
 */
import { defineRule } from './define-rule';
import { argumentList } from './message-data';
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
  name: 'no-instance-lifecycle-spy',
  description: 'Spy on an Angular lifecycle hook through the class prototype — Angular never calls the one on an instance',
  messages: {
    noInstanceLifecycleSpy:
      "`vi.spyOn({{args}})` spies `{{hook}}` on one instance, but Angular calls the hook it read off the class prototype when the component was created, so this spy records nothing. Spy on the prototype before `TestBed.createComponent`: `vi.spyOn(MyComponent.prototype, '{{hook}}')`.",
  },
  create: (context) => ({
    CallExpression: (node: EsCallExpression): void => {
      const hook = isRunnerCall(node, SPY_ON) ? spiedHook(node) : undefined;

      if (hook) {
        context.report({ node, messageId: 'noInstanceLifecycleSpy', data: { hook, args: argumentList(context, node) } });
      }
    },
  }),
});
