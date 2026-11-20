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

The design assumes the injection may work, and limits what a fooled agent can do. The agent never holds the key. A small proxy (`tools/bug_agent_proxy.mjs`) runs as a user of its own, holds the key, and is the only process whose network reaches the Anthropic API; it forwards only the message endpoints the CLI needs and refuses a request that asks the API to reach out (a server tool such as web fetch or web search, or MCP servers). The agent runs as another unprivileged user with a placeholder key, no GitHub token, no sudo and no access to the runner's files, and a firewall rule on that user lets its processes, including any code it writes and runs, reach loopback and nothing else, so its only way to the model is the proxy. That user cannot read the proxy's memory or environment, which belong to another uid. Its shell takes only exact commands, and its Read tool only the checkout and its work folder (`/proc`, `/sys`, `/etc` and home folders are denied), set in a settings file it cannot write. The job that holds the key holds only a read-only token, and the diff leaves it as data. A separate job with no secret checks the diff with the base branch's own checker, which lists paths by asking git how it reads the patch (never by parsing the headers itself) and refuses any rename, copy, mode change, link, binary or path outside `src/`, `lib/`, `tests/`, `docs/` and `umlimator*.py`; the patch's own build and test run there as a jailed user with no network, in a copy of the tree with no `.git`, and `lib/` is compared with the build before the test starts and then made read-only to it. The job that can write runs none of the diff's code, checks the paths again and what git staged before it commits, and pushes only a new branch for a draft pull request. What the agent writes back is posted only as quoted text, with mentions and fences taken out. A way to get past any of this (a run that writes outside its new branch, a key or token that leaks, a comment or pull request that writes as the workflow rather than quoting the agent) is in scope: report it privately as above.

Before the diff leaves the agent's job it is also searched for the key, with whitespace, punctuation and case taken out, and in reversed, hex and base64 forms. That search is a second check, not the main control: it cannot find every encoding, and what keeps the key safe is that the agent never has it.

What is left, and why a maintainer reads the issue before starting a run. A fooled agent can spend the key's budget through the proxy, and can send the repository's own files to the model; it cannot send them anywhere else, since the proxy refuses server tools and the agent's user reaches nothing but loopback. Other services listening on the runner's loopback are reachable by the agent's user (DNS is closed to it); a GitHub-hosted runner runs none that hold a credential. The agent can also write a patch that passes the checks and does harm when run; it reaches the repository only as a draft that a maintainer reviews, and its checks do not run until a maintainer starts them. The key should be one made for this workflow only, with a low spending limit, and rotated if a run looks wrong. The jail relies on the runner's kernel firewall and on sudo, so the workflow runs only on GitHub's Ubuntu runners; the `bug-agent-jail` workflow checks on such a runner that it holds.
