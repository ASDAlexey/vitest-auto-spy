import { mergeConfig } from 'vitest/config';

import base from './vitest.config.mts';

// The library documents happy-dom's differences from jsdom and repairs some of them
// (`timer-globals.ts`, `clock.ts`, `abort-controller-stub.ts`), but the Vitest suites only ever ran
// on jsdom, so those repairs were tested against hand-built simulations — one of which missed the
// double `onabort` in `abort-controller-stub.ts`. This project runs the same suite on the real
// thing. Coverage stays with the jsdom run: that is the one carrying the 100 % gate.
export default mergeConfig(base, {
  test: {
    environment: 'happy-dom',
    coverage: { enabled: false },
  },
});
