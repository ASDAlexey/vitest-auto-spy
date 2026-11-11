## 21. Design tests around observable behavior

Use these rules while choosing cases and assertions. For the testing API itself, follow the topic files linked from `AGENTS.md`.

1. Name the behavior and where it shows: a return value, state, an emitted event, a request or the DOM. Write expected values as literals worked out from the requirement. When the code is the only description of the behavior, say so in your report rather than presenting its current output as required.
2. Cover outcomes that differ, not branches. Where the behavior has them: a refused or failed operation, a limit and the value next to it, each condition that changes the outcome on its own, a missing value versus a valid `0`, `''` or `false`. Skip inputs the types rule out.
3. Choose inputs that expose mistakes: different values for different roles (`rename(7, 'Bob')`, not `rename(1, '1')`), mixed and unordered collections, data the operation actually changes. When the subject must pass a specific argument to get its answer, stub with `calledWith(args)` and assert the result. A method-level `mockReturnValue` replaces the `calledWith` dispatch and answers calls with wrong arguments too.
4. Assert the result first. Assert a call when the call is the behavior: a command sent, a request fired, nothing read back. Check the arguments that matter. Skip the call assertion when a `calledWith` stub and the result already prove the argument. Count or order calls only when a repeat or a swap is a defect; the HTTP testing backend counts requests by design.
5. An absence proves something only if the effect could have happened: assert what the same test did reach, or keep a test where the effect occurs. For events and streams without replay, subscribe before the trigger. Read state (signals, replayed streams, the DOM) after the work settles.

Before finishing, name one plausible wrong behavior these inputs and assertions would still accept. If that behavior is promised, close the gap, strengthening an existing test where it fits. Otherwise stop.

### Angular: what the boundary has to prove

- A handler called from the spec proves its logic, not its binding. Prove a binding once, through the real input or DOM event; a `protected` handler has no other entry.
- Pin the exact duration of a delay only when the duration is a requirement. Otherwise assert that nothing happened before the clock moves and that one result, from the latest input, appears after it.
- Replaced or destroyed work follows one of three contracts; find out which before writing the test. **Cancelled:** before replacement, capture `const old = injectHttpTesting().expectOne(url)` and then assert `old.cancelled`; a cancelled HTTP request cannot be flushed. **Ignored:** settle the old work late and assert the state is unchanged. **Shared:** one subscriber leaving does not cancel the request, and a second subscriber does not start another. Determine the cache lifetime from its configuration before asserting this behavior.
