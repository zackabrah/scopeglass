# Contributing to Scopeglass

Thank you for helping make instruction scope easier to inspect and safer to
automate. Scopeglass is intentionally small: contributions should preserve its
deterministic behavior, local-only runtime, strict public contracts, and narrow
v0.1.0 scope.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
Report vulnerabilities through [SECURITY.md](SECURITY.md), not a public issue.

## Read before changing code

- [SPEC.md](SPEC.md) is the behavioral source of truth.
- [AGENTS.md](AGENTS.md) contains repository-specific working instructions.
- `tasks/plan.md` (repository only, not packaged) records the intended
  implementation order.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) explains module boundaries.
- [docs/SECURITY.md](docs/SECURITY.md) explains the trust model.

If code and the specification disagree, do not silently choose one. Open a
focused discussion or change the contract and implementation together with
explicit review.

## Development setup

Requirements:

- Node.js `>=22.17.0`
- npm `10.9.8`, matching the repository `packageManager` field

```sh
npm ci
npm test
```

Use `npm ci`, not an unconstrained install, when verifying a contribution. The
lockfile is part of the reproducible toolchain.

## Choose a focused change

Good contributions solve one clear problem and include evidence:

- a failing test that demonstrates a bug;
- a small fixture for a missing Markdown or filesystem edge case;
- a documented contract clarification;
- a security hardening change with an abuse-case test;
- an accessibility or packaging fix with repeatable verification.

Before starting a large feature, confirm that it fits the v0.1.0 boundaries.
Vendor aliases, extra instruction formats, network/model functionality,
plugins, editor integrations, and whole-repository crawling are deliberately
out of scope.

Ask maintainers before:

- adding a runtime dependency;
- changing public JSON fields, diagnostic codes, commands, or exit semantics;
- changing the schema or diagnostic ruleset version;
- reading anything beyond the target's canonical ancestor chain and safe local
  reference metadata;
- adding network, model, plugin, telemetry, or code-execution capability.

## Branches and commits

Use a short-lived branch with a conventional type prefix:

```text
feat/markdown-reference-support
fix/windows-path-containment
docs/security-boundaries
test/report-output-race
chore/release-tooling
```

Do not prefix branches with `codex/`. Keep commits atomic and use conventional
messages such as `fix: reject output-parent symlinks` or
`docs: explain report privacy`.

## Development workflow

Use a red-green-refactor loop for behavior changes:

1. Add or identify a focused test that fails for the right reason.
2. Implement the smallest complete fix.
3. Run the focused test.
4. Run lint and type checking for the touched area.
5. Run the full verification gate before requesting final review.

Do not weaken, skip, or delete a failing test to make a change pass. Preserve
the functional-core/imperative-shell split: pure analysis consumes data and
returns data, while filesystem and process behavior remain at boundaries.

## Commands

```sh
npm test                 # Unit and integration tests
npm run test:coverage    # Tests with configured coverage floors
npm run lint             # ESLint
npm run format:check     # Prettier verification
npm run typecheck        # Strict TypeScript checking
npm run build            # ESM package and declarations
npm run browser:install  # One-time isolated browser download
npm run browser:check    # Chromium, Firefox, and WebKit report QA
npm run package:check    # publint and Are The Types Wrong
npm run audit            # High-severity dependency audit
npm run verify           # Main local verification chain
```

Run the smallest relevant command while iterating. Run `npm run verify` before
declaring a release candidate or a contribution ready for final review.

## Test expectations

Match the test to the boundary:

- pure parsing, normalization, diagnostics, and formatting: unit tests;
- filesystem containment, symlinks, root discovery, CLI streams, and exit
  codes: integration tests using temporary repositories;
- generated HTML behavior: unit attack corpus plus isolated real-browser
  verification before release.

Tests must be deterministic and must not use external network services. Include
boundary values—not just values comfortably inside a limit. Security fixes
should include a regression test for the original abuse case.

## Public contracts

Treat these as compatibility surfaces:

- package root exports;
- `ScopeglassReportV1` and `ScopeglassCheckResultV1`;
- [`schemas/scopeglass-report-v1.schema.json`](schemas/scopeglass-report-v1.schema.json)
  and
  [`schemas/scopeglass-check-result-v1.schema.json`](schemas/scopeglass-check-result-v1.schema.json);
- diagnostic and error codes;
- CLI commands, options, streams, and exit codes;
- deterministic ordering and root-relative paths.

Adding, removing, or changing a report or check-result field requires a new
schema version and a major release because the published schemas are strict.
Any diagnostic ruleset change that can alter `check` outcomes must increment
`rulesetVersion` and be reviewed as a breaking policy change.

## Documentation changes

Update documentation in the same contribution when behavior, public API,
security boundaries, or release steps change. Record expensive-to-reverse
decisions as a numbered ADR under `docs/decisions/`; do not delete old ADRs when
a decision changes—supersede them.

Avoid examples that claim npm publication, CI success, browser verification, or
release provenance unless that state has actually been verified.

## Review checklist

- [ ] The change has one clear purpose.
- [ ] Tests prove new or corrected behavior.
- [ ] Paths and repository bytes remain untrusted at every output boundary.
- [ ] No repository content is executed, imported, fetched, or uploaded.
- [ ] Public output contains no absolute host path or timestamp.
- [ ] Resource limits and deterministic ordering are preserved.
- [ ] Focused tests, formatting, lint, and type checking pass.
- [ ] `npm run verify` passes before release-candidate approval.
- [ ] User-facing and architectural documentation is current.
- [ ] No generated build output, secrets, or unrelated cleanup is included.

## Licensing

By contributing, you agree that your contribution may be distributed under the
project's [MIT License](LICENSE).
