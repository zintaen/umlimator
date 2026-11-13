# Conformance: the UML use case diagram

Release 0.21.0 (stage 4, `docs/diagrams/notes/stage-4.md`). Support is claimed by level (decision D3): **render** and
**edit** on the subset below. No interchange: Mermaid has no use case notation, and there is no XMI and no UML diagram
interchange (`docs/diagrams/proposal.md` §8.1).

A view of a version-2 model (`"schemaVersion": 2`) whose `diagram` is `"uml.use-case"` is a use case diagram. It is
drawn by `lib/umlimator-all.js` (`umlimator/all`), which the CLI's page inlines; `lib/umlimator.js`, what a map host
loads, draws it as plain cards with a warning. The vocabulary is `docs/diagrams/model.md` §2, row 8; the example is
[`examples/shopping-use-cases.json`](../../examples/shopping-use-cases.json).

## The subset, and UML 2.5.1's clauses

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
least), `generalization-kinds`, `include-cycle` (UML's `cannot_include_self`), `named` (UML's `must_have_name`)
(errors); `use-case-owner`, `point-names` (warnings).

Deleting an extension point (Shift + Delete, or the member list's ✕) takes every extend left naming no other point of
its use case, in the same transaction, and the hint line names them (`Deleted, with it, the extend from "Redeem voucher",
which named no other extension point`); an extend naming another point keeps it, the point dropped from its list. So no
single delete leaves an `extend-points` error (`tests/delete-cascade.test.mjs`). A bare `apply()` delete (a host's own
store) drops the point from the list as before, and may leave one.

## Left out

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
  and four down, and, laid out right, an include and an extend between one pair of use cases that share a line.
- A line from an actor to a use case far down the subject may run round the subject's box (the payment provider's
  association in the example): a long route, not a crossing.

## Writers: what each shows of a use case diagram

Measured on `examples/shopping-use-cases.json` (0.21.0): `umlimator.py stills` (SVG and PNG) and `umlimator.py pdf` on
its rendered page. Each file was opened and looked at.

| | SVG: `handle.toSVG()`, `umlimator.py stills` | PNG: `handle.toPNG()`, `umlimator.py stills` | PDF: `umlimator.py pdf` |
|---|---|---|---|
| Actors' figures, ellipses with their extension points, the subject's box | Yes | Yes | Yes, in vectors |
| Lines, dashes, open arrowheads and triangles, «include» and `«extend» (point) [condition]` labels | Yes | Yes | Yes |
| The legend of line kinds | No: the legend is a piece of the page, not of the picture | No | Yes, under the picture |
| Text | Text, in the page's font family; the font is not embedded unless `fontCSS` is given | Pixels | Selectable text |
| Accessible names | Each actor's, use case's and the subject's `aria-label` kept; the lines' `<title>` removed, as for maps | None | None |
| Theme | The page's, every colour resolved | The page's | `--theme`, light by default |
| Tables | None | None | "Elements": each actor, subject and use case by its kind, a use case's extension points as its members; "Lines": each line from → to and its kind. **Gap:** an extend's points and condition are not in its row (the table reads a line's `label`, which an extend leaves empty; `risks.md` R9) |

The site builds every example's stills and PDF ([zintaen.github.io/umlimator](https://zintaen.github.io/umlimator/)).

## Accessibility

Every piece has a name: "Actor Shopper", "Use case Check out, in Online bookshop, 2 extension points", "Subject Online
bookshop, holding 8 use cases", "Extend from Redeem a voucher to Check out, at payment, when the shopper has a voucher
code". Tab reads the actors, then each subject and its use cases, then the rest, then the lines (`geo.order`).
`describe()` writes the view in sentences. Text reads at 4.5:1 and lines and outlines at 3:1 on the stage in both themes
(`tests/usecase.html`, `tests/stage4.html`). Every editing gesture has a key (`docs/editing.md`).

## Performance (P1)

`tests/stage4-fixtures.test.mjs` on `tests/usecase-stress.json`'s `all` view (50 elements, 60 lines), CPU time, best of
three after a warm-up, on an Apple M5 laptop at a load average of 6 to 8 (the idlest it got; 13 Nov 2026): a full layout
and its SVG 28 ms, a use case renamed 28 to 29 ms, a stereotype set 27 to 28 ms, against the 100 ms target. CI holds 1 s
and prints the figures (the maintainer's decision of 13 Nov 2026).

## Tests

`tests/usecase.test.mjs` and `tests/usecase.html` (the type, its rules, the example under three fonts, both themes and
both directions, every gesture by pointer and key through `apply()`, a 30-step session); `tests/usecase-minimal.json`
and `tests/usecase-stress.json` with `tests/stage4-fixtures.test.mjs` and `tests/stage4.html` (`notes/stage-4.md` §16:
every edge case, laid out clean right and down, line ends on outlines, P1); `tests/notation.html` (open arrowheads and
triangles on the outlines); `tests/cli.py` (render, check, stills, pdf, the diff Action's step); `tests/mcp.py` (the MCP
server's read tools and a highlight).
