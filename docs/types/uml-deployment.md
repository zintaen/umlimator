---
title: "Deployment diagram"
description: "Nodes, execution environments and the artifacts deployed on them: one example that shows all it draws, live, how to write it, and what is drawn and left out."
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json, tools/types.json, tools/types.md and docs/diagrams/conformance/: edit those, not this file. -->

# Deployment diagram

<p class="ex-lead">Nodes, execution environments and the artifacts deployed on them. A bookshop in production: the shopper's device and browser, an edge proxy, the shop's data centre with its application server, Java runtime and database host, and the order queue, with the artifacts deployed on them and the components they manifest. The page below opens on it, <a href="/umlimator/examples/types/uml-deployment.html#view=production" target="_self">The bookshop in production</a>, live: pan, zoom, select and go into the cards that stack.</p>

<div class="ex-frame"><iframe src="/umlimator/examples/types/uml-deployment.html" title="Deployment diagram, live" loading="lazy"></iframe></div>
<div class="ex-links"><a href="/umlimator/examples/types/uml-deployment.html" target="_self">Open full screen<span class="visually-hidden"> (Deployment)</span></a><a href="/umlimator/examples/types/uml-deployment.pdf" target="_self">PDF<span class="visually-hidden"> (Deployment)</span></a><a href="/umlimator/examples/types/uml-deployment.json" target="_self">Model<span class="visually-hidden"> (Deployment)</span></a></div>

## What it shows {#shows}

<p>In the order you find them in the picture:</p>

