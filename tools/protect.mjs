#!/usr/bin/env node
// The protected core tests (tests/protected.json): the tests whose expectations change only with the maintainer's approval.
// Each entry keeps a hash of the test's body and of the file's top-level declarations it uses (its helpers), with comments
// and layout taken out, and how many times it calls assert. tests/protected.test.mjs fails when a protected test is gone
// (deleted or renamed) or its hash changed (an assertion weakened, dropped or edited, or a helper changed).
//
//   node tools/protect.mjs                          check every entry; exit 1 on a problem
//   node tools/protect.mjs --list                   print the entries
//   node tools/protect.mjs --update [file [title]]  the maintainer, after approving a change: record the hashes again
//   node tools/protect.mjs --add file title...      protect more tests (their hashes recorded now)
//   node tools/protect.mjs --remove file title...   protect fewer
//   --root dir                                      the repository to work on (default: this one)
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenize, significant, normalized, literal } from './jsscan.mjs';

export const LIST = 'tests/protected.json';
const OPEN = new Set(['(', '[', '{']), CLOSE = new Set([')', ']', '}']);
const DECL = new Set(['const', 'let', 'var', 'function', 'class']);
// a token at the start of a line ends a const statement with no semicolon unless the line before ends in, or this line
// starts with, one of these
const GOES_ON = new Set([',', '=', '=>', '(', '[', '{', '?', ':', '+', '-', '*', '/', '%', '&&', '||', '??', '.', '?.', '&', '|', '^', '<', '>', '<=', '>=', '==', '===', '!=', '!==', 'in', 'of', 'instanceof']);

// the tests a file declares with a literal title, and its top-level declarations
export function scan(src) {
  const toks = tokenize(src), sig = significant(toks), tests = new Map(), decls = new Map();
  const depthAt = []; // depth before each significant token
  let depth = 0;
  for (const t of sig) { depthAt.push(depth); if (t.type === 'punct' && OPEN.has(t.text)) depth++; else if (t.type === 'punct' && CLOSE.has(t.text)) depth = Math.max(0, depth - 1); }
  const close = j => { // index in sig of the bracket that closes the one at j
    let d = 0;
    for (let k = j; k < sig.length; k++) {
      if (sig[k].type !== 'punct') continue;
      if (OPEN.has(sig[k].text)) d++; else if (CLOSE.has(sig[k].text) && --d === 0) return k;
    }
    return sig.length - 1;
  };
  const refs = (from, to) => { // names used (not as a property after . or ?.)
    const s = new Set();
    for (let k = from; k <= to; k++) if (sig[k].type === 'id' && !(k > 0 && (sig[k - 1].text === '.' || sig[k - 1].text === '?.'))) s.add(sig[k].text);
    return s;
  };
  const newLine = k => /\n/.test(src.slice(sig[k - 1].end, sig[k].start));
  for (let j = 0; j < sig.length; j++) {
    const t = sig[j], prev = sig[j - 1];
    if (t.type !== 'id' || (prev && (prev.text === '.' || prev.text === '?.'))) continue;
    if ((t.text === 'test' || t.text === 'it')) {
      let p = j + 1;
      if (sig[p]?.text === '.' && ['skip', 'only', 'todo'].includes(sig[p + 1]?.text)) p += 2;
      if (sig[p]?.text !== '(') continue;
      const title = literal(sig[p + 1]);
      if (title === null) continue;
      const end = close(p);
      let key = title;
      for (let n = 2; tests.has(key); n++) key = `${title} #${n}`;
      tests.set(key, { body: normalized(toks, t.k, sig[end].k), asserts: sig.slice(p, end).filter((x, i, a) => x.type === 'id' && x.text === 'assert' && a[i - 1]?.text !== '.').length, refs: refs(j, end) });
      continue;
    }
    if (depthAt[j] !== 0) continue;
    let start = j;
    if (t.text === 'async' && sig[j + 1]?.text === 'function') j++;
    const kw = sig[j].text;
    if (!DECL.has(kw)) continue;
    let end, names = [];
    if (kw === 'function' || kw === 'class') {
      let k = j + 1;
      if (sig[k]?.text === '*') k++;
      if (sig[k]?.type === 'id') names.push(sig[k].text);
      while (k < sig.length && !(sig[k].text === '{' && depthAt[k] === 0)) k++;
      end = close(k);
    } else {
      let k = j + 1;
      const pattern = () => { const e = close(k); for (let q = k + 1; q < e; q++) if (sig[q].type === 'id' && sig[q + 1]?.text !== ':') names.push(sig[q].text); k = e + 1; };
      if (sig[k]?.type === 'id') names.push(sig[k].text); else if (sig[k]?.text === '{' || sig[k]?.text === '[') pattern();
      for (k = k + 1; k < sig.length; k++) {
        if (depthAt[k] !== 0) continue;
        const x = sig[k];
        if (x.text === ';') break;
        if (newLine(k) && !GOES_ON.has(sig[k - 1].text) && !GOES_ON.has(x.text) && x.text !== ')' && x.text !== ']' && x.text !== '}') { k--; break; }
        if (x.text === ',') { const n = sig[k + 1]; if (n?.type === 'id') names.push(n.text); else if (n?.text === '{' || n?.text === '[') { k++; pattern(); k--; } }
      }
      end = Math.min(k, sig.length - 1);
    }
    const decl = { text: normalized(toks, sig[start].k, sig[end].k), refs: refs(j + 1, end), names };
    for (const n of names) if (!decls.has(n)) decls.set(n, decl);
    j = end;
  }
  return { tests, decls };
}

