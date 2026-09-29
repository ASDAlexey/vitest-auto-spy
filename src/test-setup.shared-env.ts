import { NgModule, destroyPlatform, provideZonelessChangeDetection } from '@angular/core';
import { getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { readFileSync } from 'node:fs';
import { expect } from 'vitest';

import { setupAutoSpy } from './setup';

// Left out: a spec that calls setupAutoSpy() itself is testing it, and a suite-wide copy would answer for it;
// a concurrent one is outside what its per-test guards promise, and it says so when it meets one.
const OWN_TERMS = /^\s*(?:setupAutoSpy\(|(?:it|test|describe)\.concurrent\()/m;
const specFile = expect.getState().testPath;

if (specFile === undefined || !OWN_TERMS.test(readFileSync(specFile, 'utf8'))) {
  setupAutoSpy();
}

// `setupTestBed()` keeps its "initialised" flag on `globalThis` and the TestBed in a module, so after a
// spec's `vi.resetModules()` every later file of the worker would get a TestBed nobody initialised.
if (getTestBed().platform === null) {
  destroyPlatform();

  const ZonelessTestModule = NgModule({ providers: [provideZonelessChangeDetection()] })(class ZonelessTestModule {});

  getTestBed().initTestEnvironment([BrowserTestingModule, ZonelessTestModule], platformBrowserTesting(), {
    teardown: { destroyAfterEach: true },
  });
}
