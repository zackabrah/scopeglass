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
- Node.js `>=22.17.0` and ESM are acceptable distribution requirements.
- TypeScript is the implementation language.
- v1 models the canonical AGENTS.md ancestor-scope convention only. Vendor
  aliases, global instructions, skills, and proprietary rule formats are out of
  scope.
- Scopeglass describes expected instruction scope; it does not claim to reveal
  a vendor's private assembled system prompt or guarantee model compliance.
- Runtime behavior is local-only: no telemetry, model calls, network requests,
  remote assets, or execution of repository content.

## User experience and public interface

### Command and option matrix

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

`target` defaults to `.` and must already exist. Relative targets and `--root`
values resolve from the process working directory.

| Command            | Output                                                                   | Options                                                                                                              | Success behavior                                                               |
| ------------------ | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `inspect [target]` | Terminal by default; JSON with `--format json`                           | `--root`, `--format terminal\|json`, `--no-color`                                                                    | Exit 0 after successful analysis even when diagnostics exist.                  |
| `report [target]`  | HTML file at `scopeglass.html` by default; HTML stdout when `--output -` | `--root`, `--output`                                                                                                 | Exit 0 after a complete write. File status is printed to stderr, never stdout. |
| `check [target]`   | Terminal by default; `ScopeglassCheckResultV1` with `--format json`      | `--root`, `--format terminal\|json`, `--fail-on error\|warning\|info\|never`, `--max-tokens <integer>`, `--no-color` | Exit 0 when all enabled policies pass; exit 1 when any enabled policy fails.   |

Global behavior:

- `--root <path>` overrides repository-root discovery.
- `--no-color` disables ANSI styling.
- Serialized paths use `/` separators and are relative to the resolved root.
  The serialized root is always `.`; absolute local paths never appear in JSON
  or HTML.
- The schema interprets `/` as the serialized separator. It rejects slash-rooted
  paths, `.`/`..` segments, and NULs, but permits `:` or `\` inside a POSIX
  filename component; native Windows roots are removed before serialization.
- Human-facing errors go to stderr; successful payloads go to stdout.
- `NO_COLOR` and non-TTY output are respected.
- Fatal usage/filesystem failures are `ScopeglassError` instances at the
  programmatic boundary and concise stderr messages at the CLI boundary.

`report` always uses exclusive creation and refuses any existing output,
including regular files, symlinks, junctions, FIFOs, and devices. Its parent
must resolve to a real directory. The file is opened with `wx` and mode `0600`,
written, fsync'd, and closed. There is no overwrite flag in v1; users can remove
an existing regular file explicitly or use `--output -`. Output may be outside
the analyzed root because it is an explicit CLI destination, but the no-follow
and exclusive-create rules still apply.

`check` severity order is `error > warning > info`. `--fail-on warning` means a
warning _or error_ fails the check. The default is `--fail-on error`.
`--fail-on never` disables diagnostic gating. `--max-tokens` accepts a safe
non-negative integer; a total equal to the budget passes and a total greater
than the budget fails. Diagnostic and token policies combine with logical OR:

| Diagnostic policy | Token policy  | Exit |
| ----------------- | ------------- | ---- |
| pass/disabled     | pass/disabled | 0    |
| fail              | pass/disabled | 1    |
| pass/disabled     | fail          | 1    |
| fail              | fail          | 1    |

### Exit codes

| Code | Meaning                                                                          |
| ---- | -------------------------------------------------------------------------------- |
| `0`  | Analysis completed and policy passed.                                            |
| `1`  | Analysis completed but `check` policy failed.                                    |
| `2`  | Invalid arguments, unsafe path, unreadable input, or unexpected runtime failure. |

### Programmatic API

The package root has a deliberately small export allowlist:

```ts
async function analyze(
  target?: string,
  options?: { cwd?: string; root?: string },
): Promise<ScopeglassReportV1>;

