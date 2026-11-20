# Install

umlimator is an npm package, a file on a CDN, a CLI in the repository, a GitHub Action and an MCP server. Pick the one you need.

::: code-group

```bash [npm]
npm install umlimator
```

```html [CDN]
<script type="module">
  import { render } from 'https://cdn.jsdelivr.net/npm/umlimator@@@VERSION@@/lib/umlimator.js';
</script>
```

```bash [CLI]
# Python 3.9+; Chrome or Chromium for pictures and checks
git clone --depth 1 --branch v@@VERSION@@ https://github.com/zintaen/umlimator.git
python3 umlimator/umlimator.py render model.json --out page.html
```

```yaml [GitHub Action]
# .github/workflows/maps.yml: what each pull request changes in your maps, posted on it
on: pull_request
permissions: { contents: read, pull-requests: write }
jobs:
  maps:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: zintaen/umlimator@v@@VERSION@@
```

```bash [MCP]
# an MCP server over stdio, for an AI assistant such as Claude Code
claude mcp add umlimator -- python3 /path/to/umlimator.py mcp /path/to/model.json
```

:::

## npm

```bash
npm install umlimator
```

Or from GitHub, at a tag or any commit: `"umlimator": "github:zintaen/umlimator#v@@VERSION@@"`. npm 12 refuses git dependencies unless the project opts in, so that also needs `allow-git=root` in the `.npmrc` next to `package.json`.

## Without a bundler

Load the module from a CDN, pinned to a version:

```html
<script type="module">
  import { render } from 'https://cdn.jsdelivr.net/npm/umlimator@@@VERSION@@/lib/umlimator.js';
</script>
```

## The command line

The CLI is `umlimator.py` in the repository. It needs Python 3.9+ (standard library only), Google Chrome or Chromium for pictures and checks, and Node 18+ for `diff`, `drift`, `trace` and `mcp` ([Command line](../use/cli.md)):

```bash
git clone --depth 1 --branch v@@VERSION@@ https://github.com/zintaen/umlimator.git
python3 umlimator/umlimator.py render model.json --out page.html
```

The GitHub Action is set up on [GitHub Action and diff](../use/github-action.md), and the MCP server on [MCP server](../use/mcp.md). Next, draw [a first diagram](./first-diagram.md).
