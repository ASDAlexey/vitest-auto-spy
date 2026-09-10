/**
 * The private `MockTracker` on the runtime that has one.
 *
 * `src/lib/node-mock-tracker.spec.ts` drives the module through a stand-in host, because Vitest
 * cannot import `node:test` — so the one thing it cannot check is the thing the whole feature rests
 * on: that `mock.constructor` really is `MockTracker`, that an instance built from it records, and
 * that a spy whose tracker has been dropped keeps working. Every assertion below is about Node's
 * own tracker, and every one of them would be a stub asserting against itself anywhere else.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { countNodeMocks, createSpyFromClass, pruneNodeMocks, trackNodeMocks } from '../node';

class MailerService {
  send(to: string): void {
    void to;
  }

  queue(to: string): void {
    void to;
  }
}

// Top-level, the way a consumer's file does it: the sweep `trackNodeMocks()` installs is an
// `afterEach` on this file's root, and a test that registered it would be sweeping itself.
trackNodeMocks();

describe('trackNodeMocks on node:test', () => {
  it('counts the spies the private tracker is holding', () => {
    const mailer = createSpyFromClass(MailerService);

    assert.equal(countNodeMocks(), 0);

    mailer.send('a@example.com');
    mailer.queue('b@example.com');

    assert.equal(countNodeMocks(), 2);
  });

  it('sweeps the tracker after every test, and keeps tracking on the fresh one', () => {
    assert.equal(countNodeMocks(), 0);

    createSpyFromClass(MailerService).send('a@example.com');

    assert.equal(countNodeMocks(), 1);
  });

  it('drops the tracker on demand, and the spies it held go on recording', () => {
    const mailer = createSpyFromClass(MailerService);

    mailer.send.calledWith('a@example.com').mockReturnValue(undefined);
    mailer.send('a@example.com');

    assert.equal(pruneNodeMocks(), 1);
    assert.equal(countNodeMocks(), 0);

    mailer.send('c@example.com');
    assert.equal(mailer.send.mock.calls.length, 2);
  });

  it('hands back the same stop however often it is asked, and installs nothing further', () => {
    assert.equal(trackNodeMocks(), trackNodeMocks());

    createSpyFromClass(MailerService).send('a@example.com');

    assert.equal(countNodeMocks(), 1);
  });

  it('stops, and spies go back to the runtime tracker', () => {
    const stop = trackNodeMocks();
    const tracked = createSpyFromClass(MailerService);

    tracked.send('a@example.com');
    assert.equal(countNodeMocks(), 1);

    stop();

    const untracked = createSpyFromClass(MailerService);

    untracked.send('d@example.com');

    assert.equal(countNodeMocks(), 0);
    assert.equal(pruneNodeMocks(), 0);
    assert.equal(untracked.send.mock.calls.length, 1);
  });
});
