# Scopeglass v1 Specification

## Objective

Scopeglass is a local, deterministic command-line tool that answers: “Which
`AGENTS.md` instructions apply to this path, and why?” It is for developers and
maintainers using coding agents in repositories with hierarchical instruction
files.

The v1 release resolves canonical `AGENTS.md` files from repository root to a
target path, preserves line-level provenance, estimates context cost, reports
duplicate and potentially contradictory guidance, checks local Markdown
references, and renders the same versioned result as terminal, JSON, or a
self-contained HTML report.

### Assumptions approved for this build

- The public package and executable are both named `scopeglass`.
- Node.js `>=22.12.0` and ESM are acceptable distribution requirements.
- TypeScript is the implementation language.
- v1 models the canonical AGENTS.md ancestor-scope convention only. Vendor
  aliases, global instructions, skills, and proprietary rule formats are out of
  scope.
- Scopeglass describes expected instruction scope; it does not claim to reveal
  a vendor's private assembled system prompt or guarantee model compliance.
- Runtime behavior is local-only: no telemetry, model calls, network requests,
  remote assets, or execution of repository content.

## User experience and public interface

### Commands

```sh
# Inspect the current directory using terminal output.
scopeglass inspect .

# Inspect a source file and emit stable, machine-readable JSON.
scopeglass inspect src/payments/charge.ts --format json

# Create a self-contained report.
scopeglass report src/payments/charge.ts --output scopeglass.html

# Enforce policy in CI. Exit 1 when the selected diagnostic threshold or token
# budget is exceeded; exit 2 for invalid usage or runtime failure.
scopeglass check src/payments/charge.ts --fail-on warning --max-tokens 8000
```

Global behavior:

- `--root <path>` overrides repository-root discovery.
- `--no-color` disables ANSI styling.
- Paths in output use `/` separators and are relative to the resolved root.
- Human-facing errors go to stderr; successful payloads go to stdout.
- `NO_COLOR` and non-TTY output are respected.

### Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Analysis completed and policy passed. |
| `1` | Analysis completed but `check` policy failed. |
| `2` | Invalid arguments, unsafe path, unreadable input, or unexpected runtime failure. |

### JSON contract

All JSON output is a single object with `schemaVersion: 1`. Additive fields may
be introduced in minor versions. Removing or changing the meaning/type of an
existing field requires a major release.

```ts
interface ScopeglassReportV1 {
  schemaVersion: 1;
  generatedAt: string;
  root: string;
  target: string;
  tokenEstimate: {
    tokenizer: "o200k_base";
    total: number;
  };
  scopes: ScopeRecord[];
  instructions: InstructionRecord[];
  diagnostics: DiagnosticRecord[];
  summary: {
    scopeCount: number;
    instructionCount: number;
    errorCount: number;
    warningCount: number;
    infoCount: number;
  };
}
```

Diagnostics have stable codes and severities (`error`, `warning`, `info`).
Terminal wording is not a machine-readable contract; consumers must use JSON
codes rather than parse prose.

## Tech stack

- Runtime: Node.js `>=22.12.0`, ESM.
- Language/build: TypeScript 7, tsup.
- CLI: Commander 15.
- Markdown AST: `mdast-util-from-markdown`.
- Token counting: `js-tiktoken` with `o200k_base`, explicitly labeled as a
  tokenizer-specific estimate rather than a universal agent cost.
- Terminal color: picocolors, with `NO_COLOR` support.
- Tests: Vitest with V8 coverage.
- Quality: ESLint, typescript-eslint, Prettier, publint, Are The Types Wrong.

Dependencies are pinned by `package-lock.json`; CI installs with `npm ci`.

## Commands for contributors

```sh
npm ci
npm run dev -- inspect .
npm test
npm run test:coverage
npm run lint
npm run format:check
npm run typecheck
npm run build
npm run package:check
npm run verify
```

## Project structure

```text
src/
  analysis/       Scope discovery, Markdown extraction, diagnostics
  formatters/     Terminal, JSON, and self-contained HTML rendering
  cli.ts          Argument parsing and process boundary
  index.ts        Supported programmatic API
  types.ts        Public versioned contracts
tests/
  fixtures/       Small synthetic repositories
  unit/           Pure analysis and formatting tests
  integration/    Filesystem and CLI behavior
docs/             Architecture, security, and release documentation
tasks/            Implementation plan and live checklist
.github/workflows CI and release automation
```

## Code style

- Named exports only in library modules.
- `unknown` at external boundaries; narrow before use. No `any`.
- Pure analysis functions accept data and return data. Filesystem access stays
  in discovery/reference modules and the CLI boundary.
- Discriminated unions model diagnostic variants.
- Errors exposed by the CLI use stable error codes and concise messages.
- Files should remain focused and normally below 250 lines.

