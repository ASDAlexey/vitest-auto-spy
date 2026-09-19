/**
 * The published manifest and the workflows that publish it, asserted rather than reviewed.
 *
 * Everything here is a property that was wrong at least once and is invisible to every other suite:
 * a release that went out ahead of its own CI verdict, an OIDC credential handed to `npm ci`, an
 * action pinned to a tag somebody else can move, a `sideEffects` list that did not name the chunk
 * the Bun adapter registers itself from, and an `exports` map with no `./package.json` in it.
 */
import { load } from 'js-yaml';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

interface WorkflowStep {
  uses?: string;
  with?: Record<string, unknown>;
  run?: string;
}

interface WorkflowJob {
  permissions?: Record<string, string>;
  steps?: WorkflowStep[];
  uses?: string;
}

interface Workflow {
  on?: Record<string, unknown>;
  permissions?: Record<string, string>;
  jobs?: Record<string, WorkflowJob>;
}

interface Manifest {
  exports: Record<string, unknown>;
  sideEffects: string[];
  peerDependencies: Record<string, string>;
  peerDependenciesMeta: Record<string, { optional?: boolean }>;
}

const WORKFLOWS = '.github/workflows';

const manifest: Manifest = JSON.parse(readFileSync('package.json', 'utf8'));

const workflowNames = readdirSync(WORKFLOWS).filter((name) => name.endsWith('.yml'));

const workflows = new Map<string, Workflow>(
  workflowNames.map((name) => [name, load(readFileSync(join(WORKFLOWS, name), 'utf8')) as Workflow]),
);

function steps(workflow: Workflow): WorkflowStep[] {
  return Object.values(workflow.jobs ?? {}).flatMap((job) => job.steps ?? []);
}

/** `uses: owner/action@<sha> # v1.2.3` — the only pin a mutable tag cannot be moved under. */
const PINNED = /^[^@]+@[0-9a-f]{40}$/;

describe('the published manifest', () => {
  it('exports package.json, so a tool can resolve the manifest', () => {
    expect(manifest.exports['./package.json']).toBe('./package.json');
  });

  it('keeps vitest an optional peer, since /bun and /node run on another runner', () => {
    expect(manifest.peerDependencies['vitest']).toBeDefined();
    expect(manifest.peerDependenciesMeta['vitest']?.optional).toBe(true);
  });

  // 5.9.0–5.18.0 declared @angular/forms >=22, and npm refuses the install on every Angular 20/21 app.
  it('declares every Angular peer from the floor the CI Angular matrix installs', () => {
    const job = workflows.get('ci.yml')?.jobs?.['angular-range'] as WorkflowJob & {
      strategy: { matrix: { angular: string[] } };
    };
    const floor = Math.min(...job.strategy.matrix.angular.map(Number));
    const angular = Object.entries(manifest.peerDependencies).filter(([name]) => name.startsWith('@angular/'));

    expect(angular.length).toBeGreaterThan(0);
    for (const [name, range] of angular) {
      expect({ name, range }).toEqual({ name, range: `>=${floor}.0.0` });
    }
  });

  it('names the emitted chunks in sideEffects, whatever their content hash', () => {
    const matches = (file: string): boolean =>
      manifest.sideEffects.some((pattern) => {
        const tail = pattern.startsWith('**/') ? pattern.slice(3) : pattern;

        return new RegExp(`^${tail.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')}$`).test(file);
      });

    // `src/bun.ts` registers the Bun adapter at module scope and `src/bun-angular.ts` imports it
    // for that side effect alone, so esbuild puts the registration in a shared chunk that both
    // entries reach with a bare import. A bundler is free to drop a bare import of a file the
    // manifest calls pure, and the consumer then gets "No mock adapter registered".
    expect(matches('chunk-M6VMOOZ2.js')).toBe(true);
    expect(matches('bun.js')).toBe(true);
    expect(matches('setup.js')).toBe(true);
  });
});

describe('every workflow', () => {
  it('pins each action to a commit sha with the version beside it', () => {
    for (const [name, workflow] of workflows) {
      const external = steps(workflow)
        .map((step) => step.uses)
        .filter((uses): uses is string => typeof uses === 'string');

      for (const uses of external) {
        expect(PINNED.test(uses), `${name} uses ${uses}`).toBe(true);
      }

      const source = readFileSync(join(WORKFLOWS, name), 'utf8');

      // A reusable workflow of this repository is named by path, and a path has no sha to pin.
      const lines = source.split('\n').filter((candidate) => candidate.includes('uses:') && !candidate.includes('uses: ./'));

      for (const line of lines) {
        // A sha alone says nothing about what it is; the comment is what a reader and Dependabot
        // both read.
        expect(line, `${name}: ${line.trim()}`).toMatch(/# v\d+\.\d+\.\d+$/);
      }
    }
  });

  it('asks for its permissions per job, never workflow-wide', () => {
    for (const [name, workflow] of workflows) {
      expect(workflow.permissions, `${name} declares workflow-wide permissions`).toBeUndefined();

      for (const [job, definition] of Object.entries(workflow.jobs ?? {})) {
        // A job that calls a reusable workflow inherits nothing — the called workflow declares its own.
        if (definition.uses === undefined) {
          expect(definition.permissions, `${name}: job ${job}`).toBeDefined();
        }
      }
    }
  });

  it('never hands setup-node a registry-url, which would break the OIDC exchange', () => {
    for (const [name, workflow] of workflows) {
      for (const step of steps(workflow)) {
        if (step.uses?.startsWith('actions/setup-node@')) {
          expect(step.with?.['registry-url'], `${name}`).toBeUndefined();
        }
      }
    }
  });
});

describe('the release workflow', () => {
  const release = workflows.get('auto-release.yml');

  it('starts from a finished CI run rather than from the push itself', () => {
    const trigger = release?.on?.['workflow_run'] as { workflows?: string[]; types?: string[] } | undefined;

    expect(trigger?.workflows).toContain('CI');
    expect(trigger?.types).toContain('completed');
    expect(release?.on?.['push']).toBeUndefined();
  });

  it('keeps the publishing credential out of every job that runs third-party code', () => {
    for (const [name, job] of Object.entries(release?.jobs ?? {})) {
      const installs = (job.steps ?? []).some((step) => step.run?.includes('npm ci') === true);

      if (installs) {
        expect(job.permissions?.['id-token'], `job ${name} installs dependencies`).toBeUndefined();
      }
    }
  });

  it('publishes the tarball the unprivileged job packed, and installs nothing to do it', () => {
    const publish = release?.jobs?.['publish'];

    expect(publish?.permissions?.['id-token']).toBe('write');
    expect((publish?.steps ?? []).some((step) => step.run?.includes('npm publish "$TARBALL"') === true)).toBe(true);
    expect((publish?.steps ?? []).every((step) => step.run?.includes('npm ci') !== true)).toBe(true);
  });

  it('refuses to publish when the branch moved under the build', () => {
    const publish = release?.jobs?.['publish'];

    expect((publish?.steps ?? []).some((step) => step.run?.includes('git ls-remote origin') === true)).toBe(true);
  });
});
