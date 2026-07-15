# Scopeglass architecture

Scopeglass answers one bounded question: which `AGENTS.md` instructions apply
to a repository path, and why? It turns local Markdown files into a versioned,
deterministic report without executing repository content or sending it over a
network.

The normative product contract is [SPEC.md](../SPEC.md). This document explains
how the implementation realizes that contract.

## Design principles

- **Local by construction.** Analysis uses local filesystem metadata and
  `AGENTS.md` contents only. There is no model, telemetry, remote asset, or
  network path in the analysis pipeline.
- **Deterministic by contract.** The same supported filesystem snapshot,
  invocation, schema version, and ruleset version produce byte-stable JSON.
- **Functional core, imperative shell.** Filesystem access and CLI I/O stay at
  the boundary. Parsing, ordering, diagnostics, policies, and rendering operate
  on explicit values.
- **Fail closed at trust boundaries.** Unsafe links, malformed files, exceeded
  limits, and ambiguous output writes become structured failures instead of
  best-effort guesses.
- **One canonical report.** Terminal, JSON, HTML, and policy checks consume the
  same `ScopeglassReportV1` value.

## Data flow

```text
CLI or analyze()
      |
      v
root and target discovery
      |
      v
bounded, validated AGENTS.md reads
      |
      v
Markdown extraction and precedence ordering
      |
      +--> local-reference existence and containment checks
      |
      v
deterministic diagnostics and summary
      |
      v
ScopeglassReportV1
      |
      +--> terminal renderer
      +--> JSON serializer
      +--> static HTML renderer
      +--> check policy evaluation
```

Analysis completes before a renderer or policy interprets the result. A normal
analysis report may contain diagnostics; fatal discovery, validation, limit, or
I/O failures instead raise a `ScopeglassError`.

## Module map

| Area                | Modules                                                                                | Responsibility                                                                                         |
| ------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Public API          | `src/index.ts`, `src/analyze.ts`, `src/types.ts`                                       | Named exports, stable report types, and the `analyze()` entry point                                    |
| CLI shell           | `src/cli.ts`, `src/cli/`                                                               | Command parsing, exit codes, threshold policy, stdout/stderr separation, and safe report-file creation |
| Discovery           | `src/analysis/discovery.ts`, `src/analysis/paths.ts`                                   | Root selection, target containment, scope-chain construction, and portable display paths               |
| Filesystem boundary | `src/analysis/safe-files.ts`                                                           | Bounded UTF-8 reads and file-identity validation                                                       |
| Markdown model      | `src/analysis/markdown.ts`                                                             | Instruction blocks, headings, source lines, and local-reference extraction                             |
| Analysis            | `src/analysis/analyze.ts`, `src/analysis/references.ts`, `src/analysis/diagnostics.ts` | Canonical ordering, reference checks, diagnostic IDs, and report summary                               |
| Rendering           | `src/formatters/`                                                                      | Terminal, JSON, and static HTML projections of the canonical report                                    |
| Contracts           | `src/constants.ts`, `src/error.ts`, `schemas/`                                         | Version constants, hard limits, structured errors, and JSON Schema                                     |

## Discovery and precedence

Scopeglass resolves the target against the invocation working directory and
selects a root using the documented `--root` or nearest-repository behavior. A
Git worktree marker may be a `.git` directory or a small, valid `.git` file; the
latter is inspected only to recognize the repository boundary. Its `gitdir`
target is treated as opaque syntax and is never resolved or inspected.

From the root to the target directory, discovery checks each directory for an
`AGENTS.md`. Matching files form the scope chain. Precedence increases with
depth, so an instruction closer to the target is presented after—and can be
reasoned about relative to—a broader ancestor instruction. The report retains
both source locations and explicit precedence rather than flattening the chain
into an opaque prompt.

The report root is always `.`. Targets, scope paths, reference paths, and error
paths use normalized root-relative display forms; absolute host paths are not
part of a successful report.

## Safe read boundary

Instruction files are untrusted input. Before and during a read, Scopeglass
validates that the path is a regular file, compares device and inode identity
across `lstat`, open-file `fstat`, and revalidation, and reads at most the
configured byte limit. An `AGENTS.md` symlink or junction is followed only
when it resolves to a regular file inside the analysis root; broken links,
escaping links, and links to non-files are fatal. `O_NOFOLLOW` is used on the
resolved path where the platform supports it, with identity validation
retained as the portable fallback.

