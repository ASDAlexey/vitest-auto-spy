/**
 * The import block: what the codemod reads out of it and what it writes back.
 *
 * The placement cases are the ones that decide whether a migrated suite lints. A `vitest` type
 * import that lands under `./service`, or on the far side of the blank line between the groups,
 * turns every spec in the repository into an `import/order` error — which is worth more test cases
 * than it looks like from the outside.
 */
import { describe, expect, it } from 'vitest';

import { applyImportPlan, boundNames, listImports, referencedOutsideImports } from './imports';

const MOCK: [{ specifier: string; name: string; typeOnly: boolean }] = [{ specifier: 'vitest', name: 'Mock', typeOnly: true }];

describe('listImports', () => {
  it('reads the specifier, the type modifier and the braces', () => {
    const source = ["import type { Spy } from 'vitest-auto-spy';", 'import Default from "./a";', "import 'side-effect';"].join('\n');
    const statements = listImports(source);

    expect(statements.map((statement) => statement.specifier)).toEqual(['vitest-auto-spy', './a', 'side-effect']);
    expect(statements[0]?.typeOnly).toBe(true);
    expect(statements[1]?.braces).toBeUndefined();
    expect(source.slice(statements[0]?.start ?? 0, statements[0]?.end ?? 0)).toBe("import type { Spy } from 'vitest-auto-spy';");
  });

  it('ignores a dynamic import and a line with no specifier', () => {
    expect(listImports('import("./a");')).toEqual([]);
    expect(listImports('import { a } from ;')).toEqual([]);
  });

  it('does not need a semicolon', () => {
    expect(listImports("import { a } from 'x'\n")[0]?.end).toBe(21);
  });
});

describe('boundNames', () => {
  it('reads the local name of each specifier', () => {
    const source = 'import { a, b as c, type D } from "x";';
    const braces = listImports(source)[0]?.braces ?? [0, 0];

    expect(boundNames(source, braces)).toEqual(['a', 'c', 'D']);
  });

  it('does not read the words of a line comment as names nobody imported', () => {
    const source = 'import {\n  a,\n  b, // the typed double\n} from "x";';
    const braces = listImports(source)[0]?.braces ?? [0, 0];

    expect(boundNames(source, braces)).toEqual(['a', 'b']);
  });
});

