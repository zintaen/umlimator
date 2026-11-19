# GitHub Action and diff

A map is only useful while it matches the system. umlimator can show what a pull request changes in your models,
check rules in CI, and compare a map with the traffic actually seen.

## The diff Action

On pull requests, the Action posts what they change in your maps and diagrams (every type): one comment with the
summary and a sketch, and the pictures as the run's artifact. The comment names the commit it describes, only the run
for the pull request's latest commit writes it, and it says so when the diff fails.

```yaml
on: pull_request
permissions: { contents: read, pull-requests: write }
concurrency: { group: "maps-${{ github.event.pull_request.number }}", cancel-in-progress: true }   # one run per pull request
jobs:
  maps:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: zintaen/umlimator@v0.43.0
        with:
          models: "docs/*.json"   # optional: where the models are (default: every .json that is a map model)
```

| Input | Default | What it does |
|---|---|---|
| `models` | `*.json` | git pathspecs of the model files, separated by spaces; only files that are models count |
| `comment` | `true` | post one comment on the pull request with the summary, and update it on later pushes |
| `github-token` | the job's token | the token that posts the comment (`pull-requests: write`) |

| Output | What it holds |
|---|---|
| `changed` | how many model files the pull request changes |
| `summary` | the summary, as a Markdown file |

- For each model file the pull request changes, the Action writes a page with each change marked, stills of the views
  that show one, and a summary in words with a mermaid sketch, which GitHub draws in the comment, so no picture needs
  hosting.
- The comment is the bot's own and is updated on each push; the same text goes in the job summary.
- A pull request from a fork gets a read-only token: there is no comment, and the job summary still has everything.

## diff() and the CLI

`diff(before, after)` returns `{ model, summary, views }`: the `after` model with each card and line marked added, changed or removed, what changed in words (for example "adds Payments queue between Trip service and Payment provider"), and the views that show it. On a typed diagram, a reordered member or message reads "moves". On any view whose picture follows the order of its cards (a map's ranks, a sequence view's lifelines, a timing view's lanes, an activity's partitions, a mindmap's subtopics), cards in a new order read "moves X after Y" or "moves X to the start", or "reorders N cards" when more than three move. A reorder that leaves the picture as it was, such as one on a view whose cards are all pinned, is not said and its view is not listed. The marks are the model's own fields, so a page or a still the CLI makes shows them with nothing to call.

```bash
python3 umlimator.py diff before.json after.json --out diff.html --stills diff/   # what changed, marked and in words
python3 umlimator.py diff --base origin/main --out diff/              # every model changed since a ref, and a summary.md
```

`diff --base` is what the Action runs, against the merge commit's first parent.

## Rules in CI

`umlimator.py check` reports each rule the model breaks and exits 1, so a step that runs it fails the build when a
change breaks a rule such as "apps never call a database directly". [Views and layers](./views-and-layers.md#rules)
shows how to write rules.

## Drift and time-lapse

```bash
python3 umlimator.py drift model.json traffic.json --out drift.html   # drawn vs. seen (a Jaeger or Tempo dependency list)
python3 umlimator.py timelapse model.json --out history.html          # the model's versions in git history, on a slider
```

- **Drift**, `drift(model, observed, { match })`, is the map against the traffic seen. `observed` is
  `[{ from, to, count }]`, or a Jaeger or Tempo dependency list. A line that ran but is not drawn comes in rose and
  dashed, labelled "not drawn" with its calls; a drawn line that carried nothing fades. `counts` says how many lines
  were carried, undrawn, idle or not judged. [`examples/drift.html`](../../examples/drift.html) shows a week of made-up
  traffic.
- **The time-lapse** puts the model's latest 30 versions in git history (`--limit N` for more or fewer), oldest first, on a slider, saying what changed at
  each step. `update()` eases into each next model: cards that moved glide, new cards fade in, and cards that left fade
  out. [`examples/timelapse.html`](../../examples/timelapse.html) shows four made-up releases.
