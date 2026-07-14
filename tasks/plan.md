# Implementation Plan: Scopeglass v1

## Overview

Build a production-ready, local-only TypeScript CLI in thin, test-driven slices.
The dependency chain is: public contracts → safe filesystem discovery → Markdown
extraction → deterministic analysis → renderers → CLI boundary → packaging and
browser/release verification.

## Architecture decisions

- Use a functional core / imperative shell: analysis is pure; filesystem and
  process behavior are isolated at boundaries.
- Publish a versioned JSON report and programmatic `analyze()` API from day one.
- Support only canonical AGENTS.md ancestor semantics in v1.
- Generate one self-contained HTML file with escaped text and no dependencies or
  remote assets at runtime.
- Report exact UTF-8 bytes and a dependency-free conservative token estimate
  (`ceil(bytes / 3)`), with the method named in every machine-readable result.
- Keep runtime dependencies minimal and review each before installation.

## Dependency graph

```text
Tooling + public contracts
  └─ safe scope discovery
      └─ Markdown extraction
          └─ diagnostics + token analysis
              ├─ terminal/JSON formatters
              └─ HTML report
                  └─ CLI + policy exit codes
                      └─ packaging, docs, CI, browser QA, review
```

## Phase 1: Foundation

### Task 1: Establish package tooling and public contracts

**Acceptance criteria:**

- Package metadata, Node/ESM constraints, scripts, TypeScript, lint, formatting,
  build, and test configuration are reproducible.
- Versioned report, diagnostic, option, and public API types compile.
- Export allowlist, stable error codes, schema/ruleset constants, numeric limits,
  and deterministic ID/ordering rules are contract-tested.
- Contract tests fail before implementation and pass after the minimal API shell.

**Verification:** `npm run typecheck`, focused contract test, `npm run build`.

**Dependencies:** None.

**Files likely touched:** `package.json`, `package-lock.json`, `tsconfig.json`,
`src/types.ts`, `src/index.ts`, one test file.

### Task 2: Resolve roots, targets, and scope chains safely

**Acceptance criteria:**

- Explicit roots, validated `.git` directory/file markers, fallback roots, and
  canonical root-to-target AGENTS.md discovery work exactly as specified.
- Symlinks, junctions, special files, path escapes, prefix collisions, and
  check/read swaps are rejected with stable errors and no absolute-path leaks.
- Per-file/aggregate byte limits and all discovery bounds are enforced.

**Verification:** focused unit/integration tests plus typecheck.

**Dependencies:** Task 1.

**Files likely touched:** `src/analysis/paths.ts`, `src/analysis/discovery.ts`, two
test files, fixture files.

### Checkpoint: Foundation

- [ ] Focused tests pass.
- [ ] Build and typecheck pass.
- [ ] Public contract and path security receive independent review.

## Phase 2: Analysis

### Task 3: Extract instructions and references from Markdown

**Acceptance criteria:**

- Headings, paragraphs, list items, blockquotes, and eligible relative links
  retain source lines without double-counting nested content.
- Nested Markdown, Unicode, AST/instruction/reference limits, BOM, and CRLF are
  handled deterministically; inert URLs are ignored and nothing is fetched.

**Verification:** parser unit tests and fixture integration test.

**Dependencies:** Tasks 1–2.

**Files likely touched:** `src/analysis/markdown.ts`, parser test, fixtures.

### Task 4: Compute token costs and diagnostics

**Acceptance criteria:**

- Per-scope and total byte counts and heuristic token estimates are stable.
- Exact duplicates, narrowly hash-matched possible conflicts, and broken/unsafe
  references have stable codes, severities, provenance, and conservative wording.
- Diagnostics remain linear and bounded; possible conflicts are informational.
- Summary counts match the diagnostic list.

**Verification:** red/green unit tests for every diagnostic and edge case.

**Dependencies:** Tasks 2–3.

**Files likely touched:** `src/analysis/tokens.ts`, `src/analysis/diagnostics.ts`,
`src/analysis/analyze.ts`, two test files.

### Checkpoint: Core analysis

- [ ] Analysis fixture produces the expected versioned report.
- [ ] Unit/integration coverage meets the configured floor for completed modules.
- [ ] No repository content is executed or fetched.

