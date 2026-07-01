---
name: adversarial-review
description: Use when Codex should ask Claude CLI for an adversarial challenge review that pressure-tests implementation direction, design choices, assumptions, tradeoffs, and failure modes. Trigger on requests such as ask Claude for adversarial review, challenge this design, pressure-test with Claude, or get a hostile/critical Claude pass.
---

# Claude Adversarial Review

Use Claude CLI for a review-only challenge pass. This is not a normal defect sweep; it should question whether the approach should ship.

## Preflight

```powershell
Get-Command claude -ErrorAction SilentlyContinue
claude --version
claude -p "Respond with exactly: OK" --model claude-sonnet-5 --no-session-persistence
```

If a requested model fails with "There's an issue with the selected model", normalize shorthand before declaring Claude unavailable:

- `sonnet5` or `sonnet-5` -> `claude-sonnet-5`
- `opus4.8` or `opus 4.8` -> `claude-opus-4-8`

## Model Selection

- Use `claude-sonnet-5` for routine challenge reviews and broad coverage.
- Use `claude-opus-4-8` sparingly because it is expensive. Reserve it for high-risk adversarial review: security boundaries, data loss, migrations, concurrency, rollback/idempotency, distributed state, or when cheaper reviewers disagree.
- For many Claude reviewers, allocate most runs to Sonnet 5 and at most one Opus pass unless the user explicitly requests more Opus coverage.

## Adversarial Prompt

```text
You are an adversarial software reviewer.
Scope: <same exact scope the user gave>
Do not edit files.
Do not run workflows, CI pipelines, deployment scripts, release tasks, or workflow automation unless the user explicitly and directly instructs you to run that exact command. An adversarial review request is not permission to run them.
Use read-only inspection and lightweight local commands only when needed to ground findings.

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

Use `--deep` or `--model claude-opus-4-8` only when the scope is high-risk or the user explicitly wants Opus. Otherwise prefer Sonnet 5.

The helper stores prompt, JSON, markdown, and logs under `.codex/claude-bridge/`.

Verify every claim locally before acting on it. Preserve inference and uncertainty labels. Do not let Claude edit files during this review. After presenting findings, stop and ask the user which issues, if any, they want fixed before touching files.
