# Conformance: the UML profile diagram

Release 0.23.0 (stage 6, `docs/diagrams/notes/stage-6.md`). Support is claimed by level (decision D3): **render** and
**edit** on the subset below, and a **check** of every applied stereotype across the model. No interchange: Mermaid has
no profile notation, and there is no XMI and no UML diagram interchange (`docs/diagrams/proposal.md` §8.1).

A view of a version-2 model (`"schemaVersion": 2`) whose `diagram` is `"uml.profile"` is a profile diagram. It is drawn
by `lib/umlimator-all.js` (`umlimator/all`), which the CLI's page inlines; `lib/umlimator.js`, what a map host loads,
draws it as plain cards with a warning and checks no stereotype. The vocabulary is `docs/diagrams/model.md` §2, row 7;
the example is [`examples/bookshop-profile.json`](../../examples/bookshop-profile.json).

## The subset, and UML 2.5.1's clauses

| UML 2.5.1 | In the model | Drawn as |
|---|---|---|
| 12.3 Profile | `uml.Profile`; `props.stereotypes` | a package with «profile» over its name; holding something shown, a box titled «profile» name |
| 12.3 Stereotype | `uml.Stereotype`, `parent` a profile; `props.isAbstract`; its tag definitions `uml.Property` members (`name : Type [mult] = default`) | a classifier, «stereotype» over its name (italic when abstract), its tag definitions as attribute rows |
| 12.3 metaclass reference (an ElementImport of a profile) | `uml.MetaclassReference`, `parent` a profile, its `label` a UML metaclass | a classifier, «metaclass» over its name, no compartment |
| 12.3.3 Extension | `uml.Extension` from a stereotype to a metaclass reference; `props.isRequired` | a solid line with a filled triangle at the metaclass; `{required}` as its label |
| 12.3 ProfileApplication | `uml.ProfileApplication` from a package to a profile | dashed, an open arrowhead at the profile, «apply» |
| 9.9 Generalization | `uml.Generalization` between two stereotypes | the class type's hollow triangle |
| 10.2 Enumeration | `uml.Enumeration` (a tag's type), `parent` a profile; its literals | the class type's, «enumeration» and its literals |
| 12.3.4 applied stereotypes (notation) | `props.stereotypes` and `props.tags` on any element shown | the element's class or package look; under its name a compartment for each stereotype it has, headed «name», each row `tag = value` (a missing required value `tag = ?`); a member that applies a stereotype listed with it in front and its tags in braces |
| 7.8 Comment | `uml.Comment`, `uml.CommentLink` | a note, a dashed line |

**Stereotypes across the model** (`notes/stage-6.md` §5). `validate()` runs the check once on every version-2 model that
holds a `uml.Profile`, whichever views it has (`TYPED.across`). A profile applies to the package that applies it and to
everything that package owns, at any depth (a member by its owner, a line by its `parent`, else its `from` end). Inside
that scope a stereotype name is the applied profile's (`Profile::name` picks one of two applied profiles that define it;
names meet with the first letter in either case, so `Entity` is «entity»); UML's standard profile (clause 22) and UML's
keywords (Annex C) stay free keywords; outside every applied profile any name is a keyword, as before 0.23.0. A
stereotype fits an element when one of its extensions, or one of its generals', names the element's metaclass or one it
specializes, by a table of UML 2.5.1's generalizations with a row for every `uml.*` type the registered types use. Tags
are `props.tags`, keyed by stereotype then tag, each value text, checked against the tag definition. They are edited in
the properties panel on every UML view (`TYPED.fields`, `docs/editing.md`).

Rules on definitions (errors): `profile-owns` (a stereotype's and a metaclass reference's owner is a profile, directly),
`stereotype-names` (two stereotypes of one profile, or two profiles, whose names meet), `extension-ends`,
`application-ends` (a package, or a profile, applying another profile), and the class type's `generalization-kinds`
(a stereotype specializes a stereotype). Warning: `metaclass-known`. Rules on applications (warnings, so a model that
was valid stays so): `stereotype-unknown`, `stereotype-applied` (a profile's stereotype outside its scope),
`stereotype-ambiguous`, `stereotype-extends` (it does not fit the element), `stereotype-required` (an abstract required
stereotype met by no specialization), `tag-defined`, `tag-value` (Boolean, Integer, Real, UnlimitedNatural, an
enumeration of the profile), `tag-required`; and `stereotype-abstract` (an abstract stereotype applied), an error.

**Departures from UML 2.5.1:** a required extension's stereotype is supplied by the tool, not demanded: 12.3.3 says a
model without it is not well formed; this tool applies it to every element of the metaclass in the profile's scope, with
no warning, and its tags are the element's (the profile view, `describe()`, the panel and the PDF show it; other views
draw stored stereotypes only). Names meet with the first letter in either case (UML's own lower-case convention for
guillemets). `profile-owns` asks for a profile as the direct owner, narrower than UML's `containingProfile()`. The
package that applies a profile is itself in its scope (as UML tools take it; the maintainer's decision of 13 Nov 2026).
Clause numbers are as `notes/stage-6.md` cites them; the clause's words were not quoted here, as the specification's PDF
was not checked in this package.

## Left out

`notes/stage-6.md` §15: stereotype icons and custom shapes; stereotypes shown in a comment symbol; a profile's metamodel
references (its own import is not flagged since 0.31.0); ProfileApplication's `isStrict`; constraints owned by
stereotypes (OCL); stereotype operations; a tag's list value; a tag whose type is a metaclass (its value passes as any
text); a stereotype's associations; nested profiles; `sysml.` types checked against metaclasses (milestone 3); tags
drawn on other types' views; XMI profiles. And, for both stage 6 types, copy and paste, per-type `diff()` writers and a
reader.