## Phase 3: Output and CLI

### Task 5: Render terminal and JSON output

**Acceptance criteria:**

- Terminal output is readable with and without color, visibly escapes dangerous
  controls/default-ignorables, and prefixes every untrusted line with a trusted
  gutter so CI workflow commands cannot be injected.
- JSON exactly follows schema version 1 and uses normalized relative paths.
- Both renderers agree with analysis summary counts.

**Verification:** formatter tests without broad snapshots; TTY/no-color checks.

**Dependencies:** Task 4.

**Files likely touched:** `src/formatters/terminal.ts`, `src/formatters/json.ts`, two
test files.

### Task 6: Render the self-contained HTML report

**Acceptance criteria:**

- Report exposes scope order, provenance, context cost, and diagnostics accessibly.
- Repository text cannot inject markup, attributes, URLs, CSS, or scripts; the
  exact CSP is present, JavaScript is absent, and all authored links stay inert.
- Layout works from 320 to 1440 pixels and printing remains legible.

**Verification:** HTML unit tests followed by isolated real-browser QA.

**Dependencies:** Task 4.

**Files likely touched:** `src/formatters/html.ts`, HTML tests, browser fixture.

### Task 7: Implement CLI commands and policy exit codes

**Acceptance criteria:**

- `inspect`, `report`, and `check` implement the specified matrix and streams.
- Report files use exclusive mode-0600 creation, reject unsafe parents and all
  existing destinations, fsync before close, and never overwrite.
- Exit codes 0/1/2 are deterministic and CLI errors are concise.
- Installed/packed executable works outside the repository.

**Verification:** CLI integration tests and packed-tarball smoke test.

**Dependencies:** Tasks 5–6.

**Files likely touched:** `src/cli.ts`, `src/index.ts`, CLI integration test,
package metadata.

### Checkpoint: End-to-end

- [ ] All three output formats agree.
- [ ] CLI policy behavior passes integration tests.
- [ ] Generated report passes browser console, accessibility, keyboard, and
      responsive checks.

## Phase 4: Production hardening

### Task 8: Add project governance and release automation

**Acceptance criteria:**

- README, changelog, MIT license, contributing guide, code of conduct, security
  policy, architecture/security docs, and examples are complete.
- CI runs verification and audit on supported Node versions and operating systems
  with immutable action SHAs and least-privilege permissions.
- Tag-driven npm release uses OIDC trusted publishing/provenance and publishes
  the exact packed tarball that CI verified, with pinned production dependencies.

**Verification:** workflow syntax inspection, package check, audit, docs links.

**Dependencies:** Task 7.

**Files likely touched:** documentation files and `.github/workflows/*`.

### Task 9: Final review and release-candidate verification

**Acceptance criteria:**

- Independent reviews cover correctness, architecture, security, performance,
  accessibility, and test quality.
- All required findings are fixed and guarded by tests where applicable; the
  hostile corpus and golden three-scope fixture are explicit release gates.
- `npm run verify`, audit, browser QA, and clean packed install pass.

**Verification:** recorded commands and review verdict in `tasks/todo.md`.

**Dependencies:** Tasks 1–8.

**Files likely touched:** only files required to address review findings.

## Risks and mitigations

| Risk                                      | Impact | Mitigation                                                                                 |
| ----------------------------------------- | ------ | ------------------------------------------------------------------------------------------ |
| Users mistake heuristics for model truth  | High   | Say “possible conflict,” show sources, document limits.                                    |
| Malicious Markdown injects report content | High   | Escape by context, no innerHTML from data, strict CSP, attack tests.                       |
| Symlink/path escape reads outside root    | High   | Realpath containment before every read, integration abuse tests.                           |
| Parser drops source provenance            | Medium | AST positions are contract-tested on nested constructs.                                    |
| Token figure is interpreted as universal  | Medium | Name the heuristic everywhere, show exact bytes, and call tokens an estimate.              |
| CLI surface becomes difficult to evolve   | Medium | Version JSON, stable codes, additive changes, integration tests.                           |
| Dependency compromise                     | Medium | Three pinned runtime dependencies, lockfile, immutable CI actions, audit, OIDC provenance. |

## Open questions

None blocking. The implementation stays inside the approved v1 boundaries.
