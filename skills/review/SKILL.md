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

## Preferred Helper

Prefer the bundled helper over hand-rolled Claude CLI calls. From a checked-out plugin source tree, run:

```powershell
node .\scripts\claude-bridge.mjs review --scope "current git diff in this repository"
```

If using this skill from its installed plugin cache, resolve the helper relative to this `SKILL.md` as `../../scripts/claude-bridge.mjs`.

Useful options:

- `--model claude-sonnet-5` for the default ordinary review model.
- `--deep` to prefer `claude-opus-4-8` for high-risk review.
- `--scope "<scope>"` to preserve the user's exact target.
- `--dry-run` to inspect the generated prompt without calling Claude.

The helper stores prompt, JSON, markdown, and logs under `.codex/claude-bridge/`.

## Result Handling

Preserve Claude's findings, evidence boundaries, uncertainty notes, and file/line references. Verify claims locally before acting on them. Discard unsupported findings even when they sound plausible. Do not count a failed Claude run as a completed review. After presenting review findings, stop and ask the user which issues, if any, they want fixed before touching files.
