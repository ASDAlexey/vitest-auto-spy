/**
 * A component declared the way an Angular application declares one — external template, external
 * stylesheet — which Angular's JIT compiler cannot resolve on its own. It compiles under
 * `bun test` only because `vitest-auto-spy/bun-angular` inlines both at load time.
 */
import { Component, inject, signal } from '@angular/core';

import { GreetingService } from './greeting.service';

@Component({
  selector: 'app-greeting',
  templateUrl: './greeting.component.html',
  styleUrls: ['./greeting.component.css'],
})
export class GreetingComponent {
  readonly #greetings = inject(GreetingService);

  readonly name = signal(this.#greetings.currentName());
}
