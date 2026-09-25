/**
 * The small pieces every runtime report is built from, so that a count, a path and a test read the
 * same way whichever guard printed them.
 */

/** `1 timer`, `3 timers`; `plural` for a noun that does not take an `s`. */
export function count(value: number, noun: string, plural = `${noun}s`): string {
  return `${value} ${value === 1 ? noun : plural}`;
}

function runnerRoot(): string | undefined {
  const config: unknown = Reflect.get(Object(Reflect.get(globalThis, '__vitest_worker__')), 'config');
  const root: unknown = Reflect.get(Object(config), 'root');

  return typeof root === 'string' ? root : undefined;
}

function rootPrefix(root: string | undefined): string {
  return root === undefined ? '\0' : `${root.replace(/[/\\]+$/, '')}/`;
}

/** A spec or source path relative to the runner's root, as the runner itself prints it. */
export function displayPath(file: string, root: string | undefined = runnerRoot()): string {
  const prefix = rootPrefix(root);

  return file.startsWith(prefix) ? file.slice(prefix.length) : file;
}

/** A frame as V8 prints it, `at fn (/abs/file.ts:1:2)`, with the path made relative. */
export function displayFrame(frame: string, root: string | undefined = runnerRoot()): string {
  return frame.split(rootPrefix(root)).join('');
}

/**
 * The running test's full name, `suite > test`, read off the runner's worker state rather than
 * `expect.getState()`, so a caller that runs on every scheduled timer pays one property walk.
 */
export function currentTask(): object | undefined {
  const current: unknown = Reflect.get(Object(Reflect.get(globalThis, '__vitest_worker__')), 'current');

  return Reflect.get(Object(current), 'type') === 'test' ? Object(current) : undefined;
}

/** `outer > inner > test` for a task {@link currentTask} handed back; the file itself is left out. */
export function taskName(task: object): string {
  const names: string[] = [];

  for (let node: unknown = task; node !== undefined; node = Reflect.get(Object(node), 'suite')) {
    if (Reflect.get(Object(node), 'filepath') === undefined) {
      names.unshift(String(Reflect.get(Object(node), 'name')));
    }
  }

  return names.join(' > ');
}
