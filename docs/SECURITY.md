# Scopeglass security model

This document describes Scopeglass's engineering threat model and controls. To
report a vulnerability, use the process in the repository-level
[security policy](../SECURITY.md).

## Security objective

Scopeglass must inspect untrusted repository instructions without executing,
fetching, activating, or silently disclosing them. It should produce a bounded,
deterministic report or a structured failure, even when paths, files, Markdown,
and terminal strings are adversarial.

Scopeglass is a defensive inspection tool, not an operating-system sandbox. Run
it with the filesystem permissions of an account that is allowed to read the
target repository and write the requested report destination.

## Assets and trust boundaries

Assets Scopeglass aims to protect include:

- data outside the selected repository root;
- instruction contents and secrets embedded in them;
- terminal state and downstream JSON/HTML consumers;
- existing files at a requested report path;
- CPU, memory, and disk consumption;
- the integrity and reproducibility of the report.

Inputs controlled by a repository are untrusted:

- target names and filesystem entries;
- `AGENTS.md` bytes and Markdown structure;
- headings, instructions, links, and link labels;
- filenames displayed in diagnostics;
- repository changes racing an analysis.

CLI arguments and the local process environment are controlled by the invoking
user, but they are still validated at filesystem and output boundaries.

## Threats and controls

| Threat                                            | Primary controls                                                                                                                |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Path traversal outside the root                   | Canonical root/target resolution, `path.relative` containment checks, root-relative display paths                               |
| Symlink or file-swap attacks on instruction reads | `lstat`, regular-file checks, `O_NOFOLLOW` where available, descriptor `fstat`, device/inode comparison, path revalidation      |
| Oversized or pathological input                   | Per-file and aggregate byte limits, scope/instruction/reference/depth/diagnostic limits, bounded chunk reads                    |
| Malformed text                                    | Fatal UTF-8 decoding and a structured error; optional UTF-8 BOM removal for instruction files                                   |
| Malicious Markdown references                     | Relative-local classification, lexical containment, component-wise `lstat`, final resolved containment; content is never opened |
| Terminal escape injection                         | Control-character escaping and styling kept outside repository-controlled strings                                               |
| JSON control or ANSI injection                    | Standard JSON serialization of the canonical value; no color or terminal control codes                                          |
| HTML/script injection                             | Contextual escaping, no scripts, no remote assets, inert repository references, restrictive embedded CSP                        |
| Existing-file overwrite                           | Exclusive `wx` creation, private `0600` mode, output-parent identity validation, cleanup limited to the newly created inode     |
| Nondeterministic or host-leaking output           | Canonical ordering; no timestamps, durations, absolute host paths, environment values, or randomness in successful reports      |
| Accidental disclosure                             | No telemetry, model call, remote fetch, upload, auto-open, or automatic sharing                                                 |

## Repository discovery

Root discovery recognizes either a `.git` directory or a small `.git` marker
file. Marker files are capped at 4 KiB and must pass the same file-identity and
encoding checks used at the read boundary. Scopeglass does not execute Git,
interpret repository hooks, source configuration, or contact a remote. A
syntactically valid `gitdir` target is treated as opaque text and is never
resolved, stat'd, or otherwise dereferenced—including absolute and network-like
targets.

The selected target must remain under the selected root. Successful reports use
`.` as the root and normalized root-relative paths elsewhere, avoiding leakage
of the checkout's absolute location.

## Instruction-file reads

For each discovered `AGENTS.md`, Scopeglass:

1. obtains initial metadata with `lstat` and rejects non-regular files. A
   symbolic link or junction is followed only when its resolved target is a
   regular file inside the analysis root (the common
   `AGENTS.md -> CLAUDE.md` layout); a broken link, an escaping link, or a
   link resolving to anything else is a fatal error, and the resolved path is
   what continues through the steps below;
2. opens read-only with `O_NOFOLLOW` when supported;
3. compares the open descriptor and path metadata by device and inode;
4. revalidates the path identity after opening;
5. reads in bounded chunks and stops one byte beyond the limit to detect an
   oversized file;
6. decodes with fatal UTF-8 validation before parsing Markdown.

If the platform does not support `O_NOFOLLOW`, Scopeglass falls back to a
read-only open while retaining metadata and identity checks. A detected swap or
ambiguous state is a fatal error; the tool does not continue with potentially
untrusted bytes.

## Local references

Reference diagnostics answer only whether a relative local path is safe and
exists under the selected root. Scopeglass does not:

- open or parse referenced files;
- follow HTTP, HTTPS, or other remote URLs;
- load images or embeds;
- import source code;
- invoke commands or tools named in Markdown.

An escaping, absolute, device, or otherwise unsafe reference becomes a
diagnostic. Missing safe references become a broken-reference diagnostic.
For a lexically contained target, Scopeglass `lstat`s each directory component
and stops at a symbolic link or junction before inspecting anything behind it.
Repeated identical targets from one source directory share a bounded validation
result; linked content is never read.

## Rendering

All renderers receive the completed `ScopeglassReportV1`; they do not reread the
repository.

