import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import axe from "axe-core";
import { chromium, firefox, webkit } from "playwright-core";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const outputDirectory = path.join(repositoryRoot, ".browser-artifacts");
const expectedCsp =
  "default-src 'none'; base-uri 'none'; object-src 'none'; frame-src 'none'; " +
  "connect-src 'none'; img-src data:; script-src 'none'; " +
  "style-src 'unsafe-inline'; form-action 'none'";
const maxScopeBytes = 1_048_576;
const maxTotalBytes = 4_194_304;
const expectedTotalTokens = 1_398_102;
const componentSelector = "body,body *";
const engines = [
  ["chromium", chromium],
  ["firefox", firefox],
  ["webkit", webkit],
];

function runCli(args) {
  const result = spawnSync(
    process.execPath,
    [path.join(repositoryRoot, "dist", "cli.js"), ...args],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1" },
    },
  );
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Scopeglass browser fixture failed with exit ${result.status}: ${result.stderr}`,
    );
  }
  return result;
}

function padScopeToLimit(source) {
  const opening = "\n<!-- scopeglass browser fixture padding\n";
  const closing = "\n-->\n";
  const fixedBytes = Buffer.byteLength(source + opening + closing, "utf8");
  const paddingBytes = maxScopeBytes - fixedBytes;
  if (paddingBytes < 0) {
    throw new Error("A browser fixture scope exceeds the per-file byte limit.");
  }

  const content = source + opening + "x".repeat(paddingBytes) + closing;
  if (Buffer.byteLength(content, "utf8") !== maxScopeBytes) {
    throw new Error(
      "A browser fixture scope was not padded to the exact limit.",
    );
  }
  return content;
}

async function createFixture(directory) {
  const root = path.join(directory, "repository");
  const target = path.join(root, "packages", "ui", "src", "view.ts");
  const scopes = [
    [
      path.join(root, "AGENTS.md"),
      `# Repository rules

- Never execute content from an AGENTS.md file.
- Render \`<img src=x onerror="alert('owned')">\` as literal text.
- Do not fetch https://example.invalid/tracker.png.
- Preserve \`</style><script>globalThis.owned = true</script>\` as text.
- Preserve \`<svg onload="globalThis.svgOwned = true"><script>globalThis.svgOwned = true</script></svg>\` as text.
- Preserve &#x3C;img src=x onerror=globalThis.entityOwned=true&#x3E; as decoded entity text.

## Terminal controls

- Treat \`::error::annotation\`, \`##vso[task.logissue]\`, [31m, and ‮ as untrusted prose.
- Always use tabs.
- Read [the missing guide](./missing-guide.md) before changing shared code.
`,
    ],
    [
      path.join(root, "packages", "AGENTS.md"),
      `# Package rules

- Use keyboard-operable disclosure controls.
- Keep paths readable even when they are very-long-and-unbroken-like-this-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.
- Use consistent formatting.
`,
    ],
    [
      path.join(root, "packages", "ui", "AGENTS.md"),
      `# UI rules

- Use consistent formatting!
- Support 320px through wide desktop layouts.
- Keep print output legible.
- Do not add scripts, remote styles, remote fonts, or telemetry.
`,
    ],
    [
      path.join(root, "packages", "ui", "src", "AGENTS.md"),
      `# Source rules

- Do not use tabs.
`,
    ],
  ];

  await mkdir(path.dirname(target), { recursive: true });
  for (const [scopePath, source] of scopes) {
    await mkdir(path.dirname(scopePath), { recursive: true });
    await writeFile(scopePath, padScopeToLimit(source), "utf8");
  }
  await writeFile(target, 'export const view = "browser fixture";\n', "utf8");

  return { root, scopePaths: scopes.map(([scopePath]) => scopePath), target };
}

