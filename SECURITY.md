# Security Policy

Scopeglass analyzes repository-controlled paths and Markdown, so security bugs
can affect confidentiality, integrity, terminal output, generated reports, and
CI behavior. Please report suspected vulnerabilities privately.

## Supported versions

Scopeglass v0.1.0 is currently a development release line; this repository does
not yet assert a published npm release.

| Version                                         | Security support  |
| ----------------------------------------------- | ----------------- |
| Current default branch / 0.1.x development line | Accepted          |
| Older snapshots and forks                       | Best effort only  |
| Published npm versions                          | None asserted yet |

After the first release, this table will identify the exact supported release
line. Security fixes normally target the latest supported minor version.

## Report a vulnerability

Use the repository hosting platform's private **Report a vulnerability** flow
when it is available. If it is not available, contact the repository owner or a
maintainer through a private channel before sharing technical details. Do not
open a public issue for an undisclosed vulnerability.

Include:

- the affected version, commit, operating system, and filesystem;
- the command or programmatic API entry point involved;
- a minimal reproduction using synthetic, non-secret data;
- the expected and observed behavior;
- security impact and any known preconditions;
- suggested mitigations, if you have them.

Do not include real credentials, private repository content, personal data, or
third-party secrets. A maintainer may request an encrypted channel if further
sensitive material is necessary.

## Response targets

These are coordination targets, not contractual guarantees:

- acknowledge a complete report within 7 days;
- provide an initial severity assessment within 14 days;
- send an update at least every 14 days while remediation is active;
- coordinate a disclosure date after a fix or effective mitigation is
  available.

If a report is out of scope, maintainers should explain why and, when possible,
suggest a more appropriate destination.

## In scope

Examples include:

- reading outside the selected root through traversal, symlinks, junctions, or
  unsafe root discovery;
- executing, importing, fetching, or uploading repository-controlled content;
- terminal escape, workflow-command, HTML, CSS, or script injection that is not
  rendered inert;
- unsafe report creation, overwrite, permission, or output-parent behavior;
- absolute host-path or secret leakage beyond the documented report contents;
- denial of service that bypasses documented processing limits;
- package or release workflow weaknesses that can alter published artifacts.

## Usually out of scope

- a model ignoring or misunderstanding an instruction;
- claims that a vendor assembles private prompts differently from Scopeglass's
  documented canonical convention;
- social engineering unrelated to project infrastructure;
- findings that require a compromised operating-system account with no
  additional Scopeglass boundary bypass;
- repository text appearing as inert, escaped report content as documented;
- missing features or heuristics without a security consequence.

When uncertain, report privately and let maintainers triage it.

## Disclosure

Please allow reasonable time to investigate and prepare a fix before public
disclosure. Maintainers will credit reporters who want attribution, unless
legal, privacy, or safety concerns prevent it. Reporters may remain anonymous.

The detailed threat model, controls, and known limits are documented in
[docs/SECURITY.md](docs/SECURITY.md). General participation follows the
[Code of Conduct](CODE_OF_CONDUCT.md).
