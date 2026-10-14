/* PreToolUse hook: refuse a whole-file Write to the wall's shared files.

   index.html, style.css and main.js at the repo root collect one entry per tile, and more
   than one session is often adding a tile at the same time. CLAUDE.md says to append or edit
   them in place and never rewrite one wholesale; this makes that a rule rather than a
   memory. Edit is untouched, and so is tools/build-wall.js (it writes index.html from Node,
   not through the Write tool). A file that does not exist yet is not refused.

   Reads the hook's JSON on stdin; prints a deny decision, or nothing to let the call through. */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SHARED = ['index.html', 'style.css', 'main.js'].map((f) => path.join(ROOT, f).toLowerCase());

let raw = '';
process.stdin.on('data', (d) => (raw += d));
process.stdin.on('end', () => {
  let input;
  try { input = JSON.parse(raw); } catch (e) { return; }
  if (input.tool_name !== 'Write') return;
  const file = input.tool_input && input.tool_input.file_path;
  if (!file) return;
  const full = path.resolve(input.cwd || ROOT, file);
  if (!SHARED.includes(full.toLowerCase()) || !fs.existsSync(full)) return;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: path.basename(full) + ' is shared by every tile and other sessions may be adding to it right now. '
        + 'Use Edit to change it in place (append or edit, never rewrite it wholesale), as CLAUDE.md says. '
        + 'index.html between the wall:begin / wall:end markers is written by node tools/build-wall.js.',
    },
  }));
});