Bytes must be valid UTF-8. A UTF-8 byte-order mark on an instruction file is
accepted and removed before parsing. Aggregate size, scope count,
parser-sensitive syntax, Markdown depth, instruction, reference, diagnostic,
and output limits bound work and memory before and after parsing. Diagnostic
normalization has separate input/output caps and skips oversized heuristic
inputs without dropping instructions. The exact limits live in
`src/constants.ts` and are published in the [README](../README.md).

Local Markdown references are classified and checked for lexical containment,
then walked with `lstat` one component at a time before final resolved
containment. Shared component and realpath results are cached for one analysis.
Scopeglass stops at a symlink or junction rather than probing through it. It
checks target existence and type; it does not open target content, follow a URL,
import code, or invoke a tool mentioned by the document.

See the engineering [security model](SECURITY.md) for the full threat analysis
and known operating-system limitations.

## Markdown and diagnostic model

The Markdown layer produces explicit instruction records with stable source
ranges and reference candidates. It does not treat Markdown as executable HTML
or a prompt to follow.

Ruleset version 1 emits four diagnostic kinds:

- broken local reference (`error`)
- unsafe local reference (`error`)
- duplicate instruction (`info`)
- possible conflict (`info`)

Duplicate and conflict checks are intentionally narrow and explainable.
Possible conflicts require an opposite leading polarity over the same
normalized instruction core; Scopeglass does not claim semantic understanding.
Changing this meaning requires a `rulesetVersion` change.

## Determinism and ordering

Determinism depends on explicit canonicalization rather than incidental
filesystem or object iteration order:

- scopes are ordered from root toward the target;
- instructions are ordered by precedence, source range, then stable ID;
- diagnostics are finalized in a defined order with stable IDs;
- object property order is constructed deliberately before JSON serialization;
- token estimates use `ceil(UTF-8 bytes / 3)` and name that method in the
  report;
- successful reports omit timestamps, durations, absolute paths, hostnames,
  random values, and environment-specific metadata.

The result is reproducible only for the same observed filesystem snapshot. A
concurrent writer can cause a safe failure, and a filesystem mutation between
two separate invocations can legitimately change the report.

## Public contracts and versioning

The package root exports `analyze`, public report types, `ScopeglassError`,
analysis limits, and version constants. The primary API is:

```ts
import { analyze } from "scopeglass";

const report = await analyze("src/index.ts", { root: "." });
```

`AnalyzeOptions` accepts optional `cwd` and `root` values. The resolved result
is `ScopeglassReportV1`.

The machine-readable contracts are the
[report v1 JSON Schema](../schemas/scopeglass-report-v1.schema.json) and
[check-result v1 JSON Schema](../schemas/scopeglass-check-result-v1.schema.json).
Once a package is installed, they are addressable through the declared
`scopeglass/schema/report-v1.json` and
`scopeglass/schema/check-result-v1.json` package exports. The check-result
schema reuses the report contract through its stable `$id`; validators load both
schemas. These are package contracts, not a claim that version 0.1.0 has already
been published.

Two versions evolve independently:

- `schemaVersion` changes when the report shape or field semantics become
  incompatible;
- `rulesetVersion` changes when extraction, classification, or diagnostic
  behavior changes while the shape remains compatible.

## Output boundaries

Terminal output escapes controls and treats styling as a trusted rendering
gutter. JSON uses the canonical report and contains no ANSI escapes. HTML is a
self-contained, static document: repository-controlled strings are escaped,
repository references are inert text, scripts and remote assets are absent,
and a restrictive Content Security Policy is embedded.

File output is an exclusive create with private mode `0600`; Scopeglass refuses
to overwrite an existing file and validates output-directory components around
creation. Standard-output mode does not write a file.

## Dependency boundaries

Runtime dependencies have deliberately narrow roles:

- Commander parses the CLI surface;
- mdast parses Markdown into a structural tree;
- picocolors applies optional terminal styling.

None is used for network access, code execution, HTML activation, or model
inference. New runtime dependencies need explicit justification, a security
review, and maintainer approval.

## Extension rules

Changes should preserve the canonical pipeline and its trust boundaries:

1. Specify a new behavior and whether it changes schema or ruleset semantics.
2. Add fixtures and tests for ordering, limits, malformed inputs, and hostile
   strings before implementation.
3. Keep repository data as data; never execute, fetch, or activate it.
4. Feed all output formats from the same report rather than re-analyzing.
5. Record durable architectural changes in `docs/decisions/`.

The first decision record explains why the project is
[local and deterministic](decisions/0001-local-deterministic-analysis.md).
