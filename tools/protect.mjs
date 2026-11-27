#!/usr/bin/env node
// The protected core tests (tests/protected.json): the tests whose expectations change only with the maintainer's approval.
// Each entry keeps a hash of the test's body and of the file's top-level declarations it uses (its helpers), with comments
// and layout taken out, and how many times it calls assert. tests/protected.test.mjs fails when a protected test is gone
// (deleted or renamed), its hash changed (an assertion weakened, dropped or edited, or a helper changed), or it no longer
// runs: node --test runs it only as a statement at the top level or in the callback of a describe, suite, test or it, so
// one wrapped in a skipped describe, an if, a function or an expression is reported, and so is one whose test (or the describe
// around it) is bound to anything but node:test's own (import { skip as test } from 'node:test'). A protected test whose
// assert is not node:assert's own (imported from another module, or patched or handed on in the file, assert.equal = ...,
// const a = assert) asserts nothing and is reported, also when it asserts through a helper; an entry also records where
// each name it uses is imported from, and a changed import is a change.
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
  const depthAt = [], parent = [], opener = []; // depth before each significant token; the open bracket around it; a close's open
  let depth = 0;
  const stack = [];
  for (let k = 0; k < sig.length; k++) {
    const t = sig[k];
    depthAt.push(depth); parent.push(stack.length ? stack[stack.length - 1] : -1);
    if (t.type === 'punct' && OPEN.has(t.text)) { depth++; stack.push(k); }
    else if (t.type === 'punct' && CLOSE.has(t.text)) { depth = Math.max(0, depth - 1); opener[k] = stack.length ? stack.pop() : -1; }
  }
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
  // how the file binds test, it, describe and suite: node --test runs a test only through node:test's own test (it, only,
  // its default export) or, around it, describe (suite); `import { skip as test } from 'node:test'`, a name imported from
  // another module, or one declared in the file (const test = skip) makes every call of it no test that runs (audit 66).
  // A name the file never binds is a ReferenceError, which fails the run on its own
  const imports = new Map(), declared = new Set(), sideEffects = [], importAt = new Set(); // importAt: tokens of import statements
  for (let k = 0; k < sig.length; k++) {
    const t = sig[k];
    if (t.type !== 'id' || ['.', '?.'].includes(sig[k - 1]?.text)) continue;
    if (t.text === 'import' && depthAt[k] === 0 && !['(', '.'].includes(sig[k + 1]?.text)) {
      const named = [];
      let q = k + 1;
      for (; q < sig.length && sig[q].text !== ';' && !(sig[q].text === 'from' && sig[q + 1]?.type === 'str') && sig[q].type !== 'str'; q++) {
        if (sig[q].text === '{') { // { a, b as c, default as d }
          const e = close(q);
          for (let r = q + 1; r < e; r++) {
            if (sig[r].text === ',') continue;
            const name = literal(sig[r]) ?? sig[r].text;
            if (sig[r + 1]?.text === 'as') { named.push([sig[r + 2]?.text, name]); r += 2; } else named.push([sig[r].text, name]);
          }
          q = e;
        } else if (sig[q].text === '*' && sig[q + 1]?.text === 'as') { named.push([sig[q + 2]?.text, '*']); q += 2; }
        else if (sig[q].type === 'id' && sig[q].text !== 'type') named.push([sig[q].text, 'default']);
      }
      for (let r = k; r <= q + 1 && r < sig.length; r++) importAt.add(r);
      const from = sig[q]?.type === 'str' ? sig[q] : sig[q + 1];
      const module = literal(from) ?? '';
      for (const [local, imported] of named) if (local) imports.set(local, { module, imported });
      if (!named.length && sig[k + 1]?.type === 'str') sideEffects.push(module); // import './setup.mjs': run for what it does
      continue;
    }
    if (!DECL.has(t.text)) continue;
    let q = k + 1;
    if (sig[q]?.text === '*') q++;
    if (sig[q]?.type === 'id') declared.add(sig[q].text);
    else if (sig[q]?.text === '{' || sig[q]?.text === '[') for (let r = q + 1, e = close(q); r < e; r++) if (sig[r].type === 'id' && sig[r + 1]?.text !== ':') declared.add(sig[r].text);
  }
  const RUNS = { test: ['test', 'it', 'only', 'default'], it: ['test', 'it', 'only', 'default'], describe: ['describe', 'suite'], suite: ['describe', 'suite'] };
  const rebound = name => {
    const b = imports.get(name);
    if (b && !(b.module === 'node:test' && RUNS[name].includes(b.imported))) {
      return b.module !== 'node:test' ? `${name} is imported from ${b.module || 'elsewhere'}, not node:test` : b.imported === '*' ? `${name} is node:test's namespace` : `${name} is node:test's ${b.imported}`;
    }
    return declared.has(name) ? `${name} is declared in the file, not node:test's ${name}` : null;
  };
  // how the file binds assert: a protected test's assertions assert only through node:assert's own (its default export,
  // strict or the namespace), or through a top-level declaration, which the hash covers as a helper. One imported from
  // another module, used with no binding in the file (a global another module set), or patched in the file
  // (assert.equal = ..., delete assert.ok, Object.assign(assert, ...)) lets every assertion pass (audit 67). Patches take
  // more forms than a list of them can hold ((assert).equal = ..., const a = assert; a.equal = ..., a loop over its keys:
  // audit 68), so every use of assert is read: it is called (assert(...), assert.equal(...)), declared, named as a
  // property, or a method read (assert.equal, not assert.strict, which is assert again); any other use hands assert on
  // where it can be changed
  const ASSERTS = ['node:assert', 'node:assert/strict', 'assert', 'assert/strict'], PATCH = ['assign', 'defineProperty', 'defineProperties', 'setPrototypeOf', 'set', 'deleteProperty', 'method', 'getter', 'setter'];
  let assertWhy = null;
  const a = imports.get('assert');
  if (a && !(ASSERTS.includes(a.module) && ['default', 'strict', '*'].includes(a.imported))) {
    assertWhy = !ASSERTS.includes(a.module) ? `assert is imported from ${a.module || 'elsewhere'}, not node:assert` : `assert is node:assert's ${a.imported}`;
  } else if (!a && !sig.some((x, k) => x.text === 'assert' && depthAt[k] === 0 && DECL.has(sig[k - 1]?.text))) assertWhy = 'assert is not imported from node:assert';
  for (let k = 0; k < sig.length && !assertWhy; k++) {
    if (sig[k].text !== 'assert' || sig[k].type !== 'id' || ['.', '?.'].includes(sig[k - 1]?.text) || importAt.has(k)) continue;
    const line = `line ${src.slice(0, sig[k].start).split('\n').length}`;
    let m = k + 1, computed = false, last = null;
    for (;;) {
      if (['.', '?.'].includes(sig[m]?.text) && sig[m + 1]?.type === 'id') { last = sig[m + 1].text; m += 2; }
      else if (sig[m]?.text === '[') { computed = true; m = close(m) + 1; }
      else break;
    }
    const c = parent[k];
    if ((m > k + 1 && /^(=|[-+*/%&|^]=|&&=|\|\|=|\?\?=|\+\+|--)$/.test(sig[m]?.text ?? '')) || (m > k + 1 && ['delete', '++', '--'].includes(sig[k - 1]?.text))
      || (c === k - 1 && sig[c].text === '(' && PATCH.includes(sig[c - 1]?.text))) { assertWhy = `assert is changed in the file (${line})`; continue; }
    if (sig[m]?.text === '(' || (sig[m]?.text === '?.' && sig[m + 1]?.text === '(')) continue; // a call
    if (DECL.has(sig[k - 1]?.text) || sig[k - 1]?.text === 'typeof') continue; // its declaration (a top-level one is a helper)
    if (['{', ','].includes(sig[k - 1]?.text) && sig[k + 1]?.text === ':') continue; // a property's name, { assert: ... }
    if (m > k + 1 && !computed && last !== 'strict') continue; // a method or class read: assert.equal, assert.AssertionError
    assertWhy = `assert is handed on in the file, where it can be changed (${line})`;
  }
  // why the call whose name is at j would not run as a test, or null when it runs: node --test runs a test written as a
  // statement at the top level or in the callback of a describe, suite, test or it that is not skipped
  const off = j => {
    for (;;) {
      const why = rebound(sig[j].text);
      if (why) return why;
      let s = j;
      if (sig[s - 1]?.text === 'await') s--;
      const p = sig[s - 1];
      if (p && p.text === ')' && /^(if|for|while|with)$/.test(sig[opener[s - 1] - 1]?.text)) return `after ${sig[opener[s - 1] - 1].text} (...)`;
      if (p && p.text !== ';' && p.text !== '{' && p.text !== '}' && p.text !== '=>' && !(newLine(s) && !GOES_ON.has(p.text) && !['else', 'do', 'return', 'void', 'typeof', 'new', 'yield', '!'].includes(p.text))) return `after ${p.text}`;
      const b = parent[s];
      if (b < 0) return null;
      // the function around it: an arrow's expression body, or a block that is an arrow's or a function's body
      let f;
      if (p?.text === '=>' && sig[b].text === '(') f = s - 1;
      else if (sig[b].text === '{' && sig[b - 1]?.text === '=>') f = b - 1;
      else if (sig[b].text === '{' && sig[b - 1]?.text === ')' && sig[opener[b - 1] - 1]?.text === 'function') f = opener[b - 1] - 1;
      else if (sig[b].text === '{') {
        const o = sig[b - 1]?.text === ')' ? sig[opener[b - 1] - 1]?.text : sig[b - 1]?.text;
        return o && /^(if|else|for|while|do|try|catch|finally|switch|with)$/.test(o) ? `inside ${o} { ... }` : 'inside a block that is no test callback';
      } else return 'inside an expression';
      if (sig[f].text === '=>') f = sig[f - 1]?.text === ')' ? opener[f - 1] : f - 1; // the arrow's parameters
      if (sig[f - 1]?.text === 'async') f--;
      const c = parent[f]; // the call the function is passed to
      if (c < 0 || sig[c].text !== '(' || !['(', ','].includes(sig[f - 1]?.text)) return 'inside a function that is no test callback';
      let n = c - 1;
      const mod = sig[n - 1]?.text === '.' ? sig[n].text : null;
      if (mod) n -= 2;
      if (sig[n]?.type !== 'id' || !['describe', 'suite', 'test', 'it'].includes(sig[n].text) || (mod && mod !== 'only') || ['.', '?.'].includes(sig[n - 1]?.text)) {
        return mod === 'skip' || mod === 'todo' ? `inside ${sig[n].text}.${mod}` : 'inside a function that is no test callback';
      }
      const options = k => sig[parent[k]]?.text === '{' && parent[parent[k]] === c && !['=>', ')'].includes(sig[parent[k] - 1]?.text);
      for (let k = c + 1; k < close(c); k++) if (options(k)) {
        if ((sig[k].text === 'skip' || sig[k].text === 'todo') && sig[k + 1]?.text !== '(' && !(sig[k + 1]?.text === ':' && ['false', 'undefined', 'null', '0', "''", '""'].includes(sig[k + 2]?.text))) return `inside ${sig[n].text}(..., { ${sig[k].text} })`;
      }
      j = n;
    }
  };
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
      tests.set(key, { off: off(j), body: normalized(toks, t.k, sig[end].k), asserts: sig.slice(p, end).filter((x, i, a) => x.type === 'id' && x.text === 'assert' && a[i - 1]?.text !== '.').length, refs: refs(j, end) });
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
  return { tests, decls, imports, sideEffects, assertWhy };
}

