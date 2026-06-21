# Contributing

Thanks for taking the time to contribute! 🎉

## Getting started

```bash
git clone https://github.com/ASDAlexey/vitest-auto-spy.git
cd vitest-auto-spy
npm ci
```

## Development workflow

| Command | What it does |
| --- | --- |
| `npm test` | Run the test suite once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage (100% thresholds enforced) |
| `npm run typecheck` | Type-check the project with `tsc --noEmit` |
| `npm run build` | Build the ESM + CJS bundles and type declarations |

## Guidelines

- **Keep coverage at 100%.** New code needs tests; the coverage thresholds will fail CI otherwise.
- **Match the existing style** — the codebase mirrors the `jest-auto-spies` API surface.
- **One logical change per PR.** Small, focused PRs get reviewed faster.
- Update [`CHANGELOG.md`](./CHANGELOG.md) under an `Unreleased` heading when your change
  is user-facing.

## Commit messages

This project uses [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add nextWithError helper
fix: handle empty calledWith args
docs: clarify zoneless setup
test: cover createObservableWithValues edge cases
chore: bump dev dependencies
```

## Submitting a PR

1. Fork the repo and create a branch from `master`.
2. Make your change with tests.
3. Run `npm run typecheck && npm run test:coverage && npm run build` locally.
4. Open a pull request describing the change and the motivation.

By contributing you agree that your contributions are licensed under the project's
[MIT license](./LICENSE).
