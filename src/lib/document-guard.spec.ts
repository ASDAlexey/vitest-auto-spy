/**
 * The detection is driven directly against a throwaway document, because a guard wired into the run
 * fails the very test asserting on it. The wired-in blocks at the end run at `'warn'` and read what
 * the previous test left, which is the only way to watch the repair happen between two tests.
 */
import { Component, DOCUMENT, DestroyRef, Renderer2, effect, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  type DocumentSnapshot,
  checkDocumentPollution,
  fileScope,
  guardDocumentPollution,
  resolveDocumentPollution,
  snapshotDocument,
  testScope,
} from './document-guard';
import { mockValueProp } from './prop-mock';
import { setupAutoSpy } from './setup-auto-spy';

const THROW = resolveDocumentPollution('throw');
const WITH_NODES = resolveDocumentPollution({ nodes: true });

function freshDocument(): Document {
  return document.implementation.createHTMLDocument('guarded');
}

function failureOf(snapshot: DocumentSnapshot, scope = 'the test'): string {
  try {
    checkDocumentPollution(snapshot, scope);
  } catch (error) {
    return String(error);
  }

  return '';
}

describe('resolveDocumentPollution', () => {
  it('is off unless a reaction is named, and throws once the object form is used', () => {
    expect(resolveDocumentPollution(undefined)).toEqual({ reaction: 'off', nodes: false, ignoreAttributes: [], ignoreNodes: undefined });
    expect(resolveDocumentPollution({ ignoreNodes: 'style' })).toEqual({
      reaction: 'throw',
      nodes: false,
      ignoreAttributes: [],
      ignoreNodes: 'style',
    });
  });
});

describe('checkDocumentPollution — attributes', () => {
  it('names an attribute added to <body>, and takes it back off', () => {
    const doc = freshDocument();
    const snapshot = snapshotDocument(THROW, doc);

    doc.body.setAttribute('data-reset-focus', '');

    const message = failureOf(snapshot, '"keyboard > renders" (keyboard.component.spec.ts)');

    expect(message).toContain('"keyboard > renders" (keyboard.component.spec.ts) left the shared document changed:');
    expect(message).toContain('  - <body> data-reset-focus="" added');
    expect(message).toMatch(/DestroyRef\.onDestroy[\s\S]*Docs: https:\/\/asdalexey\.github\.io\/vitest-auto-spy\/utilities\/setup/);
    expect(doc.body.hasAttribute('data-reset-focus')).toBe(false);
  });

  it('names an attribute changed on <html>, with both values, and puts the old one back', () => {
    const doc = freshDocument();

    doc.documentElement.setAttribute('class', 'light');

    const snapshot = snapshotDocument(THROW, doc);

    doc.documentElement.setAttribute('class', 'light cdk-global-scrollblock');

    expect(failureOf(snapshot)).toContain('<html> class changed from "light" to "light cdk-global-scrollblock"');
    expect(doc.documentElement.getAttribute('class')).toBe('light');
  });

  it('names an attribute removed from <body> and <html>, and sets it again', () => {
    const doc = freshDocument();

    doc.body.setAttribute('data-theme', 'dark');
    doc.documentElement.setAttribute('lang', 'en');

    const snapshot = snapshotDocument(THROW, doc);

    doc.body.removeAttribute('data-theme');
    doc.documentElement.removeAttribute('lang');

    const message = failureOf(snapshot);

    expect(message).toContain('<body> data-theme removed (was "dark")');
    expect(message).toContain('<html> lang removed (was "en")');
    expect(doc.body.getAttribute('data-theme')).toBe('dark');
    expect(doc.documentElement.getAttribute('lang')).toBe('en');
  });

  it('shortens a long value in the report and still restores all of it', () => {
    const doc = freshDocument();
    const long = 'x'.repeat(200);

    doc.body.setAttribute('style', long);

    const snapshot = snapshotDocument(THROW, doc);

    doc.body.removeAttribute('style');

    expect(failureOf(snapshot)).toContain(`removed (was "${'x'.repeat(80)}…")`);
    expect(doc.body.getAttribute('style')).toBe(long);
  });

  it('says nothing about a document the test changed and changed back', () => {
    const doc = freshDocument();
    const snapshot = snapshotDocument(THROW, doc);

    doc.body.setAttribute('data-visited', '');
    doc.body.removeAttribute('data-visited');

    expect(() => checkDocumentPollution(snapshot, 'the test')).not.toThrow();
  });

  it('reads an empty class or style left by add-then-remove as the absent attribute, and does not touch it', () => {
    const doc = freshDocument();
    const snapshot = snapshotDocument(THROW, doc);

    doc.body.classList.add('scroll-hidden');
    doc.body.classList.remove('scroll-hidden');
    doc.documentElement.setAttribute('style', 'overflow: hidden');
    doc.documentElement.setAttribute('style', '');

    expect(doc.body.getAttribute('class')).toBe('');
    expect(doc.documentElement.getAttribute('style')).toBe('');
    expect(() => checkDocumentPollution(snapshot, 'the test')).not.toThrow();
    expect(doc.body.getAttribute('class')).toBe('');
    expect(doc.documentElement.getAttribute('style')).toBe('');
  });

  it('reads an empty class or style that went away as no change either', () => {
    const doc = freshDocument();

    doc.body.setAttribute('class', '');
    doc.body.setAttribute('style', '');

    const snapshot = snapshotDocument(THROW, doc);

    doc.body.removeAttribute('class');
    doc.body.removeAttribute('style');

    expect(() => checkDocumentPollution(snapshot, 'the test')).not.toThrow();
    expect(doc.body.hasAttribute('class')).toBe(false);
    expect(doc.body.hasAttribute('style')).toBe(false);
  });

  it('still names a class that kept a value, and any other attribute left empty', () => {
    const doc = freshDocument();
    const snapshot = snapshotDocument(THROW, doc);

    doc.body.classList.add('platform-tv');
    doc.body.setAttribute('data-reset-focus', '');

    const message = failureOf(snapshot);

    expect(message).toContain('<body> class="platform-tv" added');
    expect(message).toContain('<body> data-reset-focus="" added');
  });

  it('reports a leftover once: the repair makes the next check clean', () => {
    const doc = freshDocument();
    const snapshot = snapshotDocument(THROW, doc);

    doc.body.setAttribute('data-visited', '');

    expect(() => checkDocumentPollution(snapshot, 'the test')).toThrow(/data-visited/);
    expect(() => checkDocumentPollution(snapshot, 'the next test')).not.toThrow();
  });

  it('leaves the attributes a project names alone, by name or by pattern', () => {
    const doc = freshDocument();
    const snapshot = snapshotDocument(resolveDocumentPollution({ ignoreAttributes: ['aria-hidden', /^data-cdk-/] }), doc);

    doc.body.setAttribute('aria-hidden', 'true');
    doc.body.setAttribute('data-cdk-focus', '');

    expect(() => checkDocumentPollution(snapshot, 'the test')).not.toThrow();
    expect(doc.body.getAttribute('aria-hidden')).toBe('true');
  });

  it('prints and repairs without failing when asked to warn', () => {
    const doc = freshDocument();
    const write = vi.fn<(message: string) => void>();
    const snapshot = snapshotDocument(resolveDocumentPollution('warn'), doc);

    doc.body.setAttribute('data-visited', '');
    checkDocumentPollution(snapshot, 'the test', write);

    expect(write).toHaveBeenCalledWith(expect.stringContaining('<body> data-visited="" added'));
    expect(doc.body.hasAttribute('data-visited')).toBe(false);
  });

  it('writes a warning to stderr by default', () => {
    const doc = freshDocument();
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const snapshot = snapshotDocument(resolveDocumentPollution('warn'), doc);

    doc.body.setAttribute('data-visited', '');
    checkDocumentPollution(snapshot, 'the test');

    expect(write).toHaveBeenCalledWith(expect.stringContaining('data-visited'));

    write.mockRestore();
  });
});

