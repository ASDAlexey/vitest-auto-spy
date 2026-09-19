/**
 * How Vitest's own tooling meets a deep mock: `vi.spyOn` on a member nobody has read yet, and the
 * printers behind snapshots and assertion messages. Pinned so a runner upgrade or a trap change that
 * alters either shows up here rather than in a consumer's failure output.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { registerMockAdapter } from './mock-adapter';
import { mockDeep } from './mock-deep';
import { vitestMockAdapter } from './vitest-adapter';

beforeAll(() => {
  registerMockAdapter(vitestMockAdapter);
});

interface Repo {
  find(id: number): string;
  items: { title: string }[];
}

interface Api {
  repo: Repo;
  log(value: unknown): void;
}

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[\\d+m`, 'g');

/** The message an assertion failed with, colour codes stripped. */
function failureOf(assertion: () => void): string {
  try {
    assertion();
  } catch (error) {
    return String(error).replace(ANSI, '');
  }

  throw new Error('the assertion passed');
}

describe('vi.spyOn over a member nobody has read', () => {
  it('hands back the node itself, which is already a spy', () => {
    const api = mockDeep<Api>();
    const spy = vi.spyOn(api.repo, 'find');

    spy.mockReturnValue('found');

    expect(spy).toBe(api.repo.find);
    expect(api.repo.find(1)).toBe('found');
    expect(spy).toHaveBeenCalledWith(1);
  });

  it('answers `in` the way a read answers', () => {
    const api = mockDeep<Api>({ log: vi.fn() });
    const repo: object = api.repo;

    expect('find' in repo).toBe(true);
    expect('log' in api).toBe(true);
    expect('mockReturnValue' in repo).toBe(true);
    expect('then' in repo).toBe(false);
    expect('schedule' in repo).toBe(false);
    expect(Symbol.iterator in repo).toBe(false);
  });

  it('answers `false` for a deleted member, as the read answers `undefined`', () => {
    const api = mockDeep<Partial<Api>>();

    delete api.log;

    expect('log' in api).toBe(false);
  });

  it('keeps the spy surface `in` the node even when a member of that name was deleted', () => {
    const repo: Record<string, unknown> = mockDeep<Repo>();

    delete repo['mockReturnValue'];

    expect('mockReturnValue' in repo).toBe(true);
  });
});

describe('printing a deep mock', () => {
  it('snapshots a node as the mock function it is, named by its path', () => {
    const api = mockDeep<Api>();

    api.repo.find(3);

    expect({ find: api.repo.find, repo: api.repo }).toMatchInlineSnapshot(`
      {
        "find": [MockFunction mockDeep.repo.find] {
          "calls": [
            [
              3,
            ],
          ],
          "results": [
            {
              "type": "return",
              "value": undefined,
            },
          ],
        },
        "repo": [MockFunction mockDeep.repo],
      }
    `);
  });

  it('snapshots an array member as an array of nodes', () => {
    const api = mockDeep<Api>();

    void api.repo.items[0];
    void api.repo.items[1];

    expect(api.repo.items).toMatchInlineSnapshot(`
      [
        [MockFunction mockDeep.repo.items[0]],
        [MockFunction mockDeep.repo.items[1]],
      ]
    `);
  });

  it('names the spy in a failed call assertion', () => {
    const api = mockDeep<Api>();

    api.log('sent');

    expect(failureOf(() => expect(api.log).toHaveBeenCalledWith('expected'))).toContain(
      'expected "mockDeep.log" to be called with arguments: [ \'expected\' ]',
    );
  });

  it('labels a node passed as an argument `[Function undefined]` in the diff, and nothing worse', () => {
    const api = mockDeep<Api>();

    api.log(api.repo);

    // The diff printer labels a function by its `name` and stringifies it; on a node both are
    // members of the mocked type (see `isSpySurfaceKey`), so the label is empty rather than wrong.
    expect(failureOf(() => expect(api.log).toHaveBeenCalledWith({ id: 1 }))).toContain('[Function undefined]');
  });

  it('fails a deep equality with an AssertionError, not a printer crash', () => {
    const api = mockDeep<Api>();

    expect(failureOf(() => expect({ repo: api.repo }).toEqual({ repo: {} }))).toMatch(/^AssertionError: expected/);
  });

  it('matches a node passed as an argument by identity', () => {
    const api = mockDeep<Api>();

    api.log(api.repo);

    expect(api.log).toHaveBeenCalledWith(api.repo);
    expect(api.log).not.toHaveBeenCalledWith(mockDeep<Api>().repo);
  });
});
