import { spawn } from "node:child_process";
import { lstat, readFile, stat, symlink, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  createTempDirectory,
  type TempDirectory,
} from "../helpers/temp-directory.js";

const cliPath = fileURLToPath(new URL("../../src/cli.ts", import.meta.url));
const tsxPath = fileURLToPath(
  new URL("../../node_modules/tsx/dist/cli.mjs", import.meta.url),
);
const packagePath = fileURLToPath(
  new URL("../../package.json", import.meta.url),
);
const temporaryDirectories: TempDirectory[] = [];
let packageVersion = "";

interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

async function tempDirectory(): Promise<TempDirectory> {
  const directory = await createTempDirectory();
  temporaryDirectories.push(directory);
  return directory;
}

async function runCli(
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [tsxPath, cliPath, ...args], {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code) => {
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

async function runCliWithClosedStdout(
  args: string[],
  cwd: string,
): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [tsxPath, cliPath, ...args], {
      cwd,
      env: { ...process.env, NO_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.stdout.once("data", () => {
      child.stdout.destroy();
    });
    child.once("error", reject);
    child.once("close", (code) => {
      resolve({ code: code ?? -1, stderr });
    });
  });
}

async function createRepository(): Promise<TempDirectory> {
  const repository = await tempDirectory();
  await repository.mkdir(".git");
  await repository.write(
    "AGENTS.md",
    "# Repository\n\nUse strict TypeScript.\n\nRead [missing](docs/missing.md).\n",
  );
  await repository.mkdir("src");
  return repository;
}

beforeAll(async () => {
  const packageJson = JSON.parse(await readFile(packagePath, "utf8")) as {
    version: string;
  };
  packageVersion = packageJson.version;
});

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((entry) => entry.cleanup()),
  );
});

