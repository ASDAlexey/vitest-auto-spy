/**
 * A setup file's order under `sequence: { hooks: 'list' }`: Angular's cleanup and the suite's own
 * reset run before anything a spec registers, so the check has to see the requests those resets took.
 */
import { HttpClient } from '@angular/common/http';
import { TestBed, getTestBed } from '@angular/core/testing';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';

import { provideHttpTesting } from './angular-http';

afterEach(() => {
  getTestBed().resetTestingModule();
});

beforeAll(() => {
  vi.setConfig({ sequence: { hooks: 'list' } });
});

afterAll(() => {
  vi.resetConfig();
});

it.fails('reports a request the suite reset took down before the check ran', () => {
  TestBed.configureTestingModule({ providers: [...provideHttpTesting()] });
  TestBed.inject(HttpClient).get('/api/reset-first').subscribe();
});

it('leaves the next test a module it can configure', () => {
  expect(() => TestBed.configureTestingModule({ providers: [...provideHttpTesting()] })).not.toThrow();
});