describe('applyImportPlan', () => {
  it('adds a type import at the end of the third-party group, not under the relative one', () => {
    const source = ["import { TestBed } from '@angular/core/testing';", '', "import { Service } from './service';", ''].join('\n');

    expect(applyImportPlan(source, MOCK, [])).toBe(
      [
        "import { TestBed } from '@angular/core/testing';",
        "import type { Mock } from 'vitest';",
        '',
        "import { Service } from './service';",
        '',
      ].join('\n'),
    );
  });

  it('keeps a blank line when the file has only relative imports, and inserts at the top of an empty file', () => {
    expect(applyImportPlan("import { S } from './s';\n", MOCK, [])).toBe(
      "import type { Mock } from 'vitest';\n\nimport { S } from './s';\n",
    );
    expect(applyImportPlan('const a = 1;\n', MOCK, [])).toBe("import type { Mock } from 'vitest';\nconst a = 1;\n");
  });

  it('merges into an existing statement instead of writing a second one', () => {
    expect(applyImportPlan("import { it } from 'vitest';\n", MOCK, [])).toBe("import { it, type Mock } from 'vitest';\n");
    expect(applyImportPlan("import type { Mocked } from 'vitest';\n", MOCK, [])).toBe("import type { Mocked, Mock } from 'vitest';\n");
    expect(applyImportPlan("import {} from 'vitest';\n", MOCK, [])).toBe("import { type Mock } from 'vitest';\n");
    expect(applyImportPlan("import { it, } from 'vitest';\n", MOCK, [])).toBe("import { it, type Mock } from 'vitest';\n");
  });

  it('writes its own statement when the only one there is type-only and the need is a value', () => {
    const need = [{ specifier: 'vitest', name: 'vi', typeOnly: false }];

    expect(applyImportPlan("import type { Mocked } from 'vitest';\n", need, [])).toBe(
      "import type { Mocked } from 'vitest';\nimport { vi } from 'vitest';\n",
    );
  });

  it('never imports a name the file already binds, and never twice', () => {
    expect(applyImportPlan("import type { Mock } from 'vitest';\n", MOCK, [])).toBe("import type { Mock } from 'vitest';\n");
    expect(applyImportPlan('const a = 1;\n', [...MOCK, ...MOCK], [])).toBe("import type { Mock } from 'vitest';\nconst a = 1;\n");
  });

  it('drops a name the rewrite orphaned, and the whole statement when nothing is left', () => {
    expect(applyImportPlan("import { asSpy, Spy } from 'x';\nasSpy(1);\n", [], ['Spy'])).toBe("import { asSpy } from 'x';\nasSpy(1);\n");
    expect(applyImportPlan("import { Spy } from 'x';\nconst a = 1;\n", [], ['Spy'])).toBe('const a = 1;\n');
  });

  it('inserts before a line comment on the last specifier, not inside it', () => {
    const source = "import {\n  createSpyFromClass,\n  provideAutoSpy, // registers the adapter\n} from 'vitest-auto-spy';\n";
    const need = [{ specifier: 'vitest-auto-spy', name: 'asSpy', typeOnly: false }];

    expect(applyImportPlan(source, need, [])).toBe(
      "import {\n  createSpyFromClass,\n  provideAutoSpy, asSpy // registers the adapter\n} from 'vitest-auto-spy';\n",
    );
  });

  it('drops one specifier as it was written, keeping its alias and taking its own comment', () => {
    const aliased = "import { a as b, Spy } from 'x';\nb();\n";

    expect(applyImportPlan(aliased, [], ['Spy'])).toBe("import { a as b } from 'x';\nb();\n");

    const commented = "import {\n  createSpyFromClass,\n  Spy, // the typed double\n} from 'x';\ncreateSpyFromClass(1);\n";

    expect(applyImportPlan(commented, [], ['Spy'])).toBe("import {\n  createSpyFromClass,\n} from 'x';\ncreateSpyFromClass(1);\n");
  });

  it('drops the first of several specifiers without taking the ones after it', () => {
    const source = "import { Spy, asSpy } from 'x';\nasSpy(1);\n";

    expect(applyImportPlan(source, [], ['Spy'])).toBe("import { asSpy } from 'x';\nasSpy(1);\n");
  });

  it('adds a statement on its own line, whatever ends the one above it', () => {
    const trailing = "import { TestBed } from '@angular/core/testing';// keep\nconst a = 1;\n";

    expect(applyImportPlan(trailing, MOCK, [])).toBe(
      "import { TestBed } from '@angular/core/testing';// keep\nimport type { Mock } from 'vitest';\nconst a = 1;\n",
    );
    expect(applyImportPlan("import { TestBed } from 'x';", MOCK, [])).toBe(
      "import { TestBed } from 'x';\nimport type { Mock } from 'vitest';\n",
    );
  });

  it('writes the line ending the file already uses', () => {
    expect(applyImportPlan('import { TestBed } from "x";\r\nconst a = 1;\r\n', MOCK, [])).toBe(
      'import { TestBed } from "x";\r\nimport type { Mock } from \'vitest\';\r\nconst a = 1;\r\n',
    );
    expect(applyImportPlan('import { S } from "./s";\r\n', MOCK, [])).toBe(
      'import type { Mock } from \'vitest\';\r\n\r\nimport { S } from "./s";\r\n',
    );
  });

  it('finds the first import of a file that starts with a byte-order mark', () => {
    const source = '﻿import { S } from "./s";\n';

    expect(listImports(source)).toHaveLength(1);
    expect(applyImportPlan(source, MOCK, [])).toBe('﻿import type { Mock } from \'vitest\';\n\nimport { S } from "./s";\n');
  });

  it('looks past an import with no braces when it drops a name', () => {
    const source = "import 'vitest-auto-spy/rxjs';\nimport { Spy } from 'x';\nconst a = 1;\n";

    expect(applyImportPlan(source, [], ['Spy'])).toBe("import 'vitest-auto-spy/rxjs';\nconst a = 1;\n");
  });

  it('keeps a name that is still referenced, and ignores one nothing imports', () => {
    const source = "import { Spy } from 'x';\nlet a: Spy<number>;\n";

    expect(applyImportPlan(source, [], ['Spy'])).toBe(source);
    expect(applyImportPlan(source, [], ['Absent'])).toBe(source);
  });
});

describe('referencedOutsideImports', () => {
  it('does not count the import statement itself, or a mention inside a string', () => {
    const source = "import { Spy } from 'x';\nconst note = 'Spy';\n";

    expect(referencedOutsideImports(source, listImports(source), 'Spy')).toBe(false);
    expect(referencedOutsideImports('let a: Spy;', [], 'Spy')).toBe(true);
  });
});
