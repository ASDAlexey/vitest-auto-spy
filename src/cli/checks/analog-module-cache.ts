/**
 * `fsModuleCache` under the Analog Vite plugin, in a suite with inline component `styles`: the cold
 * run passes and writes the cache, and every warm run after it fails to load the virtual module the
 * plugin compiles those styles into, in JIT mode — the mode the plugin runs tests in unless told
 * otherwise. `@angular/build:unit-test` bundles before Vitest sees a file, so it has no such module.
 */
import type { Profile } from '../profile';
import type { Finding } from '../report';
import { type SourceGraph, extractSpecifiers } from './graph';
import { configKeys, declaredVitestMajor, installedVersionOf, isBelow, isKey, isRunnerConfig } from './vitest-5-facts';
import { moduleCacheSetting } from './vitest-5-upgrade';

const ANALOG_PACKAGES = new Set(['@analogjs/vite-plugin-angular', '@analogjs/vitest-angular']);
const ANALOG_PLUGIN = '@analogjs/vite-plugin-angular';

/** No Analog release fixes it yet (last verified broken: 2.7.5); set this to the first one that does. */
const ANALOG_CACHE_FIXED_IN = [Number.POSITIVE_INFINITY];

const COMPONENT = /@Component\s*\(/;
/** `styles:` inside the decorator, before the class it decorates. */
const STYLES_BEFORE_CLASS = /^(?:(?!\bclass\s)[^])*?\bstyles\s*:/;

function hasInlineStyles(text: string): boolean {
  return text
    .split(COMPONENT)
    .slice(1)
    .some((decorator) => STYLES_BEFORE_CLASS.test(decorator));
}

function analogConfig(graph: SourceGraph): string | undefined {
  return [...graph.texts].find(([file, text]) => {
    if (!isRunnerConfig(file) || !extractSpecifiers(text).some((specifier) => ANALOG_PACKAGES.has(specifier))) {
      return false;
    }

    return !configKeys(file, text).some((key) => isKey(key, 'jit') && /^false\b/.test(key.value));
  })?.[0];
}

export function checkAnalogModuleCache(profile: Profile, graph: SourceGraph): Finding[] {
  const major = declaredVitestMajor(profile);
  const analog = installedVersionOf(profile.cwd, ANALOG_PLUGIN);
  const config = analogConfig(graph);

  if (major === undefined || major < 4 || config === undefined || !isBelow(analog, ANALOG_CACHE_FIXED_IN)) {
    return [];
  }

  const setting = moduleCacheSetting(profile, graph, major);
  const styled = [...graph.texts].find(([, text]) => hasInlineStyles(text))?.[0];

  if (setting === undefined || styled === undefined) {
    return [];
  }

  return [
    {
      check: 'analog-module-cache-inline-styles',
      severity: 'warning',
      file: setting.file,
      message: `\`fsModuleCache\` is on for a suite that ${config} runs through ${ANALOG_PLUGIN} ${String(analog)} in JIT mode, and ${styled} declares inline component \`styles\`: the first run passes and fills the cache, and every run after it fails the specs that reach such a component with \`Cannot find module '/@id/__x00__virtual:angular:jit:style:inline;<hash>'\`. Verified on Analog 2.7.5, Angular 22.2 and Vitest 5.0.0.`,
      fix: `Turn \`fsModuleCache\` off in ${setting.file} while the suite runs through Analog. \`@angular/build:unit-test\` has no such break: it bundles the code before Vitest sees it.`,
    },
  ];
}
