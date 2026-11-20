# Security policy

## Supported versions

Security fixes go into the latest minor release (the newest `0.x` on npm and the newest `v0.x.y` tag). Upgrade to it to get a fix; older minors are not patched.

## Reporting a vulnerability

Please do not open a public issue for a security problem. Report it privately through GitHub Security Advisories: open the repository's [Security tab](https://github.com/zintaen/umlimator/security) and choose "Report a vulnerability". Include the version, which part is affected (the ES module, the CLI, the GitHub Action or the MCP server), a model or steps that reproduce it, and what an attacker gains.

## What to expect

- An acknowledgement within a few days.
- An assessment, and a fix or a mitigation plan, with a timeline that depends on severity.
- A GitHub Security Advisory and a release note in `docs/module-api.md` once the fix ships, crediting you unless you ask not to be named.

## What is in scope

umlimator treats a model as untrusted input. Problems worth reporting include a model that runs script in a rendered page or the details panel, a URL or image in a model that a page loads when it should not, a path in a model or a committed link that makes the CLI, the diff Action or the MCP server read or write outside where it should, and output on a terminal that a crafted model can spoof. The security notes in the changelog (`docs/module-api.md`, search for "Security") record what each release hardened.

Cloud icon packs are fetched by the user from the vendors' own sources; a problem in a vendor's pack belongs to that vendor.

## The bug agent and prompt injection

The bug agent (`.github/workflows/bug-agent.yml`, described in CONTRIBUTING.md) gives an issue's text to a language model, so an issue can try prompt injection: text that asks the agent to leak a key, change CI, push or comment. The workflow treats issue text as data, never as instructions. A run starts only when someone with write access adds the label or starts the workflow, after reading the issue. The text reaches the agent as a file, inside a fence whose marker the text cannot contain, and never through the prompt, a shell command or a workflow expression; the prompt tells the agent the file is data and to refuse what it asks.

The design assumes the injection may work, and limits what a fooled agent can do. The agent runs as an unprivileged user with no GitHub token, no sudo and no access to the runner's files, and a firewall rule on that user lets its processes, including any code it writes and runs, reach the Anthropic API and nothing else. Its shell takes only exact commands, set in a settings file it cannot write. The job that holds the API key holds only a read-only token, and the diff leaves it as data, after a check that the key is not in it. A separate job with no secret checks the diff with the base branch's own checker, which lists paths by asking git how it reads the patch (never by parsing the headers itself) and refuses any rename, copy, mode change, link, binary or path outside `src/`, `lib/`, `tests/`, `docs/` and `umlimator*.py`; the patch's own test runs there as a jailed user with no network, in a copy of the tree with no `.git`. The job that can write runs none of the diff's code, checks the paths again and what git staged before it commits, and pushes only a new branch for a draft pull request. What the agent writes back is posted only as quoted text, with mentions and fences taken out. A way to get past any of this (a run that writes outside its new branch, a key or token that leaks, a comment or pull request that writes as the workflow rather than quoting the agent) is in scope: report it privately as above.

What is left, and why a maintainer reads the issue before starting a run. The API key is in the agent's own process, and code the agent writes runs as the same user while it works, so a fooled agent can read the key; the firewall leaves it only one way out, the Anthropic API itself, where an attacker would need an account of their own on the other end (for example a file stored with their own key). Names are not resolved for the agent's user except `api.anthropic.com`, which is pinned; the DNS resolver the runner uses is held by harden-runner's block policy, not by the per-user rule. The check for the key in the diff finds it as it is, in base64 and in hex, not in every encoding. The key should be one made for this workflow only, with a low spending limit, and rotated if a run looks wrong. The agent can also write a patch that passes the checks and does harm when run; it reaches the repository only as a draft that a maintainer reviews, and its checks do not run until a maintainer starts them.
