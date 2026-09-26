#!/usr/bin/env node
// Deterministic Angular 22 workspace generator for the Vitest 4 vs 5 benchmark.
// Usage: node gen.mjs <outDir> <specFiles> [seed]
// Writes angular.json, tsconfig*, src/** into <outDir>. package.json is written by setup-arm.mjs.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [outDir, nArg, seedArg] = process.argv.slice(2);
if (!outDir || !nArg) {
  console.error('usage: node gen.mjs <outDir> <specFiles> [seed]');
  process.exit(2);
}
const N = Number(nArg);
let seed = Number(seedArg ?? 20260926) >>> 0;
const rnd = () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const pickN = (arr, n) => {
  const pool = [...arr];
  const out = [];
  while (out.length < n) out.push(pool.splice(int(0, pool.length - 1), 1)[0]);
  return out;
};

const write = (rel, content) => {
  const p = join(outDir, rel);
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, content);
};
rmSync(join(outDir, 'src'), { recursive: true, force: true });

const NOUNS = [
  'Account',
  'Billing',
  'Catalog',
  'Delivery',
  'Employee',
  'Feedback',
  'Gallery',
  'Holiday',
  'Invoice',
  'Journal',
  'Keyword',
  'Ledger',
  'Metric',
  'Notice',
  'Order',
  'Payment',
  'Quota',
  'Report',
  'Schedule',
  'Ticket',
  'Upload',
  'Voucher',
  'Warehouse',
  'Region',
  'Budget',
  'Contract',
  'Device',
  'Event',
  'Folder',
  'Group',
  'Hotel',
  'Issue',
  'Job',
  'Kiosk',
  'License',
  'Member',
  'Network',
  'Offer',
  'Project',
  'Review',
];
const kebab = (s) => s.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
const pad = (i) => String(i).padStart(3, '0');

// ---------- workspace config (mirrors `ng new` 22.2.0 --defaults) ----------
write(
  'angular.json',
  JSON.stringify(
    {
      $schema: './node_modules/@angular/cli/lib/config/schema.json',
      version: 1,
      cli: { packageManager: 'npm', analytics: false },
      newProjectRoot: 'projects',
      projects: {
        app: {
          projectType: 'application',
          schematics: {},
          root: '',
          sourceRoot: 'src',
          prefix: 'app',
          architect: {
            build: {
              builder: '@angular/build:application',
              options: { browser: 'src/main.ts', tsConfig: 'tsconfig.app.json', styles: ['src/styles.css'] },
              configurations: {
                production: { outputHashing: 'all' },
                development: { optimization: false, extractLicenses: false, sourceMap: true },
              },
              defaultConfiguration: 'production',
            },
            test: {
              builder: '@angular/build:unit-test',
              options: { setupFiles: ['src/test-setup.ts'] },
            },
          },
        },
      },
    },
    null,
    2,
  ) + '\n',
);
write(
  'tsconfig.json',
  JSON.stringify(
    {
      compileOnSave: false,
      compilerOptions: {
        strict: true,
        noImplicitOverride: true,
        noPropertyAccessFromIndexSignature: true,
        noImplicitReturns: true,
        noFallthroughCasesInSwitch: true,
        skipLibCheck: true,
        isolatedModules: true,
        experimentalDecorators: true,
        importHelpers: true,
        target: 'ES2022',
        module: 'preserve',
      },
      angularCompilerOptions: {
        enableI18nLegacyMessageIdFormat: false,
        strictInjectionParameters: true,
        strictInputAccessModifiers: true,
        strictTemplates: true,
      },
      files: [],
      references: [{ path: './tsconfig.app.json' }, { path: './tsconfig.spec.json' }],
    },
    null,
    2,
  ) + '\n',
);
write(
  'tsconfig.app.json',
  JSON.stringify(
    {
      extends: './tsconfig.json',
      compilerOptions: { outDir: './out-tsc/app', types: [] },
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/test-setup.ts'],
    },
    null,
    2,
  ) + '\n',
);
write(
  'tsconfig.spec.json',
  JSON.stringify(
    {
      extends: './tsconfig.json',
      compilerOptions: { outDir: './out-tsc/spec', types: ['vitest/globals'] },
      include: ['src/**/*.d.ts', 'src/**/*.spec.ts', 'src/test-setup.ts'],
    },
    null,
    2,
  ) + '\n',
);
write('src/styles.css', '');
write(
  'src/index.html',
  '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>App</title><base href="/"></head><body><app-root></app-root></body></html>\n',
);
write(
  'src/main.ts',
  `import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { appConfig } from './app/app.config';

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
`,
);
write(
  'src/app/app.config.ts',
  `import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';

export const appConfig: ApplicationConfig = {
  providers: [provideBrowserGlobalErrorListeners(), provideHttpClient(), provideRouter([])],
};
`,
);
write(
  'src/app/app.ts',
  `import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({ selector: 'app-root', imports: [RouterOutlet], template: '<router-outlet />' })
export class App {}
`,
);
write(
  'src/test-setup.ts',
  `import 'vitest-auto-spy/angular';
import 'vitest-auto-spy/rxjs';
`,
);
write(
  'src/app/core/models.ts',
  `export interface Item {
  id: number;
  name: string;
  active: boolean;
  score: number;
}
`,
);

