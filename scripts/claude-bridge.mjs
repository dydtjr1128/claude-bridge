#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const PROMPT_DIR = path.join(ROOT_DIR, "prompts");
const VALID_COMMANDS = new Set(["setup", "review", "adversarial-review", "rescue"]);
export const CLAUDE_DEFAULT_TIMEOUT = "10m0s";
export const CLAUDE_SLOW_MODEL_TIMEOUT = "15m0s";
export const CLAUDE_FABLE_TIMEOUT = "20m0s";
export const CLAUDE_REVIEW_TOOLS = "Read,Glob,Grep,Bash";
export const DEFAULT_REVIEW_SCOPE = "all current uncommitted changes in this repository, including staged, unstaged, and untracked files";

export function buildClaudeArgs(prompt, options = {}) {
  const args = [
    "--safe-mode",
    "--strict-mcp-config",
    "--disable-slash-commands",
    "--no-chrome",
    "--tools",
    CLAUDE_REVIEW_TOOLS,
    "--permission-mode",
    "dontAsk",
    "-p",
    prompt
  ];
  if (options.model) {
    args.push("--model", options.model);
  }
  if (options.outputFormat) {
    args.push("--output-format", options.outputFormat);
  }
  args.push("--no-session-persistence");
  return args;
}

export function defaultTimeoutForModel(model) {
  const normalized = String(model);
  if (/fable/i.test(normalized)) {
    return CLAUDE_FABLE_TIMEOUT;
  }
  if (/opus/i.test(normalized)) {
    return CLAUDE_SLOW_MODEL_TIMEOUT;
  }
  return CLAUDE_DEFAULT_TIMEOUT;
}

function usage() {
  console.log([
    "Usage:",
    "  node scripts/claude-bridge.mjs setup [--json]",
    "  node scripts/claude-bridge.mjs review [--model <model>] [--timeout <duration>] [--language <lang>] [--scope <text>] [focus ...]",
    "  node scripts/claude-bridge.mjs adversarial-review [--model <model>|--deep] [--timeout <duration>] [--language <lang>] [--scope <text>] [focus ...]",
    "  node scripts/claude-bridge.mjs rescue [--model <model>|--deep] [--timeout <duration>] [--language <lang>] [--scope <text>] [request ...]",
    "",
    "Options:",
    "  --cwd <path>          Run from this repository path.",
    "  --output-dir <path>   Store Claude JSON, log, prompt, and markdown output here.",
    `  --timeout <duration>  Stop a review after this duration (default: ${CLAUDE_DEFAULT_TIMEOUT}; Opus: ${CLAUDE_SLOW_MODEL_TIMEOUT}; Fable: ${CLAUDE_FABLE_TIMEOUT}).`,
    "  --dry-run             Print the generated prompt without calling Claude.",
    "  --json                Print machine-readable wrapper output.",
    "  --deep                Select claude-opus-5 when explicitly requested."
  ].join("\n"));
}

function parseArgs(argv) {
  const options = {};
  const positionals = [];
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      positionals.push(value);
      continue;
    }
    const key = value.slice(2);
    if (["json", "dry-run", "deep"].includes(key)) {
      options[key] = true;
      continue;
    }
    const next = argv[index + 1];
    if (next == null || next.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    options[key] = next;
    index += 1;
  }
  return { options, positionals };
}

export function parseDuration(value) {
  const input = String(value ?? "").trim();
  const match = /^(?:(\d+)m)?(?:(\d+)s)?(?:(\d+)ms)?$/.exec(input);
  if (!match) {
    throw new Error(`Invalid timeout duration: ${value}`);
  }

  const totalMs =
    Number(match[1] ?? 0) * 60_000 +
    Number(match[2] ?? 0) * 1_000 +
    Number(match[3] ?? 0);
  if (totalMs <= 0 || !Number.isSafeInteger(totalMs)) {
    throw new Error(`Invalid timeout duration: ${value}`);
  }

  return totalMs;
}

export function normalizeModel(model, command, deep) {
  if (model) {
    const normalized = String(model).trim().toLowerCase();
    if (
      normalized === "sonnet" ||
      normalized === "sonnet5" ||
      normalized === "sonnet-5" ||
      normalized === "sonnet 5"
    ) {
      return "claude-sonnet-5";
    }
    if (
      normalized === "opus" ||
      normalized === "opus5" ||
      normalized === "opus-5" ||
      normalized === "opus 5" ||
      normalized === "claude-opus-5"
    ) {
      return "claude-opus-5";
    }
    if (
      normalized === "opus4.8" ||
      normalized === "opus-4.8" ||
      normalized === "opus-4-8" ||
      normalized === "opus 4.8" ||
      normalized === "opsu4.8"
    ) {
      return "claude-opus-4-8";
    }
    return model;
  }
  if (deep || command === "adversarial-review") {
    return deep ? "claude-opus-5" : "claude-sonnet-5";
  }
  return "claude-sonnet-5";
}

function timestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds())
  ].join("");
}

function ensureDirectory(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function loadPrompt(command) {
  const file = path.join(PROMPT_DIR, `${command}.md`);
  return fs.readFileSync(file, "utf8");
}

function renderPrompt(template, values) {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => values[key] ?? "");
}

function commandLabel(command) {
  return command === "adversarial-review" ? "adversarial review" : command;
}

export function run(command, args, options = {}) {
  const spawn = options.spawn ?? spawnSync;
  return spawn(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    env: process.env,
    windowsHide: true,
    maxBuffer: 20 * 1024 * 1024,
    timeout: options.timeoutMs
  });
}

