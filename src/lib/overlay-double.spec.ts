/**
 * `@angular/cdk` is not installed here, and must not be: `Overlay` below stands in for the CDK class
 * as the DI token and the shape the double is measured against. The component opens its panel the
 * everyday way — position chain, scroll strategy, attach, backdrop — through a real `TestBed`.
 */
import { Component, Injectable, Injector, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import '../index';
import { createOverlayDouble, injectOverlayDouble, provideOverlayDouble } from './overlay-double';

interface PanelRef {
  attach(portal: unknown): { instance: Record<string, unknown> };
  dispose(): void;
  hasAttached(): boolean;
  backdropClick(): { subscribe(next: () => void): unknown };
  keydownEvents(): { subscribe(next: (event: KeyboardEvent) => void): unknown };
}

@Injectable({ providedIn: 'root' })
class Overlay {
  create(_config?: unknown): PanelRef {
    throw new Error('@angular/cdk is not installed; Overlay stands in for its declaration only.');
  }

  position(): never {
    throw new Error('@angular/cdk is not installed');
  }
}

interface FluentStrategy {
  flexibleConnectedTo(origin: unknown): FluentStrategy;
  withPositions(positions: unknown[]): FluentStrategy;
  withPush(push: boolean): FluentStrategy;
  positionChanges: { subscribe(next: () => void): unknown };
}

@Component({ selector: 'vas-menu', standalone: true, template: '' })
class MenuComponent {
  private readonly overlay = inject(Overlay);
  ref: PanelRef | undefined;
  closedBy = '';

  open(): void {
    const members = this.overlay as unknown as { position(): FluentStrategy; scrollStrategies: { reposition(): unknown } };
    const strategy = members
      .position()
      .flexibleConnectedTo('origin')
      .withPositions([{ originX: 'start' }])
      .withPush(false);

    strategy.positionChanges.subscribe(() => undefined);
    this.ref = this.overlay.create({
      positionStrategy: strategy,
      scrollStrategy: members.scrollStrategies.reposition(),
      hasBackdrop: true,
    });
    this.ref.attach('portal').instance['label'] = 'Menu';
    this.ref.backdropClick().subscribe(() => {
      this.closedBy = 'backdrop';
      this.ref?.dispose();
    });
    this.ref.keydownEvents().subscribe((event) => {
      this.closedBy = event.key;
    });
  }
}

describe('provideOverlayDouble', () => {
  it('opens a panel through the chain, and closes it from the backdrop', () => {
    TestBed.configureTestingModule({ providers: [provideOverlayDouble(Overlay, { componentInstance: { label: '' } })] });

    const menu = TestBed.createComponent(MenuComponent).componentInstance;
    const overlay = injectOverlayDouble(Overlay);

    menu.open();

    const panel = overlay.lastRef();

    expect(overlay.create).toHaveBeenCalledTimes(1);
    expect(panel.config).toMatchObject({ hasBackdrop: true, scrollStrategy: { kind: 'reposition' } });
    expect(overlay.positionCalls()).toEqual([
      { method: 'position', args: [] },
      { method: 'flexibleConnectedTo', args: ['origin'] },
      { method: 'withPositions', args: [[{ originX: 'start' }]] },
      { method: 'withPush', args: [false] },
    ]);
    expect(panel.attach).toHaveBeenCalledWith('portal');
    expect(panel.ref.hasAttached()).toBe(true);

    panel.emitKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));

    expect(menu.closedBy).toBe('ArrowDown');

    panel.emitBackdropClick();

    expect(menu.closedBy).toBe('backdrop');
    expect(panel.dispose).toHaveBeenCalledTimes(1);
    expect(panel.ref.hasAttached()).toBe(false);
  });

  it('refuses a handle when the overlay is not the double', () => {
    expect(() => injectOverlayDouble(Overlay)).toThrow(/the Overlay in the injector given is not one provideOverlayDouble\(\) built/);
  });

  it('refuses a handle when nothing provides the overlay', () => {
    class UnprovidedOverlay {
      create(): unknown {
        return undefined;
      }
    }

    expect(() => injectOverlayDouble(UnprovidedOverlay)).toThrow(/the UnprovidedOverlay in the injector given/);
  });

  it('reads the handle from a given injector', () => {
    TestBed.configureTestingModule({ providers: [provideOverlayDouble(Overlay)] });

    expect(injectOverlayDouble(Overlay, TestBed.inject(Injector)).refs).toEqual([]);
  });
});