// ---------- dependency pool: 40 root services, each 6–12 methods ----------
const deps = NOUNS.map((noun, k) => {
  const extras = int(0, 6);
  const cls = `${noun}Service`;
  const file = `core/deps/${kebab(noun)}.service`;
  const extraMethods = Array.from(
    { length: extras },
    (_, j) => `
  extra${j}(value: number): number {
    return value * ${j + 2} + this.base.length;
  }`,
  ).join('\n');
  write(
    `src/app/${file}.ts`,
    `import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { Item } from '../models';

@Injectable({ providedIn: 'root' })
export class ${cls} {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/${kebab(noun)}';

  fetchAll(id: number): Observable<Item[]> {
    return this.http.get<Item[]>(\`\${this.base}/\${id}/items\`);
  }

  loadOne(id: number): Promise<Item> {
    return fetch(\`\${this.base}/\${id}\`).then((r) => r.json() as Promise<Item>);
  }

  label(key: string): string {
    return \`${noun}:\${key}\`;
  }

  count(): number {
    return ${k};
  }

  save(item: Item): Observable<boolean> {
    return this.http.put(\`\${this.base}/\${item.id}\`, item).pipe(map(() => true));
  }

  track(event: string, payload?: unknown): void {
    console.debug('${noun}', event, payload);
  }
${extraMethods}
}
`,
  );
  return { cls, file };
});

// ---------- per-file subjects ----------
const letters = 'abcdef';
let tests = 0;
const kinds = { service: 0, component: 0, pipe: 0, guard: 0 };

function importDeps(ds, rel) {
  return ds.map((d) => `import { ${d.cls} } from '${rel}${d.file}';`).join('\n');
}

