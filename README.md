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

When you explicitly want executable validation, run the setup diagnostic:

```powershell
node .\scripts\claude-bridge.mjs setup
```

The review skills do not run this diagnostic automatically. A review or investigation request alone is not explicit user intent to validate executables.

## Install

Clone the plugin into your personal Codex plugin folder:

```powershell
mkdir $HOME\plugins -Force
git clone https://github.com/dydtjr1128/claude-bridge.git $HOME\plugins\claude-bridge
```

Add it to your personal Codex marketplace at `~/.agents/plugins/marketplace.json`. If you already have a personal marketplace file, add this object to its `plugins` array:

```json
{
  "name": "claude-bridge",
  "source": {
    "source": "local",
    "path": "./plugins/claude-bridge"
  },
  "policy": {
    "installation": "AVAILABLE",
    "authentication": "ON_INSTALL"
  },
  "category": "Productivity"
}
```

If you do not have a personal marketplace file yet, create one:

```json
{
  "name": "personal",
  "interface": {
    "displayName": "Personal"
  },
  "plugins": [
    {
      "name": "claude-bridge",
      "source": {
        "source": "local",
        "path": "./plugins/claude-bridge"
      },
      "policy": {
        "installation": "AVAILABLE",
        "authentication": "ON_INSTALL"
      },
      "category": "Productivity"
    }
  ]
}
```

Install the plugin:

```powershell
codex plugin add claude-bridge@personal
```

Then start a new Codex thread so the plugin skills are loaded.

Run the setup check:

```powershell
node $HOME\plugins\claude-bridge\scripts\claude-bridge.mjs setup
```

The setup check verifies that the local Claude CLI is installed, authenticated enough for print mode, and able to answer with `OK`.

After installation, Codex should expose these skills:

```text
$review
$adversarial-review
$rescue
```

One simple first run is:

```text
Use $review to ask Claude to review my local changes.
```

## Usage

Claude Bridge includes a small companion script inspired by the helper-runtime pattern in `openai/codex-plugin-cc`.

```powershell
node .\scripts\claude-bridge.mjs setup
node .\scripts\claude-bridge.mjs review --scope "current git diff in this repository"
node .\scripts\claude-bridge.mjs adversarial-review --scope "current git diff in this repository"
node .\scripts\claude-bridge.mjs rescue --scope "the failing parser test"
```

The skills prefer this helper because it normalizes model names, stores prompts/logs/results, and keeps the reviewer prompt consistent. Review-oriented commands accept `--timeout <duration>` using `ms`, `s`, `m`, or combined values such as `10m0s`. The default hard timeout is `10m0s`, `15m0s` for model names containing `opus`, or `20m0s` for model names containing `fable`.

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

The default guidance uses Sonnet 5. Opus 4.8 and `--deep` require explicit user intent; risk or complexity alone does not select them.

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
- `opus4.8`, `opus-4-8`, or `opus 4.8` -> `claude-opus-4-8`

Default model policy:

- Use `claude-sonnet-5` for the default review, challenge pass, investigation, and fix planning.
- Use `claude-opus-4-8` or `--deep` only when the user explicitly requests Opus.
- Do not add reviewers, retry, or switch models automatically after a failed or incomplete pass.

## Safety Rules

Claude Bridge treats Claude output as advisory. Codex should verify findings locally before acting on them.

Review and adversarial-review runs are read-only. All three modes use the same bounded execution contract:

The helper runs Claude Code with safe mode, no MCP configuration, slash commands disabled, Chrome disabled, built-in tools limited to `Read`, `Glob`, `Grep`, and `Bash`, and `dontAsk` permission mode.

Do not execute project code or validation commands unless the user explicitly and directly requests that execution. This includes tests, builds, package managers, scripts, servers, applications, CI, deployment, release, and workflow automation. A review or investigation request alone is not permission to execute them.
Read-only repository inspection commands required to obtain the requested scope are allowed, including `git diff`, `git status`, `git show`, `git log`, `git blame`, and `git ls-files`. Shell commands must not be used for any other purpose or modify files, the index, refs, configuration, or other repository state.
Complete one bounded pass within the helper-selected timeout: ten minutes for standard models, fifteen minutes for model names containing `opus`, and twenty minutes for model names containing `fable`.
Do not retry, add reviewers, expand the scope, or switch to a deeper model automatically.
If the available time or evidence is insufficient, return the supported findings and state the remaining gap.

Local verification is limited to static file and line inspection. Executable validation, Opus, `--deep`, retries, and fixes each require explicit user intent.

## Output Handling

The helper captures Claude output to files under:

```text
.codex/claude-bridge/
```

Claude JSON output should be read from the `result` field. Logs should be inspected only for failures.

Machine-readable helper results include `timeout` and `timedOut` metadata. A timed-out run preserves any partial provider output, returns failure, and is not retried automatically.

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
