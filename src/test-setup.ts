import { setupTestBed } from '@analogjs/vitest-angular/setup-testbed';

// Zoneless TestBed: initTestEnvironment with provideZonelessChangeDetection(),
// no zone.js. Needed because provideAutoSpy / injectSpy use Angular DI.
setupTestBed();
