---
title: "Block definition diagram"
description: "Blocks, their properties and how they are composed: one example that shows all it draws, live, how to write it, and what is drawn and left out."
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json, tools/types.json, tools/types.md and docs/diagrams/conformance/: edit those, not this file. -->

# Block definition diagram

<p class="ex-lead">Blocks, their properties and how they are composed. The bookshop's delivery cargo e-bike, which carries book orders to local customers: the bike and its battery, motor, controller, lights and cargo box with its parcel lock, the dock at the shop's dispatch bay it may stand in, the interface block of the charge link, the constraint blocks behind its delivery range, and the value types they use. The page below opens on it, <a href="/umlimator/examples/types/sysml-block-definition.html#view=ebike-blocks" target="_self">The delivery bike's blocks</a>, live: pan, zoom, select and go into the cards that stack.</p>

<div class="ex-frame"><iframe src="/umlimator/examples/types/sysml-block-definition.html" title="Block definition diagram, live" loading="lazy"></iframe></div>
<div class="ex-links"><a href="/umlimator/examples/types/sysml-block-definition.html" target="_self">Open full screen<span class="visually-hidden"> (Block definition)</span></a><a href="/umlimator/examples/types/sysml-block-definition.pdf" target="_self">PDF<span class="visually-hidden"> (Block definition)</span></a><a href="/umlimator/examples/types/sysml-block-definition.json" target="_self">Model<span class="visually-hidden"> (Block definition)</span></a></div>

## What it shows {#shows}

<p>In the order you find them in the picture:</p>

