/**
 * What the two end-of-test checks print, read back from the test they failed: the report names the
 * test that ended, and offers the opt-in that belongs to the check that ran.
 */
import { HttpClient, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterAll, describe, expect, it, onTestFinished } from 'vitest';

import { disableAngularDiagnostics, enableAngularDiagnostics } from './angular-diagnostics';
import { provideHttpTesting } from './angular-http';

function errorsOf(task: { result?: { errors?: readonly { message?: string }[] } }): string {
  return (task.result?.errors ?? []).map((error) => String(error.message)).join('\n');
}

describe('the diagnostics group at the end of a test', () => {
  let reported = '';

  enableAngularDiagnostics();
  afterAll(disableAngularDiagnostics);

  it.fails('leaves a cancelled request open', () => {
    onTestFinished(({ task }) => {
      reported = errorsOf(task);
    });
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    TestBed.inject(HttpClient).get('/api/left-open').subscribe().unsubscribe();
  });

  it('named that test, and the opt-in of the group', () => {
    expect(reported).toMatch(
      /GET \/api\/left-open was never answered \(end of "the diagnostics group at the end of a test > leaves a cancelled request open"\)/,
    );
    expect(reported).toContain('pass enableAngularDiagnostics({ pendingRequests: { ignoreCancelled: true } })');
  });
});

describe('provideHttpTesting at the end of a test', () => {
  let reported = '';

  it.fails('leaves a cancelled request open', () => {
    onTestFinished(({ task }) => {
      reported = errorsOf(task);
    });
    TestBed.configureTestingModule({ providers: [...provideHttpTesting()] });
    TestBed.inject(HttpClient).get('/api/left-open').subscribe().unsubscribe();
  });

  it('named that test, and the opt-in of the provider', () => {
    expect(reported).toMatch(
      /GET \/api\/left-open was never answered \(end of "provideHttpTesting at the end of a test > leaves a cancelled request open"\)/,
    );
    expect(reported).toContain('pass provideHttpTesting({ verifyOnTeardown: { ignoreCancelled: true } })');
  });
});
