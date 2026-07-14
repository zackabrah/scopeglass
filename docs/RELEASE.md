# Scopeglass release process

This checklist governs an actual release. Scopeglass 0.1.0 is the first public
release. Hosted CI, a protected npm environment, stage-only trusted publishing,
private vulnerability reporting, immutable version tags, and immutable GitHub
releases are configured. The tag workflow still requires explicit environment
approval, staged-tarball inspection, npm 2FA approval, and post-publication
verification for every release.

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
and links to review results. A second maintainer should review the following. If
the project has only one direct maintainer, record an explicit solo-maintainer
exception and independent review evidence before any registry write.

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
4. Change `schemaVersion` and the package major version for any report-shape
   change, including an added field; the published schema is strict.
5. Change `rulesetVersion` when extraction or diagnostic meaning changes while
   the report shape stays compatible.
6. Move the intended entries in [CHANGELOG.md](../CHANGELOG.md) from
   `Unreleased` to a dated version section only when the release commit is being
   prepared.
7. Re-read the [security model](SECURITY.md) and repository
   [security policy](../SECURITY.md) for release-impacting changes.

For a release commit, replace `Unreleased` only after every pre-tag gate has
evidence and publication has explicit approval.

## 2. Verify the checkout

Use a clean checkout with the minimum supported Node.js version from
`package.json`, then repeat the supported matrix with the current Node.js LTS
where it differs.

```sh
npm ci
npm run verify
npm run audit
npm run audit:signatures
```

`npm run verify` is expected to cover formatting, linting, type checking,
tests, coverage, build, package validation, and the repository's integrated
verification script. Inspect the script definition rather than assuming a
historical command list is still complete.

Hosted CI exercises Linux, macOS, and Windows on Node.js 22.17.0, 24, and 26
because path roots, separators, symlinks, `O_NOFOLLOW`, file modes, and terminal
behavior vary. The tagged release workflow repeats the full verification and
browser gates on Ubuntu with Node.js 24 before staging the candidate.

For each environment, retain:

- operating system and architecture;
- `node --version` and `npm --version`;
- the exact commit hash;
- command results and any approved exception.

## 3. Inspect and smoke-test the package

The `npm run verify` command in section 2 ends by creating and validating the
candidate exactly once. Do not run `package:check` or `npm pack` again. Inspect
that existing candidate:

```sh
cat .artifacts/manifest.json
tar -tzf .artifacts/scopeglass-*.tgz
```

The `package:check` stage within `verify` removes stale candidates, packs once,
records the filename, size, and SHA-256 digest, then runs publint, Are The Types
Wrong, a clean scripts-disabled install, the installed CLI and ESM API, schema
validation, and a final unchanged-artifact hash check. Confirm the file list
contains only the intended runtime and public artifacts, including:

- built JavaScript and declarations under `dist/`;
- `schemas/scopeglass-report-v1.schema.json` and
  `schemas/scopeglass-check-result-v1.schema.json`;
- `AGENTS.md`, `README.md`, `SPEC.md`, `CHANGELOG.md`, `CODE_OF_CONDUCT.md`,
  `CONTRIBUTING.md`, `LICENSE`, and `SECURITY.md`;
- the public documentation under `docs/` and `tasks/plan.md`;
- package metadata and the CLI entry point.

Confirm it excludes source fixtures, private notes, coverage, temporary
reports, credentials, editor state, and unrelated repository files.

Do not run `npm pack` again after this gate. The manifest identifies the only
candidate the release workflow may publish. The unit and integration suites,
followed by the packed-install verifier, must collectively exercise:

- package-root named imports;
- `scopeglass/schema/report-v1.json` and
  `scopeglass/schema/check-result-v1.json` resolution;
- `inspect` terminal and JSON modes;
- `check` pass, diagnostic-threshold failure, token-threshold failure, and
  usage/fatal exit codes;
- `report` file output, stdout output, existing-file refusal, and private file
  creation where the platform exposes POSIX modes;
- no ANSI or status text contaminates JSON or HTML stdout;
- two identical JSON runs compare byte-for-byte equal.

Do not rebuild or repack between testing the tarball and publishing it.

## 4. Review hostile output and browsers

Install the isolated engines once, then run the repository-owned browser gate:

```sh
npm run browser:install
npm run browser:check
```

The suite renders a hostile report fixture containing HTML delimiters, quotes,
Unicode, bidirectional controls, ANSI controls, long unbroken text, Markdown
links, and paths resembling URLs. It checks Chromium, Firefox, and WebKit at
320, 768, 1024, and 1440 pixels, plus 200% text size. It also enforces zero
scripts, non-local requests, console errors, or axe accessibility violations;
native keyboard disclosures; the exact meta CSP; and tagged Chromium PDF
output. Evidence and screenshots are written under `.browser-artifacts/`,
separate from the package candidate directory.

