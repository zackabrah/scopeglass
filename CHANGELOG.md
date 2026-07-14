# Changelog

All notable changes to Scopeglass are documented in this file. The format is
based on Keep a Changelog, and the project follows Semantic Versioning.

## [0.1.0] - Unreleased

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
- Strict JSON Schema 2020-12 for report schema version 1.
- Bounded local processing, hostile-input controls, and exclusive private HTML
  report creation.

### Security

- Repository content is never executed, fetched, imported, or sent off-device.
- Output paths and repository text are treated as untrusted across terminal,
  JSON, and HTML boundaries.

The npm publication, release automation, and final browser/release-candidate
verification for 0.1.0 have not been declared complete. Replace `Unreleased`
with the release date only after every gate in
[`docs/RELEASE.md`](docs/RELEASE.md) passes.
