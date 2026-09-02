/**
 * The rules for a suite that is still on the way over from `jasmine-auto-spies`.
 *
 * They are kept apart from `rules.ts` because they steer in the opposite direction. Those rules
 * push a Vitest suite towards this library's API; these ones are about a suite that has not arrived
 * yet — one that runs on the `vitest-auto-spy/jasmine` compatibility layer, or one that thinks it
 * does. Three of them catch a defect and one finishes the job:
 *
 * - `jasmine-namespace-without-entry` — the namespaces are used and nothing installed them;
 * - `no-jasmine-globals` — a global jasmine's runner provided and Vitest does not;
 * - `no-save-arguments-by-value` — the one jasmine helper this library answers with a no-op, which
 *   makes it the only shape here that changes what a test *claims* without changing whether it passes;
 * - `prefer-native-spy-api` — the renames that let the layer be dropped, off by default because the
 *   layer is legitimate for as long as the migration lasts.
 *
 * **Why `prefer-native-spy-api` fixes rather than only suggests.** Each of its rewrites stays inside
 * one call expression and keeps the receiver: `.and.returnValue(x)` installs the same implementation
 * `.mockReturnValue(x)` does, on the same spy. The plain fix is still spent only where the receiver
 * is traceable to one of this library's factories, because `.calls.count()` on somebody else's
 * object is somebody else's method — there the same edit is offered as a suggestion, exactly as
 * `no-mocked-for-spy` does when it can see a declaration but not what fills it.
 */
import { defineRule } from './define-rule';
import { ENABLE_CALL, fromLibrarySpy, installsJasmineCompat, namespaceOnSpy, setupModules, withArgsOnSpy } from './jasmine-compat';
import { BARE_GLOBAL_SELECTOR, bareGlobalReport, jasmineMemberReport } from './jasmine-globals';
import { type NativeRewrite, andRewrite, callsRewrite, saveArgumentsByValueCall } from './native-spy-api';
import {
  type EsFix,
  type EsFixer,
  type EsIdentifier,
  type EsImportDeclaration,
  type EsMemberExpression,
  type EsNode,
  type RuleModule,
  isCallee,
  memberName,
} from './rule-types';

/** The recipe every rule here points at. */
const ANCHOR = '-a-jasmine-suite-mid-migration';

/** One namespace use, held until the file is over and it is known whether anything installed them. */
interface NamespaceUse {
  node: EsNode;
  messageId: string;
}

/** `.and` / `.calls` / `.withArgs` in a file that installs neither the entry nor the compat call. */
const jasmineNamespaceWithoutEntry = defineRule({
  anchor: ANCHOR,
  description: 'Do not use the jasmine namespaces in a file that never installs the compatibility layer',
  schema: [
    {
      type: 'object',
      properties: { setupModules: { type: 'array', items: { type: 'string' } } },
      additionalProperties: false,
    },
  ],
  messages: {
    andWithoutEntry:
      "`.and` is not a member of a spy this library builds — it is installed by `vitest-auto-spy/jasmine`, and nothing in this file installs it. So this reads `undefined` and the line dies with `Cannot read properties of undefined (reading 'returnValue')`. Either add the entry (`import { createSpyFromClass } from 'vitest-auto-spy/jasmine'` — on Bun or `node:test`, where that entry cannot load, `enableJasmineCompat()` from `vitest-auto-spy/jasmine-compat`, once in the setup file), or drop the namespace: `.and.returnValue(x)` is `.mockReturnValue(x)`, `.and.callFake(f)` is `.mockImplementation(f)`, and `.and.nextWith(v)` / `.and.resolveWith(v)` are `.nextWith(v)` / `.resolveWith(v)`. This reads one file: a project that installs the layer from a setup file no spec imports should name that module in `{ setupModules: ['./test-setup'] }`, or turn the rule off.",
    callsWithoutEntry:
      "`.calls` is not a member of a spy this library builds — it is installed by `vitest-auto-spy/jasmine`, and nothing in this file installs it, so this throws `Cannot read properties of undefined`. Either add the entry (`import 'vitest-auto-spy/jasmine'`; `enableJasmineCompat()` in the setup file on Bun and `node:test`), or read the runner's own bookkeeping: `.calls.count()` is `.mock.calls.length`, `.calls.argsFor(i)` is `.mock.calls[i]`, `.calls.reset()` is `.mockClear()`. This reads one file: name a project-level setup module in `{ setupModules: ['./test-setup'] }` if that is where the layer is installed.",
    withArgsWithoutEntry:
      "`withArgs` is not a member of a spy this library builds — it is installed by `vitest-auto-spy/jasmine`, and nothing in this file installs it, so this throws `spy.withArgs is not a function`. Either add the entry (`import 'vitest-auto-spy/jasmine'`; `enableJasmineCompat()` in the setup file on Bun and `node:test`), or use the name this library gives the same thing: `spy.withArgs(a).and.returnValue(v)` is `spy.calledWith(a).mockReturnValue(v)`. This reads one file: name a project-level setup module in `{ setupModules: ['./test-setup'] }` if that is where the layer is installed.",
  },
  create: (context) => {
    const declared = setupModules(context);
    const uses: NamespaceUse[] = [];
    let installed = false;

    return {
      ImportDeclaration: (node: EsImportDeclaration): void => {
        installed ||= installsJasmineCompat(node, declared);
      },
      [`CallExpression[callee.name="${ENABLE_CALL}"]`]: (): void => {
        installed = true;
      },
      'MemberExpression[property.name="and"]': (node: EsMemberExpression): void => {
        if (namespaceOnSpy(context, node, 'and')) {
          uses.push({ node, messageId: 'andWithoutEntry' });
        }
      },
      'MemberExpression[property.name="calls"]': (node: EsMemberExpression): void => {
        if (namespaceOnSpy(context, node, 'calls')) {
          uses.push({ node, messageId: 'callsWithoutEntry' });
        }
      },
      'MemberExpression[property.name="withArgs"]': (node: EsMemberExpression): void => {
        if (withArgsOnSpy(context, node)) {
          uses.push({ node, messageId: 'withArgsWithoutEntry' });
        }
      },
      // Reported at the end because an import is not the only way in: `enableJasmineCompat()` can be
      // called anywhere in the file, including below the first spy it equips.
      'Program:exit': (): void => {
        if (installed) {
          return;
        }

        uses.forEach((use) => context.report(use));
      },
    };
  },
});

