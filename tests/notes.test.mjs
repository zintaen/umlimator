// Design notes that describe the code as it is: the layout-by-business-flow note (docs/diagrams/notes/layout-flow.md) names,
// in its tables of section 2, the functions today's layout runs and the file each is in. A function renamed or moved makes the
// note wrong, so each name is looked up in its file; and the docs' start page links the note.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('the layout-flow note is linked from docs/diagrams/README.md', () => {
  assert.match(read('docs/diagrams/README.md'), /\[`layout-flow\.md`\]\(notes\/layout-flow\.md\)/);
});

test('every function the layout-flow note\'s tables name is defined in the file the row names', () => {
  const note = read('docs/diagrams/notes/layout-flow.md'), rows = note.split('\n').filter(l => /^\| `[A-Za-z]\w*`.*\| `src\/[\w/.-]+\.js` \|/.test(l));
  assert.ok(rows.length >= 15, `the note's tables name the functions (${rows.length} rows)`);
  let names = 0;
  for (const row of rows) {
    const [, first, file] = row.split('|').map(c => c.trim()), src = read(file.replace(/`/g, ''));
    for (const [, name] of first.matchAll(/`([A-Za-z]\w*)`/g)) {
      names++;
      assert.match(src, new RegExp(`(function\\s+${name}\\b|\\b(const|let)\\s+${name}\\s*=|[,{]\\s*${name}\\s*=)`), `${name} in ${file}`);
    }
  }
  assert.ok(names >= 17, `names checked: ${names}`);
});
