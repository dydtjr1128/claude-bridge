import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT_DIR = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const BRIDGE_SCRIPT = path.join(ROOT_DIR, "scripts", "claude-bridge.mjs");

async function loadBridge() {
  return import(`${pathToFileURL(BRIDGE_SCRIPT).href}?test=unit`);
}

test("parseDuration accepts bounded duration syntax and rejects invalid values", async () => {
  const bridge = await loadBridge();

  assert.equal(bridge.parseDuration("50ms"), 50);
  assert.equal(bridge.parseDuration("2s"), 2_000);
  assert.equal(bridge.parseDuration("3m"), 180_000);
  assert.equal(bridge.parseDuration("5m0s"), 300_000);

  for (const value of ["0ms", "-1s", "1", "5mwat", "1s1s", "1s1m", "", "  "]) {
    assert.throws(() => bridge.parseDuration(value), /duration|timeout/i);
  }
});

test("default timeout scales with the selected Claude model", async () => {
  const bridge = await loadBridge();

  assert.equal(bridge.defaultTimeoutForModel("claude-sonnet-5"), "10m0s");
  assert.equal(bridge.defaultTimeoutForModel("claude-opus-5"), "15m0s");
  assert.equal(bridge.defaultTimeoutForModel("claude-opus-4-8"), "15m0s");
  assert.equal(bridge.defaultTimeoutForModel("team-fable-reviewer"), "20m0s");
});

test("current Opus shorthand and deep mode select Claude Opus 5", async () => {
  const bridge = await loadBridge();

  for (const model of ["opus", "opus5", "opus-5", "opus 5", "claude-opus-5"]) {
    assert.equal(bridge.normalizeModel(model, "review", false), "claude-opus-5", model);
  }
  assert.equal(bridge.normalizeModel(undefined, "review", true), "claude-opus-5");
  assert.equal(bridge.normalizeModel("opus4.8", "review", false), "claude-opus-4-8");
});

test("default review scope covers all uncommitted work", async () => {
  const bridge = await loadBridge();

  assert.equal(
    bridge.DEFAULT_REVIEW_SCOPE,
    "all current uncommitted changes in this repository, including staged, unstaged, and untracked files"
  );
});

