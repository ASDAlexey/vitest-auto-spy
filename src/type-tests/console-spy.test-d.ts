/**
 * Type-level tests for the `/console` entry.
 *
 * The entry is one bag of eight spies plus three lifecycle calls, and a spec writes code against
 * exactly those names. A bag widened to an index signature, a lifecycle call that grew an options
 * parameter, or a spy that stopped being callable would all pass every runtime test — the names
 * still exist at runtime — so the shapes are pinned here instead.
 */
import { describe, expectTypeOf, it } from 'vitest';

import {
  type ConsoleMethodSpy,
  type ConsoleSpies,
  consoleDebugSpy,
  consoleErrorSpy,
  consoleInfoSpy,
  consoleLogSpy,
  consoleTimeEndSpy,
  consoleTimeSpy,
  consoleTraceSpy,
  consoleWarnSpy,
  installConsoleSpies,
  resetConsoleSpies,
  restoreConsole,
} from '../console';

describe('the exported spies', () => {
  it("are the bag's own members, at the shared spy type", () => {
    expectTypeOf(consoleDebugSpy).toEqualTypeOf<ConsoleMethodSpy>();
    expectTypeOf(consoleErrorSpy).toEqualTypeOf<ConsoleMethodSpy>();
    expectTypeOf(consoleInfoSpy).toEqualTypeOf<ConsoleMethodSpy>();
    expectTypeOf(consoleLogSpy).toEqualTypeOf<ConsoleMethodSpy>();
    expectTypeOf(consoleTimeEndSpy).toEqualTypeOf<ConsoleMethodSpy>();
    expectTypeOf(consoleTimeSpy).toEqualTypeOf<ConsoleMethodSpy>();
    expectTypeOf(consoleTraceSpy).toEqualTypeOf<ConsoleMethodSpy>();
    expectTypeOf(consoleWarnSpy).toEqualTypeOf<ConsoleMethodSpy>();
  });

  it('stay callable the way console methods are: any arguments, no result', () => {
    expectTypeOf(consoleErrorSpy).toBeCallableWith('boom', new Error('boom'), { cause: 1 });
    expectTypeOf(consoleErrorSpy('boom')).toBeVoid();
  });
});

describe('installConsoleSpies', () => {
  it('hands back the bag, one spy per spied method', () => {
    const spies = installConsoleSpies();

    expectTypeOf(spies).toEqualTypeOf<ConsoleSpies>();
    expectTypeOf(spies.consoleErrorSpy).toEqualTypeOf<ConsoleMethodSpy>();
    expectTypeOf(spies.consoleWarnSpy).toEqualTypeOf<ConsoleMethodSpy>();
  });

  it('names its members, and only those', () => {
    const spies = installConsoleSpies();

    // The eight methods are the whole of what the platform offers quietly; a `consoleFatalSpy`
    // would be a name nothing on `console` answers to.
    // @ts-expect-error -- the bag has no such member
    spies.consoleFatalSpy;
  });

  it('takes nothing — silence is the one behaviour there is', () => {
    // @ts-expect-error -- there is nothing to configure
    installConsoleSpies({ silent: false });
  });
});

describe('the lifecycle calls', () => {
  it('reset and restore, returning nothing', () => {
    expectTypeOf(resetConsoleSpies()).toBeVoid();
    expectTypeOf(restoreConsole()).toBeVoid();
  });

  it('accept no arguments', () => {
    // @ts-expect-error -- the reset clears every spy; nothing to pick from
    resetConsoleSpies('error');
    // @ts-expect-error -- the restore puts everything back
    restoreConsole({ keep: ['warn'] });
  });
});
