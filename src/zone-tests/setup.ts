/**
 * The consumer's half of the contract: zone.js first, then the testing bundle, then the patch.
 *
 * This mirrors what an Angular project does — under `@angular/build:unit-test` the builder loads
 * both zone bundles from its own entry point, before any setup file runs — and it is the order the
 * patch reports on when it is wrong.
 */
import 'zone.js';
import 'zone.js/testing';

import '../zone';