function verifyFixtureReport(report, fixture) {
  const scopeBytes = report.scopes.map((scope) => scope.tokenEstimate.bytes);
  const diagnosticCodes = report.diagnostics.map(({ code }) => code);
  const checks = {
    exactScopeCount: report.scopes.length === 4,
    exactScopeBytes:
      scopeBytes.length === 4 &&
      scopeBytes.every((bytes) => bytes === maxScopeBytes),
    exactTotalBytes: report.tokenEstimate.bytes === maxTotalBytes,
    exactTotalTokens: report.tokenEstimate.total === expectedTotalTokens,
    expectedInstructions: report.summary.instructionCount === 17,
    expectedDiagnostics:
      report.summary.errorCount === 1 &&
      report.summary.infoCount === 2 &&
      report.summary.warningCount === 0 &&
      diagnosticCodes.length === 3 &&
      diagnosticCodes.includes("broken-reference") &&
      diagnosticCodes.includes("duplicate-instruction") &&
      diagnosticCodes.includes("possible-conflict"),
    explicitRoot: report.rootDiscovery.method === "explicit",
    boundedFixture: fixture.scopePaths.length === 4,
  };
  const failures = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  if (failures.length > 0) {
    throw new Error(`Invalid browser fixture: ${failures.join(", ")}`);
  }

  return {
    checks,
    diagnosticCodes,
    instructionCount: report.summary.instructionCount,
    scopeBytes,
    totalBytes: report.tokenEstimate.bytes,
    totalTokens: report.tokenEstimate.total,
  };
}

function sourceText(source) {
  const lines =
    source.startLine === source.endLine
      ? `${source.startLine}`
      : `${source.startLine}–${source.endLine}`;
  return `${source.path}:${lines}`;
}

function expectedRenderedFacts(report) {
  return {
    target: report.target,
    rootDiscovery: "Root discovery: explicit --root directory.",
    metrics: [
      ["Scopes", String(report.summary.scopeCount)],
      ["Instructions", String(report.summary.instructionCount)],
      ["Est. tokens", report.tokenEstimate.total.toLocaleString("en-US")],
      ["Diagnostics", String(report.diagnostics.length)],
    ],
    scopes: report.scopes.map((scope) => {
      const instructionCount = scope.instructionIds.length;
      return {
        path: scope.path,
        metadata: `precedence ${scope.precedence} · ~${scope.tokenEstimate.total.toLocaleString("en-US")} tokens · ${instructionCount} ${instructionCount === 1 ? "instruction" : "instructions"}`,
      };
    }),
    instructionProvenance: report.instructions.map((instruction) => ({
      eyebrow: `${instruction.section.length === 0 ? "Unsectioned" : instruction.section.join(" › ")} · ${instruction.kind}`,
      source: `${sourceText(instruction.source)} · precedence ${instruction.precedence} · ~${instruction.tokenEstimate.total.toLocaleString("en-US")} tokens`,
    })),
    diagnostics: report.diagnostics.map((diagnostic) => ({
      severity: diagnostic.severity.toUpperCase(),
      code: diagnostic.code,
      message: diagnostic.message,
      sources: diagnostic.sources.map(sourceText),
    })),
    footer: `Local-only analysis · ${report.tokenEstimate.bytes.toLocaleString("en-US")} UTF-8 bytes · estimate method ${report.tokenEstimate.method} · schema v${report.schemaVersion}`,
  };
}

async function measureLayout(page) {
  return page.evaluate((selector) => {
    const overflowingComponents = [...document.querySelectorAll(selector)]
      .map((node) => {
        const box = node.getBoundingClientRect();
        return {
          selector: `${node.tagName.toLowerCase()}${
            typeof node.className === "string" && node.className.length > 0
              ? `.${node.className.trim().replace(/\s+/gu, ".")}`
              : ""
          }`,
          left: box.left,
          right: box.right,
          clientWidth: node.clientWidth,
          scrollWidth: node.scrollWidth,
        };
      })
      .filter(
        (node) =>
          node.left < -0.5 ||
          node.right > innerWidth + 0.5 ||
          (node.clientWidth > 0 && node.scrollWidth > node.clientWidth + 1),
      );

    return {
      width: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      overflowingComponents,
    };
  }, componentSelector);
}

