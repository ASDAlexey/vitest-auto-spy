/**
 * The stock `vitest` test runner of StrykerJS, with its per-test filter fixed for Vitest 5.
 *
 * `@stryker-mutator/vitest-runner` 10.0.0 narrows a mutant run to the tests that cover it through
 * `testNamePattern`, built from the suite and test names joined with a space. Vitest 5 matches that
 * pattern against `fullTestName`, which joins them with ` > `. Nothing matches, every covering test
 * is skipped, and every mutant with per-test coverage is reported as survived — a score near 0 %
 * that looks like weak tests. Remove this file once the upstream runner matches `fullTestName`.
 */
import { PluginKind, commonTokens, declareFactoryPlugin, tokens } from '@stryker-mutator/api/plugin';
import { strykerPlugins as upstreamPlugins } from '@stryker-mutator/vitest-runner';

const upstream = upstreamPlugins.find((plugin) => plugin.name === 'vitest');

// A space in a name part matches too, so this only ever widens the filter: a mutant runs a few more
// tests than it needs, never fewer.
function acceptVitest5Separator(config) {
  let pattern;

  Object.defineProperty(config, 'testNamePattern', {
    configurable: true,
    enumerable: true,
    get: () => pattern,
    set: (value) => {
      pattern = value instanceof RegExp ? new RegExp(value.source.replaceAll(' ', '(?: | > )'), value.flags) : value;
    },
  });
}

class Vitest5TestRunner {
  #inner;

  constructor(inner) {
    this.#inner = inner;
  }

  capabilities() {
    return this.#inner.capabilities();
  }

  async init() {
    await this.#inner.init();
    this.#inner.ctx.projects.forEach((project) => acceptVitest5Separator(project.config));
  }

  dryRun(options) {
    return this.#inner.dryRun(options);
  }

  mutantRun(options) {
    return this.#inner.mutantRun(options);
  }

  dispose() {
    return this.#inner.dispose();
  }
}

function createVitest5TestRunner(injector) {
  return new Vitest5TestRunner(upstream.factory(injector));
}
createVitest5TestRunner.inject = tokens(commonTokens.injector);

export const strykerPlugins = [declareFactoryPlugin(PluginKind.TestRunner, 'vitest-5', createVitest5TestRunner)];
