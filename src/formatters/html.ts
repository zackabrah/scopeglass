import type {
  DiagnosticRecord,
  InstructionRecord,
  ScopeRecord,
  ScopeglassReportV1,
  SourceLocation,
} from "../types.js";
import {
  assertOutputSize,
  describeRootDiscovery,
  visibleText,
} from "./shared.js";

export const REPORT_CSP =
  "default-src 'none'; base-uri 'none'; object-src 'none'; frame-src 'none'; " +
  "connect-src 'none'; img-src data:; script-src 'none'; " +
  "style-src 'unsafe-inline'; form-action 'none'";

function escapeHtml(value: string): string {
  return visibleText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function sourceText(source: SourceLocation): string {
  const lines =
    source.startLine === source.endLine
      ? `${source.startLine}`
      : `${source.startLine}–${source.endLine}`;
  return `${source.path}:${lines}`;
}

function renderInstruction(instruction: InstructionRecord): string {
  const section =
    instruction.section.length === 0
      ? "Unsectioned"
      : instruction.section.join(" › ");

  return `<li class="instruction">
  <p class="eyebrow">${escapeHtml(section)} · ${escapeHtml(instruction.kind)}</p>
  <p class="instruction-text untrusted">${escapeHtml(instruction.text)}</p>
  <p class="source untrusted">${escapeHtml(sourceText(instruction.source))} · precedence ${instruction.precedence} · ~${instruction.tokenEstimate.total.toLocaleString("en-US")} tokens</p>
</li>`;
}

function renderScope(
  scope: ScopeRecord,
  instructions: InstructionRecord[],
  index: number,
): string {
  const scopeInstructions = instructions.filter(
    (instruction) => instruction.scopeId === scope.id,
  );
  const instructionMarkup =
    scopeInstructions.length === 0
      ? '<p class="empty">No prose instructions extracted from this scope.</p>'
      : `<ol class="instruction-list" role="list">${scopeInstructions.map(renderInstruction).join("")}</ol>`;
  const instructionCount = `${scopeInstructions.length.toLocaleString("en-US")} ${scopeInstructions.length === 1 ? "instruction" : "instructions"}`;

  return `<details class="scope"${index === 0 ? " open" : ""}>
  <summary>
    <span class="scope-index">${String(index + 1).padStart(2, "0")}</span>
    <span class="scope-heading"><strong class="untrusted">${escapeHtml(scope.path)}</strong><small>precedence ${scope.precedence} · ~${scope.tokenEstimate.total.toLocaleString("en-US")} tokens · <span class="scope-instruction-count">${instructionCount}</span></small></span>
    <span class="scope-count" aria-hidden="true">${scopeInstructions.length}</span>
  </summary>
  <div class="scope-body">${instructionMarkup}</div>
</details>`;
}

function renderDiagnostic(diagnostic: DiagnosticRecord): string {
  const sources = diagnostic.sources
    .map(
      (source) =>
        `<li class="untrusted">${escapeHtml(sourceText(source))}</li>`,
    )
    .join("");

  return `<li class="diagnostic diagnostic-${diagnostic.severity}">
  <div><span class="severity">${diagnostic.severity.toUpperCase()}</span><code>${diagnostic.code}</code></div>
  <p class="untrusted">${escapeHtml(diagnostic.message)}</p>
  ${sources === "" ? "" : `<ul class="source-list">${sources}</ul>`}
</li>`;
}

const styles = `
:root{color-scheme:light dark;--bg:#ffffff;--fg:#171717;--muted:#666666;--line:#eaeaea;--panel:#fafafa;--accent:#146b53;--accent-soft:#e8f5ef;--error:#c62d31;--warn:#8f5a00;--info:#0067d6;font-family:"Geist",Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;font-synthesis:none}
@media(prefers-color-scheme:dark){:root{--bg:#0a0a0a;--fg:#ededed;--muted:#a1a1a1;--line:#262626;--panel:#111111;--accent:#4cc39a;--accent-soft:#122b21;--error:#ff6166;--warn:#f0b100;--info:#52a8ff}}
*{box-sizing:border-box}
html{background:var(--bg);color:var(--fg)}
body{margin:0;min-width:280px;-webkit-font-smoothing:antialiased}
.untrusted{unicode-bidi: plaintext;overflow-wrap:anywhere;white-space:pre-wrap}
.hero{padding:clamp(2.75rem,7vw,5.5rem) max(1.25rem,calc((100vw - 1080px)/2)) clamp(2rem,4vw,3rem);border-bottom:1px solid var(--line);background:radial-gradient(640px 300px at 16% 0%,var(--accent-soft) 0%,transparent 70%)}
.brand{display:inline-flex;max-width:100%;align-items:center;gap:.5rem;margin:0 0 2.25rem;padding:.34rem .85rem;border:1px solid var(--line);border-radius:999px;background:var(--bg);font-size:.72rem;font-weight:600;letter-spacing:.08em;line-height:1.4;text-transform:uppercase;color:var(--muted)}.brand span{min-width:0;overflow-wrap:anywhere}
.brand::before{content:"";width:.5rem;height:.5rem;border-radius:50%;background:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
h1{max-width:820px;margin:0;font-size:clamp(2.4rem,6.5vw,4.6rem);font-weight:650;letter-spacing:-.045em;line-height:1.02}
.lede{max-width:620px;margin:1.25rem 0 1.75rem;color:var(--muted);font-size:clamp(.98rem,1.6vw,1.08rem);line-height:1.65}
.target{display:inline-block;max-width:100%;padding:.6rem .95rem;border:1px solid var(--line);border-radius:8px;background:var(--panel);font:500 .85rem/1.35 ui-monospace,"SF Mono",SFMono-Regular,Menlo,monospace}
.root-discovery{max-width:620px;margin:.75rem 0 0;color:var(--muted);font-size:.78rem;line-height:1.5;overflow-wrap:anywhere}
.metrics-region{max-width:1080px;margin:2.25rem auto 0}.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.75rem;margin:0}
.metric{display:flex;min-width:0;flex-direction:column;gap:.4rem;padding:1.1rem 1.2rem;border:1px solid var(--line);border-radius:10px;background:var(--panel)}
.metric dd{order:0;display:block;max-width:100%;margin:0;font-size:2.1rem;font-weight:650;letter-spacing:-.03em;line-height:1.05;font-variant-numeric:tabular-nums;overflow-wrap:anywhere;word-break:break-word}.metric dt{order:1;display:block;color:var(--muted);font-size:.7rem;font-weight:500;text-transform:uppercase;letter-spacing:.1em;overflow-wrap:anywhere}
main{width:min(1080px,calc(100% - 2.5rem));margin:0 auto;padding:clamp(2.25rem,5vw,4rem) 0}
section+section{margin-top:clamp(2.75rem,6vw,4.5rem)}
.section-head{display:grid;grid-template-columns:1fr 1fr;gap:2rem;align-items:end;margin-bottom:1.25rem}.section-head>*{min-width:0}.section-head h2{margin:0;font-size:clamp(1.4rem,3vw,1.9rem);font-weight:650;letter-spacing:-.03em;line-height:1.1;overflow-wrap:anywhere}.section-head p{max-width:460px;margin:0;color:var(--muted);font-size:.9rem;line-height:1.6}
.scope{border:1px solid var(--line);border-radius:10px;background:var(--bg)}.scope+.scope{margin-top:.6rem}
.scope summary{display:grid;grid-template-columns:2.6rem minmax(0,1fr) auto;gap:1rem;align-items:center;padding:1rem 1.1rem;cursor:pointer;list-style:none;border-radius:10px}.scope summary:hover{background:var(--panel)}.scope summary::-webkit-details-marker{display:none}.scope summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px}.scope-index{font:600 .72rem/1 ui-monospace,monospace;color:var(--accent)}.scope-heading{display:grid;min-width:0;gap:.2rem}.scope-heading strong{font-size:.95rem;font-weight:600}.scope-heading small{color:var(--muted);font-size:.78rem}.scope-count{display:grid;place-items:center;min-width:1.9rem;height:1.9rem;padding:0 .55rem;border:1px solid var(--line);border-radius:999px;background:var(--panel);color:var(--fg);font-size:.78rem;font-weight:600;font-variant-numeric:tabular-nums}
.scope-body{padding:0 1.1rem 1.1rem 4.7rem}.instruction-list{display:grid;gap:.6rem;margin:0;padding:0;list-style:none}.instruction{padding:.95rem 1.05rem;border:1px solid var(--line);border-radius:8px;background:var(--bg)}.eyebrow{margin:0 0 .5rem;color:var(--muted);font-size:.66rem;font-weight:600;letter-spacing:.09em;text-transform:uppercase}.instruction-text{margin:0;font-size:.95rem;line-height:1.6}.source{margin:.6rem 0 0;color:var(--muted);font:400 .74rem/1.5 ui-monospace,"SF Mono",SFMono-Regular,Menlo,monospace}.empty{margin:0;color:var(--muted);font-size:.9rem}
.diagnostic-list{display:grid;min-width:0;gap:.6rem;margin:0;padding:0;list-style:none}.diagnostic{min-width:0;padding:1rem 1.1rem;border:1px solid var(--line);border-left:3px solid var(--info);border-radius:8px;background:var(--panel)}.diagnostic-error{border-left-color:var(--error)}.diagnostic-warning{border-left-color:var(--warn)}.diagnostic>div{display:flex;min-width:0;flex-wrap:wrap;gap:.6rem;align-items:center}.diagnostic p{min-width:0;margin:.55rem 0 0;font-size:.92rem;line-height:1.55}.severity{font-size:.64rem;font-weight:700;letter-spacing:.1em}.diagnostic-error .severity{color:var(--error)}.diagnostic-warning .severity{color:var(--warn)}.diagnostic code{display:block;min-width:0;max-width:100%;color:var(--muted);font-size:.76rem;font-family:ui-monospace,"SF Mono",SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere;word-break:break-word}.source-list{min-width:0;margin:.55rem 0 0;padding-left:1.1rem;color:var(--muted);font:400 .74rem/1.6 ui-monospace,monospace}
.footer{margin-top:4rem;padding-top:1.25rem;border-top:1px solid var(--line);color:var(--muted);font:400 .74rem/1.6 ui-monospace,"SF Mono",SFMono-Regular,Menlo,monospace}
@media(max-width:700px){.metrics{grid-template-columns:1fr 1fr}.section-head{grid-template-columns:1fr}.scope summary{grid-template-columns:2rem minmax(0,1fr) auto;gap:.55rem}.scope-body{padding-left:1.1rem}main{width:min(100% - 1.5rem,1080px)}}
@media(max-width:360px){.metrics{grid-template-columns:1fr}.scope summary{grid-template-columns:1.7rem minmax(0,1fr)}.scope-count{display:none}.scope-body{padding-left:1.1rem}}
@media print{*{color:#000!important;background:#fff!important;box-shadow:none!important}.hero{padding:1cm 0}.metrics{break-inside:avoid}main{width:100%;padding:1cm 0}.section-head,.scope summary{break-after:avoid}details::details-content{content-visibility:visible!important}.scope-body{display:block}.instruction,.diagnostic{break-inside:avoid}.footer{margin-top:1cm}}
`;

export function renderHtml(report: ScopeglassReportV1): string {
  const scopeMarkup =
    report.scopes.length === 0
      ? '<p class="empty">No AGENTS.md files apply to this target.</p>'
      : report.scopes
          .map((scope, index) => renderScope(scope, report.instructions, index))
          .join("");
  const diagnosticMarkup =
    report.diagnostics.length === 0
      ? `<p class="empty">No diagnostics under ruleset v${report.rulesetVersion}.</p>`
      : `<ul class="diagnostic-list" role="list">${report.diagnostics.map(renderDiagnostic).join("")}</ul>`;
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="${REPORT_CSP}">
  <meta name="color-scheme" content="light dark">
  <title>Scopeglass · Effective AGENTS.md instructions</title>
  <style>${styles}</style>
</head>
<body>
  <header class="hero">
    <p class="brand"><span>Scopeglass · ruleset v${report.rulesetVersion}</span></p>
    <h1>Effective AGENTS.md instructions</h1>
    <p class="lede">Root-to-target instruction chain for this target: precedence-ordered scopes, line-level provenance, and a transparent context estimate.</p>
    <p class="target untrusted">${escapeHtml(report.target)}</p>
    <p class="root-discovery">${escapeHtml(describeRootDiscovery(report.rootDiscovery))}</p>
    <section class="metrics-region" aria-label="Analysis summary">
      <dl class="metrics">
        <div class="metric"><dt>Scopes</dt><dd>${report.summary.scopeCount}</dd></div>
        <div class="metric"><dt>Instructions</dt><dd>${report.summary.instructionCount}</dd></div>
        <div class="metric"><dt>Est. tokens</dt><dd>${report.tokenEstimate.total.toLocaleString("en-US")}</dd></div>
        <div class="metric"><dt>Diagnostics</dt><dd>${report.diagnostics.length}</dd></div>
      </dl>
    </section>
  </header>
  <main>
    <section aria-labelledby="scope-title">
      <div class="section-head"><h2 id="scope-title">Effective scope</h2><p>Scopes accumulate from repository root to target. A higher precedence number is closer to the target.</p></div>
      ${scopeMarkup}
    </section>
    <section aria-labelledby="diagnostic-title">
      <div class="section-head"><h2 id="diagnostic-title">Diagnostics</h2><p>Deterministic checks for broken local references, unsafe paths, exact duplicates, and narrowly matched possible conflicts.</p></div>
      ${diagnosticMarkup}
    </section>
    <p class="footer">Local-only analysis · ${report.tokenEstimate.bytes.toLocaleString("en-US")} UTF-8 bytes · estimate method ${report.tokenEstimate.method} · schema v${report.schemaVersion}</p>
  </main>
</body>
</html>
`;

  return assertOutputSize(html);
}