async function collectAccessibility(page) {
  const details = page.locator("details");
  const instructionCounts = await details.evaluateAll((nodes) =>
    nodes.map((node) => node.querySelectorAll(".instruction").length),
  );
  const expectedLabels = instructionCounts.map(
    (count) => `${count} ${count === 1 ? "instruction" : "instructions"}`,
  );
  const detailSnapshots = [];
  const summarySnapshots = [];
  for (let index = 0; index < expectedLabels.length; index += 1) {
    detailSnapshots.push(await details.nth(index).ariaSnapshot());
    summarySnapshots.push(
      await page.locator("summary").nth(index).ariaSnapshot(),
    );
  }

  const instructionListSnapshots = [];
  const instructionLists = page.locator(".instruction-list");
  for (let index = 0; index < (await instructionLists.count()); index += 1) {
    instructionListSnapshots.push(
      await instructionLists.nth(index).ariaSnapshot(),
    );
  }
  const diagnosticListSnapshots = [];
  const diagnosticLists = page.locator(".diagnostic-list");
  for (let index = 0; index < (await diagnosticLists.count()); index += 1) {
    diagnosticListSnapshots.push(
      await diagnosticLists.nth(index).ariaSnapshot(),
    );
  }

  return {
    expectedLabels,
    instructionCounts,
    detailSnapshots,
    groupRoleCount: await page.getByRole("group").count(),
    listRoleCount: await page.getByRole("list").count(),
    summarySnapshots,
    instructionListSnapshots,
    diagnosticListSnapshots,
    metricsSnapshot: await page.locator(".metrics-region").ariaSnapshot(),
  };
}