<ol class="ex-shows">
<li>A device drawn as a cube with &lt;&lt;device&gt;&gt; over its name (Shopper's device, Application server)</li>
<li>An execution environment nested in a device, &lt;&lt;executionEnvironment&gt;&gt; over its name (Web browser, Java 21 runtime)</li>
<li>Artifacts deployed by nesting, &lt;&lt;artifact&gt;&gt; over the name with the document icon (storefront.js, order-worker.jar, shop-api.jar)</li>
<li>A deployment line, dashed with an open arrowhead and &lt;&lt;deploy&gt;&gt; (routes.conf to the Edge proxy)</li>
<li>A node with a stereotype over its name (&lt;&lt;linux server&gt;&gt; Edge proxy, Database host)</li>
<li>Communication paths, plain solid lines with their protocols (HTTPS, HTTP, PostgreSQL wire protocol, AMQP)</li>
<li>A node holding nodes, three levels deep, each drawn as a cube inside its owner (Shop data centre, Application server, Java 21 runtime)</li>
<li>A deployment specification, &lt;&lt;deployment spec&gt;&gt; over its name (shop-api.yaml)</li>
<li>A dependency, dashed with an open arrowhead (shop-api.yaml to shop-api.jar)</li>
<li>A note linked to the deployment specification by a dashed line</li>
<li>Manifestations, dashed with &lt;&lt;manifest&gt;&gt;, from an artifact to the component it makes (order-worker.jar to Order worker, shop-api.jar to Shop API)</li>
<li>Components drawn with the component icon (Order worker, Shop API)</li>
<li>A plain node outside the data centre, joined by a path from a nested device (Order queue)</li>
</ol>

## In another setting {#alternatives}

<p>The same example, where a setting cannot share the picture above:</p>

<div class="ex-variants">
<article class="ex-variant" id="view-production-right">
<h3><a href="/umlimator/examples/types/uml-deployment.html#view=production-right" target="_self">The same deployment, laid out right</a></h3>
<p>Laid out right (<code>direction</code> left at its default) instead of down: the same nodes, artifacts and lines, with one pin (<code>layout</code>, the order queue at column 4) so no line crosses another.</p>
</article>
</div>

## How to write it {#model}

The view's `diagram`, the types its elements, members and lines may have, and its props types, which describe `props` (every field in them is optional). The element envelope, typed views and the props all UML types share are on [Typed diagrams](../api/typed-diagrams.md).

`diagram: 'uml.deployment'`.

| Type | Values |
|---|---|
| `UmlDeploymentElementType` | `uml.Node`, `uml.Device`, `uml.ExecutionEnvironment`, `uml.Artifact`, `uml.DeploymentSpecification`, `uml.Component`, `uml.Comment` |
| `UmlDeploymentLineType` | `uml.Deployment`, `uml.Manifestation`, `uml.CommunicationPath`, `uml.Dependency`, `uml.CommentLink` |

## What is drawn and left out {#conformance}

<!-- the conformance note, as written: docs/diagrams/conformance/uml-deployment.md -->

Release 0.22.0 (stage 5, `docs/diagrams/notes/stage-5.md`). Support is claimed by level (decision D3): **render** and
**edit** on the subset below. No interchange: Mermaid has no deployment notation, and there is no XMI and no UML diagram
interchange (`docs/diagrams/proposal.md` §8.1).

A view of a version-2 model (`"schemaVersion": 2`) whose `diagram` is `"uml.deployment"` is a deployment diagram. It is
drawn by `lib/umlimator-all.js` (`umlimator/all`), which the CLI's page inlines; `lib/umlimator.js`, what a map host
loads, draws it as plain cards with a warning. The vocabulary is `docs/diagrams/model.md` §2, row 6; the example is
[`examples/bookshop-deployment.json`](../../examples/bookshop-deployment.json).

### The subset, and UML 2.5.1's clauses

| UML 2.5.1 | In the model | Drawn as |
|---|---|---|
| 19.5 Node | `uml.Node`; `props.stereotypes`; `parent` a node, device or execution environment (UML's `nestedNode`) | UML's cube: a front face with a top and a right face 10 px deep; holding something shown, a box drawn as a cube, its faces inside its frame |
| 19.5 Device | `uml.Device` | the cube with «device» on a line above its name |
| 19.5 ExecutionEnvironment | `uml.ExecutionEnvironment` | the cube with «executionEnvironment» on a line above its name |
| 19.3 Artifact | `uml.Artifact`; `parent` the target it is deployed on | a rectangle with «artifact» over its name and UML's document icon |
| 19.5 DeploymentSpecification | `uml.DeploymentSpecification` (an artifact, for `manifest-ends`) | the artifact's look with «deployment spec» |
| 19.5 Deployment | by nesting (`parent`), or `uml.Deployment` from the artifact to its target | the artifact inside the target's box; or dashed, an open arrowhead, «deploy» |
| 19.3 Manifestation | `uml.Manifestation`, from an artifact to a component | dashed, an open arrowhead, «manifest» |
| 19.5 CommunicationPath | `uml.CommunicationPath` between two targets, its `label` | a plain solid line with its label, cut at 280 px |
| 11.6 Component | `uml.Component`, what an artifact manifests | the component look |
| 7.7 Dependency, 7.8 Comment | `uml.Dependency`, `uml.Comment`, `uml.CommentLink` | dashed with an open arrowhead; a note, a dashed line |

A box with a keyword or stereotypes draws them on a line above its name, as UML 2.5.1 draws a keyword (the maintainer's
decision of 13 Nov 2026), so a long name is not cut by its keyword.

Rules (`notes/stage-5.md` §10.3): `deploy-ends`, `path-ends` (two targets, neither holding the other), `manifest-ends`
(from an artifact; to anything but a component, a warning) (errors); `nest-kinds` (an error when a target's owner is not
a target; a warning for the unusual pairs: a node in an execution environment, say), `deployed-twice` (an artifact
nested in one target and deployed by a line to another), `line-inside` (a dependency, manifestation or comment link
between a box and something it holds is not drawn), `own-boxes` (the view draws its own boxes: its hand-written containers are ignored) (warnings).

**Departures from UML 2.5.1:** «manifest» to a component only (`manifest-ends` warns on other targets).

### Left out

`notes/stage-5.md` §17: instance-level deployment (node and artifact instances `name : Type`); a deployment
specification attached to a deployment line; nested artifacts; communication path multiplicities; device icons;
«manifest» of anything but a component; per-target deployment specification properties. And, for all three stage 5
types, XMI, copy and paste, per-type `diff()` writers and a reader.

Layout limits, measured on `examples/bookshop-deployment.json` and `tests/deployment-stress.json`:

- Laid out by the host's ranking with `gap: 48`, `rgap: 56`, `cut: 280` on paths, `labelGaps` (decision 9) and port
  repair off. A cube box is 10 px more padded than stage 2's box on every side (its faces are inside its frame).
- The example lays out clean right and down: no crossing, `check()` finds nothing, its seven labels all placed and none
  cut short (decision 21; laid out down without `labelGaps`, "HTTP" would have no spot).
- `tests/stage5-fixtures.test.mjs` pins the stress file. Its `edge-cases` view: clean laid out right; four crossings laid out down (the lines of the artifact deployed both ways and of the one deployed by a line, across the two paths between one pair). Six levels of nesting with a communication path from the deepest to the top (L8): the outer box is **488 × 574 px**, right and down. Its generated `all` view (50 nodes and artifacts, 50 lines, boxes five deep): 23 crossings right (15 before audit 27, when 8 lines still ran back inside the box they leave or end on) and 15 down; three lines along a box's border and a pair of lines sharing a line laid out right, and a label on a box's border; laid out down, two pairs of lines sharing a line and eleven labels on a line (eight before audit 27; three pairs and nine labels before audit 60, which let a line come into its end from the side where the way in head on cost far more). Seven labels there found no spot and were left off with nothing said; since audit 6 they are drawn, on a looser spot (one on a cube's face line, right).

### Writers: what each shows of a deployment diagram

Measured on `examples/bookshop-deployment.json` (0.22.0): `umlimator.py stills` (SVG and PNG) and `umlimator.py pdf`. The
PNG was looked at, the SVG read, the PDF's text read back (`tests/cli.py` reads its tables).

| What is drawn | SVG: `handle.toSVG()`, `umlimator.py stills` | PNG: `handle.toPNG()`, `umlimator.py stills` | PDF: `umlimator.py pdf` |
|---|---|---|---|
| Cubes, boxes nested with their faces, keywords over names, artifacts with their icons | Yes | Yes | Yes, in vectors |
| Lines, «deploy» and «manifest», path labels | Yes | Yes | Yes |
| The legend of line kinds | No: the legend is a piece of the page | No | Yes, under the picture |
| Text | Text, in the page's font family; not embedded unless `fontCSS` is given | Pixels | Selectable text |
| Accessible names | Each target's, artifact's and component's `aria-label` kept ("Execution environment Java 21 runtime, in Application server, 3 artifacts deployed"); the lines' `<title>` removed | None | None |
| Theme | The page's | The page's | `--theme`, light by default |
| Tables | None | None | "Elements": each element by its kind; a target's rows, what is deployed on it by nesting or by a line ("routes.conf, by «deploy»"); an artifact's, what it manifests. "Lines": every line, from → to, its label and kind |

### Accessibility

Every piece has a name: "Device Application server, holding 1 execution environment", "Execution environment Java 21
runtime, in Application server, 3 artifacts deployed", "Artifact shop-api.jar, on Java 21 runtime, manifests Shop API",
"Communication path HTTPS from Shopper's device to Edge proxy". A selected box is said by both its title lines. Tab
reads what each box holds, then the rest, then the lines; a box is not a Tab stop: the keyboard reaches it through the outline of elements. Text reads at 4.5:1, lines and outlines at 3:1 in both
themes (`tests/deployment.html`, `tests/stage5.html`). Every gesture has a key (`docs/editing.md`); a drop of an
artifact into a node and the Owner field each deploy it by nesting.

### Performance (P1)

`tests/stage5-fixtures.test.mjs` on `tests/deployment-stress.json`'s `all` view (50 nodes and artifacts, 50 lines, boxes
five deep), CPU time, best of seven after a warm-up, on an Apple laptop at a load average of 3 to 8 (13 Nov 2026): a full
layout and its SVG 128 ms; a path's label 125 ms; an artifact moved into another node 112 ms; a stereotype set (it grows
a header, so the view lays out again) 133 ms; a colour (an edit that moves nothing) 37 ms, against the 100 ms target. CI holds 1 s and prints the figures. Over the target on this
machine; of a layout's time the second `layoutPass` that `labelGaps` runs is about 40% (5.5's measure).

### Tests

`tests/deployment.test.mjs` and `tests/deployment.html` (the type, its rules with a passing and a failing case each, the
cube and its faces, the example under three fonts, both themes and both directions, every gesture by pointer and key,
six levels); `tests/deployment-minimal.json` and `tests/deployment-stress.json` with `tests/stage5-fixtures.test.mjs` and
`tests/stage5.html` (`notes/stage-5.md` §13: every edge case, the six-level width pinned, P1); `tests/notation.html`
(«deploy» and «manifest»'s arrowheads on what they point to); `tests/cli.py` (render, check, stills, pdf and its tables,
the diff Action's step); `tests/mcp.py`.