class ScopeglassError extends Error {
  readonly code: ScopeglassErrorCode;
  readonly path?: string; // Sanitized display path; never an absolute host path.
}
```

It also exports `REPORT_SCHEMA_VERSION`, `RULESET_VERSION`,
`TOKEN_ESTIMATE_METHOD`, documented analysis-limit constants, and the public
TypeScript types. Renderers, Markdown AST nodes, path helpers, and CLI internals
are not public exports. `analyze()` performs no writes and throws only
`ScopeglassError` for expected boundary failures. Unexpected exceptions are not
silently converted to partial reports.

Stable error codes are: `invalid-option`, `invalid-root`, `target-not-found`,
`target-outside-root`, `unsafe-symlink`, `file-too-large`, `total-too-large`,
`invalid-encoding`, `invalid-git-marker`, `scope-limit-exceeded`,
`instruction-limit-exceeded`, `instruction-too-long`,
`section-too-long`, `reference-limit-exceeded`, `reference-too-long`,
`reference-complexity-exceeded`, `markdown-complexity-exceeded`,
`markdown-depth-exceeded`, `diagnostic-limit-exceeded`,
`output-too-large`, `unreadable-file`, and `write-failed`.

### JSON contract

All JSON output is deterministic and carries `schemaVersion: 1` and
`rulesetVersion: 1`. There is no generation timestamp. Strict report and
check-result JSON Schemas ship in the package. The v1 shapes are exact: adding,
removing, or changing a field requires a new schema version and a major release.
A diagnostic ruleset change that can alter `check` results increments
`rulesetVersion` and is treated as a breaking policy change.

```ts
interface SourceLocation {
  path: string; // Root-relative, `/` separators.
  startLine: number; // 1-based, inclusive.
  endLine: number; // 1-based, inclusive.
}

interface TokenEstimate {
  method: "utf8-bytes-div-3";
  bytes: number;
  total: number; // ceil(bytes / 3)
}

type RootDiscovery =
  | {
      method: "explicit" | "target-fallback";
      marker?: never;
    }
  | {
      method: "git-directory" | "git-file";
      marker: ".git";
    };

interface ScopeRecord {
  id: string;
  path: string;
  directory: string;
  depth: number;
  precedence: number;
  tokenEstimate: TokenEstimate; // Raw AGENTS.md bytes, including Markdown/code.
  instructionIds: string[];
}

interface InstructionRecord {
  id: string;
  scopeId: string;
  kind: "paragraph" | "list-item" | "blockquote";
  text: string;
  section: string[];
  precedence: number;
  source: SourceLocation;
  tokenEstimate: TokenEstimate; // Extracted text only; not used for report total.
}

type DiagnosticCode =
  | "broken-reference"
  | "unsafe-reference"
  | "duplicate-instruction"
  | "possible-conflict";

interface DiagnosticRecord {
  id: string;
  code: DiagnosticCode;
  severity: "error" | "warning" | "info";
  message: string;
  sources: SourceLocation[];
  instructionIds: string[];
}

