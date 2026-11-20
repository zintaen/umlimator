---
title: "Use case diagram"
description: "Actors and the use cases they take part in: one example that shows all it draws, live, how to write it, and what is drawn and left out."
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json, tools/types.json, tools/types.md and docs/diagrams/conformance/: edit those, not this file. -->

# Use case diagram

<p class="ex-lead">Actors and the use cases they take part in. What shoppers do at an online bookshop: who takes part, the use cases inside the shop, and how checking out includes paying and is extended by vouchers and gift wrapping, in one use case diagram. The page below opens on it, <a href="/umlimator/examples/types/uml-use-case.html#view=shopping" target="_self">What shoppers do at the bookshop</a>, live: pan, zoom, select and go into the cards that stack.</p>

<div class="ex-frame"><iframe src="/umlimator/examples/types/uml-use-case.html" title="Use case diagram, live" loading="lazy"></iframe></div>
<div class="ex-links"><a href="/umlimator/examples/types/uml-use-case.html" target="_self">Open full screen<span class="visually-hidden"> (Use case)</span></a><a href="/umlimator/examples/types/uml-use-case.pdf" target="_self">PDF<span class="visually-hidden"> (Use case)</span></a><a href="/umlimator/examples/types/uml-use-case.json" target="_self">Model<span class="visually-hidden"> (Use case)</span></a></div>

## What it shows {#shows}

<p>In the order you find them in the picture:</p>

<ol class="ex-shows">
<li>Actors as stick figures with their names under them (Shopper, Member)</li>
<li>An actor with a stereotype under its figure (&lt;&lt;system&gt;&gt; Payment provider)</li>
<li>Generalization between two actors, a hollow triangle at the general one (Member is a Shopper)</li>
<li>A note (a comment with a folded corner) linked by a dashed line to a subject</li>
<li>A subject with nothing shown inside, drawn as a closed rectangle with its name (Warehouse)</li>
<li>A subject drawn as a box holding its use cases, its name in bold at the top left (Online bookshop)</li>
<li>Associations between an actor and a use case, plain lines</li>
<li>Use cases as ellipses holding their names</li>
<li>A use case with an extension points compartment under a divider (Check out: payment, extras)</li>
<li>An include, dashed with an open arrowhead and &lt;&lt;include&gt;&gt; (Check out includes Pay for the order, Track an order includes Sign in)</li>
<li>Extends naming their extension point and condition, <code>&lt;&lt;extend&gt;&gt; (payment) [the shopper has a voucher code]</code></li>
<li>Generalization between two use cases (Pay by card is a Pay for the order)</li>
</ol>

## In another setting {#alternatives}

<p>The same example, where a setting cannot share the picture above:</p>

<div class="ex-variants">
<article class="ex-variant" id="view-shopping-right">
<h3><a href="/umlimator/examples/types/uml-use-case.html#view=shopping-right" target="_self">The same use cases, laid out right</a></h3>
<p>Laid out right (<code>direction</code> left at its default) instead of down: the same actors, use cases and lines, the actors on the left of the subject.</p>
</article>
</div>

## How to write it {#model}

The view's `diagram`, the types its elements, members and lines may have, and its props types, which describe `props` (every field in them is optional). The element envelope, typed views and the props all UML types share are on [Typed diagrams](../api/typed-diagrams.md).

`diagram: 'uml.use-case'`.

| Type | Values |
|---|---|
| `UmlUseCaseElementType` | `uml.Actor`, `uml.UseCase`, `uml.Subject`, `uml.Comment` |
| `UmlUseCaseMemberType` | `uml.ExtensionPoint` |
| `UmlUseCaseLineType` | `uml.Association`, `uml.Include`, `uml.Extend`, `uml.Generalization`, `uml.CommentLink` |
| `UmlExtendProps` | `extensionPoints` (ids, one at least), `condition`, `stereotypes` |

## What is drawn and left out {#conformance}

<!-- the conformance note, as written: docs/diagrams/conformance/uml-use-case.md -->

