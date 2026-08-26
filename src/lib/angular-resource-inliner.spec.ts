/**
 * The resource rewrite that lets Angular's JIT compiler build a component under a runtime with no
 * build step. Two things are load-bearing and get most of the attention here: a `templateUrl`
 * written in prose (a comment, a string) must be left alone, and the rewrite must not move any
 * line — a spec's stack trace still has to point at the component's own source.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { inlineAngularResources } from './angular-resource-inliner';

const MODULE_PATH = '/project/src/app/greeting.component.ts';

/** A reader over a `{ filename: contents }` map, standing in for the file system. */
function readerFor(files: Record<string, string>): (path: string) => string {
  return (path: string): string => {
    const contents = files[path];

    if (contents === undefined) {
      throw new Error(`ENOENT: ${path}`);
    }

    return contents;
  };
}

describe('inlineAngularResources', () => {
  it('leaves a file that declares no external resource alone', () => {
    expect(inlineAngularResources(`@Component({ template: '<b></b>' })`, MODULE_PATH)).toBeUndefined();
  });

  it('inlines an external template', () => {
    const source = `@Component({ templateUrl: './greeting.component.html' })`;
    const readResource = readerFor({ '/project/src/app/greeting.component.html': '<span>Hi</span>' });

    expect(inlineAngularResources(source, MODULE_PATH, { readResource })).toBe(`@Component({ template: "<span>Hi</span>" })`);
  });

  it('inlines a stylesheet list, dropping what a test runner cannot compile', () => {
    const source = `@Component({ styleUrls: ['./a.css', './b.scss'] })`;
    const readResource = readerFor({ '/project/src/app/a.css': '.a{}' });

    expect(inlineAngularResources(source, MODULE_PATH, { readResource })).toBe(`@Component({ styles: [".a{}", ""] })`);
  });

  it('inlines the singular styleUrl', () => {
    const source = `@Component({ styleUrl: './a.css' })`;
    const readResource = readerFor({ '/project/src/app/a.css': '.a{}' });

    expect(inlineAngularResources(source, MODULE_PATH, { readResource })).toBe(`@Component({ styles: [".a{}"] })`);
  });

  it('honours a custom list of inlinable style extensions', () => {
    const source = `@Component({ styleUrl: './a.scss' })`;
    const readResource = readerFor({ '/project/src/app/a.scss': '.a{color:red}' });

    expect(inlineAngularResources(source, MODULE_PATH, { readResource, inlineStyleExtensions: ['.scss'] })).toBe(
      `@Component({ styles: [".a{color:red}"] })`,
    );
  });

  it('rewrites both halves of a declaration in one pass', () => {
    const source = [`@Component({`, `  templateUrl: './greeting.component.html',`, `  styleUrls: ['./a.css'],`, `})`].join('\n');
    const readResource = readerFor({
      '/project/src/app/greeting.component.html': '<span>Hi</span>',
      '/project/src/app/a.css': '.a{}',
    });
    const rewritten = inlineAngularResources(source, MODULE_PATH, { readResource });

    expect(rewritten).toContain(`template: "<span>Hi</span>"`);
    expect(rewritten).toContain(`styles: [".a{}"]`);
  });

  it('keeps the line count so stack traces stay accurate', () => {
    const source = [`// header`, `@Component({ templateUrl: './greeting.component.html' })`, `class X {}`].join('\n');
    const readResource = readerFor({ '/project/src/app/greeting.component.html': '<span>\nmultiline\n</span>' });
    const rewritten = inlineAngularResources(source, MODULE_PATH, { readResource });

    expect(rewritten?.split('\n')).toHaveLength(source.split('\n').length);
  });
});

describe('inlineAngularResources — what counts as code', () => {
  const throwingReader = (path: string): string => {
    throw new Error(`must not read ${path}`);
  };

  it('ignores a declaration inside a line comment, including one that ends the file', () => {
    expect(inlineAngularResources(`// templateUrl: './x.html'\n`, MODULE_PATH, { readResource: throwingReader })).toBeUndefined();
    expect(inlineAngularResources(`// templateUrl: './x.html'`, MODULE_PATH, { readResource: throwingReader })).toBeUndefined();
  });

  it('ignores a singular styleUrl written in prose', () => {
    expect(inlineAngularResources(`// styleUrl: './x.css'\n`, MODULE_PATH, { readResource: throwingReader })).toBeUndefined();
  });

  it('ignores a declaration inside a block comment, terminated or not', () => {
    expect(inlineAngularResources(`/* templateUrl: './x.html' */`, MODULE_PATH, { readResource: throwingReader })).toBeUndefined();
    expect(inlineAngularResources(`/* styleUrls: ['./x.css']`, MODULE_PATH, { readResource: throwingReader })).toBeUndefined();
  });

  it('ignores a declaration inside a string literal, escapes and all', () => {
    expect(inlineAngularResources(`const doc = "templateUrl: './x.html'";`, MODULE_PATH, { readResource: throwingReader })).toBeUndefined();
    expect(
      inlineAngularResources(`const doc = 'a\\' templateUrl: "./x.html"';`, MODULE_PATH, { readResource: throwingReader }),
    ).toBeUndefined();
    expect(
      inlineAngularResources(`const doc = 'unterminated templateUrl: "./x.html"`, MODULE_PATH, { readResource: throwingReader }),
    ).toBeUndefined();
  });

  it('is not fooled by a comment marker inside a string', () => {
    const source = `const url = 'http://example.com';\n@Component({ templateUrl: './greeting.component.html' })`;
    const readResource = readerFor({ '/project/src/app/greeting.component.html': '<b/>' });

    expect(inlineAngularResources(source, MODULE_PATH, { readResource })).toContain(`template: "<b/>"`);
  });
});

describe('inlineAngularResources — reading', () => {
  const directory = mkdtempSync(join(tmpdir(), 'vitest-auto-spy-inliner-'));

  afterAll(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it('reads from disk when no reader is injected', () => {
    writeFileSync(join(directory, 'real.html'), '<i>from disk</i>');

    const source = `@Component({ templateUrl: './real.html' })`;

    expect(inlineAngularResources(source, join(directory, 'real.component.ts'))).toBe(`@Component({ template: "<i>from disk</i>" })`);
  });

  it('names the file and the referencing module when a resource is missing', () => {
    const source = `@Component({ templateUrl: './missing.html' })`;

    expect(() => inlineAngularResources(source, MODULE_PATH, { readResource: readerFor({}) })).toThrow(
      /cannot read "\.\/missing\.html" referenced by .*greeting\.component\.ts/,
    );
  });
});
