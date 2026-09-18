/**
 * Where the end-of-test check comes from. The entry is imported in `beforeAll` here, after this
 * file was collected — which is what a spec file sees under `isolate: false` once an earlier file of
 * the worker has already evaluated the module, and where a hook registered on import never runs.
 */
import { HttpClient } from '@angular/common/http';
import { TestBed, getTestBed } from '@angular/core/testing';
import { beforeAll, describe, expect, it } from 'vitest';

import { mockValueProp } from './prop-mock';

type AngularHttp = typeof import('./angular-http');

let http: AngularHttp;

beforeAll(async () => {
  http = await import('./angular-http');
});

function openRequest(url: string): void {
  TestBed.inject(HttpClient).get(url).subscribe();
}

describe('a block that configures HTTP testing', () => {
  it.fails('fails a test that ends holding an unanswered request', () => {
    TestBed.configureTestingModule({ providers: [...http.provideHttpTesting()] });
    openRequest('/api/first-block');
  });

  it('left the next test a module it can configure', () => {
    expect(() => TestBed.configureTestingModule({ providers: [...http.provideHttpTesting()] })).not.toThrow();
  });
});

describe('a later block', () => {
  it.fails('is verified as well', () => {
    TestBed.configureTestingModule({ providers: [...http.provideHttpTesting()] });
    openRequest('/api/later-block');
  });

  it.fails('reports a request a reset in the middle of the test took down with the module', () => {
    TestBed.configureTestingModule({ providers: [...http.provideHttpTesting()] });
    openRequest('/api/abandoned');
    TestBed.resetTestingModule();
  });

  it.fails('arms the check once for a module that spreads the providers twice', () => {
    TestBed.configureTestingModule({ providers: [...http.provideHttpTesting(), ...http.provideHttpTesting()] });
    openRequest('/api/twice');
  });

  it('says nothing about a test that answered its requests', async () => {
    TestBed.configureTestingModule({ providers: [...http.provideHttpTesting()] });
    openRequest('/api/answered');

    await http.expectRequest('/api/answered').flush({});
  });

  it('never builds a reset module again to look for requests', () => {
    TestBed.configureTestingModule({ providers: [...http.provideHttpTesting({ verifyOnTeardown: false })] });
    openRequest('/api/opted-out');
    TestBed.resetTestingModule();

    expect(http.verifyNoPendingRequests).not.toThrow();
    expect(() => TestBed.configureTestingModule({ providers: [...http.provideHttpTesting()] })).not.toThrow();
  });

  it('arms nothing on a TestBed with no resetTestingModule of its own, and still checks the live module', () => {
    const restore = mockValueProp(getTestBed(), 'resetTestingModule', undefined);

    TestBed.configureTestingModule({ providers: [...http.provideHttpTesting()] });
    TestBed.inject(HttpClient);
    restore();

    expect(http.verifyNoPendingRequests).not.toThrow();
  });
});

describe('a module built in beforeAll', () => {
  beforeAll(() => {
    TestBed.configureTestingModule({ providers: [...http.provideHttpTesting()] });
    openRequest('/api/before-all');
  });

  it('has no test to fail, so its requests are left to be taken by hand', () => {
    expect(http.verifyNoPendingRequests).toThrow(/GET \/api\/before-all/);
  });
});

describe('a runner that does not say which test is running', () => {
  it('says so once, instead of arming nothing in silence', () => {
    const workerKey: PropertyKey = '__vitest_worker__';
    const written: string[] = [];
    const stderrKey: PropertyKey = 'write';
    const restoreStderr = mockValueProp(process.stderr, stderrKey, (line: string): boolean => {
      written.push(line);

      return true;
    });
    const restoreWorker = mockValueProp(globalThis, workerKey, undefined);

    try {
      TestBed.configureTestingModule({ providers: [...http.provideHttpTesting()] });
      // Building the module is what runs the initializer that arms the check.
      TestBed.inject(HttpClient);
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [...http.provideHttpTesting()] });
      TestBed.inject(HttpClient);
    } finally {
      restoreWorker();
      restoreStderr();
    }

    // Once per worker: a line per module built would be a line per test of the run.
    expect(written).toHaveLength(1);
    expect(written[0]).toContain('globalThis.__vitest_worker__ is not there');
  });
});
