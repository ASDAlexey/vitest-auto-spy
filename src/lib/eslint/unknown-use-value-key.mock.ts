const TYPES = `
export declare class InjectionToken<T> {
  constructor(description: string);
  protected readonly marker?: T;
}
export class ActivatedRoute {
  queryParams: unknown;
  snapshot: { params: Record<string, string> } = { params: {} };
  #secret = 1;
  private hidden = 2;
  navigate(): void {}
}
export abstract class Storage {
  abstract read(key: string): string | null;
}
export class Box<T> {
  value?: T;
}
export interface Config { apiUrl: string; retries: number }
export interface Legacy { legacyUrl: string }
export const CONFIG = new InjectionToken<Config>('CONFIG');
export const MAYBE = new InjectionToken<Config | null>('MAYBE');
export const EITHER = new InjectionToken<Config | Legacy>('EITHER');
export const BOTH = new InjectionToken<Config & Legacy>('BOTH');
export const FLAG = new InjectionToken<boolean>('FLAG');
export const LOOSE = new InjectionToken<any>('LOOSE');
export const OPAQUE = new InjectionToken<unknown>('OPAQUE');
export const EMPTY = new InjectionToken<object>('EMPTY');
export const MAP = new InjectionToken<Record<string, number>>('MAP');
export const PATTERN = new InjectionToken<{ [key: \`data-\${string}\`]: string; id: string }>('PATTERN');
export const LIST = new InjectionToken<Config[]>('LIST');
export const NAMED = 'NAMED';
`;

const provider = (imported: string, provide: string, value: string, extra = '', before = ''): string =>
  `import { ${imported} } from './types';\n${before}export const providers = [{ provide: ${provide}, useValue: ${value}${extra} }];\n`;

export const FIXTURES: Record<string, string> = {
  'types.ts': TYPES,
  'class-unknown.spec.ts': provider('ActivatedRoute', 'ActivatedRoute', "{ queryParams$: {}, snapshot: { params: { id: '1' } } }"),
  'class-known.spec.ts': provider(
    'ActivatedRoute',
    'ActivatedRoute',
    "{ queryParams: {}, hidden: 3, navigate() {}, 'snapshot': { params: {} } }",
  ),
  'abstract-class.spec.ts': provider('Storage', 'Storage', '{ read: () => null, write: () => undefined }'),
  'generic-class.spec.ts': provider('Box', 'Box', '{ value: 1, size: 2 }'),
  'token-unknown.spec.ts': provider('CONFIG', 'CONFIG', "{ apiUrl: '/api', retry: 3 }"),
  'token-partial.spec.ts': provider('CONFIG', 'CONFIG', "{ apiUrl: '/api' }"),
  'token-wrong-value.spec.ts': provider('CONFIG', 'CONFIG', "{ apiUrl: 42, retries: 'many' }"),
  'nullable.spec.ts': provider('MAYBE', 'MAYBE', "{ apiUrl: '/api', timeout: 1 }"),
  'union.spec.ts': provider('EITHER', 'EITHER', "{ legacyUrl: '/old', apiUrl: '/new', other: 1 }"),
  'intersection.spec.ts': provider('BOTH', 'BOTH', "{ legacyUrl: '/old', apiUrl: '/new', other: 1 }"),
  'spread.spec.ts': provider(
    'CONFIG',
    'CONFIG',
    "{ ...base, ['computed']: 1, bogus: 2 }",
    '',
    'declare const base: Record<string, unknown>;\n',
  ),
  'spread-only.spec.ts': provider('CONFIG', 'CONFIG', '{ ...base }', '', 'declare const base: Record<string, unknown>;\n'),
  'primitive.spec.ts': provider('FLAG', 'FLAG', '{ on: true }'),
  'any.spec.ts': provider('LOOSE', 'LOOSE', '{ anything: 1 }'),
  'unknown.spec.ts': provider('OPAQUE', 'OPAQUE', '{ anything: 1 }'),
  'object.spec.ts': provider('EMPTY', 'EMPTY', '{ anything: 1 }'),
  'index-signature.spec.ts': provider('MAP', 'MAP', '{ anything: 1 }'),
  'pattern-index.spec.ts': provider('PATTERN', 'PATTERN', "{ id: 'a', 'data-x': 'b', other: 'c' }"),
  'array.spec.ts': provider('LIST', 'LIST', '{ anything: 1 }'),
  'string-token.spec.ts': provider('NAMED', 'NAMED', '{ anything: 1 }'),
  'token-class.spec.ts': provider('InjectionToken', 'InjectionToken', '{ anything: 1 }'),
  'not-a-literal.spec.ts': provider('CONFIG', 'CONFIG', 'value', '', 'declare const value: { bogus: number };\n'),
  'multi.spec.ts': provider('CONFIG', 'CONFIG', "{ apiUrl: '/a', bogus: 1 }", ', multi: true'),
  'multi-variable.spec.ts': provider('CONFIG', 'CONFIG', "{ apiUrl: '/a', bogus: 1 }", ', multi: flag', 'declare const flag: boolean;\n'),
  'multi-false.spec.ts': provider('CONFIG', 'CONFIG', "{ apiUrl: '/a', bogus: 1 }", ', multi: false'),
  'other-shapes.spec.ts':
    "import { CONFIG } from './types';\n" +
    'export const factory = { provide: CONFIG, useFactory: () => ({ bogus: 1 }) };\n' +
    'export const bare = { useValue: { bogus: 1 } };\n',
};
