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
 * - `prefer-native-spy-api` — the renames that let the layer be dropped. It ships as an `error` like
 *   everything else, and it is the one rule a suite is expected to switch `'off'` for a while: the
 *   layer is legitimate for as long as the migration lasts, so on day one this fires on every line
 *   of the bridge. The migration is finished when it is silent again.
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
import { argumentList, excerpt } from './message-data';
import { type NativeRewrite, andRewrite, callsRewrite, saveArgumentsByValueCall } from './native-spy-api';
import {
  type EsFix,
  type EsFixer,
  type EsIdentifier,
  type EsImportDeclaration,
  type EsMemberExpression,
  type EsNode,
  type RuleContext,
  type RuleModule,
  isCallee,
  memberName,
} from './rule-types';

/** One namespace use, held until the file is over and it is known whether anything installed them. */
interface NamespaceUse {
  node: EsNode;
  messageId: string;
  data: Record<string, string>;
}

/** What a `.and` / `.calls` report quotes: the line's use of the namespace and the one repair for it. */
function namespaceData(context: RuleContext, node: EsMemberExpression, rewrite: NativeRewrite | undefined): Record<string, string> {
  return {
    use: excerpt(context, node.parent),
    fix: rewrite ? `Call \`${rewrite.to}\` on the spy instead` : 'Import `vitest-auto-spy/jasmine` in this file',
  };
}

/** `.and` / `.calls` / `.withArgs` in a file that installs neither the entry nor the compat call. */
const jasmineNamespaceWithoutEntry = defineRule({
  name: 'jasmine-namespace-without-entry',
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
      '`{{use}}` reads `.and`, which only the `vitest-auto-spy/jasmine` entry installs, and this file never imports it: `.and` is `undefined` and the line throws. {{fix}}; if a setup file installs the layer, name it in `{ setupModules }`.',
    callsWithoutEntry:
      '`{{use}}` reads `.calls`, which only the `vitest-auto-spy/jasmine` entry installs, and this file never imports it: `.calls` is `undefined` and the line throws. {{fix}}; if a setup file installs the layer, name it in `{ setupModules }`.',
    withArgsWithoutEntry:
      '`{{use}}` calls `withArgs`, which only the `vitest-auto-spy/jasmine` entry installs, and this file never imports it, so the line throws `withArgs is not a function`. Write `{{fix}}`, this library’s name for the same stub; if a setup file installs the layer, name it in `{ setupModules }`.',
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
          uses.push({ node, messageId: 'andWithoutEntry', data: namespaceData(context, node, andRewrite(context, node)) });
        }
      },
      'MemberExpression[property.name="calls"]': (node: EsMemberExpression): void => {
        if (namespaceOnSpy(context, node, 'calls')) {
          uses.push({ node, messageId: 'callsWithoutEntry', data: namespaceData(context, node, callsRewrite(context, node)) });
        }
      },
      'MemberExpression[property.name="withArgs"]': (node: EsMemberExpression): void => {
        if (withArgsOnSpy(context, node)) {
          const use = excerpt(context, node.parent);

          uses.push({ node, messageId: 'withArgsWithoutEntry', data: { use, fix: `${excerpt(context, node.object)}.calledWith(…)` } });
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
  name: 'prefer-native-spy-api',
  description: 'Call the spy’s own API instead of the jasmine namespace the compatibility layer adds',
  fixable: true,
  hasSuggestions: true,
  messages: {
    preferNativeSpyApi:
      '`{{from}}` is the compatibility layer’s spelling; the spy’s own API calls it `{{to}}`. Rewrite it once the suite is green, then drop the `vitest-auto-spy/jasmine` import (`npx vitest-auto-spy codemod --from jasmine` rewrites the whole suite).',
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
  name: 'no-jasmine-globals',
  description: 'Replace the globals jasmine’s runner provided — none of them exist under Vitest',
  messages: {
    jasmineNamespace:
      '`{{api}}` does not exist under Vitest: nothing declares the `jasmine` global, so this is a `ReferenceError` on the first run. Write `{{replacement}}`.',
    jasmineCreateSpyObj:
      '`{{call}}` does not exist under Vitest, and a spy object built from a list of method names drifts from the class the moment a method is added. Build it with `createAutoMock<{{type}}>()`, which reads the type and forgets nothing.',
    jasmineClock:
      '`{{use}}` does not exist under Vitest: nothing declares the `jasmine` global, so this is a `ReferenceError` on the first run. Write `{{replacement}}`.',
    jasmineSpyOn:
      '`spyOn({{args}})` is jasmine’s global, and renaming it to `vi.spyOn` changes what it does: jasmine’s stubs the method, Vitest’s calls through to the real one. Write `vi.spyOn({{args}}).mockImplementation(() => undefined)`, or build the double with `createSpyFromClass`, which stubs every method.',
    jasmineGlobal:
      '`{{api}}` is one of jasmine’s globals, and nothing declares it under Vitest — this is a `ReferenceError` on the first run. Use `{{replacement}}`.',
    jasmineWithContext:
      '`.withContext({{label}})` is jasmine’s assertion label, and Vitest’s `expect` has no such method, so this throws `withContext is not a function`. Pass the label as the second argument instead: `expect(value, {{label}})`.',
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
        context.report({ node, messageId: 'jasmineWithContext', data: { label: argumentList(context, node.parent, 60) } });
      }
    },
  }),
});

/** `.calls.saveArgumentsByValue()` — kept callable here, and a no-op. */
const noSaveArgumentsByValue = defineRule({
  name: 'no-save-arguments-by-value',
  description: 'Do not rely on saveArgumentsByValue — no runner in this family copies call arguments',
  messages: {
    noSaveArgumentsByValue:
      '`{{spy}}.calls.saveArgumentsByValue()` is a no-op here: the runner keeps a reference to each argument, so an assertion reads the object as the code left it afterwards, not as it was passed. Copy it at call time with `{{spy}}.mockImplementation((arg) => { seen.push(structuredClone(arg)); })` and assert on `seen`.',
  },
  create: (context) => ({
    'MemberExpression[property.name="calls"]': (node: EsMemberExpression): void => {
      const call = saveArgumentsByValueCall(node);

      if (call) {
        context.report({ node: call, messageId: 'noSaveArgumentsByValue', data: { spy: excerpt(context, node.object) } });
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
