/** The collaborator the fixture component injects, so DI has something worth spying on. */
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class GreetingService {
  currentName(): string {
    return 'real user';
  }

  async loadName(): Promise<string> {
    return 'real user';
  }
}
