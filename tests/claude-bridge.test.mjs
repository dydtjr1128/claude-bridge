import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

const boundedPolicy = [
  "Do not execute programs unless the user explicitly and directly requests that execution.",
  "Complete one bounded pass within five minutes.",
  "Do not retry, add reviewers, expand the scope, or switch to a deeper model automatically.",
  "If the available time or evidence is insufficient, return the supported findings and state the remaining gap."
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
    assert.doesNotMatch(text, /lightweight local commands/i);
  }
});

test("skills limit preflight and verification to explicit, static actions", () => {
  for (const name of ["review", "adversarial-review", "rescue"]) {
    const text = readFileSync(path.join(ROOT_DIR, "skills", name, "SKILL.md"), "utf8");
    for (const sentence of boundedPolicy) {
      assert.match(text, exactSentence(sentence));
    }
    assert.match(text, /static file and line inspection/i);
    assert.match(text, /setup/i);
    assert.doesNotMatch(text, /claude -p "Respond with exactly: OK"/);
    assert.doesNotMatch(text, /lightweight local commands/i);
  }

  const readme = readFileSync(path.join(ROOT_DIR, "README.md"), "utf8");
  assert.match(readme, /--timeout <duration>/);
  assert.match(readme, /5m0s/);
  assert.match(readme, /explicit user intent/i);
});
