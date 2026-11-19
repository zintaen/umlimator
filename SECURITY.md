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