function genService(i) {
  const nDeps = int(3, 6);
  const ds = pickN(deps, nDeps);
  const name = `F${pad(i)}Service`;
  const lo = int(10, 40);
  const hi = lo + int(20, 40);
  const off = int(1, 99);
  const fields = ds.map((d, j) => `  private readonly ${letters[j]} = inject(${d.cls});`).join('\n');
  const capacity = ds.map((_, j) => `this.${letters[j]}.count()`).join(' + ');
  write(
    `src/app/features/f${pad(i)}/f${pad(i)}.service.ts`,
    `import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { Item } from '../../core/models';
${importDeps(ds, '../../')}

@Injectable({ providedIn: 'root' })
export class ${name} {
${fields}

  readonly total = signal(0);
  readonly doubled = computed(() => this.total() * 2);

  label(key: string): string {
    const raw = this.a.label(key);
    return raw ? \`\${raw}#${off}\` : 'n/a';
  }

  activeCount(id: number): Observable<number> {
    return this.b.fetchAll(id).pipe(map((items) => items.filter((x) => x.active).length));
  }

  topScore(id: number): Observable<number> {
    return this.a.fetchAll(id).pipe(map((items) => items.reduce((m, x) => Math.max(m, x.score), 0)));
  }

  async refresh(id: number): Promise<string> {
    try {
      const item = await this.c.loadOne(id);
      this.c.track('refresh', item.id);
      return item.name.toUpperCase();
    } catch {
      this.c.track('refresh-failed');
      return 'error';
    }
  }

  persist(item: Item): Observable<boolean> {
    return this.b.save(item).pipe(catchError(() => of(false)));
  }

  classify(score: number): 'low' | 'mid' | 'high' {
    if (score < ${lo}) return 'low';
    if (score < ${hi}) return 'mid';
    return 'high';
  }

  bump(by = 1): void {
    this.total.update((v) => v + by);
    this.a.track('bump', by);
  }

  capacity(): number {
    return ${capacity};
  }
}
`,
  );
  const provs = ds.map((d) => `        provideAutoSpy(${d.cls}),`).join('\n');
  const spies = ds.map((d, j) => `  let ${letters[j]}: Spy<${d.cls}>;`).join('\n');
  const assigns = ds.map((d, j) => `    ${letters[j]} = injectSpy(${d.cls});`).join('\n');
  const capSet = ds.map((_, j) => `    ${letters[j]}.count.mockReturnValue(${j + 1});`).join('\n');
  const capSum = ds.reduce((s, _, j) => s + j + 1, 0);
  const n = int(2, 6);
  const itemsLit = Array.from({ length: n }, (_, k) => `{ id: ${k + 1}, name: 'n${k}', active: ${k % 2 === 0}, score: ${int(0, 100)} }`);
  const activeN = Math.ceil(n / 2);
  const maxScore = Math.max(...itemsLit.map((s) => Number(/score: (\d+)/.exec(s)[1])));
  write(
    `src/app/features/f${pad(i)}/f${pad(i)}.service.spec.ts`,
    `import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import type { Spy } from 'vitest-auto-spy';
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/angular';
import { Item } from '../../core/models';
${importDeps(ds, '../../')}
import { ${name} } from './f${pad(i)}.service';

const ITEMS: Item[] = [
  ${itemsLit.join(',\n  ')},
];

describe('${name}', () => {
  let service: ${name};
${spies}

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
${provs}
      ],
    });
    service = TestBed.inject(${name});
${assigns}
  });

  it('is created', () => {
    expect(service).toBeTruthy();
  });

  it('decorates the label from the first dependency', () => {
    a.label.mockReturnValue('base');
    expect(service.label('k')).toBe('base#${off}');
  });

  it('falls back when the label is empty', () => {
    a.label.mockReturnValue('');
    expect(service.label('k')).toBe('n/a');
  });

  it('passes the key through', () => {
    a.label.mockReturnValue('x');
    service.label('key-${i}');
    expect(a.label).toHaveBeenCalledWith('key-${i}');
    expect(a.label).toHaveBeenCalledTimes(1);
  });

  it('dispatches on arguments', () => {
    a.label.calledWith('hit').mockReturnValue('HIT');
    expect(service.label('hit')).toBe('HIT#${off}');
    expect(service.label('miss')).toBe('n/a');
  });

  it('counts active items', async () => {
    b.fetchAll.nextWith(ITEMS);
    await expect(firstValueFrom(service.activeCount(${i}))).resolves.toBe(${activeN});
    expect(b.fetchAll).toHaveBeenCalledWith(${i});
  });

  it('counts zero for an empty list', async () => {
    b.fetchAll.nextWith([]);
    await expect(firstValueFrom(service.activeCount(1))).resolves.toBe(0);
  });

  it('finds the top score', async () => {
    a.fetchAll.nextOneTimeWith(ITEMS);
    await expect(firstValueFrom(service.topScore(2))).resolves.toBe(${maxScore});
  });

  it('refreshes and tracks', async () => {
    c.loadOne.resolveWith(ITEMS[0]);
    await expect(service.refresh(5)).resolves.toBe('N0');
    expect(c.track).toHaveBeenCalledWith('refresh', 1);
  });

  it('reports a failed refresh', async () => {
    c.loadOne.rejectWith(new Error('boom'));
    await expect(service.refresh(5)).resolves.toBe('error');
    expect(c.track).toHaveBeenCalledWith('refresh-failed');
    expect(c.track).toHaveBeenCalledTimes(1);
  });

  it('persists an item', async () => {
    b.save.nextOneTimeWith(true);
    await expect(firstValueFrom(service.persist(ITEMS[0]))).resolves.toBe(true);
    expect(b.save).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
  });

  it('maps a save error to false', async () => {
    b.save.throwWith(new Error('down'));
    await expect(firstValueFrom(service.persist(ITEMS[0]))).resolves.toBe(false);
  });

  it.each([
    [${lo - 1}, 'low'],
    [${lo}, 'mid'],
    [${hi}, 'high'],
  ] as const)('classifies %d as %s', (score, expected) => {
    expect(service.classify(score)).toBe(expected);
  });

  it('bumps the signal state', () => {
    service.bump(2);
    service.bump();
    expect(service.total()).toBe(3);
    expect(service.doubled()).toBe(6);
    expect(a.track).toHaveBeenCalledTimes(2);
    expect(a.track).toHaveBeenLastCalledWith('bump', 1);
  });

  it('sums capacity across dependencies', () => {
${capSet}
    expect(service.capacity()).toBe(${capSum});
  });
});
`,
  );
  tests += 17;
  kinds.service++;
}

