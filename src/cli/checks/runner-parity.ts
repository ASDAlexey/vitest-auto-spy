/**
 * The same specs run two ways in a workspace with Angular unit-test targets: `ng test` / `nx test`
 * through the builder, and `vitest run` or the IDE through the Vitest config the builder never
 * reads. Where the two set up the test world differently, a spec passes in one and fails in the
 * other, and neither run says so.
 */
import { posix } from 'node:path';

import type { Profile } from '../profile';
import type { Finding } from '../report';
import { closingIndex } from './analog-fast-compile';
import { namedTargets } from './angular-build';
import { type TargetConfig, builderTargets } from './builder-speed';
import type { SourceGraph } from './graph';
import { isInsideLiteral, literalSpans } from './literals';
import { unitTestTargets } from './unit-test-targets';
import { configKeys, installedVersionOf, isKey, stringValue } from './vitest-5-facts';

/** The configs `vitest run` and the IDE discover on their own; `vitest-base.config.*` is the builder's. */
const DISCOVERED_CONFIG = /^vite(?:st)?\.config\.[cm]?[jt]s$/;

const DOM_MEASURED =
  'On a 48-file Angular suite switching the runner config to happy-dom took Duration from 1.37 s to 1.10 s (−20 %), suite green.';

function builderRunsHappyDom({ keys, browsers }: TargetConfig): boolean {
  const set = keys.filter((key) => isKey(key, 'environment')).map(stringValue)[0];

  return browsers.length === 0 && (set ?? 'happy-dom') === 'happy-dom';
}

const runs = (targets: readonly unknown[]): string => (targets.length === 1 ? 'runs' : 'run');

function covers(dir: string, root: string): boolean {
  return dir === '' || root === dir || root.startsWith(`${dir}/`);
}

export function checkRunnerDom(profile: Profile, graph: SourceGraph): Finding[] {
  if (installedVersionOf(profile.cwd, 'happy-dom') === undefined || installedVersionOf(profile.cwd, 'jsdom') === undefined) {
    return [];
  }

  const targets = builderTargets(profile);
  const builderConfigs = new Set(targets.map(({ config }) => config));
  const onHappyDom = targets.filter(builderRunsHappyDom);

  return [...graph.texts].flatMap(([file, text]) => {
    if (!DISCOVERED_CONFIG.test(posix.basename(file)) || builderConfigs.has(file)) {
      return [];
    }

    const jsdom = configKeys(file, text).some((key) => isKey(key, 'environment') && stringValue(key) === 'jsdom');
    const dir = posix.dirname(file) === '.' ? '' : posix.dirname(file);
    const affected = jsdom ? onHappyDom.filter(({ target }) => covers(dir, target.root)) : [];
    const [first] = affected;

    if (first === undefined) {
      return [];
    }

    return [
      {
        check: 'runner-dom-differs-from-builder',
        severity: 'warning',
        file,
        message: `${file} sets \`environment: 'jsdom'\`, while ${namedTargets(affected.map(({ target }) => target))} ${runs(affected)} through \`${first.target.builder}\` on happy-dom, which the builder picks whenever it resolves and the target's runner config does not set \`environment\`. \`vitest run\` and the IDE test one DOM, \`ng test\` / \`nx test\` another, so a spec can pass in one and fail in the other. ${DOM_MEASURED}`,
        fix: `Set \`environment: 'happy-dom'\` in the \`test\` block of ${file}. A spec that needs jsdom keeps it with a \`// @vitest-environment jsdom\` comment at its top.`,
      },
    ];
  });
}

const ANALOG_IMPORT = /\bimport\s*{([^}]*)}\s*from\s*["']@analogjs\/vitest-angular\/setup-testbed["']/g;
const STRICT_FLAGS = ['errorOnUnknownElements', 'errorOnUnknownProperties'];
const STRICT_CALL = 'setupTestBed({ errorOnUnknownElements: true, errorOnUnknownProperties: true })';

function localName(text: string): string | undefined {
  const spans = literalSpans(text);
  const specifiers = [...text.matchAll(ANALOG_IMPORT)].find((match) => !isInsideLiteral(spans, match.index))?.[1];

  const found = specifiers === undefined ? null : /\bsetupTestBed\b(?:\s+as\s+([$A-Z_a-z][\w$]*))?/.exec(specifiers);

  return found === null ? undefined : (found[1] ?? 'setupTestBed');
}

/** The flags a call leaves unset, or `undefined` when it passes something this cannot read. */
function unsetFlags(text: string, name: string): string[] | undefined {
  const spans = literalSpans(text);
  const call = [...text.matchAll(new RegExp(`(?<![\\w$.])${name.replace(/\$/g, '\\$')}\\s*\\(`, 'g'))].find(
    (match) => !isInsideLiteral(spans, match.index),
  );

  if (call === undefined) {
    return undefined;
  }

  const open = call.index + call[0].length - 1;
  const args = text.slice(open + 1, closingIndex(text, spans, open)).trim();

  if (args !== '' && !args.startsWith('{')) {
    return undefined;
  }

  return STRICT_FLAGS.filter((flag) => !new RegExp(`\\b${flag}\\s*:`).test(args));
}

export function checkAnalogTestBed(profile: Profile, graph: SourceGraph): Finding[] {
  const targets = unitTestTargets(profile);
  const [first] = targets;

  if (first === undefined) {
    return [];
  }

  return [...graph.texts].flatMap(([file, text]) => {
    const name = localName(text);
    const unset = name === undefined ? undefined : unsetFlags(text, name);

    if (unset === undefined || unset.length === 0) {
      return [];
    }

    const flags = unset.map((flag) => `\`${flag}\``).join(' and ');
    const fix =
      unset.length === STRICT_FLAGS.length
        ? `Call \`${STRICT_CALL}\`, the TestBed the builder sets up.`
        : `Add ${unset.map((flag) => `\`${flag}: true\``).join(', ')} to the options of \`setupTestBed(…)\`, as the builder's TestBed has it.`;

    return [
      {
        check: 'analog-testbed-laxer-than-builder',
        severity: 'warning',
        file,
        message: `${file} calls \`setupTestBed()\` from \`@analogjs/vitest-angular/setup-testbed\` without ${flags}, which Analog leaves off, while ${namedTargets(targets)} ${runs(targets)} through \`${first.builder}\`, whose TestBed turns both on. A misspelt element or binding in a template passes \`vitest run\` and fails \`ng test\` / \`nx test\`.`,
        fix,
      },
    ];
  });
}
