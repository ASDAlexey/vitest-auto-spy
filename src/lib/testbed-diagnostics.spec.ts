/**
 * The diagnostics have to be honest about two things: the numbers they report (a file that creates
 * one component must show one component and non-zero `TestBed` time) and their own footprint —
 * `disableTestBedDiagnostics()` must give the untouched `TestBed` methods back, and instrumenting
 * twice must not wrap a wrapper.
 */
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { mockValueProp } from './prop-mock';
import { renderShallow } from './render-shallow';
import {
  type SpecTiming,
  disableTestBedDiagnostics,
  enableTestBedDiagnostics,
  formatSpecTiming,
  getTestBedTiming,
  instrumentTestBed,
  reportSpecTiming,
} from './testbed-diagnostics';

@Component({ selector: 'app-measured', template: '<b>hi</b>' })
class MeasuredComponent {
  readonly ready = true;
}

const reported: SpecTiming[] = [];
const suppressed: SpecTiming[] = [];

describe('enableTestBedDiagnostics', () => {
  enableTestBedDiagnostics({ report: (timing) => reported.push(timing) });
  // A second registration: proves instrumentation is idempotent, and exercises the threshold that
  // keeps cheap files out of the report.
  enableTestBedDiagnostics({ report: (timing) => suppressed.push(timing), minTestBedMs: Number.MAX_SAFE_INTEGER });
  // And once with the shipped default reporter, silenced so the run output stays readable.
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  enableTestBedDiagnostics();

  afterAll(disableTestBedDiagnostics);

  it('counts what the file put through TestBed', () => {
    renderShallow(MeasuredComponent);

    const timing = getTestBedTiming();

    expect(timing.components).toBe(1);
    expect(timing.configurations).toBe(1);
    expect(timing.testBedMs).toBeGreaterThan(0);
    expect(timing.totalMs).toBeGreaterThanOrEqual(timing.testBedMs);
    expect(timing.otherMs).toBe(timing.totalMs - timing.testBedMs);
    expect(timing.file).toContain('testbed-diagnostics.spec.ts');
  });

  it('names the file "unknown file" when the runner reports no path', () => {
    // `expect.setState` cannot carry `undefined` under `exactOptionalPropertyTypes`; patch the live
    // state object instead — and undo it with the same helper the library ships.
    const testPath: PropertyKey = 'testPath';
    const restore = mockValueProp(expect.getState(), testPath, undefined);

    expect(getTestBedTiming().file).toBe('unknown file');

    restore();

    expect(getTestBedTiming().file).toContain('testbed-diagnostics.spec.ts');
  });

  it('measures on the real clock, so a spec with fake timers is not reported as free', () => {
    const before = getTestBedTiming().testBedMs;

    vi.useFakeTimers();
    renderShallow(MeasuredComponent);
    vi.useRealTimers();

    expect(getTestBedTiming().testBedMs).toBeGreaterThan(before);
  });

  it('does not wrap an already-wrapped TestBed method', () => {
    const wrapped = TestBed.createComponent;

    instrumentTestBed();

    expect(TestBed.createComponent).toBe(wrapped);
  });

  it('leaves alone a TestBed method the running Angular version does not have', () => {
    disableTestBedDiagnostics();

    const original = TestBed.compileComponents;
    const compileComponents: PropertyKey = 'compileComponents';
    const restore = mockValueProp(TestBed, compileComponents, undefined);

    instrumentTestBed();
    restore();

    expect(TestBed.compileComponents).toBe(original);
  });
});

describe('the default report', () => {
  it('falls back to the console when there is no stdout to write to', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const process: PropertyKey = 'process';
    const restore = mockValueProp(globalThis, process, undefined);

    reportSpecTiming({ file: 'c.spec.ts', testBedMs: 1, totalMs: 2, otherMs: 1, components: 1, configurations: 1 });
    restore();

    expect(info).toHaveBeenCalledWith(expect.stringContaining('c.spec.ts'));

    info.mockRestore();
  });
});

describe('formatSpecTiming', () => {
  it('reports the TestBed share of the file', () => {
    const line = formatSpecTiming({ file: 'a.spec.ts', testBedMs: 750, totalMs: 1000, otherMs: 250, components: 3, configurations: 1 });

    expect(line).toBe('[vitest-auto-spy] a.spec.ts — TestBed 750ms of 1000ms (75%), logic 250ms, 3 component(s), 1 module config(s)');
  });

  it('does not divide by a zero total', () => {
    const line = formatSpecTiming({ file: 'b.spec.ts', testBedMs: 0, totalMs: 0, otherMs: 0, components: 0, configurations: 0 });

    expect(line).toContain('(0%)');
  });
});
