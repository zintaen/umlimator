---
title: "Object diagram"
description: "Instances and the links between them at one moment: one example that shows all it draws, live, how to write it, and what is drawn and left out."
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json, tools/types.json, tools/types.md and docs/diagrams/conformance/: edit those, not this file. -->

# Object diagram

<p class="ex-lead">Instances and the links between them at one moment. One bookshop order the moment it is placed: ada, her order with its two order lines, the books they are for, the card that paid and the web till that took it, each instance with its slots. The page below opens on it, <a href="/umlimator/examples/types/uml-object.html#view=snapshot" target="_self">Order 1042, just placed</a>, live: pan, zoom, select and go into the cards that stack.</p>

<div class="ex-frame"><iframe src="/umlimator/examples/types/uml-object.html" title="Object diagram, live" loading="lazy"></iframe></div>
<div class="ex-links"><a href="/umlimator/examples/types/uml-object.html" target="_self">Open full screen<span class="visually-hidden"> (Object)</span></a><a href="/umlimator/examples/types/uml-object.pdf" target="_self">PDF<span class="visually-hidden"> (Object)</span></a><a href="/umlimator/examples/types/uml-object.json" target="_self">Model<span class="visually-hidden"> (Object)</span></a></div>

## What it shows {#shows}

<p>In the order you find them in the picture:</p>

<ol class="ex-shows">
<li>A package drawn as a box holding the instances it owns (sales)</li>
<li>Instances with a name and a classifier, the head underlined (ada : Customer, order1042 : Order)</li>
<li>An instance with a stereotype: &lt;&lt;entity&gt;&gt; over order1042</li>
<li>Slots as <code>feature = value</code> rows, and a slot with no value (ada's name)</li>
<li>A long slot value cut to the instance's width with an ellipsis (giftNote)</li>
<li>A link from an instance to itself, drawn as a loop (ada referred)</li>
<li>Two links between one pair of instances, each with its own line and name (places, ships to)</li>
<li>Links with role names at their ends (buyer, orders, deliveries)</li>
<li>An instance with a name and no classifier (webTill)</li>
<li>A link with a stereotype before its label (&lt;&lt;audit&gt;&gt; took)</li>
<li>Links named by their association instead of a label (OrderHasLines)</li>
<li>Anonymous instances, only the classifier after the colon (: OrderLine)</li>
<li>A note linked to an instance by a dashed line</li>
<li>Instances shown without their package, named with a qualified name (catalog::middlemarch : Book)</li>
<li>A class drawn beside the instances, not underlined, with its attributes (Customer)</li>
</ol>

## In another setting {#alternatives}

<p>The same example, where a setting cannot share the picture above:</p>

<div class="ex-variants">
<article class="ex-variant" id="view-snapshot-down">
<h3><a href="/umlimator/examples/types/uml-object.html#view=snapshot-down" target="_self">The same order, laid out down</a></h3>
<p>Laid out down (<code>direction</code> <code>down</code>) instead of right: the same instances, slots, links and package box.</p>
</article>
</div>

## How to write it {#model}

The view's `diagram`, the types its elements, members and lines may have, and its props types, which describe `props` (every field in them is optional). The element envelope, typed views and the props all UML types share are on [Typed diagrams](../api/typed-diagrams.md).

`diagram: 'uml.object'`.

| Type | Values |
|---|---|
| `UmlObjectElementType` | `uml.InstanceSpecification`, `uml.Package`, `uml.Comment` |
| `UmlObjectMemberType` | `uml.Slot` |
| `UmlObjectLineType` | `uml.Link`, `uml.CommentLink` |
| `UmlInstanceProps` | `classifier` (by name or qualified name, as text), `stereotypes` |
| `UmlSlotProps` | `value`, as text |
| `UmlLinkProps` | `association`, the roles at `ends.from` and `ends.to`, `stereotypes` |

## What is drawn and left out {#conformance}

<!-- the conformance note, as written: docs/diagrams/conformance/uml-object.md -->

Release 0.19.0 (stage 2, `docs/diagrams/notes/stage-2.md`). Support is claimed by level (decision D3): **render** and
**edit** on the subset below. No interchange: Mermaid has no object diagram, and there is no XMI or UML diagram
interchange (`docs/diagrams/proposal.md` §8.1).

A view of a version-2 model (`"schemaVersion": 2`) whose `diagram` is `"uml.object"` is an object diagram. It is drawn by
`lib/umlimator-all.js` (`umlimator/all`), which the CLI's page inlines; `lib/umlimator.js`, what a map host loads, draws
it as plain cards with a warning. The vocabulary is `docs/diagrams/model.md` §2, row 2; the example is
[`examples/order-objects.json`](../../examples/order-objects.json).

### The subset, and UML 2.5.1's clauses

| UML 2.5.1 | In the model | Drawn as |
|---|---|---|
| 9.8 InstanceSpecification | `uml.InstanceSpecification`: `label` its name, `props.classifier` the classifier's name as text | the classifier shape with one compartment; its head `name : Classifier` underlined, `: Classifier` for an anonymous instance (no `label`), or `name` with no classifier |
| 9.8 Slot | member `uml.Slot`: `label` the feature, `props.value` its value as text | one row: `feature = value`, or `feature` with no value; a long value cut to the instance's width (at most 320 px) |
| 9.8.4 a link, an instance of an association | `uml.Link`: `label` its name, `props.association` the association's name as text, `props.ends.from` / `.to`: `role` | a solid line with no end marks; its name, or else its association, on the line; each role by its end |
| 7.2 Comment | `uml.Comment`, `uml.CommentLink` from the comment | a note with a folded corner; a dashed line with no ends |
| 12.3 stereotype notation, as text | `props.stereotypes` on an instance or a link | «entity» over the head, before a line's label |
| 12.2 Package, as an owner | an instance's `parent` is a package | a shown package owning a shown instance is a box holding it, as in the class view (`uml-package.md`); an instance shown without its owner is named `shop::order1 : Order` |
| 9.2 Classifier, shown beside instances | a node of a class diagram's types in an object view | drawn as the class view draws it: not underlined, its keyword, its compartments |

Rules, each `validate()` problem naming its `rule` and its elements (`notes/stage-2.md` §9.3): `slot-kinds` (an instance holds slots only; a slot belongs to an instance), `link-ends` (a link joins two instances), `instance-of` (a warning: when `props.classifier` names exactly one classifier of the model, by its name or qualified name, each slot names an attribute of it or of one of its generals), `owner-kinds` (a warning: an instance's owner is a package), `line-inside` (a warning: a line between a package and what it holds is not drawn), `own-boxes` (a warning: a view's own `containers` are ignored) and the class diagram's `member-names` (two slots for one feature) and `multiplicity` (an attribute's multiplicity on a classifier the view draws, judged as the class view judges it). Ownership cycles and references that do not resolve are the core's checks. A model with only object views gets no class rules but these.

