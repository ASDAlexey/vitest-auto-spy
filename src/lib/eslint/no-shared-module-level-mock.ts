/** `export const fixture = { m: vi.fn() }` → `export const createFixture = () => ({ m: vi.fn() })`. */
import { defineRule } from './define-rule';
import { bindingName } from './message-data';
import { type EsVariableDeclarator, buildsRunnerFnAtModuleScope } from './rule-types';

export const noSharedModuleLevelMock = defineRule({
  name: 'no-shared-module-level-mock',
  description: 'Export a factory that builds the shared double, not a module-level object holding vi.fn()s',
  messages: {
    noSharedModuleLevelMock:
      '`{{name}}` is built once when the module loads, so every spec that imports it shares the same spies, and calls recorded in one file show up in the next under `isolate: false`. Export a factory instead: `export const {{factory}} = () => ({ … })`.',
  },
  create: (context) => ({
    'ExportNamedDeclaration > VariableDeclaration > VariableDeclarator': (node: EsVariableDeclarator): void => {
      if (node.init && buildsRunnerFnAtModuleScope(context, node.init)) {
        const name = bindingName(context, node.id);
        const factory = `create${name.charAt(0).toUpperCase()}${name.slice(1)}`;

        context.report({ node, messageId: 'noSharedModuleLevelMock', data: { name, factory } });
      }
    },
  }),
});