Manually inspect the generated screenshots and Chromium print preview. Record:

- no script execution, remote request, or active repository-controlled link;
- no browser-console errors or Content Security Policy violations;
- usable keyboard navigation and visible focus;
- readable structure and contrast with browser zoom and increased text size;
- wrapping without horizontal page loss at narrow widths;
- sensible print preview;
- correct rendering with an empty report and maximum representative content.

Browser review and automated cross-browser testing are release gates. Local
success is not a substitute for a green hosted release-workflow run on the
tagged commit. CI and release workflows preserve `.browser-artifacts/` as a
short-lived workflow artifact once the browser-QA process initializes, including
partial evidence when an engine or assertion fails. Browser installation or
build failures can precede artifact creation and remain in the workflow logs.
Retain the artifact URL, when present, with the release evidence.

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
- preserve and stage the already tested tarball rather than independently
  rebuilding it;
- defer public availability until a maintainer downloads, verifies, and approves
  the staged candidate with npm 2FA.

Review npm ownership, two-factor authentication, recovery access, package name,
visibility, and provenance support immediately before the first publish. Never
paste a registry token into a command, issue, log, or repository file.

### First-publication bootstrap

npm requires a package to exist before a trusted publisher can be configured.
The first publication therefore needs a one-time, explicitly approved manual
bootstrap; it is not performed by the tag workflow in this repository.

1. Create the public GitHub repository at the exact URL declared in
   `package.json`, protect the `npm` environment, and confirm that the package
   name remains available.
2. On a separate, reviewed bootstrap commit, set the package version to
   `0.0.0-bootstrap.0`. Run every verification gate above, inspect its exact
   `.artifacts/*.tgz`, and obtain second-maintainer review or a documented
   solo-maintainer exception plus explicit bootstrap approval. Do not tag this
   commit as a release.
3. Publish only that exact prerelease candidate under a non-default dist-tag:

   ```sh
   npm publish .artifacts/scopeglass-0.0.0-bootstrap.0.tgz --access public --tag bootstrap --provenance=false --ignore-scripts
   ```

   Complete the registry's 2FA challenge. `--provenance=false` is an explicit,
   recorded bootstrap-only exception because a local interactive process cannot
   issue GitHub OIDC provenance. npm requires every package to have a `latest`
   tag, so a first publication may point both `bootstrap` and `latest` at the
   placeholder even when `--tag bootstrap` is supplied. Minimize that interval
   and move `latest` to the verified stable version at approval. If a token is
   unavoidable, use a short-lived, package-scoped granular token and revoke it
   immediately; never store a long-lived automation token.

4. Verify the registry tarball, integrity, metadata, executable, and installed
   API before changing any publishing controls.
5. Configure npm trusted publishing for repository `zackabrah/scopeglass`,
   workflow `release.yml`, environment `npm`, and stage-publish permission only.
   Confirm `package.json` still names the same repository.
6. Revoke the bootstrap token if one was used, restrict traditional token
   publishing, and require the real `v0.1.0` and all later releases to use the
   OIDC tag workflow. Return to the intended release commit and repeat every
   changed/downstream gate before creating the release tag. After `v0.1.0` is
   verified, remove the temporary `bootstrap` dist-tag and deprecate the
   placeholder version with a clear message.

For 0.1.0, the bootstrap was published from reviewed PR #3 on 2026-07-14 as
`scopeglass@0.0.0-bootstrap.0`. The registry tarball matched SHA-256
`3551406c7051704c0ebdba339bee1f4132cd5aacb2d7f8dc97879700de8dc9e3`.
The `zackabrah` account used auth-and-writes 2FA, no automation token was used,
the registry install/API/schema smoke tests passed, trusted publishing was
limited to `createStagedPackage`, and traditional publish tokens were disabled.

If any identity, checksum, approval, or verification step differs from the
reviewed record, stop and produce a new candidate instead of improvising.

## 6. Tag, stage, inspect, approve, and publish

Only after all prior gates have evidence and explicit release approval:

1. Commit the dated changelog and version metadata.
2. Obtain the required review on that exact commit.
3. Create a signed or otherwise policy-compliant annotated tag such as
   `v0.1.0` on the exact green protected-main commit.
4. Approve the protected GitHub environment. The workflow verifies the tag,
   rebuilds and checks the candidate once, preserves it as a workflow artifact,
   then uses OIDC to run `npm stage publish` with automatic provenance.
