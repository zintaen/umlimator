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

The bug agent (`.github/workflows/bug-agent.yml`, described in CONTRIBUTING.md) gives an issue's text to a language model, so an issue can try prompt injection: text that asks the agent to leak a key, change CI, push or comment. The workflow treats issue text as data, never as instructions. A run starts only when someone with write access adds the label or starts the workflow, after reading the issue. The text reaches the agent as a file, inside a fence whose marker the text cannot contain, and never through the prompt, a shell command or a workflow expression; the prompt tells the agent the file is data and to refuse what it asks. The agent's job holds a read-only token and the API key and no other secret. Its network is blocked except for the Anthropic API and the hosts its setup needs (GitHub, the npm registry, nodejs.org); its shell takes only fixed command forms, with no interpreter by bare prefix; and Claude Code's subprocess scrub keeps the key and the runner's tokens out of the shells it starts as far as it can. The agent's diff leaves the job as a job output, is checked in a separate job with no secret by the base branch's copy of the checker, which lists paths by asking git how it reads the patch and refuses any rename, copy, mode change, link or binary, and the job that can write runs none of the diff's code and checks what git staged once more before it commits. What it writes back is posted only as quoted text, with mentions and fences taken out, and its code reaches the repository only as a draft pull request that passed the path and test checks and that a maintainer reviews before anything runs with more than read access. A way to get past any of this (a run that writes outside its new branch, a key or token that leaks, a comment or pull request that writes as the workflow rather than quoting the agent) is in scope: report it privately as above.

What is left, and why a maintainer reads the issue before starting a run: the test and the reproduction script are code the agent writes, so an injected instruction that the agent follows runs code on the runner while the API key is there. The egress block is what keeps the key in, and the hosts it allows take writes made with someone else's credentials (an attacker's own GitHub or npm token placed in the issue could carry the key out through them). The key should be one made for this workflow only, with a low spending limit, and rotated if a run looks wrong. The agent can also write a patch that passes the checks and does harm when run; it reaches the repository only as a draft that a maintainer reviews, and its checks do not run until a maintainer starts them.
