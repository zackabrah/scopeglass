import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  createTempDirectory,
  type TempDirectory,
} from "../helpers/temp-directory.js";

const sourceScriptPath = fileURLToPath(
  new URL("../../scripts/check-release-tag.mjs", import.meta.url),
);
const publishScriptPath = fileURLToPath(
  new URL("../../scripts/publish-package.mjs", import.meta.url),
);
const releaseWorkflowPath = fileURLToPath(
  new URL("../../.github/workflows/release.yml", import.meta.url),
);
const ciWorkflowPath = fileURLToPath(
  new URL("../../.github/workflows/ci.yml", import.meta.url),
);
const gitAttributesPath = fileURLToPath(
  new URL("../../.gitattributes", import.meta.url),
);
const packageJsonPath = fileURLToPath(
  new URL("../../package.json", import.meta.url),
);
const temporaryDirectories: TempDirectory[] = [];

function createChildEnvironment(
  overrides: Record<string, string>,
  inherited: NodeJS.ProcessEnv = process.env,
) {
  const overriddenKeys = new Set(
    Object.keys(overrides).map((key) => key.toLowerCase()),
  );
  const inheritedEntries = Object.entries(inherited).filter(
    ([key, value]) =>
      value !== undefined && !overriddenKeys.has(key.toLowerCase()),
  );

  return { ...Object.fromEntries(inheritedEntries), ...overrides };
}

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

async function runStageCommand(npmVersion = "11.18.0") {
  const directory = await createTempDirectory();
  temporaryDirectories.push(directory);
  const tarball = Buffer.from("verified candidate tarball");
  const filename = "scopeglass-0.1.0.tgz";
  const tarballPath = await directory.write(
    path.join(".artifacts", filename),
    tarball,
  );
  await directory.write(
    "package.json",
    `${JSON.stringify({
      name: "scopeglass",
      version: "0.1.0",
      repository: {
        url: "git+https://github.com/zackabrah/scopeglass.git",
      },
      publishConfig: { access: "public", provenance: true },
    })}\n`,
  );
  await directory.write(
    path.join(".artifacts", "manifest.json"),
    `${JSON.stringify({
      name: "scopeglass",
      version: "0.1.0",
      filename,
      sha256: createHash("sha256").update(tarball).digest("hex"),
      size: tarball.byteLength,
    })}\n`,
  );
  const scriptPath = await directory.write(
    "scripts/publish-package.mjs",
    await readFile(publishScriptPath, "utf8"),
  );
  const capturedArgumentsPath = path.join(
    directory.path,
    "captured-npm-arguments.json",
  );
  const npmStubPath = await directory.write(
    "capture-npm.mjs",
    `import { writeFileSync } from "node:fs";\nwriteFileSync(process.env.CAPTURE_PATH, JSON.stringify(process.argv.slice(2)));\n`,
  );

  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: directory.path,
    encoding: "utf8",
    env: createChildEnvironment({
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: "test-token",
      ACTIONS_ID_TOKEN_REQUEST_URL: "https://example.invalid/id-token",
      CAPTURE_PATH: capturedArgumentsPath,
      GITHUB_ACTIONS: "true",
      GITHUB_REF_NAME: "v0.1.0",
      GITHUB_REF_TYPE: "tag",
      GITHUB_REPOSITORY: "zackabrah/scopeglass",
      GITHUB_SERVER_URL: "https://github.com",
      npm_config_user_agent: `npm/${npmVersion} node/v24.0.0 linux x64`,
      npm_execpath: npmStubPath,
    }),
  });

  return {
    arguments:
      result.status === 0
        ? (JSON.parse(
            await readFile(capturedArgumentsPath, "utf8"),
          ) as string[])
        : [],
    result,
    tarballPath: await realpath(tarballPath),
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => directory.cleanup()),
  );
});

