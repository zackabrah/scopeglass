# ADR 0001: Keep Scopeglass local and deterministic

- Status: Accepted
- Date: 2026-07-14
- Decision owners: Scopeglass maintainers

## Context

Developers increasingly place agent instructions in nested `AGENTS.md` files.
For a particular path, understanding the effective instruction chain requires
finding a repository boundary, locating every applicable file, preserving
precedence, estimating prompt size, and noticing broken references or obvious
instruction collisions.

The material being inspected is untrusted and can be private. A repository may
contain prompt injection, malformed Markdown, secrets, hostile terminal bytes,
or paths designed to escape the checkout. An inspection tool that sends this
material to a model or service would introduce a disclosure boundary; one that
executes referenced content would turn documentation into code. A tool whose
answer varies with a hosted model, clock, environment, or filesystem enumeration
would also be difficult to test and unsuitable as a stable CI policy input.

Scopeglass needs an explainable v1 that works before a repository is trusted and
produces one contract for people, scripts, and later integrations.

## Decision

Scopeglass analysis will be local, deterministic, bounded, and read-only with
respect to repository content.

Specifically:

1. Analysis reads only the filesystem metadata and `AGENTS.md` contents needed
   to discover the effective scope chain. Local references are checked for
   safety and existence but their contents are not opened.
2. Analysis performs no network requests, telemetry, model inference, Git hook
   execution, repository code execution, or tool invocation derived from
   repository text.
3. A canonical, versioned `ScopeglassReportV1` is the single result. Terminal,
   JSON, static HTML, and check policies are projections of that result.
4. Ordering, paths, identifiers, token estimation, diagnostics, and
   serialization are explicitly defined. Successful reports exclude clocks,
   durations, random values, absolute host paths, and environment-dependent
   metadata.
5. Work is capped by hard limits. Unsafe paths, ambiguous file identity,
   malformed UTF-8, limit breaches, and fatal I/O failures fail closed through
   structured errors.
6. Diagnostics use small, explainable rules. Version 1 may identify exact
   normalized duplicates and narrow opposite-polarity conflicts, but it does
   not claim semantic interpretation.
7. HTML remains self-contained and script-free. Repository-controlled content
   is data in every renderer, never active markup or instructions to the tool.

## Consequences

### Benefits

- Repository contents stay on the user's machine unless the user chooses to
  share the resulting report.
- The analyzer can run before the repository is trusted because it does not
  execute project code or follow instructions it finds.
- Identical supported inputs can produce byte-stable JSON suitable for tests,
  diffs, caches, and policy checks.
- Diagnostics are inspectable: users can trace each result to a scope, source
  range, rule, and ruleset version.
- One report contract prevents terminal, JSON, HTML, and CI policies from
  drifting into different analyses.
- Resource limits make failure behavior explicit under adversarial or
  accidental input growth.

### Costs and constraints

- The conflict detector cannot understand paraphrases, implicit intent,
  domain-specific meaning, or nuanced exceptions. It will miss semantic
  conflicts and may report harmless lexical oppositions.
- The byte-based token estimate is portable and deterministic but does not
  match every model tokenizer.
- Scopeglass cannot validate the truth or safety of referenced content because
  it intentionally does not open it.
- Local execution still relies on operating-system filesystem semantics and the
  caller's permissions; it is not a sandbox.
- Hosted collaboration, cross-repository indexing, automatic fixes, and live
  model interpretation are outside the v1 core.
- Maintaining deterministic ordering and versioned contracts adds discipline to
  otherwise small rule changes.

## Alternatives considered

### Use a language model for semantic conflict detection

This could find paraphrases and subtler conflicts, but it would add
nondeterminism, prompt-injection exposure, cost, latency, provider dependence,
and a potential disclosure boundary. It also makes stable local and CI results
harder to guarantee. A future opt-in adapter could consume a redacted report,
but it must not redefine or silently activate the deterministic core.

### Provide a hosted analysis service

A service could simplify installation and enable collaboration, but uploading
instruction files and repository paths is a material privacy change. It also
introduces authentication, retention, availability, and multi-tenant security
obligations that do not help answer the core local question.

### Ask a specific agent runtime for its effective prompt

Runtime introspection might appear authoritative, but it couples Scopeglass to
vendor behavior, may expose unrelated hidden context, and cannot provide a
portable contract across tools. Scopeglass instead analyzes the documented
filesystem convention it can explain.

### Scan the entire repository

Whole-repository indexing could answer broader questions but would read much
more untrusted and potentially sensitive data, consume more resources, and
obscure the path-specific precedence model. V1 reads only the applicable
instruction chain.

### Start as an editor plugin

An editor surface could be convenient, but it would entangle analysis with
editor permissions, lifecycle, rendering, and distribution. A stable package
API and JSON contract allow editor integrations to be added later without
moving trust into the core.

## Security and privacy implications

The decision reduces the amount of repository data read and eliminates network
and execution paths from analysis. It does not make output public-safe: reports
can reproduce secrets that already exist in `AGENTS.md`. Users must review
reports before sharing them.

Symlink, file-swap, traversal, output-overwrite, terminal, JSON, and HTML threats
still require explicit controls. Those controls and their filesystem
limitations are maintained in the engineering
[security model](../SECURITY.md).

## Reconsideration criteria

Revisit this decision only if a concrete use case cannot be served by a
separate, explicit consumer of the stable report. Any proposal involving
network access, model inference, telemetry, broader file reads, or content
execution must:

- be opt-in and visibly separate from local deterministic analysis;
- define its new trust, privacy, retention, and failure boundaries;
- preserve the offline core and versioned report contract;
- avoid sending repository content without specific user authorization;
- include a new ADR and security review before implementation.

Improved deterministic parsers or rules may extend the local ruleset without
reversing this decision, provided their semantics are versioned and their work
remains bounded.

## References

- [Scopeglass specification](../../SPEC.md)
- [Architecture](../ARCHITECTURE.md)
- [Engineering security model](../SECURITY.md)
