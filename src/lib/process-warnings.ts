/**
 * Run `work` with `process.emitWarning` muted, for a read the library makes on its own behalf. Node 25+
 * warns from the `localStorage` getter when no `--localstorage-file` is given, and a warning raised by
 * the library's own read is charged to whichever spec file happens to be running.
 */
export function withoutProcessWarnings<T>(work: () => T): T {
  const proc: object = Object(Reflect.get(globalThis, 'process'));
  const emit: unknown = Reflect.get(proc, 'emitWarning');

  if (typeof emit !== 'function' || !Reflect.set(proc, 'emitWarning', () => undefined)) {
    return work();
  }

  try {
    return work();
  } finally {
    Reflect.set(proc, 'emitWarning', emit);
  }
}