<ol class="ex-shows">
<li>The frame and its header, <code>bdd [Package] DeliveryFleet [The delivery bike's blocks]</code></li>
<li>Blocks with &lt;&lt;block&gt;&gt; and SysML's titled compartments, an empty one not drawn</li>
<li>A block's values and operations (DeliveryVehicle, CargoBox)</li>
<li>A generalization with a hollow triangle (CargoBike to DeliveryVehicle)</li>
<li>A <code>parts</code> compartment with multiplicities (<code>lights: Light [2]</code>)</li>
<li>A <code>references</code> compartment (<code>dock: Dock [0..1]</code>)</li>
<li>A <code>values</code> compartment with a default (<code>usableShare: Real = 0.9</code>)</li>
<li>A <code>constraints</code> compartment of constraint properties (<code>usable: UsableEnergy</code>)</li>
<li>A <code>ports</code> compartment with &lt;&lt;proxy&gt;&gt; and &lt;&lt;full&gt;&gt; ports and a plain port (Battery, Motor)</li>
<li>A <code>flow properties</code> compartment with each direction: in, out, inout</li>
<li>Composite associations with filled diamonds, roles and multiplicities, matching the parts</li>
<li>A plain association to a referenced block, navigable, <code>0..1</code></li>
<li>A conjugated port, its type starting <code>~</code> (Dock's <code>charge: ~ChargeInterface</code>)</li>
<li>A labelled dependency (Battery feeds PowerBus) and a &lt;&lt;use&gt;&gt; dependency (Dock to ChargeInterface)</li>
<li>An &lt;&lt;interfaceBlock&gt;&gt; with flow properties and an operation (ChargeInterface)</li>
<li>&lt;&lt;constraintBlock&gt;&gt;s with the expression in braces, their parameters, and one owning a constraint property (UsableEnergy, RangeEquation)</li>
<li>&lt;&lt;valueType&gt;&gt;s with a <code>quantity</code> compartment, <code>unit</code> and <code>quantityKind</code> (Distance, Energy, Mass, Voltage)</li>
</ol>

## In another setting {#alternatives}

<p>The same example, where a setting cannot share the picture above:</p>

<div class="ex-variants">
<article class="ex-variant" id="view-ebike-blocks-right">
<h3><a href="/umlimator/examples/types/sysml-block-definition.html#view=ebike-blocks-right" target="_self">The same blocks, laid out right</a></h3>
<p>Laid out right (<code>direction</code> <code>right</code>) instead of down: the same blocks, compartments and lines.</p>
</article>
</div>

## How to write it {#model}

The view's `diagram`, the types its elements, members and lines may have, and its props types, which describe `props` (every field in them is optional). The element envelope, typed views and the props all UML types share are on [Typed diagrams](../api/typed-diagrams.md).

`diagram` one of the four `SysmlViewType` values.

| Type | Values |
|---|---|
| `SysmlViewType` | `sysml.requirement`, `sysml.block-definition`, `sysml.internal-block`, `sysml.parametric` |
| `SysmlElementType` | `sysml.Requirement`, `sysml.TestCase`, `sysml.Block`, `sysml.InterfaceBlock`, `sysml.ConstraintBlock`, `sysml.ValueType`, `uml.Package`, `uml.Comment` |
| `SysmlMemberType` | `sysml.PartProperty`, `sysml.ReferenceProperty`, `sysml.ValueProperty`, `sysml.ConstraintProperty`, `sysml.Port`, `sysml.FlowProperty`, `sysml.ConstraintParameter`, `uml.Operation` |
| `SysmlLineType` | `sysml.DeriveReqt`, `sysml.Satisfy`, `sysml.Verify`, `sysml.Refine`, `sysml.Trace`, `sysml.Copy`, `sysml.Connector`, `sysml.BindingConnector`, `uml.Association`, `uml.Generalization`, `uml.Dependency`, `uml.CommentLink` |
| `SysmlRequirementProps` | `reqId`, `text`, `risk` (`low`, `medium`, `high`), `verifyMethod`, `stereotypes` |
| `SysmlClassifierProps` | `constraint` (a constraint block's), `unit`, `quantityKind` (a value type's) |
| `SysmlPortProps` | `kind` (`proxy`, `full`), `valueType` (`~` before it conjugates) |
| `SysmlFlowPropertyProps` | `direction` (`in`, `out`, `inout`), `valueType` |
| `SysmlConnectorProps` | `ends.from.part`, `ends.to.part`, `itemFlow` |
| `SysmlItemFlow` | `{ item, direction }`, `direction` `from-to` or `to-from` |

## What is drawn and left out {#conformance}

<!-- the conformance note, as written: docs/diagrams/conformance/sysml-block-definition.md -->

Release 0.25.0 (milestone 3, `docs/diagrams/notes/milestone-3.md` §7). Support is claimed by level (decision D3): **render**
and **edit** on the subset below. No interchange: Mermaid has no block definition notation, and there is no XMI.

A view of a version-2 model whose `diagram` is `"sysml.block-definition"` is a block definition diagram, drawn by `lib/umlimator-all.js` (`umlimator/all`); `lib/umlimator.js` draws it as plain cards with a warning. The vocabulary is `docs/diagrams/model.md` §2, row 17; the example is [`examples/ebike-blocks.json`](../../examples/ebike-blocks.json), the blocks of the bookshop's delivery cargo e-bike, its interface block, constraint blocks and value types.

### The subset, and SysML v1.7's clauses

SysML v1.7 (formal/24-01-07): clause 8 (blocks, value types), clause 9 (ports, flow properties, interface blocks), clause
10 (constraint blocks), Annex A (the frame).

| SysML v1.7 | In the model | Drawn as |
|---|---|---|
| 8, «block» | `sysml.Block` | a classifier with «block» and SysML's named compartments, each titled: `parts`, `references`, `values`, `constraints`, `operations`, `ports`, `flow properties`; an empty one is not drawn |
| 8, «valueType» | `sysml.ValueType`; `props.unit`, `props.quantityKind` (text) | «valueType» and a `quantity` compartment, `unit = Wh`, `quantityKind = energy` |
| 9, «interfaceBlock» | `sysml.InterfaceBlock` | «interfaceBlock», `flow properties`, `ports`, `operations` |
| 10, «constraintBlock» | `sysml.ConstraintBlock`; `props.constraint` (text) | «constraintBlock», `constraints` (its expression in braces, then its constraint properties), `parameters` |
| 8, part, reference, value and constraint properties | `sysml.PartProperty`, `sysml.ReferenceProperty`, `sysml.ValueProperty`, `sysml.ConstraintProperty`; `valueType`, `multiplicity`, `default` | rows `name: Type [mult] = default` |
| 9, ports | `sysml.Port`; `props.kind` `proxy`, `full` or none; a type starting `~` conjugated | rows, «proxy» or «full» before the name |
| 9, flow properties | `sysml.FlowProperty`; `props.direction` `in`, `out`, `inout` | rows `in dc: DCPower` |
| 10, parameters | `sysml.ConstraintParameter` | rows in a constraint block's `parameters` |
| UML associations, generalizations, dependencies | `uml.Association` (a composite one is a part, below), `uml.Generalization`, `uml.Dependency` | the class type's lines and ends |
| Annex A, the frame | the view; its `subject`, a package or none | `bdd [Package] Name [view title]`, or `bdd [Model] <model title> [view title]` |

A part is a member; a composite association end of its role is the same part drawn as a line, and the two agree (one type,
one multiplicity): `part-agrees` and `part-unlisted` (§7.2).

Rules (`src/sysml/blocks.js`, beside the class type's, which run on the view too), each with a passing and a failing
fixture in `tests/blocks.test.mjs`:

| Rule | Level | SysML v1.7 |
|---|---|---|
| `part-type` | warning | clause 8: a part or reference property is typed by a block (a name of no element is fine, model.md rule 11) |
| `value-type` | warning | clause 8: a value property is typed by a value type (`Real`, `Integer`, `Boolean`, `String` fine) |
| `constraint-type` | error; a warning when the type names nothing, as after its constraint block is deleted | clause 10: a constraint property is typed by a constraint block |
| `flow-direction` | error | clause 9, FlowProperty: its direction is in, out or inout |
| `port-kind` | error; a warning when a proxy port's type names nothing, as after its interface block is deleted | clause 9's constraints on ProxyPort and FullPort: a proxy port is typed by an interface block, a full port is not. Settled as an error, as the note recommends ("(confirm)": both constraints are SysML's, on the stereotypes) |
| `member-kinds` | error | clause 10: a constraint block owns only parameters and constraint properties; clause 9: an interface block owns no part, and only flow properties, proxy ports and operations here; a value type only values and operations (clause 8: a data type) |
| `general-kinds` | error | a generalization joins two elements of one SysML kind |
| `part-agrees`, `part-unlisted` | warning | the subset's: a part stored twice agrees with itself |

The class type's `generalization-kinds` leaves a generalization with an end of another notation (a SysML block) to that
notation's rule (S20, a change stated in 0.25.0's notes).

**Departures from SysML v1.7:**

- **A part stored two ways** (a member and a composite association end) must agree; SysML has one element for both.
- **A frame with no subject** names `[Model]` and the model's title (as the requirement diagram's).
- **An interface block** is held to flow properties, proxy ports and operations; SysML may allow it value and reference
  properties too. The narrower list is the subset's (a gap below).
- **A row whose kind or direction is none of SysML's** is printed as stored, so it does not parse back unchanged.

### Left out

`notes/milestone-3.md` §17: ports drawn on a block's border on a bdd (they are a compartment); the compartments
`properties`, `namespace`, `structure` and `receptions`; directed features (`prov`, `req`); nested ports; stereotype
icons; «unit» and «quantityKind» elements (units are text); bound references; operation bodies; signal receptions;
association blocks. And copy and paste, XMI, a reader.

Layout limits, measured on `examples/ebike-blocks.json` and `tests/block-definition-stress.json`:

- `repair: false`, `reroute: false`; a generalization ranks the general first. A bdd draws only the class type's lines: a
  model whose internal block or parametric views add connectors or bindings between the same blocks would draw them at
  their owners, so the example's view lists its own `edges` (the five lines it draws), and an atlas that joins it
  draws it as the file does. A gap: the type does not filter model lines by kind; a view with no `edges` list in such a model draws them.
- The example lays out clean right and down. The stress file's `edge-cases` view (every compartment, a block of 40 rows,
  a value type with unit and quantity kind, an interface block with each direction, a constraint block owning a
  constraint property, proxy, full and conjugated ports, a part typed by a value type, a constraint property typed by a
  block, a flow property in a constraint block, a part drawn also as a disagreeing association, a generalization between a
  value type and a block, a package holding blocks) is clean right and down; the generated `all` view (50 blocks, 57
  lines) crosses 54 times right and 50 down, with no other finding.

### Writers: what each shows of a block definition diagram

Measured on `examples/ebike-blocks.json` (0.25.0); the PDF's text read back by `tests/cli.py`.

| What is drawn | SVG | PNG | PDF | Mermaid |
|---|---|---|---|---|
| Blocks and their titled compartments | Yes; a row longer than the box cut | Yes | Yes, in vectors | No writer |
| The frame and its header | Yes, the header cut to the frame | Yes | Yes | |
| Lines, ends, role and multiplicity | Yes | Yes | Yes | |
| The legend | No | No | Yes, under the picture | |
| Accessible names | Kept on nodes, lines' `<title>` removed | None | None | |
| Tables | None | None | "Elements": each classifier's compartments as rows (`parts: battery: Battery [1]`), a constraint block's expression, a value type's unit and quantity kind. "Lines": each line's ends, labels and kind | |

### Accessibility

Names: "Block CargoBike, 5 parts, 1 reference, 6 values, 3 constraints"; "Value type Energy, unit = Wh, quantityKind = energy". Text at 4.5:1, lines and outlines at 3:1 in both themes (`tests/blocks.html`, `tests/sysml.html`); every gesture has a key (`docs/editing.md`).

### Performance (P1)

`tests/sysml-fixtures.test.mjs` on `tests/block-definition-stress.json`'s `all` (50 blocks, 57 lines), CPU, best of seven
after a warm-up, on a loaded Apple laptop (14 Nov 2026): a full layout and its SVG 66 ms; a value row added 60 ms; a
block renamed 68 ms: under the 100 ms target.

### Tests

`tests/blocks.test.mjs`, `tests/blocks.html`; `tests/block-definition-minimal.json`, `tests/block-definition-stress.json`
with `tests/sysml-fixtures.test.mjs` and `tests/sysml.html`; `tests/sysml.test.mjs` (the class rule on SysML
generalizations); `tests/cli.py`; `tests/mcp.py`.

**Gaps:** clause numbers inside clauses 8 to 10 were not quoted from SysML v1.7's PDF in this build (the file could not be read here); whether SysML lets an interface block hold value and reference properties is not settled; the type draws every model line between its blocks unless the view lists its `edges`; deleting a constraint block leaves the constraint properties it typed with a `constraint-type` warning, and deleting an interface block leaves the proxy ports it typed with a `port-kind` warning (a type naming nothing), `risks.md` M15.
