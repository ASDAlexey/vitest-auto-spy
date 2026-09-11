# TODO — what is still open

Only work that is still to be taken. Shipped work lives in `CHANGELOG.md` and in git history; the
questions that were asked, measured and closed with a "no" live in [`DECISIONS.md`](./DECISIONS.md),
which is where this file's `[~]` entries went on 2026-09-10 — a decision is not a task.

## Angular diagnostics

- [ ] **`enableAngularDiagnostics` sees only the static `TestBed.configureTestingModule`.** Its
      configure inspectors (`deadSchemas`, `ngModuleScopes`, the `pendingRequests` token read,
      `shadowedProviders` collection) are reached through the wrapped static method, so a spec that
      calls `getTestBed().configureTestingModule(…)` bypasses all four. Wrap the instance, as the
      reset snapshot now does.

## Lint rules

- [ ] **Two forms `no-private-member-access` cannot see.** A member reached through a variable
      holding a **union** of classes, and a `#private` field — the second is unreachable by bracket
      access, by a cast and by `Object.getPrototypeOf` alike, so there is nothing to report for it.
      The union case is the one worth building, and it is worth building when a suite produces it.

## `doctor` — the catalogue is a fifth built

`npx vitest-auto-spy doctor` ships, and what every check has in common is that **nothing consumes the
result**: the run is green, and the only reader of a `tsconfig.spec.json` after Jest is gone is
somebody's editor. A full pass produced **52 checks** in five groups — 15 replaceable patterns, 10
silent-pass bugs, 10 repository-level ones, 18 configuration/perf hints and 5 deprecation checks
against this package's own history — and nine of them are built.

- [ ] **The other 43 checks of the sharpened catalogue.** The two that are worth naming, because they
      are the ones a per-file linter can never do, are already shipped: `helper-from-wrong-entry` and
      `no-unawaited-helper`, both driven by `scripts/generate-export-map.mjs`. The rest is a long tail
      to take a few at a time, read-only like the rest of `doctor` — trust before edit rights.

## Release infrastructure — move npm publishing to OIDC (deadline ~Jan 2027)

npm is retiring granular access tokens with **Bypass 2FA**. The scriptable half of
the move is done for _both_ packages — `auto-release.yml` and `publish-alias.yml`
publish over OIDC with no `NODE_AUTH_TOKEN`, `release.yml` no longer publishes at
all, the npm floor is pinned exactly in both and `--provenance` is gone (the
registry attaches it). No workflow reads `secrets.NPM_TOKEN` any more. What is left
is the part that needs a browser and a person.

- **2026-07-31, already in force** — such a token can no longer perform
  account/governance actions: creating or deleting tokens, changing package
  access or maintainers, editing the trusted-publishing config, managing
  org/team membership. Publishing itself still works.
- **~January 2027, announced** — direct publishing is removed. The token drops
  to reading private packages and _staging_ a publish; the release then waits
  for a human to approve it with 2FA. At that point auto-release stops being
  automatic.

Not affected: `GITHUB_TOKEN`, GitHub PATs, GitHub App tokens.

The fix is **Trusted Publishing (OIDC)** — GitHub Actions exchanges its own
OIDC token for a short-lived publish credential, so no npm token lives in the
repo at all.

