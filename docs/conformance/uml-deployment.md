# Conformance: the UML deployment diagram

Release 0.22.0 (stage 5, `docs/diagrams/notes/stage-5.md`). Support is claimed by level (decision D3): **render** and
**edit** on the subset below. No interchange: Mermaid has no deployment notation, and there is no XMI and no UML diagram
interchange (`docs/diagrams/proposal.md` §8.1).

A view of a version-2 model (`"schemaVersion": 2`) whose `diagram` is `"uml.deployment"` is a deployment diagram. It is
drawn by `lib/umlimator-all.js` (`umlimator/all`), which the CLI's page inlines; `lib/umlimator.js`, what a map host
loads, draws it as plain cards with a warning. The vocabulary is `docs/diagrams/model.md` §2, row 6; the example is
[`examples/bookshop-deployment.json`](../../examples/bookshop-deployment.json).

## The subset, and UML 2.5.1's clauses

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
nested in one target and deployed by a line to another) (warnings).

**Departures from UML 2.5.1:** «manifest» to a component only (`manifest-ends` warns on other targets).

## Left out

`notes/stage-5.md` §17: instance-level deployment (node and artifact instances `name : Type`); a deployment
specification attached to a deployment line; nested artifacts; communication path multiplicities; device icons;
«manifest» of anything but a component; per-target deployment specification properties. And, for all three stage 5
types, XMI, copy and paste, per-type `diff()` writers and a reader.

Layout limits, measured on `examples/bookshop-deployment.json` and `tests/deployment-stress.json`:

- Laid out by the host's ranking with `gap: 48`, `rgap: 56`, `cut: 280` on paths, `labelGaps` (decision 9) and port
  repair off. A cube box is 10 px more padded than stage 2's box on every side (its faces are inside its frame).
- The example lays out clean right and down: no crossing, `check()` finds nothing, its seven labels all placed and none
  cut short (decision 21; laid out down without `labelGaps`, "HTTP" would have no spot).
- `tests/stage5-fixtures.test.mjs` pins the stress file. Its `edge-cases` view: clean laid out right; four crossings
  laid out down (the lines of the artifact deployed both ways and of the one deployed by a line, across the two paths
  between one pair). Six levels of nesting with a communication path from the deepest to the top (L8): the outer box is
  **488 × 574 px**, right and down. Its generated `all` view (50 nodes and artifacts, 50 lines, boxes five deep): 15
  crossings right and 14 down; three lines along a box's border laid out right; laid out down, three pairs of lines
  sharing a line and two labels on a line.

## Writers: what each shows of a deployment diagram

Measured on `examples/bookshop-deployment.json` (0.22.0): `umlimator.py stills` (SVG and PNG) and `umlimator.py pdf`. The
PNG was looked at, the SVG read, the PDF's text read back (`tests/cli.py` reads its tables).

| | SVG: `handle.toSVG()`, `umlimator.py stills` | PNG: `handle.toPNG()`, `umlimator.py stills` | PDF: `umlimator.py pdf` |
|---|---|---|---|
| Cubes, boxes nested with their faces, keywords over names, artifacts with their icons | Yes | Yes | Yes, in vectors |
| Lines, «deploy» and «manifest», path labels | Yes | Yes | Yes |
| The legend of line kinds | No: the legend is a piece of the page | No | Yes, under the picture |
| Text | Text, in the page's font family; not embedded unless `fontCSS` is given | Pixels | Selectable text |
| Accessible names | Each target's, artifact's and component's `aria-label` kept ("Execution environment Java 21 runtime, in Application server, 3 artifacts deployed"); the lines' `<title>` removed | None | None |
| Theme | The page's | The page's | `--theme`, light by default |
| Tables | None | None | "Elements": each element by its kind; a target's rows, what is deployed on it by nesting or by a line ("routes.conf, by «deploy»"); an artifact's, what it manifests. "Lines": every line, from → to, its label and kind |

## Accessibility

Every piece has a name: "Device Application server, holding 1 execution environment", "Execution environment Java 21
runtime, in Application server, 3 artifacts deployed", "Artifact shop-api.jar, on Java 21 runtime, manifests Shop API",
"Communication path HTTPS from Shopper's device to Edge proxy". A selected box is said by both its title lines. Tab
reads each box and what it holds, then the rest, then the lines. Text reads at 4.5:1, lines and outlines at 3:1 in both
themes (`tests/deployment.html`, `tests/stage5.html`). Every gesture has a key (`docs/editing.md`); a drop of an
artifact into a node and the Owner field each deploy it by nesting.

## Performance (P1)

`tests/stage5-fixtures.test.mjs` on `tests/deployment-stress.json`'s `all` view (50 nodes and artifacts, 50 lines, boxes
five deep), CPU time, best of seven after a warm-up, on an Apple laptop at a load average of 3 to 8 (13 Nov 2026): a full
layout and its SVG 128 ms; a path's label 125 ms; an artifact moved into another node 112 ms; a stereotype set (an edit
that moves nothing) 133 ms, against the 100 ms target. CI holds 1 s and prints the figures. Over the target on this
machine; of a layout's time the second `layoutPass` that `labelGaps` runs is about 40% (5.5's measure).

## Tests

`tests/deployment.test.mjs` and `tests/deployment.html` (the type, its rules with a passing and a failing case each, the
cube and its faces, the example under three fonts, both themes and both directions, every gesture by pointer and key,
six levels); `tests/deployment-minimal.json` and `tests/deployment-stress.json` with `tests/stage5-fixtures.test.mjs` and
`tests/stage5.html` (`notes/stage-5.md` §13: every edge case, the six-level width pinned, P1); `tests/notation.html`
(«deploy» and «manifest»'s arrowheads on what they point to); `tests/cli.py` (render, check, stills, pdf and its tables,
the diff Action's step); `tests/mcp.py`; `tests/atlas.test.mjs`.
