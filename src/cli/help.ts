/** The `--help` screen. One string, so the usage text and the flag table cannot drift apart. */
export const HELP = `vitest-auto-spy — typed test spies generated from a class or a type.

Usage
  npx vitest-auto-spy <command> [options]

Commands
  doctor    Report suite-level defects that never fail a run: a tsconfig include
            pattern that matches no file, a spec another file imports, a foreign
            runner's docblock pragma, configuration for a runner that is gone.
            Read-only — it never edits a file. Exits 1 when anything is found.

  init      Write a pointer to node_modules/vitest-auto-spy/AGENTS.md into the
            instruction files the agents in this repository actually read, and
            specialise it for this repository's runner, framework and setup file.
            Rewrites only the text between its own markers.

Options
  --cwd <dir>    Run against another directory instead of the current one.
  --check        init only. Write nothing; exit 1 if the block is out of date.
  --dry-run      init only. Print what would change and write nothing.
  --uninstall    init only. Remove the managed blocks and the files it created.
  -h, --help     Show this screen.
  -v, --version  Print the installed version.

Docs  https://asdalexey.github.io/vitest-auto-spy`;