5. Use `npm stage list scopeglass`, `npm stage view <stage-id>`, and
   `npm stage download <stage-id>` to inspect the registry-staged candidate.
   Compare its checksum and package contents with the workflow artifact.
6. If and only if they match, run `npm stage approve <stage-id>` and complete
   the registry's 2FA challenge. For a mismatched or otherwise invalid
   candidate, record its stage ID and metadata, run
   `npm stage reject <stage-id>`, complete the registry's 2FA challenge, and
   verify that `npm stage list scopeglass` no longer reports the rejected ID.
   Never approve an invalid stage.
7. Rerun the same immutable tag and commit only when a failure is demonstrably
   transient and no source, artifact, metadata, or release control changed. Any
   source or artifact change requires a new reviewed version commit and a new
   SemVer tag. Never move, delete, or reuse an existing release tag.
8. Create release notes from the changelog, including schema/ruleset versions,
   supported Node.js range, checksum, known limitations, and security contact.

The exact staging command belongs in the reviewed release workflow. Direct
token publication is disabled. Any manual emergency publication requires a
separately reviewed change to that control, a public rationale, minimum
privilege and duration, and preserved tarball and registry evidence.

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

Stop before publication whenever evidence is incomplete or a gate fails. If a
registry stage exists, record it, reject it with 2FA, and verify that it is gone
before continuing. Preserve the failed workflow, stage, and artifact evidence.

After an immutable release tag exists, rerun that exact tag and commit only for
a transient infrastructure failure that requires no source, artifact, metadata,
or control change. For any source or artifact fix, increment the package to a
new SemVer version, use a new reviewed commit, produce a new candidate, and
create a new immutable tag. Never retarget, move, delete, or reuse the failed
tag. Repeat every affected and downstream gate for the replacement version.

After publication, npm versions are immutable. Do not attempt to replace a
tarball. Depending on severity and registry policy, maintainers may deprecate a
version, move a dist-tag, publish a corrected patch, or request registry support
for an exceptional unpublish. Coordinate vulnerability handling through
[SECURITY.md](../SECURITY.md), preserve evidence, and communicate impact without
exposing exploit details prematurely.

## v0.1.0 release record

- Version: `0.1.0`
- Commit and tag: `f974745c9602a471152730f5e502a3945b74168a`, annotated
  immutable tag `v0.1.0`
- Schema version: `1`
- Ruleset version: `1`
- Release owner and required environment reviewer: `zackabrah`
- Hosted matrix: Ubuntu 24.04, macOS 15, and Windows 2025 on Node.js 22.17.0,
  24, and 26; isolated Chromium 149, Firefox 151, and WebKit 26.5 review
- Protected-main verification:
  [CI run 29331969200](https://github.com/zackabrah/scopeglass/actions/runs/29331969200)
- Protected tag workflow and provenance:
  [release run 29332166877](https://github.com/zackabrah/scopeglass/actions/runs/29332166877),
  Ubuntu 24.04, Node.js 24, npm 11.18.0, stage-only OIDC trust
- Dependency evidence: zero audit vulnerabilities; the release runner verified
  278 registry signatures and 73 attestations before staging; a clean registry
  install verified 37 signatures and the Scopeglass provenance attestation
- Package file-list review: 24 regular files; no credentials, host paths,
  lifecycle scripts, tests, lockfiles, or unexpected entries
- Candidate: `scopeglass-0.1.0.tgz`, 94,620 bytes, SHA-256
  `00ae4ec8f9a448a149759906e29d7d6a706655689c7acda5ec824732b9463def`,
  integrity
  `sha512-h+Rw+X9TG+dqQbpU930d17kXoN9FpPSLC5t9KklwiANTNTRDjfKCj1+FHlQkOpkhdQCkG9iBuSW7dO0vOdDfXg==`
- Stage: `921ca987-657d-406a-85ea-4a2e6d9fa494`; downloaded and compared with
  the workflow artifact, then approved with npm 2FA
- Registry verification: the staged and public tarballs were byte-identical;
  clean CLI, API, schema, audit, signature, and SLSA provenance checks passed;
  `latest` resolves to `0.1.0`
- Bootstrap retirement: the `bootstrap` dist-tag was removed and
  `0.0.0-bootstrap.0` was deprecated with a replacement message
- Immutable GitHub release:
  [Scopeglass v0.1.0](https://github.com/zackabrah/scopeglass/releases/tag/v0.1.0),
  including the verified tarball and checksum manifest
- Known limitations: see [README.md](../README.md#the-five-minute-value), the
  [hard limits](../README.md#hard-limits), and the
  [security design](SECURITY.md#known-limitations)

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
Stage ID and staged-candidate verification:
Registry and post-publication verification:
Known limitations:
```