function genComponent(i) {
  const nDeps = int(2, 4);
  const ds = pickN(deps, nDeps);
  const name = `F${pad(i)}Component`;
  const hot = int(30, 70);
  const fields = ds.map((d, j) => `  private readonly ${letters[j]} = inject(${d.cls});`).join('\n');
  write(
    `src/app/features/f${pad(i)}/f${pad(i)}.component.ts`,
    `import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { Item } from '../../core/models';
${importDeps(ds, '../../')}

@Component({
  selector: 'app-f${pad(i)}',
  template: \`
    <h2 class="title">{{ title() }}</h2>
    @if (error()) {
      <p class="error">{{ error() }}</p>
    } @else if (loading()) {
      <p class="loading">Loading</p>
    } @else {
      <ul>
        @for (item of visible(); track item.id) {
          <li [class.active]="item.active" (click)="select(item)">
            {{ item.name }}
            @if (item.score > ${hot}) {
              <span class="hot">hot</span>
            }
          </li>
        } @empty {
          <li class="empty">Nothing here</li>
        }
      </ul>
    }
    <span class="count">{{ visible().length }}</span>
    <button type="button" (click)="reload()">Reload</button>
  \`,
})
export class ${name} implements OnInit {
${fields}

  readonly entityId = input(1);
  readonly showInactive = input(true);

  readonly items = signal<Item[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly selected = signal<number | null>(null);
  readonly visible = computed(() => (this.showInactive() ? this.items() : this.items().filter((x) => x.active)));
  readonly title = computed(() => \`\${this.b.label('f${pad(i)}')} (\${this.items().length})\`);

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.error.set('');
    this.a.fetchAll(this.entityId()).subscribe({
      next: (items) => {
        this.items.set(items);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load');
        this.loading.set(false);
      },
    });
  }

  select(item: Item): void {
    this.selected.set(item.id);
    this.${letters[nDeps - 1]}.track('select', item.id);
  }
}
`,
  );
  const provs = ds.map((d) => `        provideAutoSpy(${d.cls}),`).join('\n');
  const spies = ds.map((d, j) => `  let ${letters[j]}: Spy<${d.cls}>;`).join('\n');
  const assigns = ds.map((d, j) => `    ${letters[j]} = injectSpy(${d.cls});`).join('\n');
  const n = int(3, 7);
  const itemsArr = Array.from({ length: n }, (_, k) => ({ id: k + 1, name: `item-${i}-${k}`, active: k % 3 !== 1, score: int(0, 100) }));
  const activeN = itemsArr.filter((x) => x.active).length;
  const hotN = itemsArr.filter((x) => x.score > hot).length;
  const last = letters[nDeps - 1];
  write(
    `src/app/features/f${pad(i)}/f${pad(i)}.component.spec.ts`,
    `import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { Spy } from 'vitest-auto-spy';
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/angular';
import { Item } from '../../core/models';
${importDeps(ds, '../../')}
import { ${name} } from './f${pad(i)}.component';

const ITEMS: Item[] = ${JSON.stringify(itemsArr, null, 2)
      .replace(/"(\w+)":/g, '$1:')
      .replace(/"/g, "'")};

describe('${name}', () => {
  let fixture: ComponentFixture<${name}>;
  let el: HTMLElement;
${spies}

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [${name}],
      providers: [
${provs}
      ],
    });
${assigns}
    b.label.mockReturnValue('Title');
  });

  async function render(items: Item[] = ITEMS, inputs: Record<string, unknown> = {}): Promise<void> {
    a.fetchAll.nextWith(items);
    fixture = TestBed.createComponent(${name});
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    el = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  }

  it('creates', async () => {
    await render();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders every item', async () => {
    await render();
    expect(el.querySelectorAll('li').length).toBe(${n});
  });

  it('shows the empty state', async () => {
    await render([]);
    expect(el.querySelector('.empty')?.textContent).toContain('Nothing here');
  });

  it('shows loading until the stream emits', async () => {
    const subject = a.fetchAll.returnSubject();
    fixture = TestBed.createComponent(${name});
    el = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
    expect(el.querySelector('.loading')).not.toBeNull();
    subject.next(ITEMS);
    await fixture.whenStable();
    expect(el.querySelector('.loading')).toBeNull();
  });

  it('loads by the entity id input', async () => {
    await render(ITEMS, { entityId: ${i + 7} });
    expect(a.fetchAll).toHaveBeenCalledWith(${i + 7});
  });

  it('hides inactive items when asked', async () => {
    await render(ITEMS, { showInactive: false });
    expect(el.querySelectorAll('li').length).toBe(${activeN});
  });

  it('builds the title from the label service', async () => {
    await render();
    expect(el.querySelector('.title')?.textContent).toContain('Title (${n})');
    expect(b.label).toHaveBeenCalledWith('f${pad(i)}');
  });

  it('reloads on click', async () => {
    await render();
    el.querySelector('button')?.click();
    await fixture.whenStable();
    expect(a.fetchAll).toHaveBeenCalledTimes(2);
  });

  it('marks active items', async () => {
    await render();
    expect(el.querySelectorAll('li.active').length).toBe(${activeN});
  });

  it('flags hot items', async () => {
    await render();
    expect(el.querySelectorAll('.hot').length).toBe(${hotN});
  });

  it('shows the count', async () => {
    await render();
    expect(el.querySelector('.count')?.textContent?.trim()).toBe('${n}');
  });

  it('tracks a selection', async () => {
    await render();
    (el.querySelectorAll('li')[0] as HTMLElement).click();
    expect(${last}.track).toHaveBeenCalledWith('select', 1);
    expect(fixture.componentInstance.selected()).toBe(1);
  });

  it('shows an error when loading fails', async () => {
    a.fetchAll.throwWith(new Error('nope'));
    fixture = TestBed.createComponent(${name});
    el = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
    expect(el.querySelector('.error')?.textContent).toContain('Failed to load');
  });

  it.each([0, 1, ${n}])('renders a list of %i', async (size) => {
    await render(ITEMS.slice(0, size));
    expect(el.querySelector('.count')?.textContent?.trim()).toBe(String(size));
  });
});
`,
  );
  tests += 16;
  kinds.component++;
}