describe("release contract", () => {
  it("overrides inherited npm environment keys case-insensitively", () => {
    const environment = createChildEnvironment(
      {
        npm_config_user_agent: "npm/11.18.0",
        npm_execpath: "capture-npm.mjs",
      },
      {
        NPM_EXECPATH: "real-npm-cli.js",
        Npm_Config_User_Agent: "npm/10.9.8",
        PATH: "preserved-path",
      },
    );

    expect(environment).toEqual({
      npm_config_user_agent: "npm/11.18.0",
      npm_execpath: "capture-npm.mjs",
      PATH: "preserved-path",
    });
  });

  it("forces LF checkouts for text files on every operating system", async () => {
    const attributes = await readFile(gitAttributesPath, "utf8");

    expect(attributes.split(/\r?\n/u)).toContain("* text=auto eol=lf");
  });

  it("tests the exact minimum supported Node.js runtime in every CI job", async () => {
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
      engines: { node: string };
    };
    const workflow = await readFile(ciWorkflowPath, "utf8");

    expect(packageJson.engines.node).toBe(">=22.17.0");
    expect(workflow).toContain("node: [22.17.0, 24.x, 26.x]");
    expect(workflow).toContain("node-version: 22.17.0");
  });

  it("checks source, preserves the candidate, and stages only the verified tarball", async () => {
    const workflow = await readFile(releaseWorkflowPath, "utf8");
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
      scripts: Record<string, string>;
    };
    const protectedMain = workflow.indexOf(
      "- name: Verify tag belongs to protected main",
    );
    const verify = workflow.indexOf("- name: Build and verify package once");
    const clean = workflow.indexOf("- name: Verify checkout stayed clean");
    const preserve = workflow.indexOf(
      "- name: Preserve verified package candidate",
    );
    const stage = workflow.indexOf(
      "- name: Stage the verified tarball with provenance",
    );

    expect(workflow).toContain("fetch-depth: 0");
    expect(protectedMain).toBeGreaterThanOrEqual(0);
    expect(verify).toBeGreaterThan(protectedMain);
    expect(workflow.slice(protectedMain, verify)).toContain(
      "git fetch --no-tags origin +refs/heads/main:refs/remotes/origin/main",
    );
    expect(workflow.slice(protectedMain, verify)).toContain(
      "git merge-base --is-ancestor HEAD refs/remotes/origin/main",
    );
    expect(clean).toBeGreaterThan(verify);
    expect(preserve).toBeGreaterThan(clean);
    expect(stage).toBeGreaterThan(preserve);
    expect(workflow.slice(clean, stage)).toContain("git diff --exit-code");
    expect(workflow.slice(clean, stage)).toContain(
      "git diff --cached --exit-code",
    );
    expect(workflow.slice(clean, stage)).toContain(
      "git status --porcelain --untracked-files=normal",
    );
    expect(workflow.slice(preserve, stage)).toContain("path: .artifacts/");
    expect(workflow.slice(preserve, stage)).toContain(
      "if-no-files-found: error",
    );
    expect(workflow.slice(preserve, stage)).toContain(
      "include-hidden-files: true",
    );
    expect(workflow.slice(stage)).toContain("npm run release:stage");
    expect(workflow).not.toContain("npm run release:publish");
    expect(packageJson.scripts["release:stage"]).toBe(
      "node scripts/publish-package.mjs",
    );
    expect(packageJson.scripts).not.toHaveProperty("release:publish");
  });

  it("uses npm stage publish instead of direct publication", async () => {
    const {
      arguments: npmArguments,
      result,
      tarballPath,
    } = await runStageCommand();

    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toBe("");
    expect(npmArguments).toEqual([
      "stage",
      "publish",
      tarballPath,
      "--access",
      "public",
      "--provenance",
      "--ignore-scripts",
    ]);
  });

  it("rejects npm versions that do not support staged publishing", async () => {
    const { result } = await runStageCommand("11.14.9");

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "npm staged publishing requires npm 11.15.0 or newer.",
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