/** `.and.returnValue(x)` → `.mockReturnValue(x)`, and the rest of the renames that end a migration. */
const preferNativeSpyApi = defineRule({
  anchor: ANCHOR,
  description: 'Call the spy’s own API instead of the jasmine namespace the compatibility layer adds',
  fixable: true,
  hasSuggestions: true,
  messages: {
    preferNativeSpyApi:
      '`{{from}}` is the compatibility layer speaking; `{{to}}` is what this library calls the same thing, and the only spelling the rest of its documentation uses. The layer is a bridge — it exists so a `jasmine-auto-spies` suite runs before it is rewritten — so this is worth doing once the suite is green and not before: rewrite, then delete the `vitest-auto-spy/jasmine` import. `npx vitest-auto-spy codemod --from jasmine` does the whole suite in one pass. The edit is applied only where the receiver came out of one of this library’s factories; anywhere else the same rewrite is offered as a suggestion, because a `.calls` on somebody else’s object is somebody else’s method.',
  },
  create: (context) => {
    const report = (rewrite: NativeRewrite | undefined, spy: EsNode): void => {
      if (!rewrite) {
        return;
      }

      const fix = (fixer: EsFixer): EsFix => fixer.replaceText(rewrite.node, rewrite.text);
      const descriptor = { node: rewrite.node, messageId: 'preferNativeSpyApi', data: { from: rewrite.from, to: rewrite.to } };

      context.report(
        fromLibrarySpy(context, spy)
          ? { ...descriptor, fix }
          : { ...descriptor, suggest: [{ desc: `Call the spy’s own API: ${rewrite.to}`, fix }] },
      );
    };

    return {
      'MemberExpression[property.name="and"]': (node: EsMemberExpression): void => report(andRewrite(context, node), node.object),
      'MemberExpression[property.name="calls"]': (node: EsMemberExpression): void => report(callsRewrite(context, node), node.object),
    };
  },
});

