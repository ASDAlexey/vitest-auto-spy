/**
 * `provideAutoSpy` refuses a declaration, and `injectSpy` names the two-copies cause behind Angular's
 * "never initialized" and "reading 'ngModule'" failures instead of passing them on bare.
 */
import { Component, Directive, Injectable, InjectionToken } from '@angular/core';
import { TestBed, getTestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { injectSpy, provideAutoSpy } from './angular';
import { explainTestBedSplit, noteTestBed } from './angular-testbed-split';

@Component({ selector: 'app-panel', template: '' })
class PanelComponent {}

@Directive({ selector: '[appTooltip]' })
class TooltipDirective {}

class DerivedPanelComponent extends PanelComponent {}

@Injectable()
class ReportService {
  load(): string {
    return 'real';
  }
}

const REPORT = new InjectionToken<ReportService>('REPORT');
const UNNAMED = new InjectionToken<ReportService>('');

const NEVER_INITIALIZED = 'Need to call TestBed.initTestEnvironment() first';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('provideAutoSpy on a declaration', () => {
  it('refuses a component, pointing at a stand-in', () => {
    expect(() => provideAutoSpy(PanelComponent)).toThrow(
      /provideAutoSpy\(PanelComponent\): PanelComponent is a component[\s\S]*createComponentStub/,
    );
  });

  it('refuses a directive', () => {
    expect(() => provideAutoSpy(TooltipDirective)).toThrow('provideAutoSpy(TooltipDirective): TooltipDirective is a directive');
  });

  it('leaves an undecorated subclass alone, whose definition is only inherited', () => {
    expect(provideAutoSpy(DerivedPanelComponent).provide).toBe(DerivedPanelComponent);
  });

  it('still provides a service', () => {
    expect(provideAutoSpy(ReportService).provide).toBe(ReportService);
  });
});

describe('injectSpy with two copies of @angular/core/testing', () => {
  const testBedsBefore = globalThis.__vitestAutoSpyTestBeds__;

  // An earlier file's vi.resetModules() would turn the answer into the module-reset one.
  beforeEach(() => {
    globalThis.__vitestAutoSpyTestBeds__ = undefined;
  });

  afterEach(() => {
    globalThis.__vitestAutoSpyTestBeds__ = testBedsBefore;
  });

  it('names server.deps.inline when the TestBed it reaches was never initialized', () => {
    vi.spyOn(TestBed, 'inject').mockImplementation(() => {
      throw new Error(NEVER_INITIALIZED);
    });

    expect(() => injectSpy(ReportService)).toThrow(
      /injectSpy\(ReportService\): Angular answered "Need to call[\s\S]*two copies of @angular\/core\/testing[\s\S]*inline: \['vitest-auto-spy'\]/,
    );
  });

  it('names the token by its description, or by what it prints without one', () => {
    vi.spyOn(TestBed, 'inject').mockImplementation(() => {
      throw new TypeError("Cannot read properties of null (reading 'ngModule')");
    });

    // eslint-disable-next-line vitest-auto-spy/no-unregistered-inject-spy -- TestBed.inject is stubbed to fail, so what the token was registered as never matters here
    expect(() => injectSpy(REPORT)).toThrow(`injectSpy(REPORT): Angular answered "Cannot read properties of null (reading 'ngModule')"`);
    // eslint-disable-next-line vitest-auto-spy/no-unregistered-inject-spy -- TestBed.inject is stubbed to fail, so what the token was registered as never matters here
    expect(() => injectSpy(UNNAMED)).toThrow(`injectSpy(${String(UNNAMED)}):`);
  });

  it('passes any other failure through untouched', () => {
    expect(() => injectSpy(ReportService)).toThrow(/No provider/);
  });
});

describe('explainTestBedSplit', () => {
  const testBedsBefore = globalThis.__vitestAutoSpyTestBeds__;

  afterEach(() => {
    globalThis.__vitestAutoSpyTestBeds__ = testBedsBefore;
  });

  it('names the module reset, not two copies, once a second @angular/core/testing was evaluated in the worker', () => {
    globalThis.__vitestAutoSpyTestBeds__ = undefined;
    noteTestBed({});

    const message = explainTestBedSplit(new TypeError("Cannot read properties of null (reading 'ngModule')"), 'injectSpy(X)')?.message;

    expect(message).toMatch(
      /injectSpy\(X\): Angular answered "Cannot read[\s\S]*evaluated again in this worker[\s\S]*vi\.resetModules\(\)[\s\S]*getTestBed\(\)\.platform is null/,
    );
    expect(message).not.toContain('two copies');
    expect(message).toMatch(/Docs: \S+#two-copies-of-angular-core-testing$/);
  });

  it('keeps the two-copies reading while this package has met a single TestBed', () => {
    globalThis.__vitestAutoSpyTestBeds__ = undefined;

    const message = explainTestBedSplit(new Error(NEVER_INITIALIZED), 'injectSpy(X)', getTestBed())?.message;

    expect(message).toContain('two copies of @angular/core/testing');
    expect(message).not.toContain('evaluated again');
  });

  it('keeps the original failure as the cause', () => {
    const original = new Error(NEVER_INITIALIZED);

    expect(explainTestBedSplit(original, 'call()')?.cause).toBe(original);
  });

  it('recognizes only the two symptoms', () => {
    expect(explainTestBedSplit('not an error', 'call()')).toBeUndefined();
    expect(explainTestBedSplit(new Error('other'), 'call()')).toBeUndefined();
    expect(explainTestBedSplit(new Error("reading 'ngModule'"), 'call()')).toBeUndefined();
  });
});

describe('noteTestBed', () => {
  it('counts each distinct TestBed once', () => {
    const before = globalThis.__vitestAutoSpyTestBeds__;
    const testBed = {};

    try {
      globalThis.__vitestAutoSpyTestBeds__ = undefined;

      expect([noteTestBed(testBed), noteTestBed(testBed), noteTestBed({})]).toEqual([1, 1, 2]);
    } finally {
      globalThis.__vitestAutoSpyTestBeds__ = before;
    }
  });
});
