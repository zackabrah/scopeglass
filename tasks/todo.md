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
- [ ] Task 3: Markdown instruction/reference extraction
  - Acceptance: non-duplicated structured records, exact provenance, inert-link
    rules, and parser/instruction/reference bounds
  - Verify: parser unit and fixture tests
- [ ] Task 4: Token accounting and deterministic diagnostics
  - Acceptance: byte-based estimate plus bounded linear duplicate/conflict and
    reference diagnostics with accurate summaries
  - Verify: focused red/green analysis tests
- [ ] Checkpoint: analysis report matches golden assertions
- [ ] Task 5: Terminal and JSON renderers
  - Acceptance: workflow-command-safe terminal escaping and deterministic
    schema-v1 JSON with no host-path or ANSI leakage
  - Verify: formatter tests in color/no-color modes
- [ ] Task 6: Accessible self-contained HTML report
  - Acceptance: exact CSP, zero JavaScript/network, inert hostile data,
    responsive print-safe and keyboard-usable UI
  - Verify: unit tests and isolated real-browser QA
- [ ] Task 7: CLI commands, streams, and exit policies
  - Acceptance: exact command matrix, exclusive private report writes, combined
    policy truth table, and deterministic 0/1/2 exits
  - Verify: CLI integration and packed-install smoke tests
- [ ] Checkpoint: end-to-end CLI and report green
- [ ] Task 8: Governance, documentation, CI, and release workflow
  - Acceptance: production repository, immutable least-privilege CI, and OIDC
    provenance release of the exact verified tarball
  - Verify: docs links, workflow inspection, package checks, audit
- [ ] Task 9: Independent multi-axis review and release-candidate verification
  - Acceptance: all required findings resolved; hostile corpus and golden fixture
    pass across supported platforms
  - Verify: full verification, audit, browser QA, clean git status

## Verification record

Record each meaningful command once after the relevant change. Do not repeat a
successful command without intervening changes.

- `npm test -- tests/unit/public-contract.test.ts tests/unit/schema-contract.test.ts`
  — 4 tests passed.
- `npm run build` — ESM JavaScript, declarations, source maps, and CLI shebang
  built successfully.
- `npm audit --audit-level=low` — 0 vulnerabilities after the reviewed esbuild
  override; production dependency audit also clean.
- `npm test -- tests/integration/discovery.test.ts` — 14 tests passed, including
  exact byte bounds, aggregate/scope limits, hostile markers, symlinks, BOM, and
  no host-path leakage.
- Scoped ESLint and strict TypeScript checks for discovery — passed.
