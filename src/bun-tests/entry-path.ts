import pkg from '../../package.json';

export const fromDist = process.env['npm_lifecycle_event'] === 'test:bun:preload';

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

export function entryPath(subpath: string): string {
  const exportMap: Readonly<Record<string, unknown>> = pkg.exports;
  const target = exportMap[subpath];
  const conditions = isRecord(target) ? target['import'] : undefined;
  const file = isRecord(conditions) ? conditions['default'] : conditions;

  if (typeof file !== 'string') {
    throw new TypeError(`No import target for ${subpath}`);
  }

  return fromDist ? `../../${file.slice(2)}` : `../${file.slice('./dist/'.length).replace(/\.js$/, '.ts')}`;
}