interface ScopeglassReportV1 {
  kind: "scopeglass-report";
  schemaVersion: 1;
  rulesetVersion: 1;
  root: ".";
  rootDiscovery: RootDiscovery;
  target: string;
  tokenEstimate: TokenEstimate;
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

interface ScopeglassCheckResultV1 {
  kind: "scopeglass-check";
  schemaVersion: 1;
  rulesetVersion: 1;
  report: ScopeglassReportV1;
  policy: {
    passed: boolean;
    failOn: "error" | "warning" | "info" | "never";
    maxTokens?: number;
    failures: Array<"diagnostics" | "max-tokens">;
  };
}
```

IDs are deterministic but report-local. Scope IDs derive from the normalized
AGENTS.md path; instruction IDs derive from scope order, source line, and local
ordinal; diagnostic IDs derive from code and sorted ordinal. Consumers must not
persist IDs as global identifiers.

Ordering is stable: scopes are root-to-target; instructions are ordered by
scope precedence, start line, end line, then ID; diagnostics are ordered by
severity (`error`, `warning`, `info`), code, first source path/line, then ID.
Terminal wording is not a machine contract; consumers use JSON codes and fields.

## Tech stack

- Runtime: Node.js `>=22.17.0`, ESM.
- Language/build: TypeScript 6.0.3, tsup.
- CLI: Commander 15.
- Markdown AST: `mdast-util-from-markdown`.
- Token estimation: a documented, dependency-free `ceil(UTF-8 bytes / 3)`
  heuristic plus exact byte counts. This intentionally favors a conservative
  cross-agent estimate over bundling one vendor's 22 MB tokenizer tables.
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
  | {
      code: "duplicate-instruction";
      severity: "info";
      instructionIds: string[];
    }
  | {
      code: "possible-conflict";
      severity: "info";
      instructionIds: [string, string];
    }
  | {
      code: "broken-reference";
      severity: "error";
      source: SourceLocation;
      target: string;
    };
```

## Analysis behavior

### Root, target, and file semantics

1. Resolve the lexical target from `options.cwd` (default `process.cwd()`). The
   target must exist as a regular file or directory; nonexistent paths, FIFOs,
   devices, sockets, symlinks, and junctions are rejected.
2. If `root` is supplied, it must exist as a real, non-symlink directory. If it
   is omitted, walk upward from the target's lexical directory. A valid marker
   is either a real `.git` directory or a regular `.git` file of at most 4 KiB
   containing exactly one `gitdir: <path>` directive. The directive target is
   opaque marker text: Scopeglass never resolves, stats, or reads it. This
   recognizes worktree and nested-repository boundaries without invoking Git,
   loading repository configuration, or probing an external/network path. An
   encountered malformed marker is fatal `invalid-git-marker`; it is not
   silently skipped. If no marker exists, use the target's lexical directory
   as root and record `target-fallback`.
3. Realpath the non-symlink root and target and reject containment when
   `path.relative(root, target)` is absolute or begins with a `..` segment. Never
   use string-prefix containment. Windows comparisons use `path.relative()` on
   the native platform, including drive/UNC semantics.
4. A file target uses its parent directory for scope discovery; a directory
   target uses itself. Serialized target and scope paths are real,
   root-relative paths.
5. Walk root-to-target and consider only a regular file named exactly
   `AGENTS.md`. Any AGENTS.md symlink, junction, directory, FIFO, device, or
   socket (including a broken or in-root symlink) is a fatal boundary error.
6. Files are lstat'd, opened `O_RDONLY | O_NOFOLLOW` where supported, fstat'd as
   regular files, then read from that descriptor in bounded chunks up to the
   applicable limit plus one byte. Invalid UTF-8 is fatal. A UTF-8 BOM is
   accepted and excluded from parsed text while exact on-disk bytes remain
   visible. CRLF and LF parse equivalently.

Containment is not an OS sandbox: hard links, bind mounts, and a same-user process
mutating directory components concurrently are outside the v1 guarantee.
Instruction-file descriptors are revalidated to avoid ordinary check/read
symlink swaps.

### Hard analysis limits

| Limit                             | Value                       | Behavior when exceeded                                             |
| --------------------------------- | --------------------------- | ------------------------------------------------------------------ |
| Scope files                       | 64                          | Fatal `scope-limit-exceeded`.                                      |
| One AGENTS.md                     | 1,048,576 bytes             | Exactly the limit passes; one byte over is fatal `file-too-large`. |
| Combined AGENTS.md bytes          | 4,194,304 bytes             | Fatal `total-too-large`.                                           |
| Extracted instructions            | 4,096                       | Fatal `instruction-limit-exceeded`.                                |
| One extracted instruction         | 131,072 Unicode code points | Fatal `instruction-too-long`.                                      |
| One section heading               | 256 Unicode code points     | Fatal `section-too-long`.                                          |
| Local references                  | 2,048                       | Fatal `reference-limit-exceeded`.                                  |
| One local-reference target        | 4,096 Unicode code points   | Fatal `reference-too-long`.                                        |
| Unique reference-path inspections | 16,384                      | Fatal `reference-complexity-exceeded`.                             |
| Parser-sensitive syntax/file      | 16,384 characters           | Fatal `markdown-complexity-exceeded` before Markdown parsing.      |
| Parser-sensitive syntax/chain     | 32,768 characters           | Fatal `markdown-complexity-exceeded` before Markdown parsing.      |
| Markdown AST depth                | 128                         | Fatal `markdown-depth-exceeded`.                                   |
| Diagnostics                       | 4,096                       | Fatal `diagnostic-limit-exceeded`.                                 |
| Rendered terminal/JSON/HTML bytes | 33,554,432                  | Fatal `output-too-large`.                                          |

No whole-repository enumeration or pairwise instruction comparison occurs.

### Instruction extraction and precedence

- Headings maintain a section stack but are not instructions.
- When a normalized reference label has multiple definitions, the first
  definition wins, matching CommonMark.
- A root-level paragraph is one `paragraph` instruction.
- Each direct paragraph inside a list item is one `list-item` instruction;
  nested lists recurse, and parent text is never duplicated into child records.
- Paragraphs and list items inside a blockquote use kind `blockquote` and are
  otherwise extracted by the same rules.
- Fenced/indented code, HTML, definitions, thematic breaks, and headings are
  context but not instructions. Their raw bytes still contribute to scope and
  report token estimates because coding agents receive the whole AGENTS.md.
- Ancestor instructions accumulate. Nearer scopes receive larger `precedence`
  values but do not delete or suppress ancestor records.
- Exact duplicate normalization uses Unicode NFKC, lowercase, Markdown text
  extraction, punctuation-to-space, and collapsed whitespace. Duplicate groups
  are informational and retain every source. Only instructions of at most 1,024
  Unicode code points enter this heuristic, and NFKC/lowercase forms over 8,192
  code points are skipped. At most 4,194,304 normalized code points enter the
  per-report indexes. Skipped instructions remain in the report.
- Possible conflicts are intentionally narrow and informational: only rules
  with opposite leading polarity and an otherwise _exact_ normalized core are
  paired. Recognized negative prefixes are `do not`, `don't`, `never`,
  `must not`, `should not`, `avoid`, `forbid`, and `disallow`; positive modal or
  action prefixes (`always`, `must`, `should`, `use`, `prefer`, `require`,
  `allow`) are removed before exact comparison. Scoped exceptions whose cores
  differ are not flagged. The algorithm is hash-based and linear.
- Before calling the Markdown parser, Scopeglass counts tabs, line endings, and
  the construct markers `` ! & ) * + - . < > [ \\ ] _ ` ``. CRLF counts as
  one line ending. Per-file and aggregate budgets prevent parser event
  expansion from turning a byte-valid file into disproportionate memory or CPU
  work.

### References

- Extract inline and reference-style Markdown links from AGENTS.md files.
- Validate only relative links with a non-empty path. Queries and fragments are
  removed before the existence check; fragment correctness is intentionally not
  checked in v1. Images and autolinks are not references.
- `http:`, `https:`, `mailto:`, `data:`, `javascript:`, `file:`, other schemes,
  protocol-relative URLs, absolute paths, and fragment-only links are inert and
  ignored. No URL is fetched.
- Percent-decode each relative path exactly once. Double-encoded separators are
  not decoded again. Invalid escapes, NULs, drive/UNC forms, backslash separator
  tricks on POSIX, lexical escapes, missing targets, broken symlinks, junctions,
  special files, and resolved paths outside root produce deterministic
  `broken-reference` or `unsafe-reference` diagnostics.
- After lexical containment, inspect every path component with `lstat` and stop
  at the first symbolic link or junction. Do not probe the final target through
  such a component. A per-analysis cache shares component metadata and final
  realpath results across targets with common prefixes. Repeated occurrences of
  the same raw target from the same source directory share one validation
  result and one bounded diagnostic. Validation stops with
  `reference-complexity-exceeded` before attempting more than 16,384 unique
  component/final-path `lstat` operations, including cache misses caused by
  filesystem spelling aliases.
- Linked targets are checked for existence/containment only and are never opened,
  parsed, imported, or executed.

### Output safety

- Every terminal line containing repository-derived text begins with a trusted
  gutter, so it can never start GitHub Actions commands (`::...::`) or Azure
  commands (`##vso[...]`). C0/C1 controls (including CR, BS, DEL, ESC/CSI/OSC,
  BEL), bidi controls/isolates, zero-width/default-ignorable characters, and
  Unicode tag characters are rendered as visible `\\u{...}` notation rather
  than silently removed. Paths and error text receive the same treatment. JSON
  is created only with `JSON.stringify`, contains no ANSI, and preserves valid
  source text using standards-compliant escaping.