function genPipe(i) {
  const name = `F${pad(i)}Pipe`;
  const max = int(8, 20);
  write(
    `src/app/features/f${pad(i)}/f${pad(i)}.pipe.ts`,
    `import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'f${pad(i)}' })
export class ${name} implements PipeTransform {
  transform(value: string | null | undefined, max = ${max}, suffix = '…'): string {
    if (value == null) return '';
    const trimmed = value.trim();
    if (trimmed.length <= max) return trimmed;
    return trimmed.slice(0, Math.max(0, max - suffix.length)) + suffix;
  }
}
`,
  );
  const cases = [];
  for (let k = 0; k < 14; k++) {
    const len = int(0, max * 2);
    const s = Array.from({ length: len }, (_, j) => String.fromCharCode(97 + ((j + k) % 26))).join('');
    const exp = s.length <= max ? s : s.slice(0, max - 1) + '…';
    cases.push(`    ['${s}', '${exp}'],`);
  }
  write(
    `src/app/features/f${pad(i)}/f${pad(i)}.pipe.spec.ts`,
    `import { ${name} } from './f${pad(i)}.pipe';

describe('${name}', () => {
  const pipe = new ${name}();

  it('returns empty for nullish input', () => {
    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform(undefined)).toBe('');
  });

  it.each([
${cases.join('\n')}
  ])('truncates %j to %j', (input, expected) => {
    expect(pipe.transform(input)).toBe(expected);
  });
});
`,
  );
  tests += 15;
  kinds.pipe++;
}

