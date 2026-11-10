---
name: map-repo
description: Maps a codebase as a layered, clickable architecture map with umlimator. Reads the repository (workspaces, packages, services, entry points, imports, docker-compose, Kubernetes, Terraform, CI), writes a C4-style model (context, containers, components), renders it to one self-contained HTML page plus SVG and PNG stills, and fixes what the layout check reports. Use when the user asks to map, diagram, draw or visualise a repository's or system's architecture, wants a C4 diagram of a codebase, or asks how the parts of a repo fit together.
---

# Map a repository

Write, in `docs/architecture/` unless the repository or the user says otherwise:
- `map.json`: the model, the source to commit;
- `map.html`: one self-contained page that opens from disk: pan, zoom, click a card for its details, double-click a
  stacked card to go in;
- `stills/<view>.svg` and `.png`: each view as a picture for READMEs and docs.

The CLI is `python3 "${CLAUDE_PLUGIN_ROOT}/skills/map-repo/scripts/cli.py"`, the `scripts/cli.py` next to this file;
below it is `cli`. On first use it fetches one pinned umlimator release (a 2.5 MB shallow clone of
github.com/zintaen/umlimator) into `~/.cache/umlimator/cli`: say so before that first run. It needs git, Python 3.9+,
and Google Chrome or Chromium.

## 1. Read the codebase

Find what runs and what talks to what. Read; don't guess. Note the file each fact comes from.
- **Deployable units**: workspaces (package.json `workspaces`, pnpm-workspace.yaml, go.work, Cargo workspaces,
  pyproject), apps/ and services/ folders, Dockerfiles, docker-compose services, Kubernetes Deployments, Terraform
  resources, serverless and Procfile entries.
- **Entry points**: servers and their routes, CLIs, workers and the queues they consume, scheduled jobs.
- **Who calls whom**: HTTP clients and base URLs, gRPC stubs, queue topics produced and consumed, database URLs and ORMs,
  environment variables that name another service, imports between packages.
- **Outside**: people (users, operators), third-party APIs, managed services (payments, email, auth, storage).
- **CI/CD**: what each workflow builds and where it deploys.

Skip tests, fixtures, generated code and vendored copies unless they are the point.

## 2. Write the model

One view per level, C4-style:
1. **Context** (the root view): the people, the system as one card, and the outside systems. The system card opens
   the containers view (`opensView`).
2. **Containers**: each deployable unit (app, service, worker, database, queue, bucket) with the people and outside
   systems it touches. Boxes (`containers`) are optional: group by team or domain, so that lines run through a box,
   not back and forth between boxes. Tier boxes (apps / services / data) send a flow like service → queue → worker
   back across them. A line may end on a box.
3. **Components**: for the two to five containers that matter most, a view of their main modules and the neighbours
   they talk to; the container's card opens it. For the rest, give the card `opensView` and `opensCount` (its number
   of modules) without the view: the card still looks stacked, and a later run or a host app adds the view.

Draw only what you found. Put the evidence in each card's `how` ("server in services/api/main.go; Postgres through
DATABASE_URL"). Keep a view to about 15 cards: split a busy one by concern (what runs, and how it is built and
checked), and let a card open the part you split off.

```jsonc
{ "title": "<repo>: architecture", "root": "context",
  "nodes": [ { "id": "api", "label": "API", "kind": "backend", "sublabel": "Go, REST", "icon": "server", "opensView": "api",
               "what": "...", "when": "...", "how": "...", "badges": [{ "text": "beta", "tone": "amber" }] } ],
  "edges": [ { "id": "e1", "from": "web", "to": "api", "label": "calls", "sublabel": "REST", "kind": "calls", "weight": 2 } ],
  "views": [ { "id": "context", "parent": null, "title": "...", "caption": "...", "nodeIds": ["..."] },
             { "id": "system", "parent": "context", "title": "...", "nodeIds": ["..."],
               "containers": [{ "id": "data", "label": "Data", "nodeIds": ["db", "queue"] }] } ] }
```
- Card `kind`: frontend, backend, ai, database, queue, security, cloud, external, file.
- Line `kind`, drawn as its colour: calls (the default), feeds (hands data on), triggers (fires or suggests), state
  (reads or writes a store), guard (a check steps in). `weight` 1 to 3: how much the line stands for.
- `icon`: a name from `icons/manifest.json` in the fetched release. Line icons ship (users, user, window, server,
  database, queue, network, key, lock, gauge, chart, webhook, layers, folder, package, terminal, settings, ...); brand
  logos (react, postgresql, docker, kubernetes, github, ...) download on first use.
- Text: a card's label up to 22 characters, its sublabel up to 26; a line's label a verb or protocol up to 18.
  Longer text goes in `what`, `when` and `how`, which the page shows on click.
- Lines run left to right in reading order: draw a request from caller to callee, data from producer to consumer.
  Mark the back line of a real cycle `"loop": true`.

Every field: `engine/references/schema.md` (Map model) and `lib/umlimator.d.ts` in the fetched release. Where each
feature is used: https://github.com/zintaen/umlimator/blob/main/examples/README.md.

## 3. Render and check

```bash
cli render docs/architecture/map.json --out docs/architecture/map.html   # writes the page, then its layout check
cli check docs/architecture/map.html                                    # the check alone, after a fix
```

The output lists `problems` (aim for none) and `errors` (the check itself failed: report them). Fix, render again,
and stop after about five rounds; report what is left.

| The check says | Fix |
|---|---|
| map model problems: an unknown node, an edge with an unknown end | Fix the ids. |
| `edges A and B cross`, `takes a detour`, `runs round its own end` | Send one line out of another side (`fromSide`/`toSide`: top, bottom, left, right). If a view keeps failing, pin it: `"layout": { "<id>": [col, row], ... }`. |
| `runs right-to-left` | Draw the line in the flow's direction, or mark a real back line `"loop": true`. |
| `label ... lies on edge`, `leaves its line`, `sits on the border of family` | Shorten the label, or drop it and say it in `what`. |
| `text ... overflows node` | Shorten the label, the sublabel or the chips. |
| `passes within 12px of node` | Give the view room (`gap`, `rgap`), or pin it. |

A pinned view keeps its positions whatever the code does next: pin only the views the automatic layout gets wrong.

## 4. Hand back

```bash
cli stills docs/architecture/map.html --out docs/architecture/stills
```

Tell the user:
- what the map shows: its views, cards and lines;
- what you left out, and why;
- any problems the check still reports;
- where the files are: the page opens from disk in any browser, and a still goes in a README as
  `![...](docs/architecture/stills/<view>.png)`.

When the code changes, update the model and run step 3 again.
