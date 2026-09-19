/**
 * The TestBed half of the document guard: a component rendering through a real fixture is the one
 * author of document changes the direct checks in `document-guard.spec.ts` cannot produce. Kept in
 * its own file so the detection itself runs without the Angular testing module graph behind it.
 */
import { Component, DOCUMENT, DestroyRef, Renderer2, effect, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { setupAutoSpy } from './setup-auto-spy';

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