// what an entry records of one test: the hash of its body and its helpers, its assert count and its helpers' names
export function record(src, title, scanned = scan(src)) {
  const t = scanned.tests.get(title);
  if (!t) return null;
  const helpers = new Set(), todo = [...t.refs];
  while (todo.length) {
    const n = todo.pop();
    if (helpers.has(n) || !scanned.decls.has(n)) continue;
    helpers.add(n); todo.push(...scanned.decls.get(n).refs);
  }
  const names = [...helpers].sort(), texts = [...new Set(names.map(n => scanned.decls.get(n).text))];
  const sha256 = createHash('sha256').update([t.body, ...texts].join('\n')).digest('hex').slice(0, 16);
  return { sha256, asserts: t.asserts, helpers: names };
}

export const readList = root => JSON.parse(readFileSync(join(root, LIST), 'utf8'));
const writeList = (root, list) => writeFileSync(join(root, LIST), JSON.stringify(list, null, 2) + '\n');

// every protected test that is gone or changed: [{ file, title, problem, was, now }]
export function check(root, list = readList(root)) {
  const problems = [];
  for (const [file, entries] of Object.entries(list.tests)) {
    if (!existsSync(join(root, file))) { for (const title of Object.keys(entries)) problems.push({ file, title, problem: 'its file is gone' }); continue; }
    const src = readFileSync(join(root, file), 'utf8'), scanned = scan(src);
    for (const [title, was] of Object.entries(entries)) {
      const now = record(src, title, scanned);
      if (!now) problems.push({ file, title, problem: 'gone: deleted or renamed', was });
      else if (now.sha256 !== was.sha256) {
        const why = [now.asserts !== was.asserts ? `asserts ${was.asserts} -> ${now.asserts}` : 'its body or a helper changed'];
        const lost = was.helpers.filter(h => !now.helpers.includes(h)), added = now.helpers.filter(h => !was.helpers.includes(h));
        if (lost.length) why.push(`no longer uses ${lost.join(', ')}`);
        if (added.length) why.push(`now uses ${added.join(', ')}`);
        problems.push({ file, title, problem: `changed (${why.join('; ')})`, was, now });
      }
    }
  }
  return problems;
}

export const say = p => `${p.file}: "${p.title}": ${p.problem}`;

// record the hashes again for every entry, or those of one file, or of some titles in it; a title not found is an error
export function update(root, file, titles = []) {
  const list = readList(root), done = [];
  for (const [f, entries] of Object.entries(list.tests)) {
    if (file && f !== file) continue;
    const src = readFileSync(join(root, f), 'utf8'), scanned = scan(src);
    for (const title of Object.keys(entries)) {
      if (titles.length && !titles.includes(title)) continue;
      const now = record(src, title, scanned);
      if (!now) throw new Error(`${f}: no test titled "${title}" (renamed? --remove it and --add the new title)`);
      entries[title] = now; done.push(`${f}: "${title}"`);
    }
  }
  if (file && !list.tests[file]) throw new Error(`${file} has no protected tests`);
  writeList(root, list);
  return done;
}

export function add(root, file, titles) {
  const list = readList(root), src = readFileSync(join(root, file), 'utf8'), scanned = scan(src), entries = list.tests[file] ||= {};
  for (const title of titles) {
    const now = record(src, title, scanned);
    if (!now) throw new Error(`${file}: no test titled "${title}" (only tests with a literal title can be protected)`);
    entries[title] = now;
  }
  writeList(root, list);
}

export function remove(root, file, titles) {
  const list = readList(root), entries = list.tests[file];
  for (const title of titles) {
    if (!entries || !(title in entries)) throw new Error(`${file}: "${title}" is not protected`);
    delete entries[title];
  }
  if (entries && !Object.keys(entries).length) delete list.tests[file];
  writeList(root, list);
}

function main(argv) {
  let root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const r = argv.indexOf('--root');
  if (r >= 0) { root = argv[r + 1]; argv.splice(r, 2); }
  const [cmd, file, ...titles] = argv;
  try {
    if (cmd === '--update') { for (const d of update(root, file, titles)) console.log(`recorded ${d}`); return 0; }
    if (cmd === '--add' || cmd === '--remove') {
      if (!file || !titles.length) { console.error(`usage: node tools/protect.mjs ${cmd} tests/x.test.mjs "title" ...`); return 2; }
      (cmd === '--add' ? add : remove)(root, file, titles); console.log(`${cmd === '--add' ? 'protected' : 'unprotected'} ${titles.length} in ${file}`); return 0;
    }
    if (cmd === '--list') { for (const [f, e] of Object.entries(readList(root).tests)) for (const [t, v] of Object.entries(e)) console.log(`${f}: "${t}" (${v.asserts} asserts${v.helpers.length ? '; helpers ' + v.helpers.join(', ') : ''})`); return 0; }
    if (cmd) { console.error(`unknown option ${cmd}`); return 2; }
    const problems = check(root);
    for (const p of problems) console.log(say(p));
    const n = Object.values(readList(root).tests).reduce((s, e) => s + Object.keys(e).length, 0);
    console.log(problems.length ? `${problems.length} of ${n} protected tests gone or changed: ask the maintainer, who runs node tools/protect.mjs --update after approving` : `${n} protected tests as recorded`);
    return problems.length ? 1 : 0;
  } catch (e) { console.error(e.message); return 1; }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = main(process.argv.slice(2));
