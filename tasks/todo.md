# Scopeglass v1 Task Checklist

- [ ] Task 1: Package tooling and public contracts
  - Acceptance: reproducible build/test/lint toolchain and schema-v1 types
  - Verify: focused contract test, typecheck, build
- [ ] Task 2: Safe root, target, and scope discovery
  - Acceptance: correct hierarchy plus traversal/symlink/size protections
  - Verify: path and filesystem integration tests
- [ ] Checkpoint: foundation green and independently reviewed
- [ ] Task 3: Markdown instruction/reference extraction
  - Acceptance: structured records with exact source provenance
  - Verify: parser unit and fixture tests
- [ ] Task 4: Token accounting and deterministic diagnostics
  - Acceptance: duplicate/conflict/reference diagnostics and accurate summaries
  - Verify: focused red/green analysis tests
- [ ] Checkpoint: analysis report matches golden assertions
- [ ] Task 5: Terminal and JSON renderers
  - Acceptance: safe readable terminal and schema-v1 JSON output
  - Verify: formatter tests in color/no-color modes
- [ ] Task 6: Accessible self-contained HTML report
  - Acceptance: CSP, escaped data, responsive and keyboard-usable UI
  - Verify: unit tests and isolated real-browser QA
- [ ] Task 7: CLI commands, streams, and exit policies
  - Acceptance: inspect/report/check and deterministic 0/1/2 exits
  - Verify: CLI integration and packed-install smoke tests
- [ ] Checkpoint: end-to-end CLI and report green
- [ ] Task 8: Governance, documentation, CI, and release workflow
  - Acceptance: production repository and provenance-ready release automation
  - Verify: docs links, workflow inspection, package checks, audit
- [ ] Task 9: Independent multi-axis review and release-candidate verification
  - Acceptance: all required findings resolved
  - Verify: full verification, audit, browser QA, clean git status

## Verification record

Record each meaningful command once after the relevant change. Do not repeat a
successful command without intervening changes.

- Pending.
