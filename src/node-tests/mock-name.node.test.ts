/**
 * What a `node:test` spy is called, on the runtime that decides it.
 *
 * `mock.fn()` has no `mockName`, and the proxy it hands back reports the *implementation's* own
 * `name` — so every spy read back as the library's internal `dispatch` until the adapter started
 * naming the implementation at creation and defining `displayName` on the proxy. Whether that
 * survives `resetCalls()`, `restore()` and a tracker-wide `mock.reset()`, and what an inspector
 * actually prints, is a property of Node's `MockTracker` and of `util.inspect` — neither of which a
 * stubbed unit spec can answer.
 */
import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { inspect } from 'node:util';

import { createAutoMock, createFunctionSpy, createSpyFromClass } from '../node';

interface NodeMockContext {
  resetCalls(): void;
  restore(): void;
}

function nodeMock(spy: unknown): NodeMockContext {
  return (spy as { mock: NodeMockContext }).mock;
}

function displayNameOf(spy: unknown): unknown {
  return Reflect.get(Object(spy), 'displayName');
}

function messageOf(assertion: () => void): string {
  try {
    assertion();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }

  throw new Error('the assertion was expected to fail');
}

class ReportService {
  render(id: number): string {
    return `report-${id}`;
  }
}

describe('spy naming on node:test', () => {
  it('names the method on both name and displayName', () => {
    const reports = createSpyFromClass(ReportService);

    assert.equal(reports.render.name, 'render');
    assert.equal(displayNameOf(reports.render), 'render');
  });

  it('keeps the name through resetCalls, restore and a tracker-wide reset', () => {
    const reports = createSpyFromClass(ReportService);

    nodeMock(reports.render).resetCalls();
    assert.equal(reports.render.name, 'render');
    assert.equal(displayNameOf(reports.render), 'render');

    nodeMock(reports.render).restore();
    assert.equal(reports.render.name, 'render');
    assert.equal(displayNameOf(reports.render), 'render');

    mock.reset();
    assert.equal(reports.render.name, 'render');
    assert.equal(displayNameOf(reports.render), 'render');
  });

  it('prints the method rather than the library dispatcher from util.inspect', () => {
    const reports = createSpyFromClass(ReportService);
    const printed = inspect(reports.render);

    assert.match(printed, /\[Function: render\]/);
    assert.doesNotMatch(printed, /dispatch/);
  });

  it('names the method in a node:assert diff', () => {
    const reports = createSpyFromClass(ReportService);
    const message = messageOf(() => {
      assert.deepEqual({ render: reports.render }, { render: 'render' });
    });

    assert.match(message, /\[Function: render\]/);
    assert.doesNotMatch(message, /dispatch/);
  });

  it('keeps displayName out of enumeration, and leaves it replaceable', () => {
    const reports = createSpyFromClass(ReportService);
    const descriptor = Object.getOwnPropertyDescriptor(reports.render, 'displayName');

    assert.deepEqual(descriptor, { value: 'render', writable: false, enumerable: false, configurable: true });
    assert.equal(Object.keys(reports.render).includes('displayName'), false);
  });

  it('names a standalone function spy and a member the proxy only just materialised', () => {
    const publish = createFunctionSpy<(id: number) => void>('publish');
    const queue = createAutoMock<{ enqueue(id: number): void }>();

    assert.equal(publish.name, 'publish');
    assert.equal(displayNameOf(publish), 'publish');
    assert.equal(queue.enqueue.name, 'enqueue');
    assert.equal(displayNameOf(queue.enqueue), 'enqueue');
  });
});
