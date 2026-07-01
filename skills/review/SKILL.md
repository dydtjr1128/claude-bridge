---
name: review
description: Use when Codex should ask Claude CLI for an independent ordinary read-only code review, second-pass review, or sanity check. Trigger on requests such as ask Claude to review, run Claude review, get a Claude pass, use Claude Bridge review, or compare Claude's review against Codex findings.
---

# Claude Review

Use the local `claude` executable as an external reviewer. Treat Claude output as advisory and verify findings against the repository before editing or reporting them as true.

## Preflight

Check the CLI and run a real print-mode smoke test:

```powershell
Get-Command claude -ErrorAction SilentlyContinue
claude --version
claude -p "Respond with exactly: OK" --model claude-sonnet-5 --no-session-persistence
```

`claude auth status` is not enough; cached auth can look valid while print mode fails. Warnings about extra certs are non-blocking only when the command exits 0 and returns usable output.

## Model Selection

- Use `claude-sonnet-5` by default for ordinary reviews, small-to-medium diffs, smoke checks, and broad multi-review coverage.
- Use `claude-opus-4-8` only when the user explicitly asks for Opus or the review is high-risk: security, data loss, migrations, concurrency, rollback, idempotency, or complex architecture.
- Normalize invalid shorthand: `sonnet5` and `sonnet-5` -> `claude-sonnet-5`; `opus4.8`, `opus 4.8`, and clear `opsu4.8` typos -> `claude-opus-4-8`.

## Review Prompt

Use this shape and preserve the user's scope:

```text
You are an independent code reviewer.
Scope: <exact diff, branch, files, or user-provided scope>
Do not edit files.
Do not run workflows, CI, deployment scripts, release tasks, or workflow automation unless the user explicitly and directly instructs you to run that exact command. A review request is not permission to run them.
Use read-only inspection and lightweight local commands only when needed to ground findings.
Prioritize correctness bugs, behavioral regressions, security risks, and missing tests.
Return findings first, ordered by severity, with file/line references.
If there are no actionable findings, say that clearly and mention residual test gaps.
```

## Capture Pattern

Capture raw output to files instead of dumping nested logs into chat:

```powershell
$prompt = @'
You are an independent code reviewer.
Scope: current git diff in this repository.
Do not edit files.
Do not run workflows, CI, deployment scripts, release tasks, or workflow automation unless the user explicitly and directly instructs you to run that exact command. A review request is not permission to run them.
Use read-only inspection and lightweight local commands only when needed to ground findings.
Prioritize correctness bugs, behavioral regressions, security risks, and missing tests.
Return findings first, ordered by severity, with file/line references.
If there are no actionable findings, say that clearly and mention residual test gaps.
'@

$out = Join-Path (Get-Location) ".codex\claude-bridge\run-$(Get-Date -Format yyyyMMdd-HHmmss)"
New-Item -ItemType Directory -Force $out | Out-Null
& claude -p $prompt --model claude-sonnet-5 --output-format json --no-session-persistence > (Join-Path $out "claude-review.json") 2> (Join-Path $out "claude-review.log")
```

Read the final answer from the JSON `result` field. Inspect logs only for failures.

## Result Handling

Verify file and line claims locally. Discard unsupported findings even when they sound plausible. Do not count a failed Claude run as a completed review.