describe('createOverlayDouble', () => {
  it('keeps one ref per create, each with its own state and streams', () => {
    const double = createOverlayDouble(Overlay);

    expect(() => double.lastRef()).toThrow(/nothing called Overlay\.create\(\) yet/);

    const first = double.overlay.create();
    const second = double.overlay.create({ width: 200 });
    const [one, two] = double.refs;
    const seen: string[] = [];

    expect(first).toBe(one?.ref);
    expect(second).toBe(two?.ref);
    expect(double.lastRef()).toBe(two);
    expect(two?.ref.getConfig()).toEqual({ width: 200 });

    one?.ref.attachments().subscribe(() => seen.push('attached'));
    one?.ref.detachments().subscribe(() => seen.push('detached'));
    one?.ref.outsidePointerEvents().subscribe((event) => seen.push(event.type));

    const component = one?.ref.attach('portal');

    component?.setInput('x', 1);
    component?.destroy();
    one?.ref.detach();
    one?.emitOutsidePointer();
    one?.emitOutsidePointer(new MouseEvent('auxclick'));

    expect(seen).toEqual(['attached', 'detached', 'click', 'auxclick']);
    expect(component?.instance).toEqual({});
    expect(two?.ref.hasAttached()).toBe(false);
  });

  it('answers the rest of the ref surface', () => {
    const { overlay, lastRef } = createOverlayDouble(Overlay);

    overlay.create();

    const panel = lastRef();
    const { ref } = panel;

    ref.addPanelClass(['open', 'wide']);
    ref.removePanelClass('wide');
    ref.updatePosition();
    ref.updateSize({ width: 10 });
    ref.updatePositionStrategy({});
    ref.updateScrollStrategy({});

    expect([...(ref.overlayElement?.classList ?? [])]).toEqual(['open']);
    expect(ref.hostElement).toBeInstanceOf(HTMLElement);
    expect(ref.backdropElement).toBeNull();
    expect(ref.getDirection()).toBe('ltr');

    ref.setDirection('rtl');

    expect(ref.getDirection()).toBe('rtl');

    ref.setDirection('anything');

    expect(ref.getDirection()).toBe('ltr');
    expect(panel.addPanelClass).toHaveBeenCalledWith(['open', 'wide']);
    expect(panel.removePanelClass).toHaveBeenCalledWith('wide');
    expect(panel.updatePosition).toHaveBeenCalledTimes(1);
  });

  it('builds scroll strategies and a chain that is not a thenable', () => {
    const members = createOverlayDouble(Overlay).overlay as unknown as {
      position(): Record<PropertyKey, unknown>;
      scrollStrategies: Record<string, () => { kind: string; attach(): void; enable(): void; disable(): void }>;
    };

    for (const kind of ['noop', 'close', 'block', 'reposition']) {
      const strategy = members.scrollStrategies[kind]?.();

      strategy?.attach();
      strategy?.enable();
      strategy?.disable();

      expect(strategy?.kind).toBe(kind);
    }

    const chain = members.position();

    expect(chain['then']).toBeUndefined();
    expect(chain[Symbol.toPrimitive]).toBeUndefined();
  });

  it('completes the streams on dispose', () => {
    const { overlay, lastRef } = createOverlayDouble(Overlay);

    overlay.create();

    let completed = false;

    lastRef()
      .ref.backdropClick()
      .subscribe({ complete: () => (completed = true) });
    lastRef().ref.dispose();

    expect(completed).toBe(true);
  });
});