Release 0.21.0 (stage 4, `docs/diagrams/notes/stage-4.md`). Support is claimed by level (decision D3): **render** and
**edit** on the subset below. No interchange: Mermaid has no use case notation, and there is no XMI and no UML diagram
interchange (`docs/diagrams/proposal.md` §8.1).

A view of a version-2 model (`"schemaVersion": 2`) whose `diagram` is `"uml.use-case"` is a use case diagram. It is
drawn by `lib/umlimator-all.js` (`umlimator/all`), which the CLI's page inlines; `lib/umlimator.js`, what a map host
loads, draws it as plain cards with a warning. The vocabulary is `docs/diagrams/model.md` §2, row 8; the example is
[`examples/shopping-use-cases.json`](../../examples/shopping-use-cases.json).

### The subset, and UML 2.5.1's clauses

| UML 2.5.1 | In the model | Drawn as |
|---|---|---|
| 18.1 Actor | `uml.Actor`; `props.stereotypes` | a stick figure 24 × 44 px with its name under it; stereotypes under the figure. Actors are placed before the use cases they are associated with |
| 18.1 UseCase, ExtensionPoint | `uml.UseCase`; its `members` `uml.ExtensionPoint` (by name) | an ellipse holding its name (up to three lines of 160 px, then cut), 1.42 times its text block; with extension points, a divider and the compartment "extension points" under the name |
| 18.1 Classifier as a subject | `uml.Subject`, a use case's `parent` (at most one) | a box holding its shown use cases, its name in bold at the top left; with nothing shown, a closed rectangle with its name |
| 18.1 Include | `uml.Include`, from the including use case to the included one | dashed, an open arrowhead, «include» |
| 18.1 Extend | `uml.Extend`, from the extending use case to the extended one; `props.extensionPoints` (ids, one at least), `props.condition` (text) | dashed, an open arrowhead, `«extend» (payment) [the shopper has a voucher code]`: its points by name, then its condition, cut at 280 px |
| 11.5 Association (an actor's) | `uml.Association`, between an actor and a use case; its ends' props are not read | a plain line |
| 9.9 Generalization | `uml.Generalization`, from the specific to the general, between two actors or two use cases | a hollow triangle |
| 7.8 Comment | `uml.Comment`, `uml.CommentLink` | a note, a dashed line |

Rules, each `validate()` problem naming its `rule` and its elements (`notes/stage-4.md` §8.3): `association-ends`,
`include-ends`, `extend-ends`, `extend-points` (an extend names an extension point of the use case it extends, one at
least), `generalization-kinds`, `include-cycle` (UML's `cannot_include_self`), `generalization-cycle` (no actor or use case is its own ancestor, as in the class view), `named` (UML's `must_have_name`)
(errors); `use-case-owner`, `point-names`, `comment-link` (a comment link with no comment at either end) (warnings).

Connect refuses a line that would bring one of these errors, in the rule's words (an include, extend or generalization from an actor, an association between two use cases), as the state machine and interaction overview views refuse theirs; `extend-points` is left out, since a new extend names its extension points in the properties panel after it is drawn.

Deleting an extension point (Shift + Delete, or the member list's ✕) takes every extend left naming no other point of
its use case, in the same transaction, and the hint line names them (`Deleted extension point "payment" and the extend
from "Redeem voucher", which named no other extension point`); an extend naming another point keeps it, the point dropped from its list. So no
single delete leaves an `extend-points` error (`tests/delete-cascade.test.mjs`). A bare `apply()` delete (a host's own
store) does the same since audit 19 (the type's `refs`: `drop empties`), without the hint line.

### Left out

`notes/stage-4.md` §18: use-case descriptions; several subjects per use case, a subject distinct from the use case's
owner, and the subject as a typed classifier (a use case's `parent`, so at most one, and an untyped box); an actor drawn
as a rectangle «actor»; a use case drawn as a classifier rectangle; an extend's condition in a note (it is on the line);
association ends (multiplicity, navigability); n-ary associations; secondary actors placed on the right; realizations
of a use case. And for all four stage 4 types: XMI, copy and paste, per-type `diff()` writers (a reorder reads as
changed), resizing by hand.

Layout limits, measured on `examples/shopping-use-cases.json` and `tests/usecase-stress.json`:

- The four stage 4 types lay out with port repair off (`repair: false`, `reroute: false`, `notes/stage-4.md` §17), so
  two lines that cross next to a shared side keep their ports. `tests/stage4-fixtures.test.mjs` pins what is left: one
  crossing in the `edge-cases` view either way; in the `all` view (50 elements, 60 lines) two crossings laid out right
  and four down.
- A line from an actor to a use case far down the subject may run round the subject's box (the payment provider's
  association in the example): a long route, not a crossing.

### Writers: what each shows of a use case diagram

Measured on `examples/shopping-use-cases.json` (0.21.0): `umlimator.py stills` (SVG and PNG) and `umlimator.py pdf` on
its rendered page. Each file was opened and looked at.

| What is drawn | SVG: `handle.toSVG()`, `umlimator.py stills` | PNG: `handle.toPNG()`, `umlimator.py stills` | PDF: `umlimator.py pdf` |
|---|---|---|---|
| Actors' figures, ellipses with their extension points, the subject's box | Yes | Yes | Yes, in vectors |
| Lines, dashes, open arrowheads and triangles, «include» and `«extend» (point) [condition]` labels | Yes | Yes | Yes |
| The legend of line kinds | No: the legend is a piece of the page, not of the picture | No | Yes, under the picture |
| Text | Text, in the page's font family; the font is not embedded unless `fontCSS` is given | Pixels | Selectable text |
| Accessible names | Each actor's, use case's and the subject's `aria-label` kept; the lines' `<title>` removed, as for maps | None | None |
| Theme | The page's, every colour resolved | The page's | `--theme`, light by default |
| Tables | None | None | "Elements": each actor, subject and use case by its kind, a use case's extension points as its members; "Lines": each line from → to and its kind. **Gap:** an extend's points and condition are not in its row (the table reads a line's `label`, which an extend leaves empty; `risks.md` R9) |

The site builds every example's stills and PDF ([zintaen.github.io/umlimator](https://zintaen.github.io/umlimator/)).

### Accessibility

Every piece has a name: "Actor Shopper", "Use case Check out, in Online bookshop, 2 extension points", "Subject Online
bookshop, holding 8 use cases", "Extend from Redeem a voucher to Check out, at payment, when the shopper has a voucher
code". Tab reads the actors, then each subject's use cases, then the rest, then the lines (`geo.order`); a
subject is a box, not a Tab stop: the keyboard reaches it through the outline of elements.
`describe()` writes the view in sentences. Text reads at 4.5:1 and lines and outlines at 3:1 on the stage in both themes
(`tests/usecase.html`, `tests/stage4.html`). Every editing gesture has a key (`docs/editing.md`).

### Performance (P1)

`tests/stage4-fixtures.test.mjs` on `tests/usecase-stress.json`'s `all` view (50 elements, 60 lines), CPU time, best of
three after a warm-up, on an Apple M5 laptop at a load average of 6 to 8 (the idlest it got; 13 Nov 2026): a full layout
and its SVG 28 ms, a use case renamed 28 to 29 ms, a stereotype set 27 to 28 ms, against the 100 ms target. CI holds 1 s
and prints the figures (the maintainer's decision of 13 Nov 2026).

### Tests

`tests/usecase.test.mjs` and `tests/usecase.html` (the type, its rules, the example under three fonts, both themes and
both directions, every gesture by pointer and key through `apply()`, a 30-step session); `tests/usecase-minimal.json`
and `tests/usecase-stress.json` with `tests/stage4-fixtures.test.mjs` and `tests/stage4.html` (`notes/stage-4.md` §16:
every edge case, laid out clean right and down, line ends on outlines, P1); `tests/notation.html` (open arrowheads and
triangles on the outlines); `tests/cli.py` (render, check, stills, pdf, the diff Action's step); `tests/mcp.py` (the MCP
server's read tools and a highlight).
