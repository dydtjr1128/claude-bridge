---
name: adversarial-review
description: Use when Codex should ask Claude CLI for an adversarial challenge review that pressure-tests implementation direction, design choices, assumptions, tradeoffs, and failure modes. Trigger on requests such as ask Claude for adversarial review, challenge this design, pressure-test with Claude, or get a hostile/critical Claude pass.
---

# Claude Adversarial Review

Use Claude CLI for a review-only challenge pass. This is not a normal defect sweep; it should question whether the approach should ship.

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

Executable validation, Opus, `--deep`, retries, and fixes each require explicit user intent. Do not infer that intent from risk, difficulty, a failed review, or an adversarial review request.

Normalize shorthand only after the user explicitly selects a model:

- `sonnet5` or `sonnet-5` -> `claude-sonnet-5`
- `opus4.8` or `opus 4.8` -> `claude-opus-4-8`

## Model Selection

- Use `claude-sonnet-5` for the default challenge review.
- Use `claude-opus-4-8` only when the user explicitly asks for Opus or `--deep`.
- Do not add reviewers or change models after a failure unless the user directly requests another pass.

## Adversarial Prompt

```text
You are an adversarial software reviewer.
Scope: <same exact scope the user gave>
Do not edit files.
Do not execute programs unless the user explicitly and directly requests that execution. This includes tests, builds, package managers, scripts, servers, applications, CI, deployment, release, and workflow automation. A review or investigation request alone is not permission to execute them.
Complete one bounded pass within five minutes.
Do not retry, add reviewers, expand the scope, or switch to a deeper model automatically.
If the available time or evidence is insufficient, return the supported findings and state the remaining gap.
Limit verification to static file and line inspection.

Try to find the strongest reasons this should not ship yet.
Prioritize data loss, corruption, migrations, schema drift, concurrency, rollback, idempotency, trust boundaries, stale state, and missing tests.
Report only material findings grounded in files, line numbers, or command output.
Return in Korean unless the user requested another language.
Start with Findings ordered by severity. If no actionable finding, say so clearly.
Then give a short structural verdict: solid parts, fragile parts, and top 3 improvements.
```

## Preferred Helper

```powershell
node .\scripts\claude-bridge.mjs adversarial-review --scope "current git diff in this repository"
```

If using this skill from its installed plugin cache, resolve the helper relative to this `SKILL.md` as `../../scripts/claude-bridge.mjs`.

Use `--deep` or `--model claude-opus-4-8` only when the user explicitly requests Opus. Use `--timeout <duration>` to change the hard limit from its `5m0s` default.

The helper stores prompt, JSON, markdown, and logs under `.codex/claude-bridge/`.

Verify every claim locally before acting on it. Preserve inference and uncertainty labels. Do not let Claude edit files during this review. After presenting findings, stop and ask the user which issues, if any, they want fixed before touching files.
