/**
 * Angular render benchmarks — what a `TestBed` per-test cycle costs, and what `renderShallow`
 * takes off it. Run with `npm run bench:angular`.
 *
 * **Why this is a separate project.** `bench/auto-spy.bench.ts` runs under
 * `vitest.bench.config.mts`, which carries no Angular plugin and no `TestBed` setup, so the spy
 * numbers it publishes are free of the Angular transform. That separation is deliberate and this
 * file does not join it: it lives under `vitest.bench.angular.config.mts` instead, which is the
 * spec config's plugin/jsdom/zoneless stack pointed at benchmarks. Do not move these cases into
 * `bench/`.
 *
 * **Methodology**, matching the numbers this repository publishes for the plain core as closely as
 * an Angular figure can be matched:
 *
 * - Every arm runs a fixed **60 reps** after **30 warm-up reps** ({@link SIXTY_REPS}). A time
 *   budget would hand the cheap rungs (a bare `resetTestingModule`, ~3 µs) five orders of magnitude
 *   more samples than the arms they are compared against, and the ratios would stop meaning
 *   anything. `time: 0` makes the count exact.
 * - The published figure is the **median** of those 60, in milliseconds. The rest of this repo
 *   publishes `p75`, because its cases allocate by the hundred thousand and a GC pause lands in
 *   some samples and not others. These cases allocate whole component trees and are two to three
 *   orders of magnitude slower per rep, so the pause is inside every sample rather than a few of
 *   them; the median is also the statistic the earlier hand-run measurements reported, and printing
 *   the same one is what makes the two comparable. `bench-angular/run.mjs` prints p75 alongside it,
 *   so nothing is hidden.
 * - Every arm that measures a *per-test* cycle starts with `TestBed.resetTestingModule()`, because
 *   that is where a real suite pays for tearing the previous fixture down. Both arms of a
 *   comparison pay it.
 *
 * **The shape under test** is the one the docs describe: a host component holding an `@for` of a
 * child component, at 0 / 25 / 100 / 400 children. `renderShallow` is flat in that number — it
 * never builds the subtree — while `TestBed.createComponent` is linear in it, so the ratio is not a
 * constant and the table is the answer rather than any single figure in it.
 *
 * **Why four host classes instead of one with a size input.** The obvious shape — one host with
 * `rows = input<number[]>([])`, sized per arm through `setInput` — measures nothing here: the
 * Angular plugin does not process `input()` initializers in this file, every `setInput` fails with
 * NG0303, and all four sizes quietly render a childless component. The first draft reported
 * 0.51 / 0.38 / 0.34 / 0.28 ms for 0 / 25 / 100 / 400 children, which is warm-up order and not a
 * curve. Four classes with literal row counts have no such failure mode: a size that did not take
 * would show up as four identical rows.
 */
import { Component, Input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { bench, describe } from 'vitest';

// The public entry, not `src/lib/render-shallow` — a consumer imports it from here, and the entry
// is what registers the default mock adapter as a side effect.
import { renderShallow } from '../src/angular';

/** Child counts. 100 is the shape every rung in the last two blocks is measured on. */
const SIZES = [0, 25, 100, 400] as const;

type Size = (typeof SIZES)[number];

function rowsOf(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index);
}

/** A child with a binding and an element of its own, so a subtree costs what a real one costs. */
@Component({
  selector: 'bench-child',
  template: `<span class="bench-child__value">{{ value }}</span>`,
})
class BenchChildComponent {
  // A decorator input, not `input()`: see the file header — the plugin does not process initializer
  // APIs here, and an unbound `[value]` logs an NG0303 per child instance, which is what the arm
  // would then be measuring.
  @Input() value = 0;
}

@Component({
  selector: 'bench-host-0',
  imports: [BenchChildComponent],
  template: `<section class="bench-host">
    @for (row of rows; track row) {
      <bench-child [value]="row" />
    }
  </section>`,
})
class BenchHost0Component {
  readonly rows = rowsOf(0);
}

@Component({
  selector: 'bench-host-25',
  imports: [BenchChildComponent],
  template: `<section class="bench-host">
    @for (row of rows; track row) {
      <bench-child [value]="row" />
    }
  </section>`,
})
class BenchHost25Component {
  readonly rows = rowsOf(25);
}

@Component({
  selector: 'bench-host-100',
  imports: [BenchChildComponent],
  template: `<section class="bench-host">
    @for (row of rows; track row) {
      <bench-child [value]="row" />
    }
  </section>`,
})
class BenchHost100Component {
  readonly rows = rowsOf(100);
}

@Component({
  selector: 'bench-host-400',
  imports: [BenchChildComponent],
  template: `<section class="bench-host">
    @for (row of rows; track row) {
      <bench-child [value]="row" />
    }
  </section>`,
})
class BenchHost400Component {
  readonly rows = rowsOf(400);
}

