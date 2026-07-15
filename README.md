<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/scopeglass-logo-dark.svg">
  <img src="docs/assets/scopeglass-logo-light.svg" alt="Scopeglass — see every rule in the room" width="460">
</picture>

**See every `AGENTS.md` rule that applies to a path — ordered, attributed, and
checked without sending repository content anywhere.**

[![Tests](https://img.shields.io/github/actions/workflow/status/zackabrah/scopeglass/ci.yml?branch=main&label=tests&logo=githubactions&logoColor=white)](https://github.com/zackabrah/scopeglass/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/scopeglass?logo=npm&color=000000)](https://www.npmjs.com/package/scopeglass)
[![Node.js](https://img.shields.io/node/v/scopeglass?logo=nodedotjs&color=000000)](https://www.npmjs.com/package/scopeglass)
[![Provenance](https://img.shields.io/badge/npm-provenance-000000?logo=npm)](https://www.npmjs.com/package/scopeglass)
[![License](https://img.shields.io/github/license/zackabrah/scopeglass?color=666666)](LICENSE)

[Why](#why-scopeglass) · [Quick start](#quick-start) · [CLI](#cli) ·
[Security](#privacy-and-security) · [Limits](#hard-limits) ·
[API](#programmatic-api)

</div>

> **Release status:** v0.1.0 is the first public release. Stable tarballs are
> verified in a protected GitHub workflow, staged through npm trusted publishing
> with OIDC provenance, and published only after explicit maintainer 2FA approval.
> The `main` branch contains unreleased v0.2.0 changes under diagnostic
> ruleset v2; see the [changelog](CHANGELOG.md).

## Why Scopeglass?

Coding agents read every `AGENTS.md` from your repository root down to the file
they touch. That chain is invisible: rules stack up across directories, quietly
duplicate or contradict each other, go stale, and bill you context tokens on
every request. Scopeglass is the devtools pane for that chain — one command
shows exactly what an agent inherits at any path, where each rule comes from,
and what it costs.

|                                    |                                                                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 🔍 **Total visibility**            | The full root→target `AGENTS.md` chain in the exact precedence order agents accumulate it — nothing hiding in a parent directory.     |
| 🧾 **Line-level provenance**       | Every instruction carries its `file:line` source, so "why did the agent do that?" has a lookup instead of a guess.                    |
| 🧮 **Honest context cost**         | Exact UTF-8 bytes plus a transparent, named token estimate — know what the chain costs before an agent pays it.                       |
| ⚖️ **Duplicate & conflict flags**  | Narrow, deterministic heuristics surface repeated rules and opposite-polarity guidance, always showing both sources.                  |
| 🔗 **Reference checking**          | Broken or root-escaping relative links inside instruction files become error diagnostics before an agent trips on them.               |
| 🚦 **CI-ready policy gate**        | `scopeglass check` fails builds on diagnostics or token budgets, with stable exit codes and schema-versioned JSON.                    |
| 🔒 **Local by construction**       | No network, no model calls, no telemetry, and no execution of repository content. Ever.                                               |
| 🎨 **Three renderers, one report** | The same deterministic report renders for the terminal, as versioned JSON, or as a self-contained static HTML page with a strict CSP. |

## Quick start

Scopeglass requires Node.js 22.17.0 or newer.

```sh
npm install --global scopeglass
scopeglass inspect src/payments/charge.ts
```

A representative terminal report:

```text
◎ Scopeglass
Effective AGENTS.md instructions, with provenance.

Overview
│ Target: packages/payments/src/charge.ts
│ Root discovery: explicit --root directory.
│ Context estimate: 63 tokens (187 UTF-8 bytes, utf8-bytes-div-3)
│ 3 scopes · 7 instructions · 3 diagnostics

Scopes · root → target
│ 1. AGENTS.md · precedence 0 · ~29 tokens
│ 2. packages/AGENTS.md · precedence 1 · ~15 tokens
│ 3. packages/payments/AGENTS.md · precedence 2 · ~19 tokens

Instructions
│ 1. Use pnpm.
│    [Repository] · AGENTS.md:3-3 · paragraph · precedence 0
│
│ 2. Always use tabs.
│    [Repository] · AGENTS.md:5-5 · paragraph · precedence 0
```

The formatting is not the point. In one command, the report answers:

- ✅ Which canonical `AGENTS.md` files apply?
- ✅ In what precedence order do they accumulate?
- ✅ Which file and lines produced each instruction?
- ✅ How much context do the files approximately add?
- ✅ Are local references broken or unsafe?
- ✅ Is guidance repeated or directly opposed under the conservative ruleset?

> 💡 **Make it a gate:** add
> `scopeglass check src --fail-on error --max-tokens 8000` to CI and stop
> instruction rot before it merges.

For the ESM API and exported JSON Schemas, install it as a project dependency
instead:

```sh
npm install scopeglass
```

Scopeglass reports expected scope. It does not reveal a vendor's private prompt,
prove model compliance, or decide that one natural-language instruction
semantically overrides another.

## Install from source

Requirements:

- Node.js `>=22.17.0`
- npm `10.9.8` for the repository's pinned development workflow

```sh
npm ci
npm run build
node dist/cli.js --help
```

During development, `npm run dev -- <arguments>` runs the TypeScript CLI
directly. After the package is installed or linked locally, use `scopeglass`
instead. To try the repository's demo fixture:

```sh
npm run dev -- inspect tests/fixtures/hero-repository/packages/payments/src/charge.ts --root tests/fixtures/hero-repository --no-color
```

## CLI

`target` defaults to `.` and must already exist. Relative targets and roots are
resolved from the process working directory.

Without `--root`, Scopeglass walks upward from the target to the nearest valid
`.git` directory or well-formed `.git` file. If no marker exists, it uses the
target directory itself and does not include instructions from higher
directories. Human reports show the selected method and a fallback hint; use
`--root` when analyzing a non-Git tree with intended ancestor instructions.

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
scopeglass report packages/api/src/router.ts --output -
```

The default destination is `scopeglass.html`. File output uses exclusive
creation, private mode `0600` where supported, and refuses to overwrite an
existing file, symlink, junction, FIFO, or device. `--output -` streams HTML to
stdout. Reports are static, contain no JavaScript or remote assets, and are not
opened automatically.

> ⚠️ Use `--output <path>` for safe file creation. Redirecting `--output -`
> with a shell can overwrite an existing file and uses the shell's permissions
> rather than Scopeglass's exclusive `0600` creation safeguards.

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
  "rulesetVersion": 2,
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

Strict JSON Schemas are available for both top-level machine-output kinds:

- [`schemas/scopeglass-report-v1.schema.json`](schemas/scopeglass-report-v1.schema.json),
  exported as `scopeglass/schema/report-v1.json`;
- [`schemas/scopeglass-check-result-v1.schema.json`](schemas/scopeglass-check-result-v1.schema.json),
  exported as `scopeglass/schema/check-result-v1.json`.

The check-result schema references the report schema by its stable `$id`, so
register both schemas with validators that do not resolve package resources
automatically.

The report shape is exact for schema version 1. Adding or removing a field, or
changing its type or meaning, requires a new schema version and a major release.
A ruleset change that can change `check` outcomes increments `rulesetVersion`
and is also treated as a breaking policy change.

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
- bounded, validated UTF-8 reads with symlink and containment checks. An
  `AGENTS.md` symlink (for example `AGENTS.md -> CLAUDE.md`) is followed only
  when it resolves to a regular file inside the analysis root; broken or
  escaping links remain fatal;
- root-relative serialized paths, with no absolute host paths in JSON or HTML;
- terminal control/workflow-command neutralization;
- contextually escaped static HTML with a restrictive CSP;
- inert repository-authored links.

Scopeglass is not an operating-system sandbox. Hard links, bind mounts, and a
same-user process racing directory mutations are outside the current guarantee.
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
| One section heading                     |     256 Unicode code points |
| Local references                        |                       2,048 |
| One local-reference target              |   4,096 Unicode code points |
| Unique reference-path inspections       |                      16,384 |
| Parser-sensitive syntax in one file     |           16,384 characters |
| Parser-sensitive syntax in the chain    |           32,768 characters |
| Markdown nesting depth                  |                         128 |
| Diagnostics                             |                       4,096 |
| Rendered terminal, JSON, or HTML output |            33,554,432 bytes |

The context estimate is `ceil(UTF-8 bytes / 3)`. It is a transparent,
cross-agent heuristic—not a model-specific tokenizer result.

In practice the parser-sensitive syntax budgets bind before the byte limits:
periods, hyphens, and newlines all count, so ordinary Markdown reaches 16,384
parser-sensitive characters in the low hundreds of kilobytes—well under the
1 MiB per-file byte cap. Exceeding any hard limit is a fatal error rather than
a diagnostic, so `check` cannot return a policy result for a chain beyond
these bounds.

Duplicate/conflict heuristics normalize only instructions of at most 1,024
Unicode code points, retain individual normalized forms of at most 8,192 code
points, and process at most 4,194,304 normalized code points per report. Longer
forms remain in the report but are omitted from those informational heuristics,
preventing Unicode compatibility expansion from amplifying memory.

## Scope and non-goals

Scopeglass supports canonical ancestor `AGENTS.md` files only. It intentionally
does not analyze global instructions, `CLAUDE.md`, Cursor rules, Copilot
instruction formats, `SKILL.md`, MCP configuration, or a vendor's private
prompt assembly. It does not rewrite instruction files, score writing quality,
call a model, or crawl every source file.

The full contract is in [SPEC.md](SPEC.md). The rationale for keeping the tool
local and deterministic is recorded in
[ADR 0001](docs/decisions/0001-local-deterministic-analysis.md).

## Contributing

Start with [CONTRIBUTING.md](CONTRIBUTING.md), follow the repository-specific
instructions in [AGENTS.md](AGENTS.md), and respect the
[Code of Conduct](CODE_OF_CONDUCT.md). Security-sensitive findings belong in
the private process described by [SECURITY.md](SECURITY.md), not a public issue.

Useful contributor commands:

Download the isolated test browsers once with `npm run browser:install` before
running the browser gate.

```sh
npm test
npm run test:coverage
npm run lint
npm run typecheck
npm run build
npm run browser:install
npm run browser:check
npm run package:check
npm run verify
```

Release preparation is documented in [docs/RELEASE.md](docs/RELEASE.md). The
project is available under the [MIT License](LICENSE).

---

<div align="center">
<sub>Scopeglass reports the rules — it never executes them. 🔍</sub>
</div>