function genGuard(i) {
  const d = pickN(deps, 1)[0];
  const limit = int(2, 9);
  write(
    `src/app/features/f${pad(i)}/f${pad(i)}.guard.ts`,
    `import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ${d.cls} } from '../../${d.file}';

export const f${pad(i)}Guard: CanActivateFn = (route) => {
  const svc = inject(${d.cls});
  const allowed = svc.count() >= ${limit} && svc.label(String(route.params['id'] ?? '')) !== '';
  svc.track('guard', allowed);
  return allowed ? true : inject(Router).createUrlTree(['/denied']);
};
`,
  );
  const rows = Array.from({ length: 12 }, (_, k) => {
    const c = int(0, 12);
    const lbl = k % 4 === 0 ? '' : 'ok';
    return `    [${c}, '${lbl}', ${c >= limit && lbl !== ''}],`;
  });
  write(
    `src/app/features/f${pad(i)}/f${pad(i)}.guard.spec.ts`,
    `import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import type { Spy } from 'vitest-auto-spy';
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/angular';
import { ${d.cls} } from '../../${d.file}';
import { f${pad(i)}Guard } from './f${pad(i)}.guard';

describe('f${pad(i)}Guard', () => {
  let svc: Spy<${d.cls}>;
  const route = { params: { id: '${i}' } } as unknown as ActivatedRouteSnapshot;
  const state = {} as RouterStateSnapshot;
  const run = () => TestBed.runInInjectionContext(() => f${pad(i)}Guard(route, state));

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideAutoSpy(${d.cls})] });
    svc = injectSpy(${d.cls});
  });

  it('reads the route id', () => {
    svc.count.mockReturnValue(${limit});
    svc.label.mockReturnValue('ok');
    run();
    expect(svc.label).toHaveBeenCalledWith('${i}');
  });

  it('redirects when denied', () => {
    svc.count.mockReturnValue(0);
    const result = run();
    expect(result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/denied');
  });

  it('tracks the decision', () => {
    svc.count.mockReturnValue(${limit});
    svc.label.mockReturnValue('ok');
    run();
    expect(svc.track).toHaveBeenCalledExactlyOnceWith('guard', true);
  });

  it.each([
${rows.join('\n')}
  ])('count %i label %j allows=%s', (count, label, allowed) => {
    svc.count.mockReturnValue(count);
    svc.label.mockReturnValue(label);
    expect(run() === true).toBe(allowed);
  });
});
`,
  );
  tests += 15;
  kinds.guard++;
}

for (let i = 0; i < N; i++) {
  const r = rnd();
  if (r < 0.55) genService(i);
  else if (r < 0.9) genComponent(i);
  else if (r < 0.95) genPipe(i);
  else genGuard(i);
}
console.log(JSON.stringify({ files: N, expectedTests: tests, kinds }));