/** `jasmine.createSpyObj`, `spyOn(`, `fail(`, `.withContext(` — the globals that do not exist here. */
const noJasmineGlobals = defineRule({
  anchor: ANCHOR,
  description: 'Replace the globals jasmine’s runner provided — none of them exist under Vitest',
  messages: {
    jasmineNamespace:
      "`{{api}}` does not exist under Vitest: nothing declares the `jasmine` global, so this is a `ReferenceError` on the first run. Land the file green with `import { jasmine } from 'vitest-auto-spy/jasmine'` — the namespace forwards each member to the Vitest primitive that means the same thing — and finish the job by writing `{{replacement}}`, which is what the forward does anyway. This rule says nothing once the import is there.",
    jasmineCreateSpyObj:
      '`jasmine.createSpyObj` does not exist under Vitest, and the object it built is the thing this library replaces: it spies the names you remembered to list, and drifts from the class the moment one is added. `createSpyObj(baseName, methodNames)` from `vitest-auto-spy/jasmine` is the like-for-like landing — imported by name, or reached through the `jasmine` namespace that entry also exports — and `createAutoMock<T>()` / `createSpyFromClass(Class)` is where it should end up, because those read the type or the prototype and forget nothing.',
    jasmineClock:
      "`jasmine.clock()` does not exist under Vitest. `install()` is `vi.useFakeTimers()`, `uninstall()` is `vi.useRealTimers()`, `tick(n)` is `vi.advanceTimersByTime(n)` and `mockDate(d)` is `vi.setSystemTime(d)` — and `import { jasmine } from 'vitest-auto-spy/jasmine'` forwards the whole handle to exactly those, so the file can run before it is rewritten. This library ships the same three as helpers that clean up after themselves too: `setupFakeTimers()` (once, in the setup file), `await advanceTimers(ms)` (which flushes the microtasks the timers just queued, the step a bare `advanceTimersByTime` leaves out) and `mockSystemTime(date)` (which freezes the clock whether or not fakes are already installed, and hands back the undo).",
    jasmineSpyOn:
      '`spyOn` is jasmine’s global, and Vitest declares no such thing — but the trap is what happens when it is renamed rather than removed: **jasmine’s `spyOn` stubs the method, `vi.spyOn` calls through**. `vi.spyOn(obj, "m")` leaves the real implementation running, so the code under test really talks to its collaborator and the spec passes on whatever that returned. Write `vi.spyOn(obj, "m").mockImplementation(() => undefined)` where the jasmine line meant "stub it", and prefer `createSpyFromClass(Class)` / `provideAutoSpy(Class)`, which stub every method by construction.',
    jasmineGlobal:
      '`{{api}}` is one of jasmine’s globals, and nothing declares it under Vitest — this is a `ReferenceError` on the first run. Use `{{replacement}}`.',
    jasmineWithContext:
      '`.withContext(message)` is jasmine’s way of labelling an assertion, and Vitest’s `expect` has no such method: this throws `withContext is not a function`, and the failure lands on the assertion rather than on the value it was about. Vitest takes the label as the second argument of `expect` instead — `expect(value, message).toBe(other)`.',
  },
  create: (context) => ({
    'MemberExpression[object.name="jasmine"]': (node: EsMemberExpression): void => {
      const report = jasmineMemberReport(context, node);

      if (report) {
        context.report({ node, ...report });
      }
    },
    [BARE_GLOBAL_SELECTOR]: (node: EsIdentifier): void => {
      const report = bareGlobalReport(context, node);

      if (report) {
        context.report({ node, ...report });
      }
    },
    'MemberExpression[property.name="withContext"]': (node: EsMemberExpression): void => {
      if (memberName(node) === 'withContext' && isCallee(node)) {
        context.report({ node, messageId: 'jasmineWithContext' });
      }
    },
  }),
});

/** `.calls.saveArgumentsByValue()` — kept callable here, and a no-op. */
const noSaveArgumentsByValue = defineRule({
  anchor: ANCHOR,
  description: 'Do not rely on saveArgumentsByValue — no runner in this family copies call arguments',
  messages: {
    noSaveArgumentsByValue:
      '`saveArgumentsByValue()` is a **no-op** here, and deliberately so: jasmine copies every call’s arguments defensively, Vitest, Bun and `node:test` all keep the reference, and snapshotting every argument of every call to match it would tax every spy in the suite. Nothing throws — that is the problem. This spec asked for the arguments *as they were passed*; after the move it reads whatever the code under test left in that object afterwards, so an assertion about the state at call time silently becomes one about the state at assertion time, and it now passes or fails on a value nobody wrote. Take the copy where the call happens — `spy.mockImplementation((payload) => { seen.push(structuredClone(payload)); })`, then assert on `seen`. `captureArg<T>()` is how to reach the argument at all (`const payload = captureArg<Payload>(); expect(spy).toHaveBeenCalledWith(payload); expect(payload.value).toEqual(…)`), but it keeps the same reference the assertion matched: it repairs the reach, not the mutation.',
  },
  create: (context) => ({
    'MemberExpression[property.name="calls"]': (node: EsMemberExpression): void => {
      const call = saveArgumentsByValueCall(node);

      if (call) {
        context.report({ node: call, messageId: 'noSaveArgumentsByValue' });
      }
    },
  }),
});

/** The rules a suite still on the compatibility layer is linted by, keyed by their config name. */
export const jasmineRules: Record<string, RuleModule> = {
  'jasmine-namespace-without-entry': jasmineNamespaceWithoutEntry,
  'prefer-native-spy-api': preferNativeSpyApi,
  'no-jasmine-globals': noJasmineGlobals,
  'no-save-arguments-by-value': noSaveArgumentsByValue,
};