```ts
export type Diagnostic =
  | { code: "duplicate-instruction"; severity: "info"; instructionIds: string[] }
  | { code: "possible-conflict"; severity: "warning"; instructionIds: [string, string] }
  | { code: "broken-reference"; severity: "error"; source: SourceLocation; target: string };
```

## Analysis behavior

1. Resolve a root from `--root`, otherwise the nearest ancestor containing a
   `.git` entry, falling back to the current working directory.
2. Resolve and realpath both root and target. Reject a target outside root,
   including symlink escapes.
3. For a file target, inspect its parent directory. For a directory target,
   inspect that directory.
4. Walk from root to the target directory and load each canonical `AGENTS.md`.
   Ancestor instructions accumulate; nearer files have higher precedence.
5. Refuse files larger than 1 MiB and never follow an `AGENTS.md` symlink that
   resolves outside root.
6. Extract headings, paragraphs, list items, fenced-code metadata, and local
   Markdown links with source positions. Code fences are context, not executable
   instructions.
7. Report exact normalized duplicates as informational diagnostics.
8. Report opposite-polarity, high-overlap instruction pairs as *possible*
   conflicts. The report must show both sources and never present the heuristic
   as proof.
9. Check relative Markdown links and fragments without fetching remote URLs.
10. Render all repository content as escaped text in HTML.

## Testing strategy

- Unit tests cover path normalization, instruction extraction, duplicate and
  conflict heuristics, token accounting, diagnostics, and formatter escaping.
- Filesystem integration tests use temporary repositories for nested scope,
  missing files, symlink escape, oversized files, Unicode, and Windows-style
  display normalization.
- CLI integration tests exercise stdout/stderr separation and exit codes.
- Browser verification opens a generated report in an isolated Chrome profile,
  checks the console, accessibility tree, keyboard focus, and layouts at 320,
  768, 1024, and 1440 pixels.
- Coverage floor: 90% statements/lines/functions and 85% branches for `src/`.
- Packaging verification runs publint, Are The Types Wrong, and a packed-tarball
  smoke test.

## Threat model and boundaries

Trust boundary: every scanned path and byte of repository Markdown is hostile.

Primary abuse cases and controls:

- Path traversal or symlink escape → realpath containment checks before reads.
- Memory/CPU exhaustion → 1 MiB per instruction file, bounded scope depth, no
  whole-repository crawl in v1.
- HTML/script injection → contextual HTML escaping, inert text rendering, strict
  CSP in the generated report, and no `innerHTML` assignment from report data.
- Command execution → Scopeglass never executes fenced blocks, referenced files,
  hooks, package scripts, or shell commands from a scanned repository.
- Network exfiltration → runtime contains no HTTP client and HTML contains no
  remote resources.
- Terminal escape injection → control characters are removed from displayed
  repository content.
- Supply-chain compromise → minimal runtime dependencies, lockfile, CI audit,
  and release provenance.

### Always

- Validate CLI paths and numeric options at the process boundary.
- Escape untrusted content for terminal and HTML output.
- Keep JSON deterministic apart from `generatedAt`.
- Run `npm run verify` and `npm audit --audit-level=high` before release.

### Ask first

- Add runtime dependencies.
- Expand scanning beyond the target's ancestor chain.
- Add any network, model, plugin, or code-execution capability.
- Change the JSON schema or exit-code meanings.

### Never

- Execute or import scanned repository content.
- Fetch links found in Markdown.
- Follow a resolved path outside the selected root.
- Send telemetry or repository content off-device.
- Render repository text as trusted HTML.

## Success criteria

- Nested fixtures resolve the correct root-to-leaf AGENTS.md chain and line
  provenance.
- Duplicate, possible-conflict, broken-reference, and unsafe-path cases produce
  documented stable diagnostic codes.
- Terminal, JSON, and HTML outputs agree on counts and diagnostics.
- HTML is self-contained, responsive, keyboard-usable, WCAG 2.1 AA-oriented,
  CSP-protected, and free of browser console warnings.
- `scopeglass check` has deterministic exit codes 0/1/2.
- `npm run verify`, high-severity audit, packed-tarball smoke test, and browser
  verification pass.
- README, license, contributing guide, code of conduct, security policy,
  changelog, CI, and provenance-enabled release workflow are present.

## Non-goals for v1

- Rewriting, merging, or synchronizing instruction files.
- Natural-language “quality scores” or model-based conflict detection.
- CLAUDE.md, Cursor rules, Copilot instructions, SKILL.md, or MCP analysis.
- Observing a vendor's private prompt assembly.
- Hosted dashboards, accounts, telemetry, plugins, or editor extensions.
- Scanning every source file to build a full repository browser.

## Open questions

None blocking. Vendor profiles and additional rule formats are intentionally
deferred until the canonical AGENTS.md workflow is validated in real projects.
