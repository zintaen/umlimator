#!/usr/bin/env node
// The bug agent's API proxy (.github/workflows/bug-agent.yml). It holds the Anthropic API key, so the agent never does:
// the agent's CLI talks to http://127.0.0.1:<port> with a placeholder key, and this proxy, run as a user of its own
// (tools/bug_agent_jail.sh <user> api), swaps in the real key and forwards to the API. The agent's user cannot read this
// process's memory or environment (another uid), and its own network reaches only loopback.
//
//   BUG_AGENT_KEY=<key> node tools/bug_agent_proxy.mjs <port>
//
// Only the endpoints the CLI needs go through (POST /v1/messages and /v1/messages/count_tokens), with bodies and beta
// headers checked against allowlists (refuseBody, safeBetas), so a request cannot make the API's side reach out to a URL
// for the agent and the proxy is no way out to anywhere but the model. GET /health answers without forwarding.
import { createServer } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import { isMain } from './main.mjs';

const PATHS = new Set(['/v1/messages', '/v1/messages/count_tokens']);
const MAX_BODY = 32 * 1024 * 1024;
// request headers passed on; every other one (authorization, x-api-key, cookies, proxies' own) is dropped
const PASS = new Set(['content-type', 'accept', 'anthropic-version', 'anthropic-beta', 'user-agent', 'x-stainless-retry-count',
  'x-stainless-timeout', 'x-app']);

// Why a request body may not go on, or '' when it may. Everything is checked against an allowlist, so nothing in the
// request can make the API's side fetch a URL (an image, document or file by URL, a search result, a server tool, an MCP
// server) and carry data out in it:
//   - tools are the caller's own (no `type`, or "custom"); a typed tool runs on the API's side
//   - every content block, in every message, in `system` and inside a tool_result, is text, tool_use, tool_result,
//     thinking or redacted_thinking; a tool_result's own content is a string or text blocks only
//   - no block anywhere carries a `source` (images and documents are refused whatever their source)
const BLOCKS = new Set(['text', 'tool_use', 'tool_result', 'thinking', 'redacted_thinking']);

function refuseBlocks(content, where, inResult = false) {
  if (typeof content === 'string') return '';
  if (!Array.isArray(content)) return `${where} is not text or a list of blocks`;
  for (const c of content) {
    if (!c || typeof c !== 'object' || Array.isArray(c)) return `a block in ${where} is not an object`;
    const type = String(c.type);
    if (inResult ? type !== 'text' : !BLOCKS.has(type)) return `a ${type.slice(0, 40)} block is not allowed in ${where}`;
    if ('source' in c) return `a block with a source is not allowed in ${where}`;
    if (type === 'text' && typeof c.text !== 'string') return `a text block in ${where} has no text`;
    if (type === 'tool_result' && c.content != null) {
      const why = refuseBlocks(c.content, 'a tool_result', true);
      if (why) return why;
    }
  }
  return '';
}

export function refuseBody(text) {
  let b;
  try { b = JSON.parse(text); } catch { return 'the body is not JSON'; }
  if (!b || typeof b !== 'object' || Array.isArray(b)) return 'the body is not an object';
  for (const k of ['mcp_servers', 'container']) if (k in b) return k + ' is not allowed';
  if (b.tools != null) {
    if (!Array.isArray(b.tools)) return 'tools is not a list';
    for (const t of b.tools) {
      if (!t || typeof t !== 'object') return 'a tool is not an object';
      if (t.type != null && t.type !== 'custom') return 'server tools are not allowed: ' + String(t.type).slice(0, 60);
    }
  }
  if (b.system != null) {
    const why = refuseBlocks(b.system, 'system');
    if (why) return why;
  }
  if (b.messages != null) {
    if (!Array.isArray(b.messages)) return 'messages is not a list';
    for (const m of b.messages) {
      if (!m || typeof m !== 'object') return 'a message is not an object';
      const why = refuseBlocks(m.content, 'a message');
      if (why) return why;
    }
  }
  return '';
}

// The beta features passed on: the ones the CLI uses for thinking, caching, streaming and context, none of which reaches
// out. Any other (files, web fetch, MCP client, code execution, search results, computer use) is dropped.
const BETAS = [/^claude-code-/, /^interleaved-thinking-/, /^fine-grained-tool-streaming-/, /^prompt-caching-/, /^token-efficient-tools-/,
  /^context-management-/, /^context-1m-/, /^effort-/, /^extended-cache-ttl-/, /^output-128k-/, /^redact-thinking-/];
export function safeBetas(header) {
  return String(header || '').split(',').map(x => x.trim()).filter(x => x && BETAS.some(r => r.test(x))).join(',');
}

export function createProxy({ key, upstream = 'https://api.anthropic.com' }) {
  if (typeof key !== 'string' || key.length < 8) throw new Error('no key');
  const up = new URL(upstream);
  const send = up.protocol === 'https:' ? httpsRequest : httpRequest;
  return createServer((req, res) => {
    const deny = (code, why) => { res.writeHead(code, { 'content-type': 'text/plain' }); res.end(why + '\n'); };
    const path = (req.url || '').split('?')[0];
    if (req.method === 'GET' && path === '/health') return deny(200, 'ok');
    if (req.method !== 'POST' || !PATHS.has(path)) return deny(403, 'not an allowed endpoint');
    const chunks = [];
    let size = 0;
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const why = refuseBody(body.toString('utf8'));
      if (why) return deny(403, why);
      const headers = {};
      for (const [k, v] of Object.entries(req.headers)) if (PASS.has(k)) headers[k] = v;
      const betas = safeBetas(req.headers['anthropic-beta']);
      if (betas) headers['anthropic-beta'] = betas; else delete headers['anthropic-beta'];
      headers['x-api-key'] = key;
      headers['content-length'] = String(body.length);
      const out = send({ protocol: up.protocol, hostname: up.hostname, port: up.port || undefined, method: 'POST', path: req.url, headers }, r => {
        const h = { ...r.headers };
        delete h['set-cookie'];
        res.writeHead(r.statusCode || 502, h);
        r.pipe(res);
      });
      out.on('error', () => { if (!res.headersSent) deny(502, 'upstream error'); else res.destroy(); });
      out.end(body);
    });
  });
}

if (isMain(import.meta.url)) {
  const port = Number(process.argv[2]);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) { console.error('usage: bug_agent_proxy.mjs <port>'); process.exit(2); }
  const key = process.env.BUG_AGENT_KEY || '';
  delete process.env.BUG_AGENT_KEY;
  const server = createProxy({ key, upstream: process.env.BUG_AGENT_UPSTREAM || undefined });
  server.listen(port, '127.0.0.1', () => console.log('proxy on 127.0.0.1:' + port));
}
