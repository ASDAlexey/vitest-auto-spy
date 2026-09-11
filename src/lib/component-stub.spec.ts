import {
  Component,
  Directive,
  EventEmitter,
  Input,
  Output,
  Pipe,
  type PipeTransform,
  booleanAttribute,
  input,
  model,
  output,
  reflectComponentType,
  signal,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { describe, expect, it, vi } from 'vitest';

import { createComponentStub } from './component-stub';
import { renderShallow } from './render-shallow';

@Component({
  selector: 'app-chart',
  exportAs: 'chart',
  template: '<header><ng-content select="[slot=title]"></ng-content></header><ng-content></ng-content><p>real chart</p>',
})
class ChartComponent {
  readonly series = input<number[]>([]);
  readonly zoom = model(1);
  readonly pointSelected = output<number>();

  @Input('caption') label = '';
  @Input({ transform: booleanAttribute }) compact = false;
  @Output() readonly legendToggled = new EventEmitter<boolean>();

  reset(): void {
    this.zoom.set(1);
  }
}

@Directive({ selector: '[appTooltip]', exportAs: 'tooltip' })
class TooltipDirective {
  readonly appTooltip = input('');
  readonly shown = output<string>();
}

@Pipe({ name: 'shout', pure: false })
class ShoutPipe implements PipeTransform {
  transform(value: string): string {
    return value.toUpperCase();
  }
}

@Component({
  selector: 'app-dashboard',
  imports: [ChartComponent, TooltipDirective, ShoutPipe],
  template: `
    <app-chart
      #chartRef="chart"
      [series]="series"
      [(zoom)]="zoom"
      caption="Sales"
      compact
      (pointSelected)="selected = $event"
      (legendToggled)="legend = $event"
    >
      <span slot="title">Quarter</span>
      <em>body</em>
    </app-chart>
    <b class="ref">{{ chartRef.constructor.name }}</b>
    <i [appTooltip]="'help'" #tip="tooltip" (shown)="tooltip = $event">{{ 'loud' | shout }}</i>
  `,
})
class DashboardComponent {
  series = [1, 2, 3];
  zoom = signal(2);
  selected: number | undefined;
  legend: boolean | undefined;
  tooltip: string | undefined;
}

@Component({ selector: 'app-a, [appA]:not(.skip), button.primary[type="submit"], :not(span)[appB]', template: '' })
class ManySelectorsComponent {}

@Directive({ selector: 'input[appMask]:not([type="checkbox"]), textarea.masked' })
class MaskDirective {}

@Directive()
class AbstractBaseDirective {}

class PlainClass {}

/** The dashboard with every real child swapped for a stub. */
function renderWithStubs(overrides: { chart?: object } = {}) {
  const ChartStub = createComponentStub(ChartComponent, overrides.chart);
  const TooltipStub = createComponentStub(TooltipDirective);
  const ShoutStub = createComponentStub(ShoutPipe);

  TestBed.configureTestingModule({ imports: [DashboardComponent] });
  TestBed.overrideComponent(DashboardComponent, {
    remove: { imports: [ChartComponent, TooltipDirective, ShoutPipe] },
    add: { imports: [ChartStub, TooltipStub, ShoutStub] },
  });

  const fixture = TestBed.createComponent(DashboardComponent);
  fixture.detectChanges();

  return { fixture, ChartStub, TooltipStub };
}

describe('createComponentStub', () => {
  it('stands in for a component: the real template never renders, projected content does', () => {
    const { fixture, ChartStub } = renderWithStubs();
    const host: HTMLElement = fixture.nativeElement;

    expect(host.textContent).not.toContain('real chart');
    expect(host.querySelector('app-chart [slot=title]')?.textContent).toBe('Quarter');
    expect(host.querySelector('app-chart em')?.textContent).toBe('body');
    expect(fixture.debugElement.query(By.directive(ChartStub))).not.toBeNull();
    expect(ChartStub.name).toBe('ChartComponentStub');
  });

  it('receives every input under its public name, a signal input as a signal', () => {
    const { fixture, ChartStub } = renderWithStubs();
    const chart = fixture.debugElement.query(By.directive(ChartStub)).componentInstance;

    expect(chart.series()).toEqual([1, 2, 3]);
    expect(chart.zoom()).toBe(2);
    expect(chart.label).toBe('Sales');
    expect(chart.compact).toBe(true);
  });

  it('emits every output to the parent, and a model back through its two-way binding', () => {
    const { fixture, ChartStub } = renderWithStubs();
    const chart = fixture.debugElement.query(By.directive(ChartStub)).componentInstance;
    const dashboard = fixture.componentInstance;

    chart.pointSelected.emit(3);
    chart.legendToggled.emit(false);
    chart.zoom.set(5);

    expect(dashboard.selected).toBe(3);
    expect(dashboard.legend).toBe(false);
    expect(dashboard.zoom()).toBe(5);
  });

  it('answers the parent template reference through exportAs', () => {
    const { fixture } = renderWithStubs();

    expect(fixture.nativeElement.querySelector('.ref').textContent).toBe('ChartComponentStub');
  });

  it('starts every instance with the overrides, copied per instance', () => {
    const reset = vi.fn();
    const { fixture, ChartStub } = renderWithStubs({ chart: { reset } });
    const chart = fixture.debugElement.query(By.directive(ChartStub)).componentInstance;

    chart.reset();

    expect(reset).toHaveBeenCalledTimes(1);
    expect(Object.hasOwn(chart, 'reset')).toBe(true);
  });

  it('stands in for a directive, inputs, outputs and exportAs included', () => {
    const { fixture, TooltipStub } = renderWithStubs();
    const tooltip = fixture.debugElement.query(By.directive(TooltipStub));

    expect(tooltip.injector.get(TooltipStub).appTooltip?.()).toBe('help');

    tooltip.injector.get(TooltipStub).shown?.emit('now');

    expect(fixture.componentInstance.tooltip).toBe('now');
  });

  it('stands in for a pipe, as the identity by default', () => {
    const { fixture } = renderWithStubs();

    expect(fixture.nativeElement.querySelector('i').textContent).toBe('loud');
  });

  it('keeps the pipe name and purity, and takes a transform from the overrides', () => {
    const ShoutStub = createComponentStub(ShoutPipe, { transform: (value: string) => `${value}!` });
    const Host = Component({ selector: 'app-host', imports: [ShoutStub], template: "{{ 'hey' | shout }}" })(class {});

    TestBed.configureTestingModule({ imports: [Host] });

    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toBe('hey!');
    expect(Reflect.get(ShoutStub, 'ɵpipe')).toMatchObject({ name: 'shout', pure: false });
  });

  it('takes a template of its own', () => {
    const ChartStub = createComponentStub(ChartComponent, {}, { template: '<span class="stub">stub</span>' });
    const Host = Component({ selector: 'app-host', imports: [ChartStub], template: '<app-chart><em>gone</em></app-chart>' })(class {});

    TestBed.configureTestingModule({ imports: [Host] });

    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toBe('stub');
  });

  it('renders nothing for a component that projects nothing', () => {
    const Stub = createComponentStub(ManySelectorsComponent);
    const Host = Component({ selector: 'app-host', imports: [Stub], template: '<app-a>text</app-a>' })(class {});

    TestBed.configureTestingModule({ imports: [Host] });

    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toBe('');
  });

  it('works next to renderShallow, as the one child the kept template still has', () => {
    const ChartStub = createComponentStub(ChartComponent);
    const { fixture } = renderShallow(DashboardComponent, { keepTemplate: true, keepChildren: [ChartStub] });

    expect(fixture.debugElement.query(By.directive(ChartStub)).componentInstance.series()).toEqual([1, 2, 3]);
    expect(fixture.debugElement.query(By.directive(ChartComponent))).toBeNull();
  });

  it('never shares a component ID with the real one or with another stub of it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    [ManySelectorsComponent, createComponentStub(ManySelectorsComponent), createComponentStub(ManySelectorsComponent)].forEach((type) =>
      Reflect.get(type, 'ɵcmp'),
    );

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  describe('the selector', () => {
    it('compiles back to the real one, for a component', () => {
      const Stub = createComponentStub(ManySelectorsComponent);

      expect(Reflect.get(Stub, 'ɵcmp').selectors).toEqual(Reflect.get(ManySelectorsComponent, 'ɵcmp').selectors);
      expect(reflectComponentType(Stub)?.selector).toBe(reflectComponentType(ManySelectorsComponent)?.selector);
    });

    it('compiles back to the real one, for a directive', () => {
      const Stub = createComponentStub(MaskDirective);

      expect(Reflect.get(Stub, 'ɵdir').selectors).toEqual(Reflect.get(MaskDirective, 'ɵdir').selectors);
    });
  });

  describe('what it refuses', () => {
    it('a class with no compiled definition', () => {
      expect(() => createComponentStub(PlainClass)).toThrow(/PlainClass carries no ɵcmp, ɵdir or ɵpipe/);
    });

    it('an import that resolved to nothing', () => {
      expect(() => createComponentStub(undefined as unknown as typeof PlainClass)).toThrow(/undefined carries no ɵcmp/);
    });

    it('a directive with no selector', () => {
      expect(() => createComponentStub(AbstractBaseDirective)).toThrow(/AbstractBaseDirective has no selector/);
    });
  });
});