describe('checkDocumentPollution — nodes', () => {
  it('ignores children unless nodes are watched', () => {
    const doc = freshDocument();
    const snapshot = snapshotDocument(THROW, doc);

    doc.body.append(doc.createElement('div'));

    expect(() => checkDocumentPollution(snapshot, 'the test')).not.toThrow();
  });

  it('names a child left in <body> and <head>, and takes it out', () => {
    const doc = freshDocument();
    const snapshot = snapshotDocument(WITH_NODES, doc);
    const overlay = doc.createElement('div');
    const title = doc.createElement('meta');

    overlay.id = 'overlay';
    overlay.className = 'cdk-overlay-container';
    doc.body.append(overlay);
    doc.head.append(title);

    const message = failureOf(snapshot);

    expect(message).toContain('<body> child <div id="overlay" class="cdk-overlay-container"> added');
    expect(message).toContain('<head> child <meta> added');
    expect(overlay.isConnected).toBe(false);
    expect(title.isConnected).toBe(false);
  });

  it('puts a removed child back in its place', () => {
    const doc = freshDocument();
    doc.body.innerHTML = '<section id="a"></section><section id="b"></section><section id="c"></section>';

    const snapshot = snapshotDocument(WITH_NODES, doc);

    doc.getElementById('b')?.remove();
    doc.getElementById('c')?.remove();

    expect(failureOf(snapshot)).toContain('<body> child <section id="b"> removed');
    expect([...doc.body.children].map((child) => child.id)).toEqual(['a', 'b', 'c']);
  });

  it('leaves the children a project names alone', () => {
    const doc = freshDocument();
    const snapshot = snapshotDocument(resolveDocumentPollution({ nodes: true, ignoreNodes: 'style, link[rel=stylesheet]' }), doc);

    doc.head.append(doc.createElement('style'));

    expect(() => checkDocumentPollution(snapshot, 'the test')).not.toThrow();
    expect(doc.head.querySelectorAll('style')).toHaveLength(1);
  });
});

