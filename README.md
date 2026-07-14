# Scopeglass

**See every `AGENTS.md` rule that applies to a path—ordered, attributed, and
checked without sending repository content anywhere.**

Scopeglass follows the canonical root-to-target `AGENTS.md` chain, extracts
prose instructions with line-level provenance, estimates context size, checks
local Markdown references, and flags exact duplicates or narrowly matched
possible conflicts. The same deterministic report can be rendered for a human,
consumed as JSON, or saved as a self-contained HTML file.

> **Release status:** v0.1.0 is being prepared from this repository. This README
> does not claim that the package has been published to npm. CI release
> automation and full browser verification must be completed before a release
> is declared ready.

## The five-minute value

From a source checkout, with Node.js 22.13 or newer:

```sh
npm ci
npm run dev -- inspect src/payments/charge.ts --no-color
```

A representative terminal report looks like this:

```text
Scopeglass
Effective AGENTS.md instructions, with provenance.

Overview
│ Target: src/payments/charge.ts
│ Context estimate: 612 tokens (1,835 UTF-8 bytes, utf8-bytes-div-3)
│ 2 scopes · 7 instructions · 1 diagnostics

Scopes · root → target
│ 1. AGENTS.md · precedence 0 · ~401 tokens
│ 2. src/payments/AGENTS.md · precedence 1 · ~211 tokens

Instructions
│ 1. [Repository]
│ Use strict TypeScript.
│    AGENTS.md:3-3 · paragraph · precedence 0
```

The important part is not the formatting. In one command, the report answers:

- Which canonical `AGENTS.md` files apply?
- In what precedence order do they accumulate?
- Which file and lines produced each instruction?
- How much context do the files approximately add?
- Are local references broken or unsafe?
- Is guidance repeated or directly opposed under the conservative v1 ruleset?

Scopeglass reports expected scope. It does not reveal a vendor's private prompt,
prove model compliance, or decide that one natural-language instruction
semantically overrides another.

## Install from source

Requirements:

- Node.js `>=22.13.0`
- npm `10.9.8` for the repository's pinned development workflow

```sh
npm ci
npm run build
node dist/cli.js --help
```

During development, `npm run dev -- <arguments>` runs the TypeScript CLI
directly. After the package is installed or linked locally, use `scopeglass`
instead.

## CLI

`target` defaults to `.` and must already exist. Relative targets and roots are
resolved from the process working directory.

| Command                       | Purpose                                     | Important options                                                                                                           |
| ----------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `scopeglass inspect [target]` | Print the effective chain and instructions. | `--format terminal\|json`, `--root <path>`, `--no-color`                                                                    |
| `scopeglass report [target]`  | Create a self-contained HTML report.        | `--output <path>`, `--root <path>`                                                                                          |
| `scopeglass check [target]`   | Enforce diagnostic and context policies.    | `--format terminal\|json`, `--fail-on error\|warning\|info\|never`, `--max-tokens <integer>`, `--root <path>`, `--no-color` |

### Inspect

```sh
scopeglass inspect .
scopeglass inspect packages/api/src/router.ts --format json
scopeglass inspect ../workspace/app.ts --root ../workspace
```

`inspect` exits `0` after a successful analysis even when the report contains
diagnostics. JSON is written to stdout without ANSI styling; fatal errors are
written to stderr.

### Report

```sh
scopeglass report packages/api/src/router.ts
scopeglass report packages/api/src/router.ts --output artifacts/scopeglass.html
scopeglass report packages/api/src/router.ts --output - > scopeglass.html
```

The default destination is `scopeglass.html`. File output uses exclusive
creation, private mode `0600` where supported, and refuses to overwrite an
existing file, symlink, junction, FIFO, or device. `--output -` streams HTML to
stdout. Reports are static, contain no JavaScript or remote assets, and are not
opened automatically.

Reports contain instruction text and repository-relative paths. Treat them as
repository data; an `AGENTS.md` file may itself contain secrets.

### Check

```sh
scopeglass check .
scopeglass check src --fail-on warning
scopeglass check src --fail-on never --max-tokens 8000 --format json
```

The default diagnostic threshold is `error`. Thresholds are inclusive:
`--fail-on warning` fails for warnings or errors. A token total equal to
`--max-tokens` passes; a greater total fails. Diagnostic and token policies use
logical OR, so either can fail the check.

| Exit code | Meaning                                                                                     |
| --------- | ------------------------------------------------------------------------------------------- |
| `0`       | Analysis completed and every enabled policy passed.                                         |
| `1`       | Analysis completed, but a `check` policy failed.                                            |
| `2`       | Invalid usage, unsafe/unreadable input, failed report write, or unexpected runtime failure. |

## Diagnostics

| Code                    | Severity | Meaning                                                                                                             |
| ----------------------- | -------- | ------------------------------------------------------------------------------------------------------------------- |
| `broken-reference`      | error    | A relative Markdown target is missing or disappeared during inspection.                                             |
| `unsafe-reference`      | error    | A reference is malformed, escapes the root, uses an unsafe path form, or resolves through an unsupported file type. |
| `duplicate-instruction` | info     | The same normalized instruction occurs more than once.                                                              |
| `possible-conflict`     | info     | Opposite leading polarity occurs for an otherwise exactly normalized rule.                                          |

