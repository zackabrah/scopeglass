# Changelog

All notable changes to Scopeglass are documented in this file. The format is
based on Keep a Changelog, and the project follows Semantic Versioning.

## [0.2.0] - 2026-07-15

Diagnostic ruleset version 2. Reports keep schema version 1; ruleset-observable
behavior changed, so `check` outcomes can differ from v0.1.0 on the same tree.

### Changed

- An `AGENTS.md` symbolic link or junction is now followed when it resolves to
  a regular file inside the analysis root (the common
  `AGENTS.md -> CLAUDE.md` layout). Broken links, links escaping the root, and
  links resolving to non-files remain fatal `unsafe-symlink` errors, and the
  resolved file passes through the same open-descriptor identity checks.
- Only root-level headings update the section stack. A heading nested inside a
  blockquote or list item no longer relabels later instructions.
- Same-line instruction ordering ties now break on the numeric instruction
  ordinal instead of lexicographic ID comparison.
- The npm package no longer ships `tasks/plan.md`; it remains in the
  repository.

### Documentation

- Documented that the parser-sensitive syntax budgets, not the byte limits,
  are the practical input ceiling, and that exceeding any hard limit is fatal
  rather than a diagnostic.

## [0.1.0] - 2026-07-14

### Added

- Canonical root-to-target `AGENTS.md` scope discovery for file and directory
  targets, including Git worktree marker support.
- Line-attributed extraction of paragraphs, list items, and blockquotes.
- Deterministic diagnostics for broken or unsafe local references, exact
  duplicate instructions, and conservative possible conflicts.
- Transparent context estimates based on UTF-8 byte counts.
- Terminal, versioned JSON, and self-contained static HTML rendering.
- `inspect`, `report`, and policy-oriented `check` command contracts.
- A small ESM programmatic API centered on `analyze()` and typed
  `ScopeglassError` failures.
- Strict JSON Schema 2020-12 contracts for report and check-result schema
  version 1.
- Bounded local processing, hostile-input controls, and exclusive private HTML
  report creation.

### Changed

- Raised the minimum supported Node.js version to 22.17.0 so Windows
  file-identity checks run on a release containing the upstream libuv
  volume-serial-number fix.
- The release workflow preserves the exact verified candidate and uses npm
  staged publishing, protected GitHub OIDC, and explicit maintainer approval.

### Security

- Repository content is never executed, fetched, imported, or sent off-device.
- Output paths and repository text are treated as untrusted across terminal,
  JSON, and HTML boundaries.
- Parser-sensitive syntax is bounded before Markdown parsing; Unicode
  diagnostic normalization has per-instruction and aggregate budgets.
- Local-reference checks cache shared path components while preserving
  component-wise symlink and final realpath containment validation.
- File swap checks compare lossless `bigint` device and inode identifiers.
- Package publication uses stage-only trusted publishing, disallows traditional
  publish tokens, and is protected by immutable version tags and releases.