function outputText(value) {
  return typeof value === "string" ? value : "";
}

export function commandReport(result) {
  const spawnError = result.error instanceof Error ? result.error.message : "";
  const stderr = [outputText(result.stderr).trim(), spawnError].filter(Boolean).join("\n");
  return {
    status: result.status,
    stdout: outputText(result.stdout).trim(),
    stderr,
    timedOut: result.error?.code === "ETIMEDOUT"
  };
}

export function resolveClaudeOutput(raw, options = {}) {
  const output = outputText(raw);
  const partialOutput = options.timedOut ? output : null;
  if (!output.trim()) {
    return {
      result: "",
      parsed: null,
      parseError: "Claude produced no JSON output.",
      partialOutput,
      hasResult: false
    };
  }
  try {
    const parsed = JSON.parse(output);
    const result = typeof parsed.result === "string" ? parsed.result : "";
    return {
      result,
      parsed,
      parseError: null,
      partialOutput,
      hasResult: Boolean(result.trim())
    };
  } catch (error) {
    return {
      result: output,
      parsed: null,
      parseError: error instanceof Error ? error.message : String(error),
      partialOutput,
      hasResult: false
    };
  }
}

function printOutput(payload, asJson) {
  if (asJson) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  if (payload.result) {
    process.stdout.write(payload.result.endsWith("\n") ? payload.result : `${payload.result}\n`);
  }
  if (payload.outputDir) {
    process.stdout.write(`\nClaude Bridge output: ${payload.outputDir}\n`);
  }
}

function handleSetup(options) {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const version = run("claude", ["--version"], { cwd });
  const smoke = run("claude", buildClaudeArgs("Respond with exactly: OK", {
    model: "claude-sonnet-5"
  }), { cwd });
  const versionReport = commandReport(version);
  const smokeReport = commandReport(smoke);
  const payload = {
    ready: version.status === 0 && smoke.status === 0 && outputText(smoke.stdout).trim() === "OK",
    version: versionReport,
    smoke: smokeReport
  };
  printOutput({ ...payload, result: payload.ready ? "Claude Bridge setup check passed." : "Claude Bridge setup check failed." }, Boolean(options.json));
  if (!payload.ready) {
    process.exitCode = 1;
  }
}

function handleClaudeCommand(command, options, positionals) {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const scope = options.scope ?? DEFAULT_REVIEW_SCOPE;
  const userFocus = positionals.join(" ").trim() || "No extra focus provided.";
  const language = options.language ?? "Korean unless the user requested another language";
  const model = normalizeModel(options.model, command, Boolean(options.deep));
  const timeout = String(options.timeout ?? defaultTimeoutForModel(model)).trim();
  const timeoutMs = parseDuration(timeout);
  const outputDir = path.resolve(
    cwd,
    options["output-dir"] ?? path.join(".codex", "claude-bridge", `run-${timestamp()}`)
  );

  const prompt = renderPrompt(loadPrompt(command), {
    SCOPE: scope,
    USER_FOCUS: userFocus,
    LANGUAGE: language,
    TIMEOUT: timeout
  });
  const promptFile = path.join(outputDir, `${command}.prompt.md`);
  const jsonFile = path.join(outputDir, `${command}.json`);
  const logFile = path.join(outputDir, `${command}.log`);
  const mdFile = path.join(outputDir, `${command}.md`);

  if (options["dry-run"]) {
    printOutput({
      command,
      model,
      timeout,
      timedOut: false,
      prompt,
      result: prompt
    }, Boolean(options.json));
    return;
  }

  ensureDirectory(outputDir);
  fs.writeFileSync(promptFile, prompt, "utf8");

  const claude = run("claude", buildClaudeArgs(prompt, {
    model,
    outputFormat: "json"
  }), { cwd, timeoutMs });
  fs.writeFileSync(jsonFile, claude.stdout ?? "", "utf8");
  const spawnError = claude.error instanceof Error ? claude.error.message : "";
  const stderrLog = [claude.stderr ?? "", spawnError].filter(Boolean).join("\n");
  fs.writeFileSync(logFile, stderrLog, "utf8");

  const timedOut = claude.error?.code === "ETIMEDOUT";
  const parsed = resolveClaudeOutput(claude.stdout ?? "", { timedOut });
  fs.writeFileSync(mdFile, parsed.result || "", "utf8");
  const isClaudeError = parsed.parsed?.is_error === true;
  const payload = {
    command,
    label: commandLabel(command),
    model,
    timeout,
    timedOut,
    status: claude.status,
    success:
      claude.status === 0 &&
      !timedOut &&
      !isClaudeError &&
      !parsed.parseError &&
      parsed.hasResult,
    outputDir,
    promptFile,
    jsonFile,
    logFile,
    markdownFile: mdFile,
    parseError: parsed.parseError,
    partialOutput: parsed.partialOutput,
    spawnError: spawnError || null,
    claudeError: isClaudeError ? parsed.parsed?.result ?? "Claude returned is_error=true." : null,
    result: parsed.result
  };
  printOutput(payload, Boolean(options.json));
  if (!payload.success) {
    process.exitCode = claude.status || 1;
  }
}

function main() {
  const [command, ...argv] = process.argv.slice(2);
  if (!command || command === "--help" || command === "help") {
    usage();
    return;
  }
  if (!VALID_COMMANDS.has(command)) {
    throw new Error(`Unknown command: ${command}`);
  }
  const { options, positionals } = parseArgs(argv);
  if (command === "setup") {
    handleSetup(options);
    return;
  }
  handleClaudeCommand(command, options, positionals);
}

const isMainModule = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isMainModule) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
