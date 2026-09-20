/**
 * A journal is worth exactly the ORDER it reports, so the specs assert on whole sequences:
 * entries as recorded (callbacks fired out of their declaration order included), `items` as a
 * snapshot that later calls must not rewrite under a held reference, and `result()` as the
 * one-line rendering a failure diff shows.
 */
import { describe, expect, it } from 'vitest';

import { createLog } from './call-log';

describe('createLog', () => {
  it('records entries in the order they were added', () => {
    const log = createLog();

    log.add('init');
    log.add('load');

    expect(log.items).toEqual(['init', 'load']);
    expect(log.result()).toBe('init; load');
  });

  it('renders an empty journal as an empty string', () => {
    const log = createLog();

    expect(log.result()).toBe('');
    expect(log.items).toEqual([]);
  });

  it('records through fn() when the callback runs, not when it is made', () => {
    const log = createLog();
    const onOpen = log.fn('open');

    expect(log.items).toEqual([]);

    onOpen();

    expect(log.items).toEqual(['open']);
  });

  it('keeps the order callbacks fire in, not the order they were declared', () => {
    const log = createLog();
    const onInit = log.fn('init');
    const onReady = log.fn('ready');
    const onDestroy = log.fn('destroy');

    onReady();
    onDestroy();
    onInit();

    expect(log.items).toEqual(['ready', 'destroy', 'init']);
    expect(log.result()).toBe('ready; destroy; init');
  });

  it('interleaves add() and fn() into one sequence', () => {
    const log = createLog();
    const onSaved = log.fn('saved');

    log.add('saving');
    onSaved();
    log.add('closed');

    expect(log.result()).toBe('saving; saved; closed');
  });

  it('clears every entry and keeps recording afterwards', () => {
    const log = createLog();

    log.add('init');
    log.clear();

    expect(log.items).toEqual([]);
    expect(log.result()).toBe('');

    log.add('restarted');
    expect(log.items).toEqual(['restarted']);
  });

  it('hands out items as a snapshot a held reference keeps', () => {
    const log = createLog();

    log.add('first');
    const held = log.items;

    log.add('second');

    expect(held).toEqual(['first']);
    expect(log.items).not.toBe(held);
    expect(log.items).toEqual(['first', 'second']);
  });

  it('does not let a spec rewrite the record through a returned array', () => {
    const log = createLog();

    log.add('init');

    const copy = log.items;
    (copy as string[]).push('forged');

    expect(log.items).toEqual(['init']);
  });

  it('narrows the vocabulary when the type argument is a literal union', () => {
    const log = createLog<'boot' | 'run' | 'halt'>();

    log.add('boot');
    log.fn('halt')();

    expect(log.result()).toBe('boot; halt');
  });
});