Layout limits, measured on `examples/bookshop-profile.json` and `tests/profile-stress.json`:

- Laid out by the host's ranking, down by default, an extension ranking the metaclass first, with port repair and
  rerouting off (`repair: false`, `reroute: false`, §12).
- The example lays out clean down and right: no crossing, `check()` finds nothing.
- `tests/stage6-fixtures.test.mjs` pins the stress file. Its `edge-cases` view (two profiles, 26 stereotypes and
  metaclasses, 20 applying elements, packages two deep) is clean both ways. Its generated `all` view (3 profiles, 40
  stereotypes, 50 metaclass references and classes, 60 lines) crosses 17 times laid out right and 30 times down; no line
  runs through a node.
- A member row with long tags is cut with an ellipsis at the classifier's width (`«column» - placedAt: Instant [0..1]
  {name = placed_a…` on the example); its whole text is in the node's accessible name, `describe()` and the PDF's rows.

## Writers: what each shows of a profile diagram

Measured on `examples/bookshop-profile.json` (0.23.0): `umlimator.py stills` (SVG and PNG) and `umlimator.py pdf`. The
PNG was looked at, the SVG read, the PDF's text read back (`tests/cli.py` reads its tables).

| | SVG: `handle.toSVG()`, `umlimator.py stills` | PNG: `handle.toPNG()`, `umlimator.py stills` | PDF: `umlimator.py pdf` |
|---|---|---|---|
| Profile and package boxes, «stereotype» and «metaclass» classifiers, tag definitions | Yes | Yes | Yes, in vectors |
| Tag compartments | Yes; a long member row cut with an ellipsis | Yes, cut alike | Yes, cut alike in the picture; whole in the tables |
| Extensions (filled triangle, `{required}`), «apply», generalizations | Yes | Yes | Yes |
| The legend of line kinds | No: the legend is a piece of the page | No | Yes, under the picture; its two longest explanations (the extension's "… the metaclass it points to" and the profile application's "… the package may use the profile's stereotypes") cut at the legend's width |
| Text | Text, in the page's font family; not embedded unless `fontCSS` is given | Pixels | Selectable text |
| Accessible names | Each node's `aria-label` kept ("Stereotype owned, extends Class {required}, team: String [0..1]"); the lines' `<title>` removed | None | None |
| Theme | The page's | The page's | `--theme`, light by default |
| Tables | None | None | "Elements": a profile's stereotypes and metaclasses and where it is applied; a metaclass's extensions; a stereotype's extension, generals and tags; an element's stereotypes with their tags (a required one marked), each member's. "Lines": every line, from → to, its label and kind (empty for an extension and an application: their `{required}` and «apply» are drawn from the line, not stored as a label) |

## Accessibility

Every piece has a name: "Profile BookshopConventions, holding 6 elements", "Stereotype owned, extends Class {required},
team: String [0..1]", "Profile application from sales to BookshopConventions: «apply»"; an element's name says its
stereotypes, the required ones too, and its tags. Tab reads what each box holds, then the rest, then the lines;
a box is not a Tab stop: the keyboard reaches it through the outline of elements.
Text reads at 4.5:1, lines and outlines at 3:1 in both themes (`tests/profile.html`, `tests/stage6.html`). Every gesture
has a key (`docs/editing.md`).

## Performance (P1)

`tests/stage6-fixtures.test.mjs` on `tests/profile-stress.json`'s `all` view, CPU time, best of seven after a warm-up,
on an Apple laptop at a load average of 5 to 7 (14 Nov 2026): a full layout and its SVG 73 to 82 ms; a tag value set 14
to 28 ms; a stereotype added (a header grown, laid out again) 73 to 81 ms, against the 100 ms target. CI holds 1 s and
prints the figures. The cross-model check alone (`TYPED.across`, `tests/stereotypes.test.mjs`) on 2,006 elements and
1,503 lines under 3 applied profiles: 11 ms against its 10 ms target; four times the model 30 ms, held under ten times.
The canvas's problems list runs `validate()`, so the check runs on every edit of a typed view in `umlimator-all.js`.

## Tests

`tests/stereotypes.test.mjs` (every cross-model rule with a passing and a failing model, the metaclass table, no model
without a profile getting a new problem, P1 of the check); `tests/profile.test.mjs` and `tests/profile.html` (the type,
its rules, the look, describe(), every gesture by pointer and key, a 30-step session); `tests/profile-minimal.json` and
`tests/profile-stress.json` with `tests/stage6-fixtures.test.mjs` and `tests/stage6.html` (`notes/stage-6.md` §11:
every edge case, P1); `tests/notation.html` (the extension's filled triangle, «apply»'s dashed open arrow);
`tests/cli.py` (render, check, stills, pdf and its tables, the diff Action's step); `tests/mcp.py`.