type Host = typeof BenchHost0Component;

const HOSTS: Record<Size, Host> = {
  0: BenchHost0Component,
  25: BenchHost25Component,
  100: BenchHost100Component,
  400: BenchHost400Component,
};

const HOST_100 = HOSTS[100];

/** 60 reps after 30 warm-up reps, exactly — see the file header for why this is not a time budget. */
const SIXTY_REPS = { iterations: 60, time: 0, warmupIterations: 30, warmupTime: 0 };

/** The full per-test cycle a spec pays without this library: reset, configure, create, detect. */
function testBedCycle(host: Host): void {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [host] });

  const fixture = TestBed.createComponent(host);

  fixture.detectChanges();
}

/** The same cycle through `renderShallow`, which resets nothing itself — so the reset is added here. */
function shallowCycle(host: Host, keepTemplate: boolean): void {
  TestBed.resetTestingModule();
  renderShallow(host, { keepTemplate });
}

SIZES.forEach((size) => {
  describe(`per-render cycle — ${size} children`, () => {
    const host = HOSTS[size];

    bench(
      'TestBed.createComponent, full cycle',
      () => {
        testBedCycle(host);
      },
      SIXTY_REPS,
    );

    bench(
      'renderShallow, full cycle',
      () => {
        shallowCycle(host, false);
      },
      SIXTY_REPS,
    );
  });
});

// The middle rung. `buildOverride` applies `imports: keepChildren ?? []` whether or not the template
// is kept, so `keepTemplate: true` renders the component's own template against an empty subtree
// under `NO_ERRORS_SCHEMA` — the claim `docs-site/core/performance.md` makes, and this block is
// what checks it.
describe('the three rungs — 100 children', () => {
  bench(
    'TestBed.createComponent, full cycle',
    () => {
      testBedCycle(HOST_100);
    },
    SIXTY_REPS,
  );

  bench(
    'renderShallow({ keepTemplate: true }), full cycle',
    () => {
      shallowCycle(HOST_100, true);
    },
    SIXTY_REPS,
  );

  bench(
    'renderShallow(), full cycle',
    () => {
      shallowCycle(HOST_100, false);
    },
    SIXTY_REPS,
  );
});

// Where the time in that cycle actually is. Four candidate optimisations were proposed against it
// and all four die on these five rows: configuration is lazy, the reset is free, compiling is a
// no-op on an AOT bed, and a bed reused across tests saves nothing — everything is in
// `createComponent` plus the first change detection, which is the part `renderShallow` shrinks.
describe('where the cycle spends its time — 100 children', () => {
  // The reuse arm keeps its configuration across reps; every other arm resets the bed under it, so
  // it re-configures on its first rep after one of them. That is one rep out of sixty and cannot
  // reach the median.
  let configured = false;

  // The same cycle the block above measures, repeated here so every rung is divided by a baseline
  // taken in the same block. Arms measured minutes apart in one process are not comparable to the
  // third decimal — this file's own numbers move 10-20 % between the first block and the last as
  // V8 finishes warming up — and every claim in this block is a claim about a fraction of a cycle.
  bench(
    'full per-test cycle (reset + configure + createComponent + CD)',
    () => {
      testBedCycle(HOST_100);
      configured = false;
    },
    SIXTY_REPS,
  );

  bench(
    'resetTestingModule() alone',
    () => {
      TestBed.resetTestingModule();
      configured = false;
    },
    SIXTY_REPS,
  );

  bench(
    'resetTestingModule() + configureTestingModule()',
    () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ imports: [HOST_100] });
      configured = false;
    },
    SIXTY_REPS,
  );

  bench(
    'createComponent + CD on an already-configured module',
    () => {
      if (!configured) {
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({ imports: [HOST_100] });
        configured = true;
      }

      const fixture = TestBed.createComponent(HOST_100);

      fixture.detectChanges();
      // Without this the module accumulates sixty live fixtures and the arm measures the heap.
      fixture.destroy();
    },
    SIXTY_REPS,
  );

  bench(
    'configureTestingModule + overrideComponent + createComponent + CD',
    () => {
      TestBed.resetTestingModule();
      configured = false;
      TestBed.configureTestingModule({ imports: [HOST_100] });
      TestBed.overrideComponent(HOST_100, { set: { imports: [], template: '', styles: [] } });

      const fixture = TestBed.createComponent(HOST_100);

      fixture.detectChanges();
    },
    SIXTY_REPS,
  );

  bench(
    'compileComponents() on a standalone AOT bed',
    async () => {
      TestBed.resetTestingModule();
      configured = false;
      TestBed.configureTestingModule({ imports: [HOST_100] });

      await TestBed.compileComponents();
    },
    SIXTY_REPS,
  );
});
