#!/usr/bin/env node
// The deployed site's links (.github/workflows/check.yml, job site-links, after the Pages deploy): every page of the
// documentation site is fetched from the live site, starting at its root and following its own links, and every internal
// link, frame, picture, script and stylesheet a page names must answer 200.
//
//   node tools/linkcheck.mjs <base-url>      e.g. https://zintaen.github.io/umlimator/
//
// Internal means on the base URL's origin and under its path. Pages are crawled outside <base>examples/ only: the
// rendered examples are checked to answer, not read (each is a whole model in one file, its links in script strings).
// A page is read only when it answers text/html. A fragment is dropped; a query is kept. The root is retried for a short
// while, as Pages may still be switching to the new deploy. Each broken link prints `::error::linkcheck: <url> (<status>)
// from <page>`, and the run exits 1 if there is any. Standard library only (Node 18+ fetch).
let base;
try { base = new URL(process.argv[2]); } catch { base = new URL("about:blank"); }
if (!base.pathname.endsWith("/")) base.pathname += "/";
const tries = Number(process.env.LINKCHECK_TRIES || 10), wait = Number(process.env.LINKCHECK_WAIT_MS || 15000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const internal = (u) => u.origin === base.origin && u.pathname.startsWith(base.pathname);
const crawled = (u) => !u.pathname.startsWith(base.pathname + "examples/");

// href, src and srcset values, from tags only (not from text): <a>, <link>, <iframe>, <img>, <script>, <source>
function links(html, pageUrl) {
  const out = new Set();
  const noScripts = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (m) => m.slice(0, m.indexOf(">") + 1));
  for (const tag of noScripts.matchAll(/<(a|link|iframe|img|script|source)\b[^>]*>/gi)) {
    for (const [, attr, , v1, v2] of tag[0].matchAll(/\s(href|src|srcset)\s*=\s*("([^"]*)"|'([^']*)')/gi)) {
      const vals = attr.toLowerCase() === "srcset" ? (v1 ?? v2).split(",").map((s) => s.trim().split(/\s+/)[0]) : [v1 ?? v2];
      for (const v of vals) {
        if (!v || /^(mailto:|tel:|javascript:|data:|#)/i.test(v)) continue;
        try {
          const u = new URL(v.replace(/&amp;/g, "&"), pageUrl);
          u.hash = "";
          out.add(u.href);
        } catch {}
      }
    }
  }
  return [...out];
}

async function get(url) {
  try {
    const r = await fetch(url, { redirect: "follow" });
    const html = r.ok && /text\/html/.test(r.headers.get("content-type") || "") ? await r.text() : null;
    if (!html) await r.body?.cancel();
    return { status: r.status, html };
  } catch (e) {
    return { status: `${e.cause?.code || e.message}`, html: null };
  }
}

async function main() {
  if (!/^https?:$/.test(base.protocol)) {
    console.log("::error::linkcheck: usage: node tools/linkcheck.mjs <base-url>");
    process.exit(1);
  }
  let root;
  for (let i = 1; i <= tries; i++) {
    root = await get(base.href);
    if (root.status === 200 && root.html) break;
    if (i === tries) {
      console.log(`::error::linkcheck: ${base.href} answered ${root.status}`);
      process.exit(1);
    }
    console.log(`linkcheck: ${base.href} answered ${root.status} (try ${i} of ${tries}), waiting ${wait / 1000} s`);
    await sleep(wait);
  }
  const status = new Map([[base.href, 200]]), from = new Map(), queue = [[base.href, root.html]];
  const pages = new Set([base.href]);
  const bad = [];
  while (queue.length) {
    const batch = queue.splice(0);
    const found = [];
    for (const [page, html] of batch) for (const l of links(html, page)) if (internal(new URL(l)) && !status.has(l) && !from.has(l)) { from.set(l, page); found.push(l); }
    for (let i = 0; i < found.length; i += 8) {
      await Promise.all(found.slice(i, i + 8).map(async (l) => {
        const r = await get(l);
        status.set(l, r.status);
        if (r.status !== 200) bad.push(`${l} (${r.status}) from ${from.get(l)}`);
        else if (r.html && crawled(new URL(l)) && !pages.has(l)) { pages.add(l); queue.push([l, r.html]); }
      }));
    }
  }
  for (const b of bad) console.log(`::error::linkcheck: ${b}`);
  console.log(`linkcheck: ${pages.size} page(s) read, ${status.size} internal link(s) checked, ${bad.length} broken`);
  process.exit(bad.length ? 1 : 0);
}

main();
