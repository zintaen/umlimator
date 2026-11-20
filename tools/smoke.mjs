#!/usr/bin/env node
// The release job's smoke test (.github/workflows/check.yml, job smoke): a version just published to npm under the
// `next` dist-tag is installed from the registry into an empty folder, as a host installs it, and used there before
// `latest` is moved to it.
//
//   node tools/smoke.mjs <spec> [--repo <dir>] [--no-cli]
//
// <spec> is what npm installs: umlimator@0.46.0 in the release job, or a tarball from `npm pack` (tests/smoke.test.mjs).
// --repo is a checkout of the released commit (default: this one): its smallest example model (examples/types/, by
// size) is the one used, and its CLI (umlimator.py, which the package does not ship) runs with the installed package's
// lib/ in place of its own. Steps:
//   1. install: npm install <spec> into a new empty folder; a version not yet visible on the registry is retried
//   2. node: in that folder, import umlimator and umlimator/all, read schema.json, then migrate(), validate() (no error),
//      layout() (cards placed at finite points) and check() the example's every view with umlimator/all
//   3. cli: umlimator.py render the example to a page holding the installed lib, then umlimator.py check that page in
//      headless Chrome (every view checked, no error)
// Each step prints one line; the first that fails prints `::error::smoke: <step>: <reason>` and exits 1, so the
// release job leaves `latest` where it was. Standard library and npm only.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const opt = (name, dflt) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt);
const spec = args.find((a, i) => !a.startsWith("--") && !["--repo"].includes(args[i - 1]));
const repo = resolve(opt("--repo", join(fileURLToPath(import.meta.url), "..", "..")));
const tries = Number(process.env.SMOKE_TRIES || 6), wait = Number(process.env.SMOKE_WAIT_MS || 20000);

function fail(stepName, reason) {
  console.log(`::error::smoke: ${stepName}: ${String(reason).trim().split("\n").slice(-12).join(" | ")}`);
  process.exit(1);
}

function run(cmd, argv, cwd, extra = {}) {
  const r = spawnSync(cmd, argv, { cwd, encoding: "utf8", timeout: 600000, env: { ...process.env, ...extra } });
  return { code: r.error ? -1 : r.status, out: (r.stdout || "") + (r.stderr || "") + (r.error ? r.error.message : "") };
}

if (!spec) fail("usage", "node tools/smoke.mjs <spec> [--repo <dir>] [--no-cli]");

// the example: the smallest model in examples/types/, by bytes (the same file on every run of one commit)
const typesDir = join(repo, "examples", "types");
if (!existsSync(typesDir)) fail("example", `${typesDir} does not exist: --repo must be a checkout of the released commit`);
const example = readdirSync(typesDir).filter((f) => f.endsWith(".json")).map((f) => join(typesDir, f))
  .sort((a, b) => statSync(a).size - statSync(b).size || a.localeCompare(b))[0];
if (!example) fail("example", `no model in ${typesDir}`);

// 1. install, into an empty folder that is no workspace of this repository
const dir = mkdtempSync(join(tmpdir(), "umlimator-smoke-"));
process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "smoke", private: true, type: "module" }));
let inst;
for (let i = 1; i <= tries; i++) {
  inst = run("npm", ["install", "--no-audit", "--no-fund", "--ignore-scripts", "--prefer-online", spec], dir);
  if (inst.code === 0) break;
  if (!/E404|ETARGET|No matching version/.test(inst.out) || i === tries) fail("install", `npm install ${spec}: ${inst.out}`);
  console.log(`install: ${spec} not on the registry yet (try ${i} of ${tries}), waiting ${wait / 1000} s`);
  spawnSync("sleep", [String(wait / 1000)]);
}
const pkgDir = join(dir, "node_modules", "umlimator");
const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
const want = /^umlimator@(\d[^\s]*)$/.exec(spec)?.[1];
if (want && pkg.version !== want) fail("install", `asked for ${want}, npm installed ${pkg.version}`);
console.log(`install: umlimator ${pkg.version} from ${spec} into ${dir}`);

// 2. node: a script in the clean folder, so `umlimator` resolves to what npm installed and nothing else
const probe = `
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const core = await import("umlimator"), all = await import("umlimator/all");
for (const f of ["migrate", "validate", "layout", "check", "render"]) if (typeof core[f] !== "function" || typeof all[f] !== "function") throw new Error("umlimator or umlimator/all has no " + f + "()");
const schema = JSON.parse(readFileSync(createRequire(import.meta.url).resolve("umlimator/schema.json"), "utf8"));
if (!schema.$schema) throw new Error("umlimator/schema.json is no JSON Schema");
const model = all.migrate(JSON.parse(readFileSync(process.argv[2], "utf8")));
const errors = all.validate(model).filter((p) => p.level === "error");
if (errors.length) throw new Error("validate(): " + JSON.stringify(errors.slice(0, 3)));
const views = (model.views || []).map((v) => v.id);
if (!views.length) throw new Error("the example has no view");
let cards = 0;
for (const v of views) {
  const l = all.layout(model, v);
  const placed = Object.values(l.nodes || {});
  if (!placed.length || placed.some((n) => ![n.x, n.y, n.w, n.h].every(Number.isFinite))) throw new Error("layout(" + v + ") placed no card, or one at no finite point");
  if (!Array.isArray(all.check(model, v))) throw new Error("check(" + v + ") returned no list");
  cards += placed.length;
}
console.log(JSON.stringify({ views: views.length, cards }));
`;
writeFileSync(join(dir, "probe.mjs"), probe);
const node = run(process.execPath, ["probe.mjs", example], dir);
if (node.code !== 0) fail("node", node.out);
const got = JSON.parse(node.out.trim().split("\n").pop());
console.log(`node: imported umlimator and umlimator/all ${pkg.version}; ${basename(example)}: ${got.views} view(s) laid out, ${got.cards} card(s), validate and check clean`);

// 3. cli: the released commit's CLI, drawing with the installed lib (a copy of the checkout: umlimator.py finds lib/
// beside itself, so lib/ is the package's and the rest the checkout's)
if (!args.includes("--no-cli")) {
  const cli = join(dir, "cli");
  mkdirSync(cli);
  for (const f of readdirSync(repo)) {
    if (f === "lib" || f === ".git" || f === "node_modules") continue;
    if (f.endsWith(".py")) cpSync(join(repo, f), join(cli, f));   // copied: the CLI resolves its own path to find lib/
    else symlinkSync(join(repo, f), join(cli, f));
  }
  cpSync(join(pkgDir, "lib"), join(cli, "lib"), { recursive: true });
  const page = join(dir, "page.html");
  const r = run("python3", ["umlimator.py", "render", example, "--out", page, "--no-check"], cli);
  if (r.code !== 0 || !existsSync(page)) fail("cli render", r.out);
  if (!readFileSync(page, "utf8").includes(readFileSync(join(pkgDir, "lib", "umlimator-all.js"), "utf8").slice(0, 4000)))
    fail("cli render", "the page does not hold the installed package's lib/umlimator-all.js");
  const c = run("python3", ["umlimator.py", "check", page], cli);
  let rep;
  try { rep = JSON.parse(c.out.slice(c.out.indexOf("{"))); } catch { fail("cli check", c.out); }
  if (c.code !== 0 || !rep.checked || (rep.errors || []).length) fail("cli check", c.out);
  console.log(`cli: umlimator.py render and check ${basename(example)} with the installed lib: ${rep.checked} checked, no error`);
}
console.log(`smoke: umlimator ${pkg.version} ok`);
