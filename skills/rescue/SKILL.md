---
name: rescue
description: Use when Codex should ask Claude CLI for a rescue-style investigation, second opinion, debugging pass, or explicitly requested follow-up fix. Trigger on requests such as ask Claude to rescue this, have Claude investigate, use Claude to debug, ask Claude for a fix plan, or let Claude try a constrained fix.
---

# Claude Rescue

Use Claude CLI for investigation or follow-up rescue work from Codex. Unlike `review` and `adversarial-review`, this skill can support implementation only when the user explicitly asks for a fix or patch. Otherwise keep Claude in investigation and plan mode.

## Preflight

```powershell
Get-Command claude -ErrorAction SilentlyContinue
claude --version
claude -p "Respond with exactly: OK" --model claude-sonnet-5 --no-session-persistence
```

Normalize model shorthand:

- `sonnet5` or `sonnet-5` -> `claude-sonnet-5`
- `opus4.8` or `opus 4.8` -> `claude-opus-4-8`

## Mode Selection

- Use `claude-sonnet-5` by default for investigation, debugging, log interpretation, and fix planning.
- Use `claude-opus-4-8` sparingly for difficult failures, deep architectural diagnosis, security-sensitive issues, or repeated failed attempts.
- Do not ask Claude to run workflows, CI, deployment scripts, release tasks, or workflow automation unless the user explicitly and directly instructs you to run that exact command. A rescue request is not permission to run them.
- If the user only asks for rescue/investigation, ask Claude for findings and a plan, not edits.
- If the user explicitly asks Claude to fix, constrain the scope and verify the resulting patch yourself before reporting completion.

## Investigation Prompt

```text
You are a rescue engineer giving Codex an external second opinion.
Scope: <exact user request and relevant files, logs, or diff>
Do not edit files unless the user explicitly requested a fix.
Do not run workflows, CI, deployment scripts, release tasks, or workflow automation unless the user explicitly and directly instructs you to run that exact command. A rescue request is not permission to run them.
Use read-only inspection and lightweight local commands when needed.
Return actionable findings, likely root cause, and the smallest safe next step.
If proposing a fix, include files and line references.
```

## Capture Pattern

```powershell
$prompt = @'
You are a rescue engineer giving Codex an external second opinion.
Scope: <user request>
Do not edit files unless the user explicitly requested a fix.
Do not run workflows, CI, deployment scripts, release tasks, or workflow automation unless the user explicitly and directly instructs you to run that exact command. A rescue request is not permission to run them.
Use read-only inspection and lightweight local commands when needed.
Return actionable findings, likely root cause, and the smallest safe next step.
If proposing a fix, include files and line references.
'@

$out = Join-Path (Get-Location) ".codex\claude-bridge\run-$(Get-Date -Format yyyyMMdd-HHmmss)"
New-Item -ItemType Directory -Force $out | Out-Null
& claude -p $prompt --model claude-sonnet-5 --output-format json --no-session-persistence > (Join-Path $out "claude-rescue.json") 2> (Join-Path $out "claude-rescue.log")
```

Treat Claude output as advisory. Verify code claims, command claims, and proposed fixes locally.
