/** The spec file Vitest is running, or `undefined` on a runner that does not say — one bucket for the worker then. */
export function currentSpecFile(): unknown {
  return Reflect.get(Object(Reflect.get(globalThis, '__vitest_worker__')), 'filepath');
}
