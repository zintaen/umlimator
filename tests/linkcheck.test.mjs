// The deployed site's link check (tools/linkcheck.mjs, CI's site-links job after the Pages deploy), run against a small
// site served here: it crawls the site's pages from the root, checks every internal link, frame, picture, script and
// stylesheet answers 200, names each broken one with the page that links it, and leaves other sites alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { promisify } from 'node:util';

const tool = new URL('../tools/linkcheck.mjs', import.meta.url).pathname;

// a site under /umlimator/: path -> [status, content type, body]
const SITE = {
  '/umlimator/': [200, 'text/html', `<a href="start/">Start</a> <a href="#top">top</a> <a href="https://example.com/away">away</a>
    <link rel="stylesheet" href="/umlimator/assets/site.css"><script type="module" src="./assets/app.js"></script>
    <script>const s = "<a href='never-read.html'>";</script><a href="mailto:x@y.z">mail</a>`],
  '/umlimator/start/': [200, 'text/html; charset=utf-8', `<a href="../use/index.html?x=1&amp;y=2#part">Use</a>
    <iframe src="../examples/map.html"></iframe><img srcset="../assets/a.png 1x, ../assets/b.png 2x">`],
  '/umlimator/use/index.html': [200, 'text/html', `<a href="/umlimator/">home</a> <a href="/elsewhere/page.html">not ours</a>`],
  '/umlimator/examples/map.html': [200, 'text/html', `<a href="never-crawled.html">a link inside an example</a>`],
  '/umlimator/assets/site.css': [200, 'text/css', 'body{}'],
  '/umlimator/assets/app.js': [200, 'text/javascript', ''],
  '/umlimator/assets/a.png': [200, 'image/png', ''],
  '/umlimator/assets/b.png': [200, 'image/png', ''],
};

async function serve(site) {
  const seen = [];
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    seen.push(req.url);
    const [status, type, body] = site[path] || [404, 'text/html', 'not found'];
    res.writeHead(status, { 'content-type': type });
    res.end(body);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}/umlimator/`, seen, close: () => server.close() };
}

async function check(url, env = {}) {
  try {
    const r = await promisify(execFile)(process.execPath, [tool, url], { env: { ...process.env, LINKCHECK_TRIES: '1', LINKCHECK_WAIT_MS: '0', ...env } });
    return { code: 0, out: r.stdout };
  } catch (e) { return { code: e.code, out: e.stdout + e.stderr }; }
}

test('linkcheck: a site whose internal links, frames, pictures, scripts and stylesheets all answer passes, and every page is read', async () => {
  const s = await serve(SITE);
  try {
    const r = await check(s.url);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /3 page\(s\) read, \d+ internal link\(s\) checked, 0 broken/);
    for (const p of ['/umlimator/start/', '/umlimator/use/index.html?x=1&y=2', '/umlimator/examples/map.html', '/umlimator/assets/site.css', '/umlimator/assets/app.js', '/umlimator/assets/a.png', '/umlimator/assets/b.png'])
      assert.ok(s.seen.includes(p), `${p} was fetched`);
    assert.ok(!s.seen.some(p => /never-(read|crawled)|elsewhere/.test(p)), `script text, an example's own links and paths outside the site are not fetched: ${s.seen}`);
  } finally { s.close(); }
});

for (const [what, path] of [['a page', '/umlimator/use/index.html'], ['a frame', '/umlimator/examples/map.html'], ['a picture of a srcset', '/umlimator/assets/b.png'], ['a stylesheet', '/umlimator/assets/site.css']]) {
  test(`linkcheck: ${what} that answers 404 fails the run, named with the page that links it`, async () => {
    const site = { ...SITE };
    delete site[path];
    const s = await serve(site);
    try {
      const r = await check(s.url);
      assert.equal(r.code, 1, r.out);
      assert.match(r.out, new RegExp(`::error::linkcheck: ${s.url.replace('/umlimator/', '')}${path.replace(/[.?]/g, '\\$&')}\\S* \\(404\\) from ${s.url}`));
      assert.match(r.out, /1 broken/);
    } finally { s.close(); }
  });
}

test('linkcheck: a link that answers 500 fails too; one on another site is not checked', async () => {
  const s = await serve({ ...SITE, '/umlimator/assets/app.js': [500, 'text/plain', 'boom'] });
  try {
    const r = await check(s.url);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /assets\/app\.js \(500\)/);
    assert.ok(!/example\.com/.test(r.out), r.out);
  } finally { s.close(); }
});

test('linkcheck: a root that never answers 200 fails, after its tries, saying what it answered', async () => {
  const s = await serve({});
  try {
    const r = await check(s.url, { LINKCHECK_TRIES: '2' });
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /try 1 of 2/);
    assert.match(r.out, /::error::linkcheck: http:\S+\/umlimator\/ answered 404/);
  } finally { s.close(); }
});

test('linkcheck: no URL is a usage error', async () => {
  const r = await check('');
  assert.equal(r.code, 1);
  assert.match(r.out, /::error::linkcheck: usage/);
});
