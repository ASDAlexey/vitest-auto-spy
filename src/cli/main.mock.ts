export function doctorArgs(root: string): string[] {
  return ['doctor', '--cwd', root];
}

export function initArgs(root: string): string[] {
  return ['init', '--cwd', root];
}

export function initCheckArgs(root: string): string[] {
  return ['init', '--cwd', root, '--check'];
}

export function ordinaryPerfFiles(root: string): { file: string; tests: number; testCount: number }[] {
  return Array.from({ length: 9 }, (_unused, index) => ({ file: `${root}/o-${index}.spec.ts`, tests: 100, testCount: 40 }));
}

export function perfReportJson(root: string, files: readonly Record<string, unknown>[]): string {
  return JSON.stringify({ version: 2, root, transform: 0, wall: 1_000, failed: 0, files });
}
