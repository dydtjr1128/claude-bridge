---
name: rescue
description: Use when Codex should ask Claude CLI for a rescue-style investigation, second opinion, debugging pass, or explicitly requested follow-up fix. Trigger on requests such as ask Claude to rescue this, have Claude investigate, use Claude to debug, ask Claude for a fix plan, or let Claude try a constrained fix.
---

# Claude Rescue

Use Claude CLI for investigation or follow-up rescue work from Codex. Unlike `review` and `adversarial-review`, this skill can support implementation only when the user explicitly asks for a fix or patch. Otherwise keep Claude in investigation and plan mode.

## Preflight

Do not run automatic executable validation or print-mode smoke tests. Limit local verification to static file and line inspection.

If the user explicitly requests executable validation, `setup` remains available as an explicit diagnostic command:

```powershell
node .\scripts\claude-bridge.mjs setup
```

## Bounded Execution Policy

Do not execute programs unless the user explicitly and directly requests that execution. This includes tests, builds, package managers, scripts, servers, applications, CI, deployment, release, and workflow automation. A review or investigation request alone is not permission to execute them.
Complete one bounded pass within five minutes.
Do not retry, add reviewers, expand the scope, or switch to a deeper model automatically.
If the available time or evidence is insufficient, return the supported findings and state the remaining gap.

Executable validation, Opus, `--deep`, retries, and fixes each require explicit user intent. Do not infer that intent from risk, difficulty, a failed attempt, or a rescue request.

Normalize model shorthand only after the user explicitly selects a model:

- `sonnet5` or `sonnet-5` -> `claude-sonnet-5`
- `opus4.8` or `opus 4.8` -> `claude-opus-4-8`

## Mode Selection

- Use `claude-sonnet-5` by default for investigation, log interpretation, and fix planning.
- Use `claude-opus-4-8` only when the user explicitly asks for Opus or `--deep`.
- Do not retry, add reviewers, or change models after a failed attempt unless the user directly requests another pass.
- If the user asks only for investigation, return findings and a plan; make a constrained fix only when explicitly requested.

## Investigation Prompt

```text
You are a rescue engineer giving Codex an external second opinion.
Scope: <exact user request and relevant files, logs, or diff>
Do not edit files unless the user explicitly requested a fix.
Do not execute programs unless the user explicitly and directly requests that execution. This includes tests, builds, package managers, scripts, servers, applications, CI, deployment, release, and workflow automation. A review or investigation request alone is not permission to execute them.
Complete one bounded pass within five minutes.
Do not retry, add reviewers, expand the scope, or switch to a deeper model automatically.
If the available time or evidence is insufficient, return the supported findings and state the remaining gap.
Limit verification to static file and line inspection.
Return actionable findings, likely root cause, and the smallest safe next step.
If proposing a fix, include files and line references.
```

## Preferred Helper

```powershell
node .\scripts\claude-bridge.mjs rescue --scope "<user request and relevant context>"
```

If using this skill from its installed plugin cache, resolve the helper relative to this `SKILL.md` as `../../scripts/claude-bridge.mjs`.

Use `--deep` or `--model claude-opus-4-8` only when the user explicitly requests Opus. Use `--timeout <duration>` to change the hard limit from its `5m0s` default.

Treat Claude output as advisory. Preserve observed facts, inferences, open questions, and next steps. Verify code claims, command claims, and proposed fixes locally. If Claude was not successfully invoked, report the failure and do not invent a substitute rescue answer.
