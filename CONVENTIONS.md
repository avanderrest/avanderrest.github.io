# Conventions for local models

- One file and one change per request.
- Never rewrite a whole file; emit a diff hunk only.
- Copy the SEARCH section verbatim from the file, including indentation.
- Never invent code that is not in the file or the repo map.
- Static site for GitHub Pages: no server code, no secrets, no build step.
- Plain JS only, no npm packages in shipped pages; vendor libraries instead.
- After editing a .js file, run `node --check <file>` and report the result. Aider does this
  automatically; the same lint will fail on a `.py` file, so check those with
  `python -m py_compile <file>` instead.