- HTML is static and contains no JavaScript. It uses semantic elements and
  `<details>` for disclosure. Repository text is contextually escaped and never
  becomes an attribute, URL, style, or raw HTML value.
- Repository-authored links are displayed as inert text, not clickable anchors.
- Internal DOM IDs come only from trusted counters. The exact CSP is:

  ```text
  default-src 'none'; base-uri 'none'; object-src 'none'; frame-src 'none'; connect-src 'none'; img-src data:; script-src 'none'; style-src 'unsafe-inline'; form-action 'none'
  ```

  `frame-ancestors` is intentionally absent because browsers ignore it when CSP
  is delivered through a document `<meta>` element. Sites serving reports over
  HTTP can add `frame-ancestors 'none'` as a response header.

  Report text uses `unicode-bidi: plaintext`. There are no remote assets or
  network-capable elements.

## Testing strategy

- Unit tests cover path normalization, instruction extraction, duplicate and
  conflict heuristics, token accounting, diagnostics, and formatter escaping.
- Filesystem integration tests use temporary repositories for nested scope,
  no-git fallback, worktree `.git` files, nested repositories, relative and
  absolute targets, malformed/oversized `.git` markers, path-prefix collisions,
  symlinks and junctions in/out, special files, missing/disappearing files,
  descriptor revalidation, exact/over size limits, invalid UTF-8, BOM, CRLF,
  Unicode, bidi/control bytes, long lines, and native Windows drive/UNC behavior.
