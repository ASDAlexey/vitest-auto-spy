import { posix, win32 } from 'node:path';

export function pathsOf(path: string): typeof posix {
  return /^(?:[a-z]:[/\\]|[/\\]{2}[^/\\])/i.test(path) ? win32 : posix;
}

export function pathInsideRoot(root: string, file: string): string | undefined {
  const paths = pathsOf(root);

  if (!root || paths !== pathsOf(file)) {
    return undefined;
  }

  if (!paths.isAbsolute(file) || !paths.isAbsolute(root)) {
    return undefined;
  }

  const local = paths.relative(root, file).split(paths.sep).join('/');

  return local !== '' && local !== '..' && !local.startsWith('../') && !paths.isAbsolute(local) ? local : undefined;
}

export function reportRelativePath(file: string, root: string, cwd: string): string | undefined {
  return pathInsideRoot(cwd, file) ?? pathInsideRoot(root, file);
}
