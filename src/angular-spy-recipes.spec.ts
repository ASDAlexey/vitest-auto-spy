import { SecurityContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DomSanitizer } from '@angular/platform-browser';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { provideAutoSpy } from './angular';
import { provideDomSanitizerDouble } from './angular-doubles';

type TaskConnection = { destroy(): void };

class TaskStore {
  declare readonly load: ((taskId: string) => TaskConnection) & { destroy(): void };
}

describe('Angular spy recipes', () => {
  afterEach(() => vi.restoreAllMocks());

  it('injects a callable override with both destroy methods intact', () => {
    const connection = { destroy: vi.fn() };
    const load = Object.assign(vi.fn<TaskStore['load']>().mockReturnValue(connection), { destroy: vi.fn() });

    TestBed.configureTestingModule({ providers: [provideAutoSpy(TaskStore, { overrides: { load } })] });

    const store = TestBed.inject(TaskStore);
    const result = store.load('task-1');
    result.destroy();
    store.load.destroy();

    expect(store.load).toBe(load);
    expect(load).toHaveBeenCalledExactlyOnceWith('task-1');
    expect(result).toBe(connection);
    expect(connection.destroy).toHaveBeenCalledExactlyOnceWith();
    expect(load.destroy).toHaveBeenCalledExactlyOnceWith();
  });

  it('asserts trusted HTML through the matching security context', () => {
    TestBed.configureTestingModule({ providers: [provideDomSanitizerDouble()] });
    const sanitizer = TestBed.inject(DomSanitizer);
    const html = '<b>Tasks</b>';
    const trusted = sanitizer.bypassSecurityTrustHtml(html);

    expect(trusted).not.toBe(html);
    expect(sanitizer.sanitize(SecurityContext.HTML, trusted)).toBe(html);
  });

  it('records calls without replacing Angular sanitization', () => {
    const sanitizer = TestBed.inject(DomSanitizer);
    // eslint-disable-next-line vitest-auto-spy/prefer-inject-spy -- This recipe keeps Angular's sanitizer implementation.
    const sanitize = vi.spyOn(sanitizer, 'sanitize');
    const html = '<b>Tasks</b><script>ignored</script>';

    expect(sanitizer.sanitize(SecurityContext.HTML, html)).toBe('<b>Tasks</b>');
    expect(sanitize).toHaveBeenCalledExactlyOnceWith(SecurityContext.HTML, html);
  });
});
