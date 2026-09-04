'use strict';

/*
 * `npm run lint` is `eslint . --ext .ts`, and `.eslintignore` excludes `bench/` but not this
 * directory, so the benchmark here is linted. It is not in any of the three programs the root
 * config names, which without this file makes every run of the gate fail with "The file was not
 * found in any of the provided project(s)".
 *
 * Everything else cascades from the root config; only the program changes.
 */
module.exports = {
  parserOptions: {
    project: ['../tsconfig.bench-angular.json'],
    tsconfigRootDir: __dirname,
  },
};