The field values, the failure codes and what the January 2027 deadline does (and does
not) mean for this repository are written down for good in
[CONTRIBUTING.md → How the two packages authenticate to npm](./CONTRIBUTING.md#how-the-two-packages-authenticate-to-npm).
The trusted publisher for `vitest-auto-spy` is registered (2026-08-30: `ASDAlexey/vitest-auto-spy`,
`auto-release.yml`, environment empty, permissions `npm publish`; npm did not demand 2FA to save
it). What is left here is the part that is still undone.

- [ ] **Publish `vitest-auto-spies` again, then register its publisher.** The
      package was unpublished in full on **2026-08-29T20:35:25Z**; npm's 24-hour hold
      on a fully unpublished name (_"you may not publish any new versions of that
      package until 24 hours have passed"_) expired on **2026-08-30T20:35:25Z** and
      nothing blocks the publish any more. Re-checked 2026-09-10: `npm view
      vitest-auto-spies` is still a 404, so this is waiting on a person, not on npm.
      A trusted publisher is
      configured on a package's settings page, which a non-existent package does not
      have, so the order is: one manual `cd alias && npm publish --access public` (a
      person with `npm login`, not a bypass token), then the publisher row from the
      table in CONTRIBUTING.md. That bootstrap publish is also why the OIDC path
      cannot be proven the same evening: an `Actions → Auto Release → Run workflow`
      with `alias_ref` set to the current tag would find that version already on npm,
      report "nothing to do" and go green without touching the handshake. The first
      real OIDC publish of the alias is the next release. Its old versions 1.6.0 /
      1.9.2 / 1.9.3 can never be reused — _"Once `package@version` has been used, you
      can never use it again."_
- [ ] **Delete the `NPM_TOKEN` repository secret and revoke the token on npm.**
      Nothing reads it any more, but do it only once both packages have gone out
      over OIDC — the "skip if version already exists" guards make a retry safe, a
      missing fallback during a half-finished migration is not.
- [ ] **Tighten _Publishing access_ on both packages** — npmjs.com → package →
      Settings → _Publishing access_ → _"Require two-factor authentication and
      disallow bypass 2fa tokens"_, then **Update Package Settings**. Both packages
      currently sit on the permissive option. Trusted publishers keep working under
      either, so this changes nothing operationally; it removes the bypass-token
      escape hatch, which is only worth removing once it is no longer the fallback.
      Needs 2FA on the account.


## Claude Code plugin directory — submission — DECIDED 2026-09-02: submit

Re-checked against the live catalogues on 2026-09-02. Every assumption the previous note weighed
was out of date, and the cost that made it "future" is gone.

The repo is already its own marketplace: `.claude-plugin/marketplace.json` +
`.claude-plugin/plugin.json` + `skills/vitest-auto-spy/SKILL.md`, all on `master`,
public, installable by anyone with

```
/plugin marketplace add ASDAlexey/vitest-auto-spy
/plugin install vitest-auto-spy@vitest-auto-spy
```

Getting into the **official directory** (`anthropics/claude-plugins-official`, installed as
`claude-plugin-directory`) is the step that is still open — it buys discoverability via
`/plugin > Discover`, and nothing else.

- [ ] **Submit the plugin through the form.** <https://clau.de/plugin-directory-submission> is the
      only channel: `.github/workflows/close-external-prs.yml` auto-closes any pull request from an
      author without write access and replies with that link. The maintainer's to send; everything a
      reviewer looks at is already in place — `plugin.json` / `marketplace.json` versions in lockstep
      with `package.json` (`scripts/sync-plugin-version.mjs` on `npm version`), `SKILL.md`
      frontmatter that passes their `validate-frontmatter.ts` (`name` + `description`, quoted where a
      value carries YAML special characters), LICENSE (MIT) and `SECURITY.md`. The one thing missing
      is a `README.md` in the plugin root — their documented layout expects one and ours lives only
      at repo root.

Two things to know before spending time on it. **The entry is a copy, not a reference:** the
directory stores third-party plugins under `external_plugins/<name>/` with just
`.claude-plugin/plugin.json` (plus `.mcp.json` where relevant) and lists them in the root
`marketplace.json` with `source: "./external_plugins/<name>"`, a `category` and sometimes
`tags: ["community-managed"]`. Content is copied in by Anthropic — our repo is not referenced as a
git source, so a directory entry has to be re-synced on every release. **And the shape may not

Nothing in the repository asks for support today: no `funding` field in `package.json`, no
`.github/FUNDING.yml`, no section in the README or on the docs site. The mechanics are a couple of
hours' work; the reason this is a TODO rather than a done thing is that two decisions have to be
made first, and both are the maintainer's, not a coding task.

**Both items below are the maintainer's to decide, not a coding task; asked and deferred
2026-09-04.** Nothing is wired until the payment links exist.

- [ ] **Wire the standard funding surfaces, once payment links exist.** `funding` in `package.json`
      so `npm fund` surfaces the project to everyone who installed it; `.github/FUNDING.yml` for the
      Sponsor button; a short section in `README.md`, the docs site and the landing page; SVG QR
      codes generated offline into `assets/` from the payment URLs. One sentence, stated once, and
      linked from the other surfaces rather than repeated — the same rule the benchmark numbers
      follow, and for the same reason.
- [ ] **Choose the channels.** Recurring payments with a reader-chosen amount are supported
      everywhere, so the choice is not about features. It is about who can actually pay: GitHub
      Sponsors and Ko-fi reach an international audience and integrate with `npm fund`; Boosty and
      CloudTips reach Russian cards. Two blocks may be needed, and that is fine — it is what the
      audience split already looks like.

Two traps, recorded because they are easy to get wrong and expensive to undo:

- **Never publish card numbers.** A PAN in a public repository is indexed and scraped within
  hours, is usable for card-not-present payments, and cannot be revoked without reissuing the
  card; GitHub's secret scanning flags it as well. Payment _links_ are revocable, replaceable and
  measurable. This is settled — do not revisit it, and do not accept a "just for now" version.
- **The wording on the button does not decide the tax treatment.** Labelling support as a gift
  changes nothing by itself: in most jurisdictions recurring payments received in connection with
  one's own work are income whatever the button says, and regularity is precisely the signal that
  gets looked at. What does matter — the recipient's status, the platform's role as payer,
  residency — is a question for an accountant, to be settled _before_ a channel is switched on
  rather than after. Not a coding decision, and not something to design around in the repository.