A view may set `direction: "down"`, `subject` (names are qualified from it) and pins in `layout`. A link from an
instance to itself is drawn as a loop, and two links between one pair each keep their own line.

### Left out

- Checking a slot's value against its feature's type; an instance's own value specification (`= value` in its body);
  nested instances in slots; n-ary links; links drawn as instances of an association class; a link's multiplicity,
  aggregation and navigability (an instance has no multiplicity).
- A classifier and an association are text, not references (`docs/diagrams/risks.md` M8): renaming a class does not
  rename the instances that name it. A classifier name that matches no classifier, or several, is not checked.
- F2 edits the instance's name alone; its classifier is set in the properties panel (`notes/stage-2.md` §9.2, (a)).
- A reader: Mermaid has no object notation. `paths()` reads a link as a map's line.
- XMI and UML diagram interchange.
- Lines cross where the layered layout finds no better order. `tests/object-stress.json` (50 instances, 60 links, one a
  loop) has 42 crossings laid out down and 42 laid out right, most among the twenty lines from order lines to their
  eight books; `tests/object-fixtures.test.mjs` pins both counts (`docs/diagrams/risks.md` L4). `tests/object-minimal.json`
  has none.
- A known limit found by 2.6: laid out right in Chrome, under a sans-serif or a monospace font, a role at a line's end
  can be placed on a neighbouring instance where several links end close together on one side (seen on a 50-instance
  view with three links into each of eight books, `risks.md` L5). Node's text estimate does not show it; the stress
  fixture as committed lays out clean in both directions under all three fonts.

### Writers: what each shows of an object diagram

Measured on `examples/order-objects.json` (0.19.0): `umlimator.py stills` (SVG and PNG, light and dark) and
`umlimator.py pdf` on its rendered page. Each file was opened and looked at.

| What is drawn | SVG: `handle.toSVG()`, `umlimator.py stills` | PNG: `handle.toPNG()`, `umlimator.py stills` | PDF: `umlimator.py pdf` |
|---|---|---|---|
| Instances, heads underlined, every slot row | Yes | Yes | Yes, in vectors |
| Links, their names, the association's name, roles by each end | Yes | Yes | Yes |
| Notes and their links | Yes | Yes | Yes |
| A package holding instances, as a box | Yes | Yes | Yes |
| The legend | No: the legend is a piece of the page (`render()`'s `legend`), not of the picture | No | Yes, under the picture |
| Text | Text, in the page's font family; the font is not embedded unless `fontCSS` is given | Pixels | Selectable text |
| Accessible names | Each instance's `aria-label` kept ("Instance specification order1042 : Order, 2 slots"); the lines' `<title>` removed, as for maps | None | None |
| Theme | The page's, light or dark, every colour resolved (no CSS variables), so the file opens alone | The page's | `--theme`, light by default |
| Views | One per call (`view`); `stills` writes every view | One per call; `stills` every view, at 2x | Every view (`--views` picks), each on its own page |
| Tables | None | None | Per type (R8, 0.19.0): each instance by its drawn name (`ada : Customer`), its kind ("Instance specification") and its slots as `feature = value`; each link from → to, its label and its kind ("Link"). The table's heading says "Elements" |

The site builds every example's stills and PDF ([zintaen.github.io/umlimator](https://zintaen.github.io/umlimator/)),
this one's among them.

### Accessibility

Instances and links have accessible names ("Instance specification ada : Customer, 1 slot"; "Link from ada : Customer
to order1042 : Order (orders): places"); `describe()` writes the view in words, one instance a line with its slots and
its links ("Instance specification ada : Customer, 1 slot: email = ada@example.org; linked to order1042 : Order
(orders) ("places")."). Text reads at 4.5:1 or more and lines at 3:1 or more on the stage in both themes
(`tests/object.html`). Every editing gesture has a key (`docs/editing.md`).

### Tests

`tests/object.test.mjs` and `tests/object.html` (the type, the slot syntax, its rules, the example laid out under three
fonts, both themes and both directions, each gesture by pointer and key, a 30-step session that undoes, redoes and
reopens to byte-identical models); `tests/object-fixtures.test.mjs` with `tests/object-minimal.json` and
`tests/object-stress.json` (`notes/stage-2.md` §15, and P1's budget), and `tests/package-object.html`, which draws both
fixtures in Chrome under three fonts, both themes and both directions; `tests/cli.py` (render, check, stills, pdf, and
the diff Action's step); `tests/mcp.py` (the MCP server, C10).
