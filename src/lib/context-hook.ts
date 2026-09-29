// In a file whose `test` carries fixtures, Vitest parses each hook's source and throws `FixtureParseError`
// on a plainly named context parameter; a parameterless `function` reading `arguments` gives it nothing to parse.

/** `beforeEach` / `afterEach` body: `body(context)`. */
export function contextHook<Context>(body: (context: Context) => void): () => void {
  return function (): void {
    // eslint-disable-next-line prefer-rest-params -- a rest parameter is exactly what the fixture parser rejects
    body(arguments[0]);
  };
}

/** `aroundEach` body: `body(runTest, context)`. */
export function aroundContextHook(
  body: (runTest: () => Promise<void>, context: unknown) => Promise<void>,
): (runTest: () => Promise<void>) => Promise<void> {
  return function (): Promise<void> {
    // eslint-disable-next-line prefer-rest-params -- a rest parameter is exactly what the fixture parser rejects
    return body(arguments[0], arguments[1]);
  };
}