describe("CLI", () => {
  it("keeps help and version aligned with the package", async () => {
    const version = await runCli(["--version"]);
    expect(version).toEqual({
      code: 0,
      stdout: `${packageVersion}\n`,
      stderr: "",
    });

    const help = await runCli(["--help"]);
    expect(help.code).toBe(0);
    expect(help.stderr).toBe("");
    expect(help.stdout).toMatch(/inspect .*\[target\]/u);
    expect(help.stdout).toMatch(/report .*\[target\]/u);
    expect(help.stdout).toMatch(/check .*\[target\]/u);
  });

  it("writes clean deterministic inspect payloads to stdout", async () => {
    const repository = await createRepository();

    const json = await runCli(["inspect", "src", "--format", "json"], {
      cwd: repository.path,
    });
    expect(json.code).toBe(0);
    expect(json.stderr).toBe("");
    expect(json.stdout).not.toContain("\u001b");
    expect(JSON.parse(json.stdout)).toMatchObject({
      kind: "scopeglass-report",
      target: "src",
      root: ".",
    });

    const terminal = await runCli(["inspect", "src", "--no-color"], {
      cwd: repository.path,
      env: { NO_COLOR: "1" },
    });
    expect(terminal.code).toBe(0);
    expect(terminal.stderr).toBe("");
    expect(terminal.stdout).toContain("Scopeglass");
    expect(terminal.stdout).not.toContain("\u001b[");
  });

  it("combines diagnostic and token policies with deterministic exit codes", async () => {
    const repository = await createRepository();
    const inspected = await runCli(["inspect", ".", "--format", "json"], {
      cwd: repository.path,
    });
    const report = JSON.parse(inspected.stdout) as {
      tokenEstimate: { total: number };
    };

    const defaultFailure = await runCli(["check", ".", "--format", "json"], {
      cwd: repository.path,
    });
    expect(defaultFailure.code).toBe(1);
    expect(JSON.parse(defaultFailure.stdout)).toMatchObject({
      kind: "scopeglass-check",
      policy: { passed: false, failOn: "error", failures: ["diagnostics"] },
    });

    const terminalFailure = await runCli(["check", ".", "--no-color"], {
      cwd: repository.path,
    });
    expect(terminalFailure.code).toBe(1);
    expect(terminalFailure.stdout).toContain("Policy\n│ Result: FAILED");

    const equality = await runCli(
      [
        "check",
        ".",
        "--format",
        "json",
        "--fail-on",
        "never",
        "--max-tokens",
        String(report.tokenEstimate.total),
      ],
      { cwd: repository.path },
    );
    expect(equality.code).toBe(0);
    expect(JSON.parse(equality.stdout)).toMatchObject({
      policy: { passed: true, failures: [] },
    });

    const tokenFailure = await runCli(
      [
        "check",
        ".",
        "--format",
        "json",
        "--fail-on",
        "never",
        "--max-tokens",
        String(report.tokenEstimate.total - 1),
      ],
      { cwd: repository.path },
    );
    expect(tokenFailure.code).toBe(1);
    expect(JSON.parse(tokenFailure.stdout)).toMatchObject({
      policy: { passed: false, failures: ["max-tokens"] },
    });
  });

  it.each(["-1", "1.5", "NaN", "9007199254740992"])(
    "rejects invalid max-token value %s as usage error",
    async (value) => {
      const repository = await createRepository();
      const result = await runCli(["check", ".", "--max-tokens", value], {
        cwd: repository.path,
      });

      expect(result.code).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("max-tokens");
      expect(result.stderr).not.toContain("invalid-option: error:");
    },
  );

  it("uses one concise prefix for usage errors", async () => {
    const result = await runCli(["inspect", ".", "--format", "xml"]);

    expect(result).toEqual({
      code: 2,
      stdout: "",
      stderr:
        "scopeglass: invalid-option: option '--format <format>' argument 'xml' is invalid. format must be terminal or json.\n",
    });
  });

  it("treats a closed stdout pipe as a clean termination", async () => {
    const repository = await tempDirectory();
    await repository.mkdir(".git");
    await repository.write(
      "AGENTS.md",
      Array.from({ length: 4_096 }, (_, index) => `- Rule ${index}`).join("\n"),
    );

    const result = await runCliWithClosedStdout(
      ["inspect", ".", "--no-color"],
      repository.path,
    );

    expect(result).toEqual({ code: 0, stderr: "" });
  });

  it("streams HTML or creates one private report without overwriting", async () => {
    const repository = await createRepository();

    const streamed = await runCli(["report", ".", "--output", "-"], {
      cwd: repository.path,
    });
    expect(streamed.code).toBe(0);
    expect(streamed.stderr).toBe("");
    expect(streamed.stdout).toMatch(/^<!doctype html>/u);

    const output = path.join(repository.path, "artifacts", "scopeglass.html");
    await repository.mkdir("artifacts");
    const created = await runCli(["report", ".", "--output", output], {
      cwd: repository.path,
    });
    expect(created).toMatchObject({ code: 0, stdout: "" });
    expect(created.stderr).toContain("Created report:");
    expect(await readFile(output, "utf8")).toMatch(/^<!doctype html>/u);
    if (process.platform !== "win32") {
      expect((await stat(output)).mode & 0o777).toBe(0o600);
    }

    await writeFile(output, "sentinel");
    const refused = await runCli(["report", ".", "--output", output], {
      cwd: repository.path,
    });
    expect(refused.code).toBe(2);
    expect(await readFile(output, "utf8")).toBe("sentinel");

    const symlinkOutput = path.join(repository.path, "unsafe.html");
    await symlink(output, symlinkOutput);
    const symlinkRefused = await runCli(
      ["report", ".", "--output", symlinkOutput],
      { cwd: repository.path },
    );
    expect(symlinkRefused.code).toBe(2);
    expect(await readFile(output, "utf8")).toBe("sentinel");

    const realParent = await repository.mkdir("real-artifacts");
    const linkedParent = path.join(repository.path, "linked-artifacts");
    await symlink(realParent, linkedParent, "dir");
    const parentRefused = await runCli(
      ["report", ".", "--output", path.join(linkedParent, "report.html")],
      { cwd: repository.path },
    );
    expect(parentRefused.code).toBe(2);

    const concurrentOutput = path.join(
      repository.path,
      "artifacts",
      "race.html",
    );
    const concurrent = await Promise.all([
      runCli(["report", ".", "--output", concurrentOutput], {
        cwd: repository.path,
      }),
      runCli(["report", ".", "--output", concurrentOutput], {
        cwd: repository.path,
      }),
    ]);
    expect(concurrent.map(({ code }) => code).sort()).toEqual([0, 2]);
    expect(await readFile(concurrentOutput, "utf8")).toMatch(
      /^<!doctype html>/u,
    );
  });

  it("reports expected failures concisely without absolute host paths", async () => {
    const repository = await createRepository();

    const result = await runCli(["inspect", "private/missing.ts"], {
      cwd: repository.path,
    });

    expect(result.code).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("target-not-found");
    expect(result.stderr).toContain("private/missing.ts");
    expect(result.stderr).not.toContain(repository.path);
  });

  it.each([
    ["case", "CaseRepo", "caserepo"],
    ["Unicode normalization", "Répo", "Répo"],
    ["filesystem-specific Unicode fold", "σrepo", "ςrepo"],
  ])(
    "does not skip intermediate-symlink checks through a %s filesystem alias",
    async (_aliasKind, repositoryName, aliasName) => {
      const workspace = await tempDirectory();
      const repositoryPath = await workspace.mkdir(repositoryName);
      const aliasPath = path.join(workspace.path, aliasName);
      try {
        await lstat(aliasPath);
      } catch {
        return;
      }

      await workspace.mkdir(`${repositoryName}/.git`);
      await workspace.write(
        `${repositoryName}/AGENTS.md`,
        "Use safe output.\n",
      );
      const outsidePath = await workspace.mkdir("outside/sub");
      await symlink(
        path.dirname(outsidePath),
        path.join(repositoryPath, "linked"),
        "dir",
      );
      const outputPath = path.join(aliasPath, "linked", "sub", "report.html");

      const result = await runCli(["report", ".", "--output", outputPath], {
        cwd: repositoryPath,
      });

      expect(result.code).toBe(2);
      await expect(
        lstat(path.join(outsidePath, "report.html")),
      ).rejects.toMatchObject({ code: "ENOENT" });
    },
  );
});