- Markdown tests cover nested lists, blockquotes, setext headings, inline and
  reference-style links, queries/fragments, percent encoding, and remote/inert
  schemes. Conflict tests include explicit true positives and scoped
  false-positive guards.
- CLI integration and runtime-boundary tests cover threshold equality,
  combined-policy truth table, invalid numerics, clean JSON stdout, stderr-only
  fatal errors, TTY/piped output, `NO_COLOR`, exclusive report creation,
  concurrent creators, existing output,
  output-parent symlinks, output symlinks, and mode `0600` where supported.
- A golden hero fixture contains three nested scopes, exact provenance, one
  duplicate, one conservative possible conflict, one broken link, and visible
  context totals. Terminal, JSON, and HTML must report the same facts.
- Browser verification opens a generated report in isolated Chromium, Firefox,
  and WebKit profiles. Its four scopes use the exact 1,048,576-byte per-file and
  4,194,304-byte aggregate limits. The suite checks closing-tag, event-handler,
  CSS, SVG, entity, bidi, and control-character payloads remain inert text; the
  exact CSP; zero scripts or external resources; a clean console; named
  accessibility-tree lists/groups/counts; native keyboard disclosures; tagged,
  script-free Chromium PDF output; layouts at 320, 768, 1024, and 1440 pixels;
  and 200% text reflow at 320 pixels.
- In-process coverage floor: 90% statements/lines/functions and 75% branches.
  The process entry point and `src/cli/**` are excluded from V8 attribution
  because they are exercised as real spawned executables; their cross-process
  integration suite remains a mandatory verification gate.
- Packaging verification runs publint, Are The Types Wrong, and a packed-tarball
  smoke test.

## Threat model and boundaries

Trust boundary: every scanned path and byte of repository Markdown is hostile.

Primary abuse cases and controls:

- Path traversal or symlink escape → lexical containment, component-by-component
  `lstat`, and final realpath containment before accepting a reference.
- Memory/CPU exhaustion → numeric per-file/total/scope/instruction/reference
  caps, linear diagnostics, and no whole-repository crawl.
- HTML/script injection → contextual HTML escaping, inert text rendering, strict
  CSP in the generated report, and no `innerHTML` assignment from report data.
- Command execution → Scopeglass never executes fenced blocks, referenced files,
  hooks, package scripts, or shell commands from a scanned repository.
- Network exfiltration → runtime contains no HTTP client and HTML contains no
  remote resources.
- Terminal/workflow-command injection → every untrusted line has a trusted
  gutter and dangerous controls/default-ignorables are visibly escaped.
- Output clobbering → exclusive no-follow creation, filesystem-identity-based
  descendant detection across case/Unicode aliases, real parent components,
  private permissions, fsync, and no overwrite mode.
- Supply-chain compromise → three pinned runtime dependencies, lockfile, clean
  `npm ci`, high-severity audit, immutable action SHAs, least-privilege workflow
  permissions, OIDC trusted publishing/provenance, and publication of the exact
  tarball verified in CI.

Reports may contain repository paths and instruction text, including secrets
that were already present in AGENTS.md. Scopeglass does not redact, upload,
auto-open, or share reports; users must treat generated JSON/HTML as repository
data and review it before publishing.

### Always

- Validate CLI paths and numeric options at the process boundary.
- Escape untrusted content for terminal and HTML output.
- Keep JSON byte-deterministic for identical input and options.
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
- Duplicate, conservative possible-conflict, broken-reference, and unsafe-path
  cases produce documented stable diagnostic/error codes.
- Terminal, JSON, and HTML outputs agree on counts and diagnostics.
- HTML is self-contained, responsive, keyboard-usable, WCAG 2.1 AA-oriented,
  CSP-protected, and free of browser console warnings.
- `scopeglass check` has deterministic exit codes 0/1/2.
- The golden hero fixture demonstrates the complete five-second value proposition
  in all formats.
- `npm run verify`, high-severity audit, packed-tarball smoke test, and browser
  verification pass.
- The hostile-input corpus and golden hero fixture pass on Linux, macOS, and
  Windows for every behavior the host platform supports.
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
