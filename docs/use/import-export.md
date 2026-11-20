# Import and export

You rarely start from nothing. `umlimator.py import` reads diagrams and infrastructure descriptions you already have
into a model, and lists, line by line, whatever it could not read. `umlimator.py export` writes a model's BPMN back as
BPMN XML.

## Formats

| Source | Becomes | Needs |
|---|---|---|
| Structurizr DSL (`.dsl`) | a map: people, systems, containers and components, their relationships, and the workspace's views | — |
| Structurizr JSON workspace | typed C4 views | Node |
| C4-PlantUML | a map, from its element, relationship and boundary macros | — |
| Mermaid `flowchart` or `graph` | a map; with `--typed`, a flowchart | Node for `--typed` |
| Mermaid `C4Context`, `C4Container`, `C4Component` | a map | — |
| Mermaid `classDiagram` | a UML class diagram | Node |
| Mermaid `sequenceDiagram` | a UML sequence diagram | Node |
| Mermaid `stateDiagram` | a UML state machine diagram | Node |
| Mermaid `requirementDiagram` | a SysML requirement diagram | Node |
| Mermaid `erDiagram` | an ER diagram | Node |
| Mermaid `mindmap` | a mindmap | Node |
| DBML (`.dbml`) | an ER diagram | Node and `@dbml/core`, installed by you |
| BPMN XML (`.bpmn`) | a BPMN diagram | Node and `bpmn-moddle`, installed by you |
| `docker compose config --format json` | a map of services, `depends_on` and networks | — |
| `kubectl get … -o json` | a map of workloads, Services and Ingresses | — |

`@dbml/core` and `bpmn-moddle` are never dependencies of umlimator: install them yourself when you need them.

## Examples

```bash
python3 umlimator.py import workspace.dsl --out model.json            # a diagram you have already, as a model
python3 umlimator.py import classes.mmd --out classes.json            # a Mermaid classDiagram, as a UML class diagram (needs Node)
python3 umlimator.py import checkout.mmd --out checkout.json          # a Mermaid sequenceDiagram, as a UML sequence diagram (needs Node)
python3 umlimator.py import order.mmd --out order.json                # a Mermaid stateDiagram, as a UML state machine diagram (needs Node)
python3 umlimator.py import needs.mmd --out needs.json                # a Mermaid requirementDiagram, as a SysML requirement diagram (needs Node)
python3 umlimator.py import schema.mmd --out schema.json              # a Mermaid erDiagram, as an ER diagram (needs Node)
python3 umlimator.py import returns.mmd --typed --out returns.json    # a Mermaid flowchart as a flowchart (without --typed, a map)
python3 umlimator.py import workspace.json --out c4.json              # a Structurizr JSON workspace, as typed C4 views (needs Node)
python3 umlimator.py import schema.dbml --out schema.json             # DBML, as an ER diagram (needs Node and @dbml/core, installed by you)
python3 umlimator.py import plan.mmd --out plan.json                  # a Mermaid mindmap, as a mindmap (needs Node)
python3 umlimator.py import order.bpmn --out order.json               # BPMN XML, as a BPMN diagram (needs Node and bpmn-moddle, installed by you)
docker compose config --format json > compose.json && python3 umlimator.py import compose.json --out model.json
kubectl get deploy,sts,svc,ing -A -o json > cluster.json && python3 umlimator.py import cluster.json --out model.json
```

## How import reads a file

- It tells the format from the content, then the extension; `--format` decides.
- In a map, groups, boundaries, subgraphs, networks and namespaces become boxes. Structurizr's views stay views, a card opening the view below it.
- The typed Mermaid readers draw no boxes for groups: a class diagram's namespaces become packages, and a flowchart's subgraphs (with `--typed`) and an `erDiagram`'s are not read. The cards in them are, and each group left out is listed on stderr.
- A Structurizr, C4-PlantUML or Mermaid C4 source's people are people (`person`, or `user` outside the system), and its
  phone apps phones. A Structurizr workspace's `styles` give its elements their shapes (`shape Person`, `Cylinder`,
  `WebBrowser`, ...), in Structurizr's own order; a shape the map has no counterpart for is listed in `notImported`.
- Whatever the file holds that `import` doesn't read is listed on stderr with its line (in JSON, its path).

What each element becomes, and what is left out: [`docs/module-api.md` § Import](../module-api.md#import-90).

## Export

```bash
python3 umlimator.py export order.json --out order.bpmn   # a model's BPMN as BPMN XML, laid out (needs Node and bpmn-moddle)
```

`export` writes BPMN XML only. The Mermaid writers (class, sequence, state machine, requirement, entity-relationship,
flowchart and mindmap) are internal to the module: they live in `src/readers/`, are used by the tests' round trips, and
are not exported by the package or reachable from the command line.

For pictures and documents rather than source formats:

| Output | How |
|---|---|
| SVG, PNG | `map.toSVG()`, `map.toPNG()`, the page's Export menu, or `umlimator.py stills` |
| PDF | `umlimator.py pdf` ([Command line](./cli.md#pdf)) |
| Animated PNG of a story | `umlimator.py record` |
| A self-contained page | `umlimator.py render` ([The standalone page](./standalone-page.md)) |