Conflict detection is deliberately narrow and deterministic. “Possible” is
important: Scopeglass shows both sources and never presents the heuristic as a
proof of intent.

## JSON contract

Reports are byte-deterministic for identical inputs and options. They contain
no timestamp and no absolute host path. Arrays have stable ordering, and the
contract carries separate schema and diagnostic-ruleset versions.

```json
{
  "kind": "scopeglass-report",
  "schemaVersion": 1,
  "rulesetVersion": 1,
  "root": ".",
  "rootDiscovery": { "method": "target-fallback" },
  "target": ".",
  "tokenEstimate": {
    "method": "utf8-bytes-div-3",
    "bytes": 0,
    "total": 0
  },
  "scopes": [],
  "instructions": [],
  "diagnostics": [],
  "summary": {
    "scopeCount": 0,
    "instructionCount": 0,
    "errorCount": 0,
    "warningCount": 0,
    "infoCount": 0
  }
}
```

The strict JSON Schema is available in the repository at
[`schemas/scopeglass-report-v1.schema.json`](schemas/scopeglass-report-v1.schema.json)
and through the package export `scopeglass/schema/report-v1.json` when the
package is installed.

Additive report fields may appear in minor versions. Removing a field or
changing its type or meaning requires a major release. A ruleset change that
can change `check` outcomes increments `rulesetVersion` and is treated as a
breaking policy change.

## Programmatic API

The package root deliberately exposes a small ESM API:

```ts
import {
  ANALYSIS_LIMITS,
  ScopeglassError,
  analyze,
  type ScopeglassReportV1,
} from "scopeglass";

try {
  const report: ScopeglassReportV1 = await analyze("src/payments/charge.ts", {
    cwd: process.cwd(),
    root: ".",
  });

  console.log(report.scopes.map(({ path }) => path));
  console.log(ANALYSIS_LIMITS.maxScopes);
} catch (error) {
  if (error instanceof ScopeglassError) {
    console.error(error.code, error.path);
  } else {
    throw error;
  }
}
```

`analyze()` performs no writes. Expected boundary failures use
`ScopeglassError`; unexpected exceptions are not converted into partial
reports. The root export also includes the version constants, analysis limits,
error/diagnostic types, and report types. Renderers and filesystem helpers are
internal.

## Privacy and security

Runtime analysis is local-only:

- no telemetry, model calls, network requests, remote assets, or plugins;
- no execution or import of repository content, fenced blocks, hooks, or
  referenced files;
- bounded, validated UTF-8 reads with symlink and containment checks;
- root-relative serialized paths, with no absolute host paths in JSON or HTML;
- terminal control/workflow-command neutralization;
- contextually escaped static HTML with a restrictive CSP;
- inert repository-authored links.

Scopeglass is not an operating-system sandbox. Hard links, bind mounts, and a
same-user process racing directory mutations are outside the v0.1.0 guarantee.
Read the [security design](docs/SECURITY.md), [reporting policy](SECURITY.md),
and [architecture](docs/ARCHITECTURE.md) before using it on adversarial
repositories.

## Hard limits

| Resource                                |                       Limit |
| --------------------------------------- | --------------------------: |
| Applicable scope files                  |                          64 |
| One `AGENTS.md`                         |             1,048,576 bytes |
| Combined `AGENTS.md` input              |             4,194,304 bytes |
| Extracted instructions                  |                       4,096 |
| One extracted instruction               | 131,072 Unicode code points |
| Local references                        |                       2,048 |
| Markdown nesting depth                  |                         128 |
| Diagnostics                             |                       4,096 |
| Rendered terminal, JSON, or HTML output |            33,554,432 bytes |

The context estimate is `ceil(UTF-8 bytes / 3)`. It is a transparent,
cross-agent heuristic—not a model-specific tokenizer result.

## Scope and non-goals

v0.1.0 supports canonical ancestor `AGENTS.md` files only. It intentionally does
not analyze global instructions, `CLAUDE.md`, Cursor rules, Copilot instruction
formats, `SKILL.md`, MCP configuration, or a vendor's private prompt assembly.
It does not rewrite instruction files, score writing quality, call a model, or
crawl every source file.

The full contract is in [SPEC.md](SPEC.md). The rationale for keeping the tool
local and deterministic is recorded in
[ADR 0001](docs/decisions/0001-local-deterministic-analysis.md).

## Contributing

Start with [CONTRIBUTING.md](CONTRIBUTING.md), follow the repository-specific
instructions in [AGENTS.md](AGENTS.md), and respect the
[Code of Conduct](CODE_OF_CONDUCT.md). Security-sensitive findings belong in
the private process described by [SECURITY.md](SECURITY.md), not a public issue.

Useful contributor commands:

```sh
npm test
npm run test:coverage
npm run lint
npm run typecheck
npm run build
npm run package:check
npm run verify
```

Release preparation is documented in [docs/RELEASE.md](docs/RELEASE.md). The
project is available under the [MIT License](LICENSE).
