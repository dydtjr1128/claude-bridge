# Repository Instructions

## Language And Formatting

- Write project docs, commit subjects, commit bodies, and release notes in English.
- Keep bullet lists compact: use one to four bullets per list and do not put blank lines between bullet items.
- Keep README structure, installation flow, and terminology consistent across Claude Bridge and Antigravity Bridge.

## Git And Release

- Use concise English commit subjects.
- Use commit bodies only when useful; if used, keep bullet lines adjacent with no blank lines between them.
- Before pushing, verify `git diff --check` and inspect commit messages for non-ASCII text and repeated blank lines.
- For release tags, create or move `v1.0.0` at the current release commit and push the tag when requested.

## Web Access

- If browser or web search tools hit certificate errors, first try a CLI fallback such as `curl-cffi get https://www.naver.com`.
- If a required URL still times out after that fallback, treat a corporate Wi-Fi firewall as a possible cause and report only that possibility.

## Worktree Safety

- Do not stage unrelated local changes; commit only the requested files.
- Preserve user edits in the worktree unless explicitly asked to change them.
