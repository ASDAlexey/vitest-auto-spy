/**
 * A zone-based TestBed, initialised the way the Angular CLI initialises one.
 *
 * `provideZoneChangeDetection()` is the part that matters and the part an ad-hoc setup leaves out:
 * `@angular/build:unit-test` adds it to the test environment for every suite in which `Zone` is
 * defined, and it is what subscribes `ApplicationRef._tick()` to `NgZone.onMicrotaskEmpty`. Without
 * it a zone-based TestBed never re-enters a tick, and `stable.zone-test.ts` would be reporting on a
 * stack no consumer runs.
 */
import { setupTestBed } from '@analogjs/vitest-angular/setup-testbed';
import { provideZoneChangeDetection } from '@angular/core';

setupTestBed({ zoneless: false, providers: [provideZoneChangeDetection()] });
