# Claude Bridge

Use Claude CLI from Codex for external code review, adversarial review, and rescue-style investigation.

This plugin is for Codex users who want a convenient way to ask the local Claude CLI for an independent pass without leaving the repository they are already working in.

## What You Get

- `$review` for a normal read-only Claude review.
- `$adversarial-review` for a challenge review that pressure-tests the implementation approach, design choices, assumptions, and failure modes.
- `$rescue` for Claude-assisted investigation, debugging, fix planning, or an explicitly requested constrained fix.

## Requirements

- Claude Code CLI installed and available as `claude`.
- A working Claude CLI login or API configuration.
- Codex with local plugin support.

Check Claude readiness with:

```powershell
claude --version
claude -p "Respond with exactly: OK" --model claude-sonnet-5 --no-session-persistence
```

`claude auth status` is useful but not sufficient by itself. A cached login can look valid while print mode still fails.

## Install

Install or register this folder as a local Codex plugin using your normal Codex local-plugin flow. The plugin manifest is:

```text
.codex-plugin/plugin.json
```

After installation, Codex should expose these skills:

```text
$review
$adversarial-review
$rescue
```

## Usage

Claude Bridge includes a small companion script inspired by the helper-runtime pattern in `openai/codex-plugin-cc`.

```powershell
node .\scripts\claude-bridge.mjs setup
node .\scripts\claude-bridge.mjs review --scope "current git diff in this repository"
node .\scripts\claude-bridge.mjs adversarial-review --scope "current git diff in this repository"
node .\scripts\claude-bridge.mjs rescue --scope "the failing parser test"
```

The skills prefer this helper because it normalizes model names, stores prompts/logs/results, and keeps the reviewer prompt consistent.

### `$review`

Runs a normal read-only Claude review against the current scope.

Use it when you want:

- a second-pass review of local changes;
- a sanity check before shipping;
- another model's view on Codex review findings;
- a mostly routine review where Sonnet 5 is sufficient.

Example prompts:

```text
Use $review to ask Claude to review my local changes.
Use $review to compare Claude's review against the current Codex findings.
Use $review to review this branch against main.
```

This skill is review-only. It tells Claude not to edit files.

### `$adversarial-review`

Runs a challenge review that is meant to question the approach, not just find ordinary implementation defects.

Use it when you want Claude to pressure-test:

- architecture and design choices;
- hidden assumptions and tradeoffs;
- auth, data loss, rollback, race conditions, or reliability risks;
- whether a simpler or safer approach should have been chosen.

Example prompts:

```text
Use $adversarial-review to challenge this caching design.
Use $adversarial-review to look for race conditions and rollback risks.
Use $adversarial-review with Opus if this change is high risk.
```

The default guidance uses Sonnet 5 for broad coverage and reserves Opus 4.8 for high-risk or deep reviews.

### `$rescue`

Asks Claude for a rescue-style pass: investigation, diagnosis, root-cause analysis, or a follow-up fix plan.

Use it when you want Claude to:

- investigate a failing test or bug;
- explain a confusing failure;
- propose the smallest safe fix;
- try a constrained patch only when you explicitly ask for a fix.

Example prompts:

```text
Use $rescue to ask Claude why this test is failing.
Use $rescue to get a fix plan for this regression.
Use $rescue to ask Claude to try a constrained fix for the failing parser test.
```

If you do not explicitly ask for a fix, `$rescue` should keep Claude in investigation and planning mode.

## Model Selection

Claude Bridge normalizes common shorthand before calling Claude CLI:

- `sonnet5` or `sonnet-5` -> `claude-sonnet-5`
- `opus4.8` or `opus 4.8` -> `claude-opus-4-8`

Default model policy:

- Use `claude-sonnet-5` for ordinary reviews, broad multi-review coverage, smoke checks, debugging, and fix planning.
- Use `claude-opus-4-8` sparingly because it is expensive.
- Prefer Opus only for high-risk security, data loss, migrations, concurrency, rollback/idempotency, complex architecture, or final tie-breaker review.

## Safety Rules

Claude Bridge treats Claude output as advisory. Codex should verify findings locally before acting on them.

Review and adversarial-review runs are read-only. They explicitly tell Claude:

- do not edit files;
- do not run workflows, CI, deployment scripts, release tasks, or workflow automation unless the user explicitly and directly instructs that exact command;
- use read-only inspection and lightweight local commands only when needed to ground findings.

A general review request is not permission to run CI, deploy, release, or trigger workflow automation.

## Output Handling

The helper captures Claude output to files under:

```text
.codex/claude-bridge/
```

Claude JSON output should be read from the `result` field. Logs should be inspected only for failures.

## Relationship To Codex Plugin CC

Claude Bridge is inspired by the workflow shape of `openai/codex-plugin-cc`, but it goes in the opposite direction:

- `codex-plugin-cc` lets Claude Code users delegate work to Codex.
- Claude Bridge lets Codex users ask the local Claude CLI for review, adversarial review, and rescue passes.

## Repository Layout

```text
.codex-plugin/
  plugin.json
skills/
  review/
  adversarial-review/
  rescue/
prompts/
  review.md
  adversarial-review.md
  rescue.md
scripts/
  claude-bridge.mjs
```