test("run passes a hard timeout to an injected provider", async () => {
  const bridge = await loadBridge();
  let invocation;
  const fakeSpawn = (command, args, options) => {
    invocation = { command, args, options };
    return { status: 0, stdout: '{"result":"review complete"}', stderr: "" };
  };

  const result = bridge.run("claude", ["-p", "review"], {
    cwd: ROOT_DIR,
    timeoutMs: 50,
    spawn: fakeSpawn
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /review complete/);
  assert.equal(invocation.command, "claude");
  assert.equal(invocation.options.timeout, 50);
});

test("commandReport preserves provider failure and timeout metadata", async () => {
  const bridge = await loadBridge();
  const failure = bridge.run("claude", [], {
    spawn: () => ({ status: 7, stdout: "", stderr: "provider failed" })
  });
  const failureReport = bridge.commandReport(failure);

  assert.equal(failureReport.status, 7);
  assert.match(failureReport.stderr + failureReport.stdout, /failed|7/i);
  assert.equal(failureReport.timedOut, false);

  const timeoutError = Object.assign(new Error("provider timed out"), { code: "ETIMEDOUT" });
  const timedOut = bridge.run("claude", [], {
    timeoutMs: 50,
    spawn: () => ({
      status: null,
      stdout: "partial review",
      stderr: "",
      error: timeoutError
    })
  });
  const timeoutReport = bridge.commandReport(timedOut);

  assert.equal(timeoutReport.status, null);
  assert.equal(timeoutReport.stdout, "partial review");
  assert.equal(timeoutReport.timedOut, true);
});

test("resolveClaudeOutput preserves truncated raw JSON from a timed-out run", async () => {
  const bridge = await loadBridge();
  const raw = '{"result":"partial review';

  const output = bridge.resolveClaudeOutput(raw, { timedOut: true });

  assert.equal(output.result, raw);
  assert.equal(output.partialOutput, raw);
  assert.equal(output.hasResult, false);
  assert.match(output.parseError, /JSON|position|unterminated|end/i);
});

test("resolveClaudeOutput preserves a timed-out JSON envelope without a result", async () => {
  const bridge = await loadBridge();
  const raw = '{"type":"result","is_error":false}';

  const output = bridge.resolveClaudeOutput(raw, { timedOut: true });

  assert.equal(output.result, "");
  assert.equal(output.partialOutput, raw);
  assert.equal(output.hasResult, false);
  assert.equal(output.parseError, null);
});

test("resolveClaudeOutput requires a nonempty JSON result for completion", async () => {
  const bridge = await loadBridge();

  for (const raw of ["", "not JSON", "{}", '{"result":""}']) {
    const output = bridge.resolveClaudeOutput(raw);
    assert.equal(output.hasResult, false, raw);
  }
});

test("Claude reviews use isolated read-only-oriented arguments", async () => {
  const bridge = await loadBridge();

  assert.equal(bridge.CLAUDE_REVIEW_TOOLS, "Read,Glob,Grep,Bash");
  assert.deepEqual(bridge.buildClaudeArgs("review this diff", {
    model: "claude-sonnet-5",
    outputFormat: "json"
  }), [
    "--safe-mode",
    "--strict-mcp-config",
    "--disable-slash-commands",
    "--no-chrome",
    "--tools",
    "Read,Glob,Grep,Bash",
    "--permission-mode",
    "dontAsk",
    "-p",
    "review this diff",
    "--model",
    "claude-sonnet-5",
    "--output-format",
    "json",
    "--no-session-persistence"
  ]);
});

const boundedPolicy = [
  "Do not execute project code or validation commands unless the user explicitly and directly requests that execution.",
  "Read-only repository inspection commands required to obtain the requested scope are allowed, including `git diff`, `git status`, `git show`, `git log`, `git blame`, and `git ls-files`.",
  "When the scope is current uncommitted work, include staged, unstaged, and untracked files; enumerate them with read-only Git inspection before reviewing only those changes.",
  "Do not use shell commands for any other purpose, and do not run commands that modify files, the index, refs, configuration, or other repository state.",
  "Do not retry, add reviewers, expand the scope, or switch to a deeper model automatically.",
  "If the available time or evidence is insufficient, return the supported findings and state the remaining gap.",
  "Start with the exact diff or named files in scope and inspect only directly relevant dependencies needed to support a concrete finding.",
  "Do not perform repository-wide discovery, recursively follow references, or pursue speculative context.",
  "Once a finding has enough static evidence, report it; if evidence remains insufficient, state the uncertainty and remaining gap instead of continuing to investigate."
];

function exactSentence(sentence) {
  return new RegExp(sentence.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
}

test("review prompts enforce one bounded non-executing pass", () => {
  for (const name of ["review", "adversarial-review", "rescue"]) {
    const text = readFileSync(path.join(ROOT_DIR, "prompts", `${name}.md`), "utf8");
    for (const sentence of boundedPolicy) {
      assert.match(text, exactSentence(sentence));
    }
    assert.match(text, /selected hard timeout \(\{\{TIMEOUT\}\}\)/i);
    assert.doesNotMatch(text, /lightweight local commands/i);
  }
});

test("skills limit preflight and verification to explicit, static actions", () => {
  for (const name of ["review", "adversarial-review", "rescue"]) {
    const text = readFileSync(path.join(ROOT_DIR, "skills", name, "SKILL.md"), "utf8");
    for (const sentence of boundedPolicy) {
      assert.match(text, exactSentence(sentence));
    }
    assert.match(text, /helper-selected timeout/i);
    assert.match(text, /ten minutes[\s\S]*fifteen minutes[\s\S]*twenty minutes/i);
    assert.match(text, /static file and line inspection/i);
    assert.match(text, /setup/i);
    assert.doesNotMatch(text, /claude -p "Respond with exactly: OK"/);
    assert.doesNotMatch(text, /lightweight local commands/i);
  }

  const readme = readFileSync(path.join(ROOT_DIR, "README.md"), "utf8");
  assert.match(readme, /--timeout <duration>/);
  assert.match(readme, /10m0s/);
  assert.match(readme, /15m0s/);
  assert.match(readme, /20m0s/);
  assert.match(readme, /explicit user intent/i);
});

test("repository declares Apache-2.0 licensing", () => {
  assert.ok(existsSync(path.join(ROOT_DIR, "LICENSE")));
  assert.match(readFileSync(path.join(ROOT_DIR, "LICENSE"), "utf8"), /Apache License[\s\S]*Version 2\.0/);
});
