# Scopeglass v1 Task Checklist

- [x] Task 1: Package tooling and public contracts
  - Acceptance: reproducible toolchain, export allowlist, schema-v1 types,
    ruleset/error constants, ordering rules, and documented hard limits
  - Verify: focused contract test, typecheck, build
- [x] Task 2: Safe root, target, and scope discovery
  - Acceptance: exact root/marker semantics plus traversal, race, special-file,
    symlink/junction, aggregate-size, and host-path disclosure protections
  - Verify: path and filesystem integration tests
- [x] Checkpoint: foundation green and independently reviewed
- [x] Task 3: Markdown instruction/reference extraction
  - Acceptance: non-duplicated structured records, exact provenance, inert-link
    rules, and parser/instruction/reference bounds
  - Verify: parser unit and fixture tests
- [x] Task 4: Token accounting and deterministic diagnostics
  - Acceptance: byte-based estimate plus bounded linear duplicate/conflict and
    reference diagnostics with accurate summaries
  - Verify: focused red/green analysis tests
- [x] Checkpoint: analysis report matches golden assertions
- [x] Task 5: Terminal and JSON renderers
  - Acceptance: workflow-command-safe terminal escaping and deterministic
    schema-v1 JSON with no host-path or ANSI leakage
  - Verify: formatter tests in color/no-color modes
- [x] Task 6: Accessible self-contained HTML report
  - Acceptance: exact CSP, zero JavaScript/network, inert hostile data,
    responsive print-safe and keyboard-usable UI
  - Verify: unit tests and isolated real-browser QA
- [x] Task 7: CLI commands, streams, and exit policies
  - Acceptance: exact command matrix, exclusive private report writes, combined
    policy truth table, and deterministic 0/1/2 exits
  - Verify: CLI integration and packed-install smoke tests
- [x] Checkpoint: end-to-end CLI and report green
- [x] Task 8: Governance, documentation, CI, and release workflow
  - Acceptance: production repository, immutable least-privilege CI, and OIDC
    provenance release of the exact verified tarball
  - Verify: docs links, workflow inspection, package checks, audit
- [x] Task 9: Independent multi-axis review and release-candidate verification
  - Acceptance: all required findings resolved; hostile corpus and golden fixture
    pass across supported platforms
  - Verify: full verification, audit, browser QA, clean git status
  - [x] Local correctness, contract, release, accessibility, and reliability
        reviews have no remaining P1/P2 findings
  - [x] Local hostile corpus, golden fixture, packaging, audits, and isolated
        Chromium/Firefox/WebKit gates pass
  - [x] Hosted Linux/macOS/Windows matrix, protected release environment,
        bootstrap registry verification, and independent reviews pass
  - [x] v0.1.0 staged approval, provenance, final registry verification, and
        immutable GitHub release evidence pass

## Verification record

Record each meaningful command once after the relevant change. Do not repeat a
successful command without intervening changes.

Local verification on 2026-07-14:

- `npm test` — 99 tests across 14 files passed, including exact byte/syntax
  limits, parser amplification, Unicode normalization retention, filesystem
  aliases, reference-I/O bounds, output contracts, and release metadata.
- `npm run typecheck`, `npm run lint`, and `actionlint` — passed on the settled
  local source tree.
- `npm run browser:check` — the exact 4,194,304-byte fixture passed Chromium
  149.0.7827.55, Firefox 151.0, and WebKit 26.5, including canonical fact
  agreement, axe, keyboard, reflow, fresh closed-scope print visibility, and a
  tagged script-free PDF.
- `npm audit --audit-level=low` and the production-only audit — 0
  vulnerabilities; registry verification reported 276 signatures and 71
  attestations.
- Independent contract and reliability rechecks reported no remaining P1/P2
  findings after the final regression fixes.
- Protected `main` CI run
  [29331969200](https://github.com/zackabrah/scopeglass/actions/runs/29331969200)
  passed all 10 jobs on commit `f974745c9602a471152730f5e502a3945b74168a`.
- Protected release run
  [29332166877](https://github.com/zackabrah/scopeglass/actions/runs/29332166877)
  verified the immutable `v0.1.0` tag, preserved the exact candidate, and
  staged it with OIDC provenance.
- npm stage `921ca987-657d-406a-85ea-4a2e6d9fa494` was inspected and approved
  with 2FA. The local candidate, tarball preserved inside the workflow artifact,
  stage, public registry tarball, and GitHub release asset were byte-identical:
  94,620 bytes, 24 files, SHA-256
  `00ae4ec8f9a448a149759906e29d7d6a706655689c7acda5ec824732b9463def`.
- Clean registry CLI, API, schema, vulnerability, signature, and provenance
  checks passed. `latest` resolves to `0.1.0`; the bootstrap dist-tag was
  removed and its placeholder version was deprecated.
- GitHub Release
  [v0.1.0](https://github.com/zackabrah/scopeglass/releases/tag/v0.1.0) is
  published, latest, and immutable with the verified tarball and manifest.
