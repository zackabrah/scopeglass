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
:root{color-scheme:light;--ink:#17201d;--muted:#64716c;--paper:#f5f4ee;--panel:#fffefa;--line:#d8ddd7;--accent:#146b53;--accent-soft:#dcebe5;--error:#a33b32;--warn:#8a5b12;--info:#29637a;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-synthesis:none}
*{box-sizing:border-box}
html{background:var(--paper);color:var(--ink)}
body{margin:0;min-width:280px}
.untrusted{unicode-bidi: plaintext;overflow-wrap:anywhere;white-space:pre-wrap}
.hero{padding:clamp(2rem,7vw,6.5rem) max(1.25rem,calc((100vw - 1120px)/2));border-bottom:1px solid var(--line);background:linear-gradient(145deg,#f7f6ef 0%,#edf4ef 100%)}
.brand{display:inline-flex;max-width:100%;align-items:center;gap:.55rem;margin:0 0 2.5rem;font-size:.77rem;font-weight:800;letter-spacing:.14em;line-height:1.4;text-transform:uppercase;color:var(--accent)}.brand span{min-width:0;overflow-wrap:anywhere}
.brand::before{content:"";width:.72rem;height:.72rem;border:2px solid currentColor;border-radius:50%;box-shadow:inset 0 0 0 2px var(--paper)}
h1{max-width:780px;margin:0;font-family:Georgia,"Times New Roman",serif;font-size:clamp(2.5rem,7.5vw,6.2rem);font-weight:500;letter-spacing:-.055em;line-height:.92}
.lede{max-width:650px;margin:1.5rem 0 2rem;color:var(--muted);font-size:clamp(1rem,2vw,1.2rem);line-height:1.65}
.target{display:inline-block;max-width:100%;padding:.72rem 1rem;border:1px solid #b8c8c0;border-radius:999px;background:rgba(255,255,255,.72);font:600 .86rem/1.3 ui-monospace,SFMono-Regular,Menlo,monospace}
.root-discovery{max-width:650px;margin:.8rem 0 0;color:var(--muted);font-size:.78rem;line-height:1.5;overflow-wrap:anywhere}
.metrics-region{max-width:1120px;margin:2.5rem auto 0}.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1px;margin:0;background:var(--line);border:1px solid var(--line);border-radius:1rem;overflow:hidden}
.metric{display:flex;min-width:0;flex-direction:column;padding:1.2rem;background:var(--panel)}
.metric dd{order:0;display:block;max-width:100%;margin:0;font-family:Georgia,"Times New Roman",serif;font-size:2rem;font-weight:500;line-height:1.05;overflow-wrap:anywhere;word-break:break-word}.metric dt{order:1;display:block;color:var(--muted);font-size:.78rem;text-transform:uppercase;letter-spacing:.09em;overflow-wrap:anywhere}
main{width:min(1120px,calc(100% - 2.5rem));margin:0 auto;padding:clamp(2.5rem,7vw,6rem) 0}
section+section{margin-top:clamp(3.5rem,8vw,7rem)}
.section-head{display:grid;grid-template-columns:1fr 1fr;gap:2rem;align-items:end;margin-bottom:1.5rem}.section-head>*{min-width:0}.section-head h2{margin:0;font:500 clamp(2rem,5vw,4rem)/1 Georgia,"Times New Roman",serif;letter-spacing:-.04em;overflow-wrap:anywhere}.section-head p{max-width:480px;margin:0;color:var(--muted);line-height:1.6}
.scope{border-top:1px solid var(--line)}.scope:last-child{border-bottom:1px solid var(--line)}
.scope summary{display:grid;grid-template-columns:3rem minmax(0,1fr) auto;gap:1rem;align-items:center;padding:1.25rem .25rem;cursor:pointer;list-style:none}.scope summary::-webkit-details-marker{display:none}.scope summary:focus-visible{outline:3px solid #7bb7a4;outline-offset:4px;border-radius:.35rem}.scope-index{font:700 .75rem/1 ui-monospace,monospace;color:var(--accent)}.scope-heading{display:grid;min-width:0;gap:.25rem}.scope-heading strong{font-size:1rem}.scope-heading small{color:var(--muted)}.scope-count{display:grid;place-items:center;width:2.25rem;height:2.25rem;border-radius:50%;background:var(--accent-soft);color:var(--accent);font-weight:800}
.scope-body{padding:0 0 1.5rem 4rem}.instruction-list{display:grid;gap:.75rem;margin:0;padding:0;list-style:none}.instruction{padding:1.1rem 1.2rem;border:1px solid var(--line);border-radius:.75rem;background:var(--panel)}.eyebrow{margin:0 0 .65rem;color:var(--accent);font-size:.7rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.instruction-text{margin:0;font-size:1rem;line-height:1.55}.source{margin:.75rem 0 0;color:var(--muted);font:500 .73rem/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}.empty{margin:0;color:var(--muted)}
.diagnostic-list{display:grid;min-width:0;gap:.75rem;margin:0;padding:0;list-style:none}.diagnostic{min-width:0;padding:1.15rem 1.25rem;border:1px solid var(--line);border-left:4px solid var(--info);border-radius:.65rem;background:var(--panel)}.diagnostic-error{border-left-color:var(--error)}.diagnostic-warning{border-left-color:var(--warn)}.diagnostic>div{display:flex;min-width:0;flex-wrap:wrap;gap:.75rem;align-items:center}.diagnostic p{min-width:0;margin:.65rem 0 0;line-height:1.5}.severity{font-size:.68rem;font-weight:900;letter-spacing:.1em}.diagnostic code{display:block;min-width:0;max-width:100%;color:var(--muted);font-size:.76rem;overflow-wrap:anywhere;word-break:break-word}.source-list{min-width:0;margin:.65rem 0 0;padding-left:1.15rem;color:var(--muted);font:500 .72rem/1.6 ui-monospace,monospace}
.footer{margin-top:5rem;padding-top:1.5rem;border-top:1px solid var(--line);color:var(--muted);font-size:.78rem}
@media(max-width:700px){.metrics{grid-template-columns:1fr 1fr}.section-head{grid-template-columns:1fr}.scope summary{grid-template-columns:2rem minmax(0,1fr) auto;gap:.55rem}.scope-body{padding-left:2.5rem}main{width:min(100% - 1.5rem,1120px)}}
@media(max-width:360px){.metrics{grid-template-columns:1fr}.scope summary{grid-template-columns:1.7rem minmax(0,1fr)}.scope-count{display:none}.scope-body{padding-left:0}}
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
      ? '<p class="empty">No diagnostics. The effective instruction chain is internally consistent under ruleset v1.</p>'
      : `<ul class="diagnostic-list" role="list">${report.diagnostics.map(renderDiagnostic).join("")}</ul>`;
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="${REPORT_CSP}">
  <meta name="color-scheme" content="light">
  <title>Scopeglass · Effective AGENTS.md instructions</title>
  <style>${styles}</style>
</head>
<body>
  <header class="hero">
    <p class="brand"><span>Scopeglass · ruleset v${report.rulesetVersion}</span></p>
    <h1>See every rule in the room.</h1>
    <p class="lede">The effective AGENTS.md chain for this target, ordered by precedence with line-level provenance and a transparent context estimate.</p>
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
