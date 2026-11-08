# Working in this repo

Project instructions live in `CLAUDE.md`.

## Editing rules

Small local models have corrupted files in this repo by editing from memory.

- Read a file immediately before editing it; never edit from memory. An edit whose search text
  does not match means the file changed — re-read it, do not retry the same text.
- This repo is plain JS on GitHub Pages: after editing a `.js` file, `node --check <file>`.
  Aider runs that automatically (`auto-lint` in `.aider.conf.yml`).

Tool-specific mechanics (diff-only output, one change per request, repo map) live in
`CONVENTIONS.md`, which `.aider.conf.yml` loads for aider. Do not copy those rules here.
