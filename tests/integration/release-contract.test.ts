import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  createTempDirectory,
  type TempDirectory,
} from "../helpers/temp-directory.js";

const sourceScriptPath = fileURLToPath(
  new URL("../../scripts/check-release-tag.mjs", import.meta.url),
);
const releaseWorkflowPath = fileURLToPath(
  new URL("../../.github/workflows/release.yml", import.meta.url),
);
const temporaryDirectories: TempDirectory[] = [];

async function runReleaseCheck(changelog: string, refName = "v0.1.0") {
  const directory = await createTempDirectory();
  temporaryDirectories.push(directory);
  await directory.write(
    "package.json",
    `${JSON.stringify({ version: "0.1.0" })}\n`,
  );
  await directory.write("CHANGELOG.md", changelog);
  const scriptPath = await directory.write(
    "scripts/check-release-tag.mjs",
    await readFile(sourceScriptPath, "utf8"),
  );

  return spawnSync(process.execPath, [scriptPath], {
    cwd: directory.path,
    encoding: "utf8",
    env: {
      ...process.env,
      GITHUB_ACTIONS: "true",
      GITHUB_REF_TYPE: "tag",
      GITHUB_REF_NAME: refName,
    },
  });
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => directory.cleanup()),
  );
});

describe("release contract", () => {
  it("checks tracked and untracked source after verification and before publication", async () => {
    const workflow = await readFile(releaseWorkflowPath, "utf8");
    const verify = workflow.indexOf("- name: Build and verify package once");
    const clean = workflow.indexOf("- name: Verify checkout stayed clean");
    const publish = workflow.indexOf(
      "- name: Publish the verified tarball with provenance",
    );

    expect(verify).toBeGreaterThanOrEqual(0);
    expect(clean).toBeGreaterThan(verify);
    expect(publish).toBeGreaterThan(clean);
    expect(workflow.slice(clean, publish)).toContain("git diff --exit-code");
    expect(workflow.slice(clean, publish)).toContain(
      "git diff --cached --exit-code",
    );
    expect(workflow.slice(clean, publish)).toContain(
      "git status --porcelain --untracked-files=normal",
    );
  });

  it("accepts only the exact tag with one valid dated changelog heading", async () => {
    const result = await runReleaseCheck(
      "# Changelog\n\n## [0.1.0] - 2026-07-14\n",
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe(
      "Release tag v0.1.0 and changelog date 2026-07-14 match package.json.\n",
    );
  });

  it.each([
    "## [0.1.0] - Unreleased\n",
    "## [0.1.0] - 2026-02-30\n",
    "## [0.1.0] - 2026-07-14\n## [0.1.0] - 2026-07-15\n",
  ])(
    "rejects an undated, invalid, or duplicate release heading",
    async (changelog) => {
      const result = await runReleaseCheck(changelog);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        "CHANGELOG.md must contain exactly one dated 0.1.0 release heading.",
      );
    },
  );

  it("rejects a tag that does not exactly match the package version", async () => {
    const result = await runReleaseCheck("## [0.1.0] - 2026-07-14\n", "v0.1.1");

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "Release must run from the exact v0.1.0 tag.",
    );
  });
});