async function inspectEngine(name, browserType, reportUrl, expectedFacts) {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  const consoleEntries = [];
  const pageErrors = [];
  const requestUrls = [];

  page.on("console", (message) =>
    consoleEntries.push({ type: message.type(), text: message.text() }),
  );
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => requestUrls.push(request.url()));

  try {
    await page.goto(reportUrl, { waitUntil: "load" });
    const safety = await page.evaluate(() => {
      const bodyText = document.body.textContent ?? "";
      const hasEventAttribute = [...document.querySelectorAll("*")].some(
        (node) =>
          node.getAttributeNames().some((attribute) => /^on/iu.test(attribute)),
      );
      return {
        scripts: document.scripts.length,
        images: document.images.length,
        svgs: document.querySelectorAll("svg").length,
        eventHandlers: hasEventAttribute ? 1 : 0,
        externalElements: document.querySelectorAll(
          '[src^="http"],[href^="http"]',
        ).length,
        injectedGlobals:
          globalThis.owned === true ||
          globalThis.svgOwned === true ||
          globalThis.entityOwned === true,
        hostileText: {
          image: bodyText.includes(`<img src=x onerror="alert('owned')">`),
          remote: bodyText.includes("https://example.invalid/tracker.png"),
          script: bodyText.includes(
            "</style><script>globalThis.owned = true</script>",
          ),
          svg: bodyText.includes(
            '<svg onload="globalThis.svgOwned = true"><script>globalThis.svgOwned = true</script></svg>',
          ),
          entity: bodyText.includes("globalThis.entityOwned=true"),
          controls:
            bodyText.includes("::error::annotation") &&
            bodyText.includes("##vso[task.logissue]") &&
            bodyText.includes("\\u{1b}") &&
            bodyText.includes("\\u{202e}"),
        },
        csp:
          document.querySelector('meta[http-equiv="Content-Security-Policy"]')
            ?.content ?? "",
        details: document.querySelectorAll("details").length,
        summaries: document.querySelectorAll("summary").length,
        instructionLists: document.querySelectorAll(
          '.instruction-list[role="list"]',
        ).length,
        diagnosticLists: document.querySelectorAll(
          '.diagnostic-list[role="list"]',
        ).length,
        hiddenCounts: document.querySelectorAll(
          '.scope-count[aria-hidden="true"]',
        ).length,
        errorDiagnostics: document.querySelectorAll(".diagnostic-error").length,
        infoDiagnostics: document.querySelectorAll(".diagnostic-info").length,
        hasLongDiagnosticCode: [
          ...document.querySelectorAll(".diagnostic code"),
        ]
          .map((node) => node.textContent)
          .includes("duplicate-instruction"),
        rootDiscovery:
          document.querySelector(".root-discovery")?.textContent ?? "",
        metricRegions: document.querySelectorAll(
          'section.metrics-region[aria-label="Analysis summary"]',
        ).length,
        metricTerms: document.querySelectorAll(".metrics dt").length,
        metricDefinitions: document.querySelectorAll(".metrics dd").length,
        renderedFacts: {
          target: document.querySelector(".target")?.textContent ?? "",
          rootDiscovery:
            document.querySelector(".root-discovery")?.textContent ?? "",
          metrics: [...document.querySelectorAll(".metric")].map((node) => [
            node.querySelector("dt")?.textContent ?? "",
            node.querySelector("dd")?.textContent ?? "",
          ]),
          scopes: [...document.querySelectorAll("details.scope")].map(
            (node) => ({
              path:
                node.querySelector(".scope-heading strong")?.textContent ?? "",
              metadata:
                node.querySelector(".scope-heading small")?.textContent ?? "",
            }),
          ),
          instructionProvenance: [
            ...document.querySelectorAll(".instruction"),
          ].map((node) => ({
            eyebrow: node.querySelector(".eyebrow")?.textContent ?? "",
            source: node.querySelector(".source")?.textContent ?? "",
          })),
          diagnostics: [...document.querySelectorAll(".diagnostic")].map(
            (node) => ({
              severity: node.querySelector(".severity")?.textContent ?? "",
              code: node.querySelector("code")?.textContent ?? "",
              message: node.querySelector(":scope > p")?.textContent ?? "",
              sources: [...node.querySelectorAll(".source-list li")].map(
                (source) => source.textContent ?? "",
              ),
            }),
          ),
          footer: document.querySelector(".footer")?.textContent ?? "",
        },
        headings: [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map(
          (node) => Number(node.tagName.slice(1)),
        ),
      };
    });

    await page.emulateMedia({ media: "print" });
    const freshPrint = await page.evaluate(() => ({
      closedScopes: document.querySelectorAll("details.scope:not([open])")
        .length,
      visibleScopeBodies: [...document.querySelectorAll(".scope-body")].filter(
        (node) => node.checkVisibility(),
      ).length,
    }));
    await page.emulateMedia({ media: "screen" });

    const summary = page.locator("summary").first();
    const details = page.locator("details").first();
    await summary.focus();
    const keyboard = {
      focusBefore: await summary.evaluate(
        (node) => document.activeElement === node,
      ),
      openBefore: await details.evaluate((node) => node.open),
    };
    await page.keyboard.press("Space");
    keyboard.openAfterSpace = await details.evaluate((node) => node.open);
    await page.keyboard.press("Enter");
    keyboard.openAfterEnter = await details.evaluate((node) => node.open);
    keyboard.focusAfter = await summary.evaluate(
      (node) => document.activeElement === node,
    );

    await page.locator("details").evaluateAll((nodes) => {
      for (const node of nodes) node.open = true;
    });
    const accessibility = await collectAccessibility(page);

    const layouts = [];
    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const layout = await measureLayout(page);
      layouts.push(layout);
      if (width === 320 || width === 1440) {
        await page.evaluate(() => scrollTo(0, 0));
        await page.screenshot({
          path: path.join(outputDirectory, `${name}-${width}.png`),
          fullPage: width === 320,
        });
      }
    }

    await page.setViewportSize({ width: 320, height: 900 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
      scrollTo(0, 0);
    });
    const zoomLayout = await measureLayout(page);
    await page.screenshot({
      path: path.join(outputDirectory, `${name}-text-zoom.png`),
      fullPage: true,
    });
    await page.evaluate(() => {
      document.documentElement.style.removeProperty("font-size");
    });
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.evaluate(axe.source);
    const axeResult = await page.evaluate(async () =>
      globalThis.axe.run(document, {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"],
        },
      }),
    );
    const violations = axeResult.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.map((node) => node.target),
    }));
    const nonLocalRequests = requestUrls.filter(
      (url) => !url.startsWith("file:") && !url.startsWith("data:"),
    );

    let print = {
      checked: false,
      freshClosedScopes: freshPrint.closedScopes,
      freshVisibleScopeBodies: freshPrint.visibleScopeBodies,
      passed:
        freshPrint.closedScopes === 3 && freshPrint.visibleScopeBodies === 4,
    };
    if (name === "chromium") {
      await page.emulateMedia({ media: "print" });
      const pdfPath = path.join(outputDirectory, "chromium-print.pdf");
      await page.pdf({
        path: pdfPath,
        format: "A4",
        printBackground: true,
        tagged: true,
      });
      const pdf = await readFile(pdfPath);
      print = {
        checked: true,
        freshClosedScopes: freshPrint.closedScopes,
        freshVisibleScopeBodies: freshPrint.visibleScopeBodies,
        passed:
          print.passed &&
          pdf.subarray(0, 5).toString("ascii") === "%PDF-" &&
          pdf.byteLength > 10_000 &&
          pdf.includes(Buffer.from("/StructTreeRoot", "ascii")) &&
          pdf.includes(Buffer.from("/Marked true", "ascii")) &&
          !pdf.includes(Buffer.from("/JavaScript", "ascii")),
      };
    }

    const summaryAccessibility = accessibility.summarySnapshots.every(
      (snapshot, index) => {
        const label = accessibility.expectedLabels[index];
        const count = accessibility.instructionCounts[index];
        return (
          label !== undefined &&
          count !== undefined &&
          snapshot.includes(label) &&
          !snapshot.includes(`${label} ${count}`)
        );
      },
    );
    const listAccessibility = [
      ...accessibility.instructionListSnapshots,
      ...accessibility.diagnosticListSnapshots,
    ].every((snapshot) => snapshot.trimStart().startsWith("- list"));
    const detailAccessibility = accessibility.detailSnapshots.every(
      (snapshot, index) => {
        const label = accessibility.expectedLabels[index];
        return (
          label !== undefined &&
          snapshot.trimStart().startsWith("- group:") &&
          snapshot.split(label).length === 2
        );
      },
    );
    const allHostileTextVisible = Object.values(safety.hostileText).every(
      Boolean,
    );
    const metricsAccessibility =
      accessibility.metricsSnapshot.includes("Analysis summary") &&
      ["Scopes", "Instructions", "Est. tokens", "Diagnostics"].every((label) =>
        accessibility.metricsSnapshot.includes(label),
      );
    const assertions = {
      safeMarkup:
        safety.scripts === 0 &&
        safety.images === 0 &&
        safety.svgs === 0 &&
        safety.eventHandlers === 0 &&
        safety.externalElements === 0 &&
        !safety.injectedGlobals &&
        allHostileTextVisible,
      exactCsp: safety.csp === expectedCsp,
      semantics:
        safety.details === 4 &&
        safety.summaries === 4 &&
        safety.instructionLists === 4 &&
        safety.diagnosticLists === 1 &&
        safety.hiddenCounts === 4 &&
        safety.errorDiagnostics === 1 &&
        safety.infoDiagnostics === 2 &&
        safety.hasLongDiagnosticCode &&
        safety.metricRegions === 1 &&
        safety.metricTerms === 4 &&
        safety.metricDefinitions === 4 &&
        safety.rootDiscovery === "Root discovery: explicit --root directory." &&
        JSON.stringify(safety.headings) === JSON.stringify([1, 2, 2]),
      renderedFacts:
        JSON.stringify(safety.renderedFacts) === JSON.stringify(expectedFacts),
      keyboard:
        keyboard.focusBefore &&
        keyboard.focusAfter &&
        keyboard.openBefore !== keyboard.openAfterSpace &&
        keyboard.openAfterSpace !== keyboard.openAfterEnter,
      responsive:
        layouts.every(
          (layout) =>
            !layout.horizontalOverflow &&
            layout.overflowingComponents.length === 0,
        ) &&
        !zoomLayout.horizontalOverflow &&
        zoomLayout.overflowingComponents.length === 0,
      accessible:
        violations.length === 0 &&
        accessibility.groupRoleCount === 4 &&
        accessibility.listRoleCount >= 5 &&
        accessibility.instructionListSnapshots.length === 4 &&
        accessibility.diagnosticListSnapshots.length === 1 &&
        summaryAccessibility &&
        detailAccessibility &&
        listAccessibility &&
        metricsAccessibility,
      localOnly: nonLocalRequests.length === 0,
      cleanConsole: consoleEntries.length === 0 && pageErrors.length === 0,
      printable: print.passed,
    };

    return {
      engine: name,
      version: browser.version(),
      assertions,
      safety,
      keyboard,
      accessibility,
      layouts,
      zoomLayout,
      violations,
      requestUrls,
      nonLocalRequests,
      consoleEntries,
      pageErrors,
      print,
    };
  } finally {
    await context.close();
    await browser.close();
  }
}

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
const evidencePath = path.join(outputDirectory, "results.json");
const evidence = {
  status: "running",
  activeEngine: null,
  fixture: null,
  engines: [],
  error: null,
};

