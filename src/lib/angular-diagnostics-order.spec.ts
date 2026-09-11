/**
 * A setup file's order under `sequence: { hooks: 'list' }`: Angular's cleanup and the suite's own
 * reset are registered before the group, so both run before its `afterEach` — at the file level,
 * where no later hook resets the module the check used to rebuild.
 */
import { HttpClient, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, getTestBed } from '@angular/core/testing';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';

import '../angular';
import { disableAngularDiagnostics, enableAngularDiagnostics } from './angular-diagnostics';

afterEach(() => {
  getTestBed().resetTestingModule();
});

enableAngularDiagnostics();

beforeAll(() => {
  vi.setConfig({ sequence: { hooks: 'list' } });
});

afterAll(() => {
  vi.resetConfig();
  disableAngularDiagnostics();
});

it.fails('reports a request the suite reset took down before the check ran', () => {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  TestBed.inject(HttpClient).get('/api/reset-first').subscribe();
});

it('leaves the next test a module it can configure', () => {
  expect(() => TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] })).not.toThrow();
});