const RUNNERS = ['test', 'it', 'describe', 'suite']; // checked by scan() as how the test runs, not recorded as imports

// what an entry records of one test: the hash of its body and its helpers, its assert count, its helpers' names, and where
// each name it and its helpers import comes from, with the modules the file imports only to run them (audit 67: an
// import swapped for a module that does nothing changes neither the body nor a helper)
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
  const used = new Set([...t.refs, ...names.flatMap(n => [...scanned.decls.get(n).refs])]);
  const imports = [...used].filter(n => scanned.imports.has(n) && !RUNNERS.includes(n)).sort().map(n => `${n}: ${scanned.imports.get(n).module} ${scanned.imports.get(n).imported}`);
  return { sha256, asserts: t.asserts, helpers: names, imports: [...imports, ...[...new Set(scanned.sideEffects)].sort()] };
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
      else if (scanned.tests.get(title).off) problems.push({ file, title, problem: `no longer runs (${scanned.tests.get(title).off})`, was, now });
      else if (asserting(scanned, title)) problems.push({ file, title, problem: `no longer asserts (${asserting(scanned, title)})`, was, now });
      else if (now.sha256 !== was.sha256) {
        const why = [now.asserts !== was.asserts ? `asserts ${was.asserts} -> ${now.asserts}` : 'its body or a helper changed'];
        const lost = was.helpers.filter(h => !now.helpers.includes(h)), added = now.helpers.filter(h => !was.helpers.includes(h));
        if (lost.length) why.push(`no longer uses ${lost.join(', ')}`);
        if (added.length) why.push(`now uses ${added.join(', ')}`);
        problems.push({ file, title, problem: `changed (${why.join('; ')})`, was, now });
      } else if (was.imports) { // an entry recorded before audit 67 has no imports to compare
        const lost = was.imports.filter(i => !now.imports.includes(i)), added = now.imports.filter(i => !was.imports.includes(i));
        if (lost.length || added.length) problems.push({ file, title, problem: `changed (its imports: ${[...lost.map(i => `was ${i}`), ...added.map(i => `now ${i}`)].join('; ')})`, was, now });
      }
    }
  }
  return problems;
}

// why a test that calls assert, itself or through a helper it uses, would pass whatever it asserts, or null (a test that
// asserts only through a helper was not reported, audit 68)
const asserting = (scanned, title) => {
  if (!scanned.assertWhy) return null;
  const seen = new Set(), todo = [...scanned.tests.get(title).refs];
  while (todo.length) {
    const n = todo.pop();
    if (n === 'assert') return scanned.assertWhy;
    if (seen.has(n) || !scanned.decls.has(n)) continue;
    seen.add(n); todo.push(...scanned.decls.get(n).refs);
  }
  return null;
};

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
      if (scanned.tests.get(title).off) throw new Error(`${f}: "${title}" does not run (${scanned.tests.get(title).off})`);
      if (asserting(scanned, title)) throw new Error(`${f}: "${title}" does not assert (${asserting(scanned, title)})`);
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
    if (scanned.tests.get(title).off) throw new Error(`${file}: "${title}" does not run (${scanned.tests.get(title).off})`);
    if (asserting(scanned, title)) throw new Error(`${file}: "${title}" does not assert (${asserting(scanned, title)})`);
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
