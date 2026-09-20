/**
 * Type-level tests for the `TestBed` timing family of `vitest-auto-spy/angular/diagnostics`.
 *
 * The options are written once in a setup file, and the failure these guard against is a quiet
 * one: a `report` callback whose parameter is widened off `SpecTiming` compiles everywhere and
 * reads wrong fields at runtime, and a `minTestBedMs` that silently accepts a string filters
 * nothing. Every pin below compiles against the declared shape or fails the suite.
 */
import { describe, expectTypeOf, it } from 'vitest';

import { type SpecTiming, type TestBedDiagnosticsOptions, enableTestBedDiagnostics } from '../angular-diagnostics';

describe('SpecTiming', () => {
  it('counts in numbers and names the file it came from', () => {
    expectTypeOf<SpecTiming['file']>().toEqualTypeOf<string>();
    expectTypeOf<SpecTiming['testBedMs']>().toEqualTypeOf<number>();
    expectTypeOf<SpecTiming['totalMs']>().toEqualTypeOf<number>();
    expectTypeOf<SpecTiming['otherMs']>().toEqualTypeOf<number>();
    expectTypeOf<SpecTiming['components']>().toEqualTypeOf<number>();
    expectTypeOf<SpecTiming['configurations']>().toEqualTypeOf<number>();
  });
});

describe('TestBedDiagnosticsOptions', () => {
  it('hands the report a SpecTiming and takes nothing back', () => {
    expectTypeOf<TestBedDiagnosticsOptions['report']>().toEqualTypeOf<((timing: SpecTiming) => void) | undefined>();
    expectTypeOf<TestBedDiagnosticsOptions['minTestBedMs']>().toEqualTypeOf<number | undefined>();
  });

  it('accepts both keys at once, and the object is optional', () => {
    enableTestBedDiagnostics();
    enableTestBedDiagnostics({ minTestBedMs: 200, report: (timing) => void timing.file });
  });

  it('rejects what the keys are not', () => {
    // @ts-expect-error -- a threshold is a number of milliseconds
    enableTestBedDiagnostics({ minTestBedMs: '200' });
    // @ts-expect-error -- the report is handed a SpecTiming, not a number
    enableTestBedDiagnostics({ report: (ms: number) => String(ms) });
    // @ts-expect-error -- no such option exists
    enableTestBedDiagnostics({ perTest: true });
  });
});