describe('snapshotDocument', () => {
  it('watches nothing where there is no document', () => {
    expect(snapshotDocument(THROW, null).watched).toEqual([]);
  });

  it('watches only the elements a document has', () => {
    const svg = new DOMParser().parseFromString('<svg xmlns="http://www.w3.org/2000/svg"/>', 'image/svg+xml');

    expect(snapshotDocument(THROW, svg).watched.map(({ label }) => label)).toEqual(['<html>']);
  });

  it('reads the running document by default', () => {
    expect(snapshotDocument(THROW).watched.map(({ element }) => element)).toEqual([document.documentElement, document.head, document.body]);
  });
});

describe('guardDocumentPollution', () => {
  it('names "this test" and "this file" when the runner reports neither', () => {
    const state = expect.getState();
    const restore = mockValueProp(expect, 'getState', () => ({ ...state, currentTestName: undefined, testPath: undefined }));
    const scopes = [testScope(), fileScope()];

    restore();

    expect(scopes).toEqual(['"this test" (this file)', 'this file, outside any test (a beforeAll or afterAll),']);
  });

  it('registers nothing when it is off', () => {
    expect(() => guardDocumentPollution('off')).not.toThrow();
  });
});

describe('guardDocumentPollution, wired into the run', () => {
  const warnings: string[] = [];

  beforeAll(() => {
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
      warnings.push(String(chunk));

      return true;
    });
  });

  afterAll(() => {
    vi.mocked(process.stderr.write).mockRestore();
  });

  describe('a leak inside a test', () => {
    guardDocumentPollution({ reaction: 'warn', nodes: true });

    it('lets a test that leaves the document alone through', () => {
      expect(document.body.attributes).toHaveLength(0);
    });

    it('leaves an attribute behind', () => {
      document.body.setAttribute('data-reset-focus', '');
    });

    it('starts from the document the previous test found, and the report names that test', () => {
      expect(document.body.hasAttribute('data-reset-focus')).toBe(false);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('"guardDocumentPollution, wired into the run > a leak inside a test > leaves an attribute behind"');
      expect(warnings[0]).toContain('document-guard.spec.ts');
      warnings.length = 0;
    });
  });

  describe('a leak in a beforeAll', () => {
    guardDocumentPollution('warn');

    beforeAll(() => {
      document.documentElement.setAttribute('data-suite', 'on');
    });

    it('is not charged to a test, which never made it', () => {
      expect(document.documentElement.getAttribute('data-suite')).toBe('on');
    });
  });

  describe('after the block that leaked in its beforeAll', () => {
    it('finds the document put back and the file named', () => {
      expect(document.documentElement.hasAttribute('data-suite')).toBe(false);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatch(
        /document-guard\.spec\.ts, outside any test \(a beforeAll or afterAll\), left the shared document changed/,
      );
      expect(warnings[0]).toContain('<html> data-suite="on" added');
      warnings.length = 0;
    });
  });
});

@Component({ selector: 'app-focus-reset', template: '<p>keyboard</p>', styles: ['p { color: red; }'] })
class OwnedAttributeComponent {
  constructor() {
    const doc = inject(DOCUMENT);
    const renderer = inject(Renderer2);

    renderer.setAttribute(doc.body, 'data-owned', '');
    inject(DestroyRef).onDestroy(() => renderer.removeAttribute(doc.body, 'data-owned'));
  }
}

@Component({ selector: 'app-keyboard', template: '<p>keyboard</p>' })
class LeakingComponent {
  constructor() {
    const doc = inject(DOCUMENT);
    const renderer = inject(Renderer2);

    effect(() => renderer.setAttribute(doc.body, 'data-reset-focus', ''));
  }
}

describe('documentPollution under a TestBed', () => {
  const warnings: string[] = [];

  beforeAll(() => {
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
      warnings.push(String(chunk));

      return true;
    });
  });

  afterAll(() => {
    vi.mocked(process.stderr.write).mockRestore();
  });

  describe('with setupAutoSpy', () => {
    // Registered inside the block, so its hooks run before the TestBed's own teardown — the order a
    // consumer's setup file gets as well, and the one an `afterEach` check would misreport.
    setupAutoSpy({ duplicateCopies: 'off', documentPollution: { reaction: 'warn', nodes: true } });

    it('renders a component that cleans up what it set on <body>', async () => {
      const fixture = TestBed.createComponent(OwnedAttributeComponent);

      await fixture.whenStable();

      expect(document.body.hasAttribute('data-owned')).toBe(true);
      expect(document.head.querySelector('style')).not.toBeNull();
    });

    it('reported nothing: the style, the root element and the attribute went with the fixture', () => {
      expect(warnings).toEqual([]);
    });

    it('renders a component whose effect leaves an attribute on <body>', async () => {
      const fixture = TestBed.createComponent(LeakingComponent);

      await fixture.whenStable();

      expect(document.body.hasAttribute('data-reset-focus')).toBe(true);
    });

    it('reported that test by name and took the attribute off', () => {
      expect(document.body.hasAttribute('data-reset-focus')).toBe(false);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('renders a component whose effect leaves an attribute on <body>');
      expect(warnings[0]).toContain('<body> data-reset-focus="" added');
    });
  });
});
