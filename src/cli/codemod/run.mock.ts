export const LEGACY = [
  "import { createSpyFromClass, provideAutoSpy, Spy } from 'jest-auto-spies';",
  '',
  "import { Service } from './service';",
  '',
  'describe("Service", () => {',
  '  let service: Spy<Service>;',
  '  let hook: jest.Mock<void, [Service]>;',
  '',
  '  beforeEach(() => {',
  '    service = TestBed.inject(Service) as Spy<Service>;',
  '    jest.spyOn(service, "load").mockImplementation();',
  '    hook = jest.fn();',
  '  });',
  '});',
  '',
].join('\n');

/**
 * The same suite as it was written under jasmine: the upstream package, the `.and` namespace over
 * both APIs at once, a bare `spyOn`, and the two globals nothing imports.
 */
export const JASMINE = [
  "import { createSpyFromClass, provideAutoSpy, Spy } from 'jasmine-auto-spies';",
  '',
  "import { Service } from './service';",
  '',
  'describe("Service", () => {',
  '  let service: Spy<Service>;',
  '',
  '  beforeEach(() => {',
  '    jasmine.clock().install();',
  '    service = createSpyFromClass(Service);',
  "    spyOn(service, 'reset');",
  '    service.load.and.nextWith(1);',
  '    service.save.and.returnValue(2);',
  '  });',
  '',
  '  it("loads", () => {',
  '    expect(service.ready).toBeTrue();',
  '  });',
  '});',
  '',
].join('\n');

export const REPO = {
  'package.json': JSON.stringify({ scripts: { test: 'vitest run' }, devDependencies: { vitest: '^4', '@angular/core': '^20' } }),
  'src/app/service.spec.ts': LEGACY,
  'src/app/service.ts': 'export class Service {}\n',
  'vitest.config.ts': 'export default { test: { globals: true } };\n',
};