### Terminal

Repository-controlled controls are escaped before display. Optional ANSI color
is applied only to Scopeglass-owned structural text. `--no-color` and
non-color-capable environments produce plain text.

### JSON

JSON mode serializes the canonical report and emits no progress text or ANSI
codes to standard output. Consumers should still treat every string as
untrusted data and validate against the published
[report JSON Schema](../schemas/scopeglass-report-v1.schema.json) or
[check-result JSON Schema](../schemas/scopeglass-check-result-v1.schema.json),
as appropriate. The check-result schema references the report schema, so load
both when validating check output.

### HTML

HTML reports are self-contained and static. Repository-controlled text is
escaped for its context, links from repository data are rendered inert, and no
JavaScript or remote asset is included. The document carries a restrictive
Content Security Policy. Opening a report does not cause Scopeglass itself to
upload or fetch data.

## Report-file creation

File reports use exclusive creation and refuse an existing path. The output
file is set to mode `0600`, written as UTF-8, synchronized, and closed. Parent
directory components under the invocation working directory are required to be
real directories, not symbolic links, and parent identity is rechecked around
creation. Descendant detection walks candidate ancestors by filesystem
device/inode identity, rather than attempting to reproduce platform-specific
case or Unicode normalization rules, so equivalent path spellings cannot skip
the component checks.

On a failed write, cleanup removes only the regular file whose device and inode
match the file Scopeglass created. The tool does not replace an existing file
or follow a symlink to a destination.

The user may deliberately select an output location outside the analyzed root.
That location is outside the repository-containment promise and remains the
user's responsibility.

## Privacy

Analysis is local and has no telemetry or model inference. However, a report can
contain instruction text, paths, and diagnostics copied or derived from
`AGENTS.md`; those files may themselves contain credentials, private URLs, or
other sensitive material. Scopeglass does not redact secrets.

Treat JSON and HTML reports with the same sensitivity as the source instruction
files. Review them before attaching them to an issue, publishing an artifact,
or sending them to another person.

## Resource limits

Version 0.1.0 limits the number and size of scopes, files, extracted
instructions, references, unique reference-path inspections, parser-sensitive
Markdown syntax, Markdown nesting, diagnostics, and rendered output. The exact
values are listed in the [README](../README.md) and defined in
`src/constants.ts`. Exceeding a hard limit is a structured fatal failure rather
than a partial success.

Duplicate/conflict diagnostics additionally skip instructions over 1,024 code
points and normalized forms over 8,192 code points, with a 4,194,304-code-point
aggregate normalization budget. Those nonfatal heuristic caps preserve the
instruction in the report while preventing Unicode compatibility expansion
from consuming disproportionate memory.

The token count is an estimate—`ceil(UTF-8 bytes / 3)`—not a tokenizer result or
a security boundary.

The parser-sensitive syntax budgets are the practical ceiling for legitimate
input: ordinary Markdown punctuation and newlines count toward them, so the
1 MiB per-file and 4 MiB aggregate byte limits are reachable only by unusually
punctuation-sparse text. This is intentional—the byte limits bound I/O while
the syntax budgets bound parser state—but chains of large instruction files
fail closed rather than partially analyzing.

## Known limitations

- Scopeglass is not a sandbox and cannot defend against a privileged process or
  an attacker with equivalent account permissions continuously replacing
  directory components.
- Device/inode validation does not make all filesystem topologies equivalent.
  Hard links, bind mounts, network filesystems, and unusual filesystems can have
  semantics beyond the portable guarantee.
- Directory-component racing outside the validated output-parent path remains
  an operating-system concern.
- A safe reference is checked for containment and existence, not for the safety
  or truth of its contents.
- Duplicate and conflict diagnostics are deterministic heuristics. They do not
  establish semantic equivalence, correctness, or malicious intent.
- Static HTML controls reduce activation risk but do not make a report suitable
  for an untrusted active-content hosting context that rewrites headers or
  markup.

## Verification status

Version 0.1.0 completed the local and hosted gates for parsing, discovery, path
safety, limits, diagnostics, rendering, CLI behavior, cross-browser review,
dependency audits, and exact-tarball packaging. Hosted CI is green across
Linux, macOS, and Windows on the supported Node.js matrix.

The protected tag workflow staged the release through OIDC, and explicit npm
2FA approval published the exact 94,620-byte candidate with SHA-256
`00ae4ec8f9a448a149759906e29d7d6a706655689c7acda5ec824732b9463def`.
The tarball preserved inside the workflow artifact, npm stage, public registry
tarball, and immutable GitHub release asset were byte-identical. Registry
install, CLI, API, schema, audit, signature, and SLSA provenance checks passed.
The temporary bootstrap dist-tag was removed and its placeholder version was
deprecated. Private vulnerability reporting remains enabled. See the completed
evidence in [RELEASE.md](RELEASE.md).

The architectural rationale for keeping the pipeline local and deterministic
is recorded in
[ADR 0001](decisions/0001-local-deterministic-analysis.md).
