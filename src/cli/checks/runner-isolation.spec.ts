/**
 * The one thing this check exists to prevent is a finding that tells a reader to take a decision
 * they have already taken, so the tests below are mostly about staying quiet: about a workspace
 * that is not this builder's, about a file that is not a workspace, and about a key declared in the
 * one place nobody looks — a named configuration rather than the target's own options.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { readProfile } from '../profile';
import { createTempRepo, removeTempRepos } from '../temp-repo';
import { isolationFromAngularBuilder as fromProfile } from './runner-isolation';

const isolationFromAngularBuilder = (root: string): ReturnType<typeof fromProfile> => fromProfile(readProfile(root));

afterEach(() => {
  removeTempRepos();
});

const workspace = (test: unknown): string => JSON.stringify({ projects: { bench: { architect: { test } } } });

describe('isolationFromAngularBuilder', () => {
  it('says nothing at all about a workspace that does not run that builder', () => {
    expect(isolationFromAngularBuilder(createTempRepo({ 'package.json': '{}' }))).toBeUndefined();
    expect(isolationFromAngularBuilder(createTempRepo({ 'angular.json': 'not json' }))).toBeUndefined();
    expect(isolationFromAngularBuilder(createTempRepo({ 'angular.json': '[]' }))).toBeUndefined();
    expect(isolationFromAngularBuilder(createTempRepo({ 'angular.json': '{"projects":"nope"}' }))).toBeUndefined();
    expect(
      isolationFromAngularBuilder(createTempRepo({ 'angular.json': workspace({ builder: '@angular/build:application' }) })),
    ).toBeUndefined();
  });

  it('reports the default when the target declares nothing', () => {
    const root = createTempRepo({ 'angular.json': workspace({ builder: '@angular/build:unit-test', options: { runner: 'vitest' } }) });

    expect(isolationFromAngularBuilder(root)).toEqual({
      isolated: false,
      why: '@angular/build:unit-test already runs without per-file isolation — that is its default',
    });
  });

  it('finds the key wherever it was declared, options or a named configuration', () => {
    const inOptions = createTempRepo({ 'angular.json': workspace({ builder: '@angular/build:unit-test', options: { isolate: true } }) });
    const inConfiguration = createTempRepo({
      'angular.json': workspace({
        builder: '@angular/build:unit-test',
        options: {},
        configurations: { ci: { isolate: true }, watch: 'nope' },
      }),
    });

    expect(isolationFromAngularBuilder(inOptions)?.isolated).toBe(true);
    expect(isolationFromAngularBuilder(inConfiguration)?.isolated).toBe(true);
  });

  it('takes `false` for what it is: the default said out loud, not a request for isolation', () => {
    const root = createTempRepo({ 'angular.json': workspace({ builder: '@angular/build:unit-test', options: { isolate: false } }) });

    expect(isolationFromAngularBuilder(root)?.isolated).toBe(false);
  });

  it('reads the older workspace file and the newer target key, and survives the shapes in between', () => {
    const older = createTempRepo({
      'workspace.json': JSON.stringify({ projects: { bench: { targets: { test: { builder: '@angular/build:unit-test' } } } } }),
    });
    const odd = createTempRepo({
      'angular.json': JSON.stringify({
        projects: { a: 'not a project', b: { architect: 'not targets' }, c: { architect: { test: 'not a target' } } },
      }),
    });

    expect(isolationFromAngularBuilder(older)?.isolated).toBe(false);
    expect(isolationFromAngularBuilder(odd)).toBeUndefined();
  });

  it('reads an Nx project and the options `nx.json` gives every unit-test target', () => {
    const project = JSON.stringify({ targets: { test: { executor: '@nx/angular:unit-test' } } });
    const plain = createTempRepo({ 'libs/a/project.json': project });
    const byDefault = createTempRepo({
      'libs/a/project.json': project,
      'nx.json': JSON.stringify({ targetDefaults: { '@nx/angular:unit-test': { options: { isolate: true } } } }),
    });

    expect(isolationFromAngularBuilder(plain)?.why).toBe(
      '@nx/angular:unit-test already runs without per-file isolation — that is its default',
    );
    expect(isolationFromAngularBuilder(byDefault)?.isolated).toBe(true);
  });
});
