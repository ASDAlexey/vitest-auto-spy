/** The class every fixture reads, with one member of each shape a modifier can be spelled on. */
const CARD = `
export class Card {
  private secret = 1;
  protected shielded = 2;
  public open = 3;

  private hide(): void {}

  constructor(private readonly http: string) {}
}
`;

/** The fixtures, by file name — all written before the first lint, so one program covers them. */
export const FIXTURES: Record<string, string> = {
  'card.ts': CARD,
  'private-field.spec.ts': "import { Card } from './card';\ndeclare const card: Card;\nvoid card['secret'];\n",
  'protected-field.spec.ts': "import { Card } from './card';\ndeclare const card: Card;\nvoid card['shielded'];\n",
  'private-method.spec.ts': "import { Card } from './card';\ndeclare const card: Card;\nvoid card['hide']();\n",
  'parameter-property.spec.ts': "import { Card } from './card';\ndeclare const card: Card;\nvoid card['http'];\n",
  'const-key.spec.ts': "import { Card } from './card';\ndeclare const card: Card;\nconst KEY = 'secret';\nvoid card[KEY];\n",
  'public-member.spec.ts': "import { Card } from './card';\ndeclare const card: Card;\nvoid card['open'];\n",
  'dynamic-key.spec.ts': "import { Card } from './card';\ndeclare const card: Card;\ndeclare const key: string;\nvoid card[key];\n",
  'index-signatures.spec.ts':
    'declare const env: Record<string, string>;\n' +
    'declare const params: { [key: string]: unknown };\n' +
    "void env['APP_FEATURE_ENABLED'];\n" +
    "void params['isCheckoutModalOpen'];\n",
  'indexed-access-type.spec.ts': "import { Card } from './card';\ntype Open = Card['open'];\ndeclare const open: Open;\nvoid open;\n",
  'library-declaration.spec.ts': "declare const when: Date;\nvoid when['getTime']();\n",
  'cast-any.spec.ts': "import { Card } from './card';\ndeclare const card: Card;\nvoid (card as any).secret;\n",
  'cast-double.spec.ts': "import { Card } from './card';\ndeclare const card: Card;\nvoid (card as unknown as { hide(): void }).hide();\n",
  'cast-decoy.spec.ts':
    "import { Card } from './card';\n" +
    'interface OpenCard {\n  shielded: number;\n}\n' +
    'declare const card: Card;\n' +
    'void (card as unknown as OpenCard).shielded;\n',
  'cast-angle.spec.ts': "import { Card } from './card';\ndeclare const card: Card;\nvoid (<any>card).secret;\n",
  'cast-bracket.spec.ts': "import { Card } from './card';\ndeclare const card: Card;\nvoid (card as any)['secret'];\n",
  'cast-public.spec.ts':
    "import { Card } from './card';\ndeclare const card: Card;\nvoid (card as any).open;\nvoid (card as any).nothingLikeThat;\n",
  'dotted-no-cast.spec.ts': "import { Card } from './card';\ndeclare const card: Card;\nvoid card.open;\n",
  'prototype-spy.spec.ts':
    "import { Card } from './card';\n" +
    'declare const vi: { spyOn(target: object, key: string): void };\n' +
    'declare const card: Card;\n' +
    "vi.spyOn(Object.getPrototypeOf(card), 'hide');\n",
  'single-run.spec.ts': "import { Card } from './card';\ndeclare const card: Card;\nvoid card['secret'];\n",
  'ordinary-spy.spec.ts':
    "import { Card } from './card';\n" +
    'declare const vi: { spyOn(target: object, key: string): void };\n' +
    'declare const card: Card;\n' +
    'declare function makeCard(): Card;\n' +
    "vi.spyOn(card, 'open');\n" +
    "vi.spyOn(makeCard(), 'open');\n" +
    'Object.getPrototypeOf(card);\n' +
    'vi.spyOn();\n',
};
