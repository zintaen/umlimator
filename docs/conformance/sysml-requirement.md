# Conformance: the SysML requirement diagram

Release 0.25.0 (milestone 3, `docs/diagrams/notes/milestone-3.md` §6). Support is claimed by level (decision D3): **render**
and **edit** on the subset below, and **interchange** with Mermaid's `requirementDiagram` (a reader and a writer). No XMI.

A view of a version-2 model (`"schemaVersion": 2`) whose `diagram` is `"sysml.requirement"` is a requirement diagram. It is
drawn by `lib/umlimator-all.js` (`umlimator/all`), which the CLI's page inlines; `lib/umlimator.js`, what a map host
loads, draws it as plain cards with a warning. The vocabulary is `docs/diagrams/model.md` §2, row 16; the example is
[`examples/ebike-requirements.json`](../../examples/ebike-requirements.json), the e-bike atlas's root
([`examples/ebike-atlas.json`](../../examples/ebike-atlas.json)), whose specification opens the block definition view
and whose range requirement opens the parametric view that checks it.

## The subset, and SysML v1.7's clauses

SysML v1.7 (formal/24-01-07): clause 16 (requirements), the non-normative extensions' annex (extendedRequirement's `risk`
and `verifyMethod`) and Annex A (the frame and its header).

| SysML v1.7 | In the model | Drawn as |
|---|---|---|
| 16, «requirement» | `sysml.Requirement`; `props.reqId`, `props.text` | a classifier with «requirement» over its name and one compartment `id = "EB-1.1"`, `text = "…"`, the text wrapped at 224 px into as many rows as it needs (`present.<id>.rows` caps them, "+k more") |
| Mermaid's five other kinds | `props.stereotypes` (`functionalRequirement`, …) | the kind over the name, beside «requirement» |
| Non-normative annex, extendedRequirement | `props.risk` (`low`, `medium`, `high`), `props.verifyMethod` (`analysis`, `inspection`, `test`, `demonstration`) | rows when set |
| 16, requirement containment | a requirement's `parent`, a requirement or a package | a requirement in a requirement: a derived line with a crosshair (⊕) at the owner's end, never stored; in a package: inside the package's box |
| 16, «deriveReqt», «satisfy», «verify», «refine», «trace», «copy» | `sysml.DeriveReqt`, `sysml.Satisfy`, `sysml.Verify`, `sysml.Refine`, `sysml.Trace`, `sysml.Copy`, client to supplier | a dashed line, an open arrow at the supplier, its keyword |
| 16, «testCase» | `sysml.TestCase` | a classifier with «testCase» |
| 8, «block» | `sysml.Block` | a classifier with «block», its name only (its compartments are the block definition view's) |
| 16, «rationale», «problem» | `uml.Comment` with the stereotype | a note, the keyword leading its text |
| Annex A, the frame | the view; its `subject`, a package or none | a frame with the pentagon header `req [Package] Name [view title]`, or `req [Model] <model title> [view title]` with no subject |

Rules (`src/sysml/requirement.js`), each with a passing and a failing fixture in `tests/requirement.test.mjs`:

| Rule | Level | SysML v1.7 |
|---|---|---|
| `requirement-nested` | error | clause 16, «requirement»'s constraints: a classifier nested in a requirement is a requirement |
| `requirement-members` | error | clause 16, «requirement»: no attributes, operations or ports of its own |
| `requirement-general` | error | clause 16, «requirement»: it takes part in no generalization |
| `requirement-association` | error | clause 16, «requirement»: it takes part in no association |
| `requirement-typing` | error | clause 16, «requirement»: it types no element |
| `derive-ends`, `copy-ends` | error | clause 16, «deriveReqt» and «copy»: client and supplier are requirements |
| `copy-text` | error | clause 16, «copy»: the client's text is a read-only copy of the supplier's |
| `satisfy-ends`, `verify-ends` | error | clause 16, «satisfy» and «verify»: the supplier is a requirement |
| `requirement-owner` | warning | none: the subset's restriction (a requirement owned only by a requirement or a package), a departure |
| `requirement-id`, `requirement-text` | warning | none: what a reader expects (one id each, a text) |
| `derive-cycle` | warning | none: a requirement derived from itself through a chain says nothing |
| `satisfy-from`, `verify-from` | warning | SysML allows any named element as the client; a requirement satisfying, or anything but a test case verifying, is unusual |
| `refine-ends`, `trace-ends` | warning | one end is a requirement, as SysML's own uses of them |
| `risk-value`, `verify-method` | warning | the non-normative annex's words |

Clause 16's constraints are cited by stereotype, as the note does (§6.3); their sub-clause numbers were not quoted from the
PDF in this build (a gap, below).

**Departures from SysML v1.7:**

- **Containment is drawn, not stored**: the crosshair line is derived from `parent` and is no model element; deleting it
  re-homes the requirement to its owner's owner.
- **A requirement's owner** is a requirement or a package: a restriction of the subset, not a SysML constraint
  (`requirement-owner`, a warning).
- **A frame with no subject** names `[Model]`, which Annex A allows, and the model file's `title` as if it were a Model
  element's name, which it is not.
- **`copy-text`** fires after a text edited in the panel: the registry has no hook to keep the client's text read-only, so
  the problem says so and the author edits it back.

## Left out

`notes/milestone-3.md` §17: requirement tables and matrices; callout notation (a note listing satisfiedBy); derived
compartments on the box (they are in `describe()` and the PDF); requirement generalization (SysML forbids it);
extendedRequirement's `source` and the other non-normative categories; a req frame whose element is a requirement. And
copy and paste, XMI, allocations, views and viewpoints.

Layout limits, measured on `examples/ebike-requirements.json` and `tests/requirement-stress.json`:

- Port repair and rerouting off (`repair: false`, `reroute: false`, §14). The type ranks by containment and the six
  relationships (owner above, or left of, what it contains), then lays out by the layered layout.
- The example lays out clean right and down: `check()` finds nothing, in Node and in Chrome.
- `tests/sysml-fixtures.test.mjs` pins the stress file. Its `edge-cases` view (containment four deep, a requirement in a
  package, a derive cycle, a copy with another text, a satisfy to a block, a duplicate id, a requirement with a member,
  a generalization between requirements, a 600-character text and one capped, a verify from a block, a «rationale», the
  five kinds, a 40-character name, a requirement with no text) crosses once, right and down; `ec-package` (the frame of a
  package subject) is clean. The generated `all` view (50 requirements, 60 relationships) crosses 204 times right and
  235 down, with two findings down (two lines sharing a track, a «satisfy» label on a line); no line runs through a node.

## Writers: what each shows of a requirement diagram

Measured on `examples/ebike-requirements.json` (0.25.0); the PDF's text read back by `tests/cli.py`.

| | SVG: `handle.toSVG()`, `umlimator.py stills` | PNG: `handle.toPNG()`, `umlimator.py stills` | PDF: `umlimator.py pdf` | Mermaid: `writeMermaidRequirement` |
|---|---|---|---|---|
| Requirements, their id and text | Yes, the text wrapped (a capped one ends "+k more") | Yes | Yes, in vectors; the tables give the text whole | Yes, each kind, `id`, `text`, `risk`, `verifymethod` |
| The frame and its header | Yes, the header cut to the frame | Yes | Yes | No: Mermaid has no frame |
| Containment | The crosshair lines | Yes | Yes; "contains", "contained in" rows | `contains` |
| The six relationships | Yes, each with its keyword | Yes | Yes; each element's rows say them both ways | Yes, forward |
| Blocks and test cases | Yes, by name | Yes | Yes | `element` with `type: Block` or `type: TestCase`; their other props lost |
| Comments and their links, packages | Yes | Yes | Yes | No: reported as not written |
| Direction | Yes | Yes | Yes | `TB` or `LR`; `BT` and `RL` read back as `TB` and `LR` |
| Quotes and line breaks in names and texts | Yes | Yes | Yes | Removed, carried whole in `%% name:` and `%% text:` comments the reader reads back |
| The legend | No: the legend is a piece of the page | No | Yes, under the picture | No |
| Text | Text, in the page's font family; not embedded unless `fontCSS` is given | Pixels | Selectable text | Text |
| Accessible names | Each node's `aria-label` kept; the lines' `<title>` removed | None | None | None |
| Tables | None | None | "Elements": each requirement's id, text whole, risk, verify method and its relations both ways; a test case's or block's relations. "Lines": each relationship by its keyword | None |

## Accessibility

Every piece has a name: "Requirement Pedal assistance, EB-1.1: The motor shall assist the rider only while the rider is
pedalling"; "Satisfy from block Controller to requirement Assistance cut-off". The reading order is the frame, then the
cards rank by rank (down) or row by row (right), then the lines. Text reads at 4.5:1, lines and outlines at 3:1 in both
themes (`tests/requirement.html`, `tests/sysml.html`); the page passes the axe rules the earlier pages run. Every gesture
has a key (`docs/editing.md`).

## Performance (P1)

`tests/sysml-fixtures.test.mjs` on `tests/requirement-stress.json`'s `all` view (50 requirements, 60 relationships), CPU
time, best of seven after a warm-up, on an Apple laptop under other agents' load (14 Nov 2026): a full layout and its SVG
561 ms; a requirement's text edited 590 ms, a satisfy added 543 ms, a containment line deleted 495 ms: over the 100 ms
target, under CI's 1 s ceiling, which the test holds and prints (`tests/requirement.test.mjs` measures its own generated
model alike). The type's own ranking runs inside each edit's time.

## Tests

`tests/requirement.test.mjs` and `tests/requirement.html` (the look, the rules each passing and failing, every gesture by
pointer and key, a 30-step session); `tests/requirement-minimal.json` and `tests/requirement-stress.json` with
`tests/sysml-fixtures.test.mjs` and `tests/sysml.html`; `tests/mermaid-requirement.test.mjs`, `tests/import.py`; `tests/cli.py`;
`tests/mcp.py`; `tests/ebike-atlas.test.mjs`.

**Gap:** the clause numbers inside clause 16 and the annexes' letters were not quoted from SysML v1.7's PDF in this
build (the file could not be read here); each rule cites its stereotype's constraint by name. Settling them is the next
documents package's.
