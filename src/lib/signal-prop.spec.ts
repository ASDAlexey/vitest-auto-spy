import {
  Component,
  Injectable,
  type ModelSignal,
  type Signal,
  type Type,
  computed,
  effect,
  input,
  linkedSignal,
  model,
  signal,
} from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';

import '../angular';
import { injectSpy, provideAutoSpy } from './angular';
import { restoreMockedProps } from './prop-mock';
import { mockSignalProp } from './signal-prop';
import { stable } from './zoneless';

@Injectable({ providedIn: 'root' })
class CounterService {
  readonly count: Signal<number> = signal(0);

  reset(): void {
    /* prototype method, so the auto-spy finds it */
  }
}

@Component({
  selector: 'vas-filter',
  template: '[{{ filter() }}|{{ label() }}]',
})
class FilterComponent {
  readonly filter: Signal<string> = signal('all');
  readonly label = computed(() => `f=${this.filter()}`);
  readonly seen: string[] = [];

  constructor() {
    effect(() => this.seen.push(this.filter()));
  }
}

@Component({
  selector: 'vas-total',
  template: '[{{ total() }}]',
})
class TotalComponent {
  readonly count = signal(2);
  readonly total: Signal<number> = computed(() => this.count() * 10);
}

@Component({
  selector: 'vas-mode',
  template: '[{{ mode() }}]',
})
class ModeComponent {
  readonly mode = input('idle');
}

@Component({
  selector: 'vas-editor',
  template: '[{{ draft() }}]',
})
class EditorComponent {
  readonly draft: ModelSignal<string> = model('empty');
}

/** Configure, create and render in one line — every component here is rendered before it is driven. */
function render<T>(type: Type<T>): ComponentFixture<T> {
  TestBed.configureTestingModule({ imports: [type] });

  const fixture = TestBed.createComponent(type);

  fixture.detectChanges();

  return fixture;
}

function textOf(fixture: ComponentFixture<unknown>): string {
  return String(fixture.nativeElement.textContent);
}

describe('mockSignalProp', () => {
  afterEach(() => {
    restoreMockedProps();
    TestBed.resetTestingModule();
  });

  it('replaces the property with a signal the spec can write', () => {
    TestBed.configureTestingModule({ providers: [provideAutoSpy(CounterService)] });

    const service = injectSpy(CounterService);
    const count = mockSignalProp(service, 'count', 7);

    expect(service.count()).toBe(7);

    count.set(42);

    expect(service.count()).toBe(42);
  });

  it('stays reactive, so a computed downstream recomputes', () => {
    TestBed.configureTestingModule({ providers: [provideAutoSpy(CounterService)] });

    const service = injectSpy(CounterService);
    const count = mockSignalProp(service, 'count', 1);
    const label = computed(() => `${service.count()} items`);

    expect(label()).toBe('1 items');

    count.update((value) => value + 1);

    expect(label()).toBe('2 items');
  });

  it('reaches a computed that read the member first', () => {
    const service = new CounterService();
    const label = computed(() => `${service.count()} items`);

    // The read that fixes the link: from here the computed is wired to the signal, not to the property.
    expect(label()).toBe('0 items');

    const count = mockSignalProp(service, 'count', 5);

    expect(label()).toBe('5 items');

    count.set(9);

    expect(label()).toBe('9 items');
    expect(service.count()).toBe(9);
  });

  it('reaches a template and an effect that rendered before the call', async () => {
    const fixture = render(FilterComponent);
    const component = fixture.componentInstance;

    expect(textOf(fixture)).toBe('[all|f=all]');

    const filter = mockSignalProp(component, 'filter', 'open');

    await stable(fixture);

    expect(textOf(fixture)).toBe('[open|f=open]');

    filter.set('closed');
    await stable(fixture);

    expect(textOf(fixture)).toBe('[closed|f=closed]');
    expect(component.seen).toEqual(['all', 'open', 'closed']);
  });

  it('keeps a model writable from both ends', () => {
    const component = render(EditorComponent).componentInstance;
    const emitted: string[] = [];

    component.draft.subscribe((value) => emitted.push(value));

    const draft = mockSignalProp(component, 'draft', 'filled');

    expect(typeof component.draft.subscribe).toBe('function');
    expect(emitted).toEqual(['filled']);

    draft.set('edited');

    expect(emitted).toEqual(['filled', 'edited']);
    expect(component.draft()).toBe('edited');
  });

  it('writes through a linkedSignal without cutting it off its source', () => {
    const source = signal(1);
    const holder = { doubled: linkedSignal(() => source() * 2) };

    expect(holder.doubled()).toBe(2);

    const doubled = mockSignalProp(holder, 'doubled', 100);

    expect(holder.doubled()).toBe(100);

    doubled.set(50);
    source.set(3);

    expect(holder.doubled()).toBe(6);
  });

  it('refuses an input, and names setInput as the way to drive one', () => {
    const component = render(ModeComponent).componentInstance;

    expect(() => mockSignalProp(component, 'mode', 'patched')).toThrow(/is an input\(\) signal/);
    expect(() => mockSignalProp(component, 'mode', 'patched')).toThrow(/componentRef\.setInput\('mode', value\)/);
  });

  it('leaves the input alone, so setInput still works after the refusal', async () => {
    const fixture = render(ModeComponent);

    expect(() => mockSignalProp(fixture.componentInstance, 'mode', 'patched')).toThrow(/input\(\) signal/);

    fixture.componentRef.setInput('mode', 'from-parent');
    await stable(fixture);

    expect(textOf(fixture)).toBe('[from-parent]');
  });

  it('swaps a computed the spec patches before anything has read it', async () => {
    TestBed.configureTestingModule({ imports: [TotalComponent] });

    const fixture = TestBed.createComponent(TotalComponent);
    const total = mockSignalProp(fixture.componentInstance, 'total', 7);

    await stable(fixture);

    expect(textOf(fixture)).toBe('[7]');

    total.set(8);
    await stable(fixture);

    expect(textOf(fixture)).toBe('[8]');
  });

  it('refuses to swap a computed a rendered template already reads', () => {
    const component = render(TotalComponent).componentInstance;

    expect(() => mockSignalProp(component, 'total', 7)).toThrow(/already read/);
    expect(() => mockSignalProp(component, 'total', 7)).toThrow(/Patch before the first detectChanges\(\)/);
  });

  it('is undone by restoreMockedProps where it patched the property', () => {
    TestBed.configureTestingModule({ providers: [provideAutoSpy(CounterService)] });

    const service = injectSpy(CounterService);

    mockSignalProp(service, 'count', 5);

    expect(service.count()).toBe(5);

    restoreMockedProps();

    expect(service.count).toBeUndefined();
  });

  it('has nothing to restore where it wrote through the member', () => {
    const service = new CounterService();

    mockSignalProp(service, 'count', 5);
    restoreMockedProps();

    // The signal is the service's own, so the value stays where the spec left it.
    expect(service.count()).toBe(5);
  });
});
