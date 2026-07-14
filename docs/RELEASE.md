# Scopeglass release process

This is a prospective release checklist for maintainers. It does not establish
that Scopeglass 0.1.0 is published, that continuous integration is configured,
or that any browser, operating-system, provenance, or registry gate has passed.
Record evidence for every gate during an actual release.

## Release principles

- Release from a reviewed, clean commit with no unexplained generated or
  untracked files.
- Test the exact source and tarball that will be published.
- Keep `schemaVersion`, `rulesetVersion`, package version, CLI version, schema,
  and documentation internally consistent.
- Publish only with explicit maintainer approval and least-privilege registry
  credentials.
- Do not weaken a failing safety, determinism, or output-escaping test to make a
  release proceed.

## Roles and evidence

The release owner runs the checklist and collects commands, versions, checksums,
and links to review results. A second maintainer should review:

- public API and schema compatibility;
- dependency and security changes;
- the package file list and executable entry point;
- terminal, JSON, and HTML output samples;
- the final changelog and release notes.

Store release evidence in the release discussion or other durable maintainer
record. Do not put secrets, tokens, or private environment values in that
record.

## 1. Prepare the version

1. Confirm the intended semantic version and scope against
   [SPEC.md](../SPEC.md).
2. Review every change since the previous release, including dependencies,
   package metadata, schema, ruleset behavior, limits, and security controls.
3. Ensure `package.json` and the CLI report the intended package version.
4. Change `schemaVersion` only for an incompatible report-contract change.
5. Change `rulesetVersion` when extraction or diagnostic meaning changes while
   the report shape stays compatible.
6. Move the intended entries in [CHANGELOG.md](../CHANGELOG.md) from
   `Unreleased` to a dated version section only when the release commit is being
   prepared.
7. Re-read the [security model](SECURITY.md) and repository
   [security policy](../SECURITY.md) for release-impacting changes.

For the first release, leave `0.1.0` marked `Unreleased` until every gate below
has evidence and publication is approved.

## 2. Verify the checkout

Use a clean checkout with the minimum supported Node.js version from
`package.json`, then repeat the supported matrix with the current Node.js LTS
where it differs.

```sh
npm ci
npm run verify
npm run audit
```

`npm run verify` is expected to cover formatting, linting, type checking,
tests, coverage, build, package validation, and the repository's integrated
verification script. Inspect the script definition rather than assuming a
historical command list is still complete.

The supported operating-system matrix should exercise at least Linux, macOS,
and Windows because path roots, separators, symlinks, `O_NOFOLLOW`, file modes,
and terminal behavior vary. At the time of writing, completion of that matrix
is not asserted here.

For each environment, retain:

- operating system and architecture;
- `node --version` and `npm --version`;
- the exact commit hash;
- command results and any approved exception.

## 3. Inspect and smoke-test the package

First inspect without creating a tarball:

```sh
npm pack --dry-run
```

Confirm the file list contains only the intended runtime and public artifacts,
including:

- built JavaScript and declarations under `dist/`;
- `schemas/scopeglass-report-v1.schema.json`;
- `README.md`, `CHANGELOG.md`, `LICENSE`, and `SECURITY.md`;
- package metadata and the CLI entry point.

Confirm it excludes source fixtures, private notes, coverage, temporary
reports, credentials, editor state, and unrelated repository files.

Create the candidate only after the dry run is correct:

```sh
npm pack
shasum -a 256 scopeglass-*.tgz
```

Install that exact tarball in a new temporary directory. Exercise the binary
and package API against small, nested, malformed, hostile-string, and
limit-boundary fixtures. At minimum verify:

- package-root named imports;
- `scopeglass/schema/report-v1.json` resolution;
- `inspect` terminal and JSON modes;
- `check` pass, diagnostic-threshold failure, token-threshold failure, and
  usage/fatal exit codes;
- `report` file output, stdout output, existing-file refusal, and private file
  creation where the platform exposes POSIX modes;
- no ANSI or status text contaminates JSON or HTML stdout;
- two identical JSON runs compare byte-for-byte equal.

Do not rebuild between testing the tarball and publishing it.

## 4. Review hostile output and browsers

Render a report fixture containing HTML delimiters, quotes, Unicode,
bidirectional controls, ANSI controls, long unbroken text, Markdown links, and
paths resembling URLs. Confirm that repository data remains text in every
format.

Manually inspect the static HTML candidate in supported browsers at viewport
widths 320, 768, 1024, and 1440 pixels. Record:

- no script execution, remote request, or active repository-controlled link;
- no browser-console errors or Content Security Policy violations;
- usable keyboard navigation and visible focus;
- readable structure and contrast with browser zoom and increased text size;
- wrapping without horizontal page loss at narrow widths;
- sensible print preview;
- correct rendering with an empty report and maximum representative content.

Browser review and automated cross-browser testing are release gates; this
checklist does not claim they have been completed for 0.1.0.

## 5. Establish publication controls

Before the first registry publication, maintainers should configure and review
a release workflow. The repository does not gain these guarantees merely by
describing them here.

The workflow should:

- pin third-party automation actions to immutable commit SHAs;
- use minimal job and repository permissions;
- separate verification from publication;
- use npm trusted publishing through short-lived OIDC credentials where
  available;
- request provenance for the exact verified package;
- protect the release environment with maintainer approval;
- refuse a tag/version mismatch or a dirty/generated diff;
- publish the already tested tarball rather than an independently rebuilt one.

Review npm ownership, two-factor authentication, recovery access, package name,
visibility, and provenance support immediately before the first publish. Never
paste a registry token into a command, issue, log, or repository file.

## 6. Approve and publish

Only after all prior gates have evidence and explicit release approval:

1. Commit the dated changelog and version metadata.
2. Obtain the required review on that exact commit.
3. Create a signed or otherwise policy-compliant annotated tag such as
   `v0.1.0`.
4. Publish the verified tarball through the approved workflow, requesting
   provenance if the registry and workflow support it.
5. Create release notes from the changelog, including schema/ruleset versions,
   supported Node.js range, checksum, known limitations, and security contact.

The exact registry command belongs in the reviewed release workflow. If a
manual emergency publication is ever authorized, record why, use the minimum
privilege and duration possible, and preserve the tarball checksum and registry
response.

## 7. Verify after publication

From a separate clean environment:

- verify registry metadata, version, dist-tag, integrity, provenance, license,
  engine range, executable, and package exports;
- install by exact version and rerun the package smoke tests;
- compare the registry tarball checksum/integrity with the approved candidate;
- verify the release tag and notes point to the released commit;
- check documentation links and schema resolution from the installed package;
- monitor the security-reporting channel and issue tracker for regressions.

Mark the release complete only after post-publication checks are recorded.

## Failed release or security response

Stop before publication whenever evidence is incomplete or a gate fails. Fix
the issue on a new reviewed commit, produce a new candidate, and repeat affected
and downstream gates.

After publication, npm versions are immutable. Do not attempt to replace a
tarball. Depending on severity and registry policy, maintainers may deprecate a
version, move a dist-tag, publish a corrected patch, or request registry support
for an exceptional unpublish. Coordinate vulnerability handling through
[SECURITY.md](../SECURITY.md), preserve evidence, and communicate impact without
exposing exploit details prematurely.

## Release record template

```text
Version:
Commit and tag:
Schema version:
Ruleset version:
Release owner / reviewer:
Node/npm and OS matrix:
Verification logs:
Dependency audit:
Package file-list review:
Candidate filename, integrity, and SHA-256:
Tarball smoke test:
Browser/security review:
Workflow/provenance evidence:
Registry and post-publication verification:
Known limitations:
```
