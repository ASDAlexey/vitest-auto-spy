/** The `--help` screen. One string, so the usage text and the flag table cannot drift apart. */
export const HELP = `vitest-auto-spy — typed test spies generated from a class or a type.

Usage
  npx vitest-auto-spy <command> [options]

Commands
  doctor    Report suite-level defects that never fail a run: a tsconfig include
            pattern that matches no file, a spec another file imports, a foreign
            runner's docblock pragma, configuration for a runner that is gone.
            Read-only — it never edits a file. Exits 1 when anything is found.

  codemod   Migrate a suite off jest-auto-spies and Jest: split the legacy
            import across this package's entry points, rewrite
            \`TestBed.inject(X) as Spy<X>\`, transpose \`jest.Mock<R, [A]>\` into
            the call signature Vitest takes, and rename the jest.* members that
            have a vi.* twin. Prints a diff and writes nothing unless --write.

  perf      Say where the suite's time actually goes, and which files to act
            on. Runs Vitest once with a reporter that records the per-file
            phase timings, then reports each phase's share and names the spec
            files a rule can act on: the ones that reach no DOM and could run
            under the \`node\` environment, and the ones that import a barrel.
            Every finding states the rule it used. Exits 0 without --gate.

            With --gate it also fails the run over a test body or a file that
            is over budget — and only after re-measuring it on its own, so a
            file that was merely sharing a worker is reported as not
            reproduced instead. Exit 1 is "over budget", exit 2 is "there was
            nothing to judge".

  init      Write a pointer to node_modules/vitest-auto-spy/AGENTS.md into the
            instruction files the agents in this repository actually read, and
            specialise it for this repository's runner, framework and setup file.
            Rewrites only the text between its own markers.

Usage of codemod
  npx vitest-auto-spy codemod [path…] [options]

  With no path it visits every *.spec.ts / *.test.ts in the repository; with a
  path it visits every TypeScript file under it.

  A jasmine-auto-spies suite migrates the same way, with --from jasmine: the
  \`.and\` namespace comes off the auto-spies helpers, jasmine's own strategies
  become their mock* twins, and \`spyOn\` gains the stub it had for free — that
  last one is why the rewrite is not a rename. Land the suite green on
  \`vitest-auto-spy/jasmine\` first, then run this and drop that import.

Usage of perf
  npx vitest-auto-spy perf [path…] [options]

  With no path it measures the whole suite; a path is passed through to Vitest
  as its file filter. The phase totals are CPU time summed over every worker,
  which is why they add up to more than the wall clock.

  A bare \`vitest run\` is not every repository's suite. Where the suite is built
  by something else — an Angular builder, an Nx target, a script — there is no
  vitest.config at the root, and the defaults sweep up every *.spec.* in the
  tree with no globals and no aliases. perf refuses to call that a measurement
  and asks for the real command instead:

    npx vitest-auto-spy perf --command 'npm test'

  \`--command\` runs that line with VITEST_AUTO_SPY_PERF_OUT and
  VITEST_AUTO_SPY_PERF_REPORTER in the environment; the configuration it
  reaches attaches the reporter itself:

    const perf = process.env['VITEST_AUTO_SPY_PERF_REPORTER'];
    reporters: perf === undefined ? ['default'] : ['default', perf],

  Add {paths} to the command — \`npm test -- {paths:--include=}\` — and the gate
  can re-measure its suspects through the same harness.

Options
  --cwd <dir>    Run against another directory instead of the current one.
  --json <path>  perf only. Read a report a previous run wrote instead of
                 running Vitest again. A directory or a pattern
                 (coverage/**/perf-*.json) merges every report a sharded
                 pipeline wrote, which is the only way the median means the
                 whole suite.
  --out <path>   perf only. Keep the JSON report at this path. Without it the
                 report is written under node_modules/.cache and deleted.
  --command <c>  perf only. Measure this shell line instead of running Vitest
                 directly. {paths} / {paths:<prefix>} take the files of a
                 confirmation pass.
  --gate         perf only. Fail the run over a confirmed budget. Exit 1.
  --max-test-ms  perf only. Budget for one test body. Default 1000; the report
                 records no body under 100 ms, so that is the floor.
  --max-file-ms  perf only. Budget for a file's bodies added up. Default 5000,
                 and a file must also be over --factor × the run's median.
  --factor <n>   perf only. How many times the median file a file has to be.
                 Default 10, which is what keeps the verdict the same on a
                 loaded runner and on an idle laptop.
  --max-wall-ms  perf only. A whole-run budget. Off by default: wall clock is
                 a property of the machine, so nothing derives it for you.
  --gate-only    perf only. Comma-separated paths the gate may judge. The
                 median is still taken over the whole run.
  --no-confirm   perf only. Skip the confirmation pass and gate on a single
                 reading.
  --baseline <p> perf only. Compare against a committed baseline and fail on
                 what grew. Recorded as a ratio to the median file of the run,
                 so a slower machine does not read as a regression.
  --update-baseline
                 perf only. Record this run into the baseline instead of
                 judging it. Defaults to perf-baseline.json.
  --baseline-factor / --baseline-floor-ms
                 perf only. How many times its recorded share a file has to
                 take (2), and the absolute floor under which it is noise
                 (500 ms).
  --top <n>      perf only. Rows in the "slowest files" and "slowest bodies"
                 tables. 0 turns them off. Asked for explicitly, a run whose
                 slowest file is under the one-second floor says so rather
                 than printing nothing.
  --check        init only. Write nothing; exit 1 if the block is out of date.
  --dry-run      init only. Print what would change and write nothing.
  --uninstall    init only. Remove the managed blocks and the files it created.
  --write        codemod only. Apply the edits. Without it nothing is written.
  --verify       codemod only. Transform nothing; match the files against the
                 patterns the codemod removes and report what is left. Exit 1
                 if anything matched — the check that survives a hand edit.
  --from <pkg>   codemod only. Which suite this is: jest-auto-spies,
                 jasmine-auto-spies (alias: jasmine), or auto — the default,
                 which reads each file and applies the set that file needs.
  --only <ids>   codemod only. Run only these transforms, comma-separated.
  --skip <ids>   codemod only. Run everything except these.
  --list         codemod only. Print the transforms and the entry-point table
                 generated from the installed package's own export map.
  -h, --help     Show this screen.
  -v, --version  Print the installed version.

Docs  https://asdalexey.github.io/vitest-auto-spy`;
