/**
 * `explainSpy` pairs each configured argument list with the calls that did or did not hit it. These
 * specs pin the attribution, the two narratives a reader most often arrives in — nothing configured
 * and nothing matched — and the refusal to throw on anything that is not one of this library's
 * doubles.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { createAutoMock } from './auto-mock';
import { createSpyFromClass } from './create-spy-from-class';
import { explainSpy } from './explain-spy';
import { createFunctionSpy } from './function-spy';
import { registerMockAdapter } from './mock-adapter';
import { mockDeep } from './mock-deep';
import { markAsMock } from './spy-mark';
import { vitestMockAdapter } from './vitest-adapter';

beforeAll(() => {
  registerMockAdapter(vitestMockAdapter);
});

class UserService {
  load(_id: number): string {
    return '';
  }

  save(_name: string): void {}

  remove(_id: number): void {}

  get name(): string {
    return '';
  }

  set name(_value: string) {}
}

interface Repository {
  find(id: number): string;
}

describe('explainSpy', () => {
  it('attributes every call to the config it hit, and names the default for the ones that hit none', () => {
    const users = createSpyFromClass(UserService);
    users.load.calledWith(1).mockReturnValue('one');
    users.load.calledWith(expect.any(String)).mockReturnValue('any');

    users.load(1);
    users.load(2);
    users.load('x' as unknown as number);

    const report = explainSpy(users, 'load');

    expect(report).toContain('load — 3 calls, 2 configured');
    expect(report).toContain('#1 calledWith(1)');
    expect(report).toContain('#2 calledWith(Any<String>)');
    expect(report).toContain('#1 load(1) -> matched #1');
    expect(report).toContain('#2 load(2) -> no configured arguments matched; the default value was used');
    expect(report).toContain("#3 load('x') -> matched #2");
  });

  it('numbers the two chains in one sequence, so a call names a single config', () => {
    const repo = createAutoMock<Repository>();
    repo.find.calledWith(1).mockReturnValue('one');
    repo.find.mustBeCalledWith(2).mockReturnValue('two');

    repo.find(2);

    const report = explainSpy(repo, 'find');

    expect(report).toContain('#1 calledWith(1)');
    expect(report).toContain('#2 mustBeCalledWith(2)');
    expect(report).toContain('#1 find(2) -> matched #2');
  });

  it('says outright when N calls matched nothing', () => {
    const repo = createAutoMock<Repository>();
    repo.find.calledWith(1).mockReturnValue('one');

    repo.find(7);
    repo.find(8);

    expect(explainSpy(repo, 'find')).toContain('find — 2 calls, 1 configured, none matched');
  });

  it('says outright when nothing was configured, and drops the per-call verdict that would say nothing', () => {
    const repo = createAutoMock<Repository>();

    repo.find(7);

    const report = explainSpy(repo, 'find');

    expect(report).toContain('find — 1 call, nothing configured');
    expect(report).toContain('#1 find(7)');
    expect(report).not.toContain('->');
  });

  it('reports a configured member that was never called', () => {
    const repo = createAutoMock<Repository>();
    repo.find.calledWith(1).mockReturnValue('one');

    const report = explainSpy(repo, 'find');

    expect(report).toContain('find — never called, 1 configured');
    expect(report).not.toContain('calls:');
  });

  it('reports every spied member, accessor spies included, when no method is named', () => {
    const users = createSpyFromClass(UserService, { autoSpyAccessors: true });
    users.load.calledWith(1).mockReturnValue('one');

    users.save('a');

    const report = explainSpy(users);

    expect(report).toContain('[vitest-auto-spy] explainSpy');
    expect(report).toContain('load — never called, 1 configured');
    expect(report).toContain('save — 1 call, nothing configured');
    expect(report).toContain('get name — never called, nothing configured');
    expect(report).toContain('set name — never called, nothing configured');
    // A lazy method nobody touched is left out rather than built: it would be materialised only to
    // report that it has nothing to report.
    expect(report).not.toContain('remove');
  });

  it('explains a single function spy, taking its name from the mock', () => {
    const load = createFunctionSpy<(id: number) => string>('load');
    load.calledWith(1).mockReturnValue('one');

    load(1);

    expect(explainSpy(load)).toContain('load — 1 call, 1 configured');
  });

  it('falls back to a generic name for a marked mock that carries none, and to the given method name', () => {
    const anonymous = vi.fn();
    markAsMock(anonymous);

    anonymous(1);

    expect(explainSpy(anonymous)).toContain('spy — 1 call, nothing configured');
    expect(explainSpy(anonymous, 'ping')).toContain('ping — 1 call, nothing configured');
  });

  it('reports a marked double that answers no mock name at all', () => {
    const foreign = Object.assign(() => undefined, { mock: { calls: [[1]] } });
    markAsMock(foreign);

    expect(explainSpy(foreign)).toContain('spy — 1 call, nothing configured');
  });

  it('answers a named accessor from the bag rather than by invoking the live accessor', () => {
    const users = createSpyFromClass(UserService, { autoSpyAccessors: true });

    const report = explainSpy(users, 'name');

    expect(report).toContain('get name — never called, nothing configured');
    expect(report).toContain('set name — never called, nothing configured');
    // Reading the property is what the bag lookup exists to avoid: it would record a call here.
    expect(users.accessorSpies.getters.name).not.toHaveBeenCalled();
  });

  it('reports a plain runner mock as not one of ours instead of throwing', () => {
    const plain = vi.fn();

    expect(explainSpy(plain)).toContain('nothing to explain: this value holds no spy created by vitest-auto-spy');
    expect(explainSpy({ load: plain }, 'load')).toContain('load is not a spy created by vitest-auto-spy');
    expect(explainSpy({}, 'missing')).toContain('missing is not a spy created by vitest-auto-spy');
    expect(explainSpy({ plain: 1 })).toContain('nothing to explain');
  });

  it('walks a mockDeep tree: the node, the named child and the leaf', () => {
    const api = mockDeep<{ repo: { find(id: number): string } }>();
    api.repo.find.calledWith(1).mockReturnValue('one');

    api.repo.find(1);

    expect(explainSpy(api)).toContain('mockDeep — never called, nothing configured');
    expect(explainSpy(api.repo, 'find')).toContain('find — 1 call, 1 configured');
    expect(explainSpy(api.repo.find)).toContain('mockDeep.repo.find — 1 call, 1 configured');
  });

  it('ignores a bag that is not the accessor-spies shape', () => {
    const fake = { accessorSpies: 'not a bag', getters: 1 };
    const halfBag = { accessorSpies: { getters: null, setters: { name: 'not a mock' } } };

    expect(explainSpy(fake)).toContain('nothing to explain');
    expect(explainSpy(halfBag)).toContain('nothing to explain');
  });
});
