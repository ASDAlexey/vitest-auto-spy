import { Component, booleanAttribute, input } from '@angular/core';

@Component({ selector: 'app-panel', template: '' })
export class PanelComponent {
  readonly isExpanded = input(false, { alias: 'expanded', transform: booleanAttribute });
}

@Component({ imports: [PanelComponent], template: '<app-panel expanded />' })
export class PanelHostComponent {}

@Component({ selector: 'app-slot', template: `<ng-content select='[slot="sales&amp;amp;tax"]'></ng-content>` })
export class QuotedSlotComponent {}

@Component({
  imports: [QuotedSlotComponent],
  template: `<app-slot><b slot="sales&amp;amp;tax">match</b><b slot="sales&amp;tax">near miss</b></app-slot>`,
})
export class SlotHostComponent {}

export const SERIES = [1, 2, 3];
