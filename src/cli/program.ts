import { Command, CommanderError, InvalidArgumentError } from "commander";

import { analyze } from "../analyze.js";
import { ScopeglassError } from "../error.js";
import { renderHtml } from "../formatters/html.js";
import { renderJson } from "../formatters/json.js";
import { renderCheckTerminal, renderTerminal } from "../formatters/terminal.js";
import type { AnalyzeOptions } from "../types.js";
import { createCheckResult, parseFailOn, parseMaxTokens } from "./policy.js";
import { writeReportFile } from "./report-file.js";
import {
  terminalColorEnabled,
  writeReportCreated,
  writeScopeglassError,
  writeUnexpectedError,
  writeUsageError,
} from "./runtime.js";

type OutputFormat = "json" | "terminal";
type CliExitCode = 0 | 1 | 2;

interface RootOptions {
  root?: string;
}

interface InspectOptions extends RootOptions {
  color: boolean;
  format: OutputFormat;
}

interface ReportOptions extends RootOptions {
  output: string;
}

interface CheckOptions extends InspectOptions {
  failOn: ReturnType<typeof parseFailOn>;
  maxTokens?: number;
}

function parseFormat(value: string): OutputFormat {
  if (value === "json" || value === "terminal") {
    return value;
  }
  throw new InvalidArgumentError("format must be terminal or json.");
}

function analyzeOptions(root: string | undefined): AnalyzeOptions | undefined {
  return root === undefined ? undefined : { root };
}

function configureInspectCommand(
  program: Command,
  setExitCode: (code: CliExitCode) => void,
): void {
  const command = program
    .command("inspect [target]")
    .usage("[target] [options]")
    .description("Inspect the effective AGENTS.md instruction chain.")
    .option("--root <path>", "Override repository-root discovery.")
    .option(
      "--format <format>",
      "Output format: terminal or json.",
      parseFormat,
      "terminal",
    )
    .option("--no-color", "Disable ANSI color.")
    .allowExcessArguments(false);

  command.action(async (target: string | undefined) => {
    const options = command.opts<InspectOptions>();
    const report = await analyze(target, analyzeOptions(options.root));
    const output =
      options.format === "json"
        ? renderJson(report)
        : renderTerminal(report, {
            color: terminalColorEnabled(options.color),
          });
    process.stdout.write(output);
    setExitCode(0);
  });
}

function configureReportCommand(
  program: Command,
  setExitCode: (code: CliExitCode) => void,
): void {
  const command = program
    .command("report [target]")
    .usage("[target] [options]")
    .description("Create a self-contained HTML report.")
    .option("--root <path>", "Override repository-root discovery.")
    .option(
      "--output <path>",
      "Output path, or - for stdout.",
      "scopeglass.html",
    )
    .allowExcessArguments(false);

  command.action(async (target: string | undefined) => {
    const options = command.opts<ReportOptions>();
    const report = await analyze(target, analyzeOptions(options.root));
    const html = renderHtml(report);

    if (options.output === "-") {
      process.stdout.write(html);
    } else {
      const displayPath = await writeReportFile(options.output, html);
      writeReportCreated(displayPath);
    }
    setExitCode(0);
  });
}

function configureCheckCommand(
  program: Command,
  setExitCode: (code: CliExitCode) => void,
): void {
  const command = program
    .command("check [target]")
    .usage("[target] [options]")
    .description("Enforce diagnostic and token-budget policy.")
    .option("--root <path>", "Override repository-root discovery.")
    .option(
      "--format <format>",
      "Output format: terminal or json.",
      parseFormat,
      "terminal",
    )
    .option(
      "--fail-on <severity>",
      "Fail on error, warning, info, or never.",
      parseFailOn,
      "error",
    )
    .option(
      "--max-tokens <integer>",
      "Fail when the context estimate exceeds this budget.",
      parseMaxTokens,
    )
    .option("--no-color", "Disable ANSI color.")
    .allowExcessArguments(false);

  command.action(async (target: string | undefined) => {
    const options = command.opts<CheckOptions>();
    const report = await analyze(target, analyzeOptions(options.root));
    const result = createCheckResult(report, options.failOn, options.maxTokens);
    const output =
      options.format === "json"
        ? renderJson(result)
        : renderCheckTerminal(result, {
            color: terminalColorEnabled(options.color),
          });
    process.stdout.write(output);
    setExitCode(result.policy.passed ? 0 : 1);
  });
}

export async function runCli(
  args: string[],
  version: string,
): Promise<CliExitCode> {
  let exitCode: CliExitCode = 0;
  const setExitCode = (code: CliExitCode) => {
    exitCode = code;
  };
  const program = new Command()
    .name("scopeglass")
    .description(
      "Inspect which AGENTS.md instructions apply to a path and why.",
    )
    .version(version)
    .allowExcessArguments(false)
    .configureHelp({
      subcommandTerm: (command) => {
        const argumentsText = command.registeredArguments
          .map((argument) =>
            argument.required ? `<${argument.name()}>` : `[${argument.name()}]`,
          )
          .join(" ");
        return `${command.name()}${argumentsText === "" ? "" : ` ${argumentsText}`}`;
      },
    })
    .exitOverride()
    .configureOutput({
      writeOut: (value) => process.stdout.write(value),
      writeErr: () => undefined,
    });

  configureInspectCommand(program, setExitCode);
  configureReportCommand(program, setExitCode);
  configureCheckCommand(program, setExitCode);
  program.action(() => {
    throw new InvalidArgumentError(
      "a command is required; use --help for available commands.",
    );
  });

  try {
    await program.parseAsync(args, { from: "user" });
    return exitCode;
  } catch (error) {
    if (error instanceof CommanderError) {
      if (error.exitCode === 0) {
        return 0;
      }
      writeUsageError(error.message);
      return 2;
    }
    if (error instanceof ScopeglassError) {
      writeScopeglassError(error);
      return 2;
    }
    writeUnexpectedError();
    return 2;
  }
}