async function writeEvidence() {
  await writeFile(
    evidencePath,
    `${JSON.stringify(evidence, null, 2)}\n`,
    "utf8",
  );
}

await writeEvidence();
const temporaryDirectory = await mkdtemp(
  path.join(tmpdir(), "scopeglass-browser-qa-"),
);

try {
  const fixture = await createFixture(temporaryDirectory);
  const inspectResult = runCli([
    "inspect",
    fixture.target,
    "--root",
    fixture.root,
    "--format",
    "json",
  ]);
  const report = JSON.parse(inspectResult.stdout);
  const fixtureVerification = verifyFixtureReport(report, fixture);
  evidence.fixture = fixtureVerification;
  await writeEvidence();
  const reportPath = path.join(temporaryDirectory, "scopeglass.html");
  runCli([
    "report",
    fixture.target,
    "--root",
    fixture.root,
    "--output",
    reportPath,
  ]);

  for (const [name, browserType] of engines) {
    evidence.activeEngine = name;
    await writeEvidence();
    evidence.engines.push(
      await inspectEngine(
        name,
        browserType,
        pathToFileURL(reportPath).href,
        expectedRenderedFacts(report),
      ),
    );
    await writeEvidence();
  }
  evidence.activeEngine = null;

  const failures = evidence.engines.flatMap((result) =>
    Object.entries(result.assertions)
      .filter(([, passed]) => !passed)
      .map(([assertion]) => `${result.engine}:${assertion}`),
  );
  if (failures.length > 0) {
    throw new Error(`Browser QA failed: ${failures.join(", ")}`);
  }
  evidence.status = "passed";
  await writeEvidence();

  process.stdout.write(
    `fixture: ${fixtureVerification.totalBytes.toLocaleString("en-US")} bytes · ${fixtureVerification.totalTokens.toLocaleString("en-US")} tokens · ${fixtureVerification.instructionCount} instructions\n${evidence.engines
      .map(({ engine, version }) => `${engine} ${version}: browser QA passed`)
      .join("\n")}\n`,
  );
} catch (error) {
  evidence.status = "failed";
  evidence.error =
    error instanceof Error ? error.message : "Browser QA failed unexpectedly.";
  await writeEvidence();
  throw error;
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
