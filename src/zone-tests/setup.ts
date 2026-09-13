/**
 * The consumer's half of the contract: zone.js first, then the testing bundle, then the patch.
 *
 * This mirrors what an Angular project does — under `@angular/build:unit-test` the builder loads
 * both zone bundles from its own entry point, before any setup file runs — and it is the order the
 * patch reports on when it is wrong.
 *
 * The TestBed lives one module away because the order is load-bearing and the import sorter is not
 * on our side: an `@angular/core` specifier written here sorts above `zone.js`, evaluates first, and
 * `fakeAsync` then reports that `zone-testing.js` could not be found. Behind a relative specifier it
 * is evaluated after both bundles, whatever the sorter does to the lines.
 */
import 'zone.js';
import 'zone.js/testing';

import '../zone';
import './testbed';
