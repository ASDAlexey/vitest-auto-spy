const COUNTER = `
import { computed, signal } from '@angular/core';

export class Counter {
  readonly total = signal(3);
  readonly doubled = computed(() => this.total() * 2);
  readonly items = signal<readonly string[]>([]);
  readonly loose = signal<any>(undefined);

  label(): string {
    return 'three';
  }
}
`;

/** The fixtures, by file name — all written before the first lint, so one program covers them. */
export const FIXTURES: Record<string, string> = {
  'counter.ts': COUNTER,
  'signal-to-be.spec.ts': "import { Counter } from './counter';\ndeclare const counter: Counter;\nexpect(counter.total()).toBe(3);\n",
  'signal-to-equal.spec.ts':
    "import { Counter } from './counter';\ndeclare const counter: Counter;\nexpect(counter.doubled()).toEqual(6);\n",
  'signal-to-strict-equal.spec.ts':
    "import { Counter } from './counter';\ndeclare const counter: Counter;\nexpect(counter.total()).toStrictEqual(3);\n",
  'negated.spec.ts': "import { Counter } from './counter';\ndeclare const counter: Counter;\nexpect(counter.total()).not.toBe(3);\n",
  'generic-type-arguments.spec.ts':
    "import { Counter } from './counter';\ndeclare const counter: Counter;\nexpect(counter.total<number>()).toBe(3);\n",
  'strict-equal-no-arguments.spec.ts':
    "import { Counter } from './counter';\ndeclare const counter: Counter;\nexpect(counter.total()).toStrictEqual();\n",
  'method-call.spec.ts': "import { Counter } from './counter';\ndeclare const counter: Counter;\nexpect(counter.label()).toBe('three');\n",
  'plain-function.spec.ts': 'declare const read: () => number;\nexpect(read()).toBe(1);\n',
  'not-expect.spec.ts':
    "import { Counter } from './counter';\n" +
    'declare const counter: Counter;\n' +
    'declare const checked: { toBe(expected: unknown): void };\n' +
    'declare const verify: (value: unknown, note: string) => { toBe(expected: unknown): void };\n' +
    'declare const library: { expect(value: unknown): { toBe(expected: unknown): void } };\n' +
    'checked.toBe(counter.total());\n' +
    "verify(counter.total(), 'note').toBe(3);\n" +
    'library.expect(counter.total()).toBe(3);\n',
  'non-matcher.spec.ts':
    "import { Counter } from './counter';\ndeclare const counter: Counter;\nexpect(counter.total()).toBeTruthy();\nexpect(counter.total()).toHaveBeenCalled();\n",
  'signal-to-be-null.spec.ts':
    "import { Counter } from './counter';\ndeclare const counter: Counter;\nexpect(counter.items()).toBeNull();\nexpect(counter.items()).not.toBeUndefined();\n",
  'object-to-be.spec.ts':
    "import { Counter } from './counter';\ndeclare const counter: Counter;\ndeclare const list: readonly string[];\nexpect(counter.items()).toBe(list);\nexpect(counter.items()).not.toBe(list);\nexpect(counter.loose()).toBe(list);\nexpect(counter.items()).toBe();\nexpect(counter.items()).toBe([...list]);\nexpect(counter.items()).toBe(/a/);\n",
  'object-to-equal.spec.ts':
    "import { Counter } from './counter';\ndeclare const counter: Counter;\ndeclare const list: readonly string[];\nexpect(counter.items()).toEqual(list);\n",
  'primitive-to-be.spec.ts':
    "import { Counter } from './counter';\ndeclare const counter: Counter;\ndeclare const three: number;\nexpect(counter.total()).toBe(three);\nexpect(counter.loose()).toBe(-1);\nexpect(counter.loose()).toBe(undefined);\nexpect(counter.loose()).toBe(`a`);\n",
  'plain-value.spec.ts': 'declare const box: { value: number };\nexpect(box.value).toBe(1);\n',
};
