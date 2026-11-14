// The docs-site plugins (#92), with no Markdown library installed: each is handed a ```umlimator fenced block as its host
// hands it (a markdown-it token, a remark code node) and gives back the <umlimator-map> element.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import markdownIt, { attrs } from '../lib/umlimator-markdown-it.js';
import remark from '../lib/umlimator-remark.js';
import { UmlimatorMap } from '../lib/umlimator-element.js';
import { readFileSync, readdirSync } from 'node:fs';

const md = { renderer: { rules: { fence: () => '<pre>the host\'s</pre>' } } };
markdownIt(md);
const fence = (info, content) => md.renderer.rules.fence([{ info, content }], 0, {}, {}, {});
// a code node in a blockquote, through the plugin: what it became
const viaRemark = (lang, value) => { const tree = { type: 'root', children: [{ type: 'blockquote', children: [{ type: 'code', lang, value }] }] }; remark()(tree); return tree.children[0].children[0]; };
// what remark-rehype, or MDX, writes for a node that names an element (data.hName, data.hProperties)
const asHtml = n => `<${n.data.hName}${Object.entries(n.data.hProperties).map(([k, v]) => ` ${k}="${v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}"`).join('')}></${n.data.hName}>\n`;

test('markdown-it: a block with src and view becomes the element with those attributes; other fences stay the host\'s', () => {
  assert.equal(fence('umlimator', 'src: /maps/shop.json\nview: api\nminimap: true\n'), '<umlimator-map src="/maps/shop.json" view="api" minimap="true"></umlimator-map>\n');
  assert.equal(fence('umlimator {.wide}', 'src: a.json'), '<umlimator-map src="a.json"></umlimator-map>\n');
  assert.equal(fence('umlimator', 'src: a.json\nwheel: ctrl'), '<umlimator-map src="a.json" wheel="ctrl"></umlimator-map>\n'); // a map in a document lets the page scroll
  assert.equal(fence('js', 'let x'), '<pre>the host\'s</pre>');
});

test('an inline model goes into src as a data: URL, minified, after the keys before it', () => {
  const model = { nodes: [{ id: 'a', label: 'Shop & "Co" <b>' }], views: [{ id: 'v', nodeIds: ['a'] }] };
  const out = fence('umlimator', `view: v\n${JSON.stringify(model, null, 2)}\n`), src = out.match(/ src="([^"]*)"/)[1];
  assert.match(out, /^<umlimator-map view="v" src="data:application\/json,[^"<>& ]*"><\/umlimator-map>\n$/);
  assert.equal(decodeURIComponent(src.slice('data:application/json,'.length)), JSON.stringify(model));
});

test('a block the element can\'t use fails the build: an unknown key, a broken model, neither src nor a model, or both', () => {
  assert.throws(() => attrs('veiw: api\nsrc: a.json'), /"veiw: api" is not one of src: view:/);
  assert.throws(() => attrs('{ "nodes": [ }'), SyntaxError);
  assert.throws(() => attrs('view: api'), /either src:/);
  assert.throws(() => attrs('src: a.json\n{ "nodes": [], "views": [] }'), /either src:/);
});

test('remark: the same element, from a node MDX and remark-rehype both turn into it, at any depth', () => {
  const text = 'src: maps/a & b.json\ncontrols: false\nheight: 600';
  assert.equal(asHtml(viaRemark('umlimator', text)), fence('umlimator', text));
  assert.equal(asHtml(viaRemark('umlimator', text)), '<umlimator-map src="maps/a &amp; b.json" controls="false" height="600"></umlimator-map>\n');
  assert.deepEqual(viaRemark('js', 'x'), { type: 'code', lang: 'js', value: 'x' });
});

test('the package exports the element and both plugins; the element\'s module loads in Node (a server render) and defines nothing', () => {
  const req = createRequire(import.meta.url); // a package may resolve its own name through its exports
  for (const [entry, file] of [['element', 'umlimator-element'], ['markdown-it', 'umlimator-markdown-it'], ['remark', 'umlimator-remark']]) {
    assert.match(req.resolve('umlimator/' + entry), new RegExp(`lib[\\\\/]${file}\\.js$`), entry);
  }
  assert.equal(typeof UmlimatorMap, 'function');
  assert.equal(globalThis.customElements, undefined);
});

test('every page in examples/, the gallery the site opens on included, declares its language (axe html-has-lang, audit 2)', () => {
  const dir = new URL('../examples/', import.meta.url);
  const bare = readdirSync(dir).filter(f => f.endsWith('.html') && !/<html lang="[a-z]/.test(readFileSync(new URL(f, dir), 'utf8')));
  assert.deepEqual(bare, []);
});
