# Risks and edge cases

Checked against `main` at 14e5844 on 11 Nov 2026. **Verified** means run or read in the code; everything else is
reasoning to be tested. Each row says what to do and in which stage ([`plan.md`](plan.md)). Symbols are named, not
line numbers, because the file they are in is about to be split.

## 1. Findings that changed the plan

All verified.

| # | Finding | Evidence | What it means |
|---|---|---|---|
| F1 | A line from a card to itself is dropped, and nothing says so | A model with `from: "a", to: "a"`: `validate()` returns no problem and `layout()` draws no line | Self-transitions, reflexive associations and self-messages need a self-loop route. Stage 1. Today's map should at least warn: a small fix for 0.16.0 |
| F2 | Two lines between the same two cards are drawn as one | The same run: `e` and `e2` come back as one line | Typed lines must stay apart, each with its own ports and label. Stage 1 |
| F3 | The CLI validates every model through the upstream script, which knows cards only | `upstream_view()` in `umlimator.py`; `validate_map()` in `engine/scripts/visual.py`, which CI requires unmodified | A line that ends on a member (a port) is "an unknown end" there. `upstream_view()` must show members as cards, as it already does boxes. Stage 1 |
| F4 | `render` bakes a row order into every view's `layout` | `cmd_render()` in `visual.py` ("bake") | A view whose layout has no slots (sequence, timing, mindmap) must return nothing to bake. Stages 1 and 3 |
| F5 | The standalone page inlines one module file into one `<script type="module">` | `visual_cmd()` in `umlimator.py`; `engine/assets/template.html` | After the split, the page needs one built file with no imports. It is committed and checked fresh in CI, as `examples/bookshop.html` is |
| F6 | A release that predates typed models draws one wrongly and silently | A typed model on today's module: no warning, one 138 by 42 card | Old releases cannot be fixed. From stage 1 a newer `schemaVersion` is an error. Document that the CLI, the Action and the module must be at least the version that wrote the model |
| F7 | Any change to a card relays out its view | `viewKey()` is the JSON of the view, its cards and its lines | For typed views, split the key: what moves geometry, and what only repaints. Otherwise every keystroke in a property field routes again. Stage 1 |
| F8 | Any `.json` with `nodes` and `views` lists counts as a map | `model_of()` in `umlimator.py`; CI's globs are `examples/*.json` | The target examples live in `docs/diagrams/examples/`, outside those globs. A stage moves its examples to `examples/` when they draw |
| F9 | Lines without an id are named by position, and stories, overlays and hosts keep those names | `Ref` in `lib/umlimator.d.ts`; `validate()` accepts `"a->b#0"` | `migrate()` must not give ids to untyped lines. Only typed lines require ids. (The proposal first said otherwise; corrected) |
| F10 | Layout of 50 to 69 cards takes 1.4 to 1.9 s in Node, cold | Timed on 14e5844. An earlier 4 s figure was taken while other jobs ran | The 1 s budget for a full layout is not met on dense views today. Editing must not need a full layout (F7, pins) |
| F11 | `main` is in the middle of 0.16.0, with layout fixes still landing | `git log`: #146 to #148; `bench/expected.json` rewritten twice | Release 0.16.0 first. The split lands alone, with no other pull request open |

## 2. Compatibility with what exists

Host applications embed today's map notation. Nothing below may change what they see.

| # | Risk or edge case | What to do | Stage |
|---|---|---|---|
| C1 | An existing model draws differently after the layout is generalized | Geometry hashes (`bench/expected.json`), the examples' stills in `box`, and every existing test stay as they are in every pull request. The map is the default diagram: a view with no `diagram` takes today's path untouched | All |
| C2 | The public API shifts | Additive only through 1.0.0: `render()`, `layout()`, `Handle`, the events and the five `change` operations keep their shapes. 1.0.0 removes nothing | All |
| C3 | Hosts that handle `change` meet operations they do not know | Map views emit exactly today's operations. New operations (`set`, `hide`, `reparent`) come only from typed views, in a new `edit` event that carries a transaction | 1 |
| C4 | The split moves files hosts load by path | `lib/umlimator.js` stays one built file with today's exports. `umlimator/element`, `umlimator/theme.css` and the docs plugins keep their paths. A git install still works because built files are committed | 1 |
| C5 | Map-only hosts pay for 28 notations | Families are subpath exports (`umlimator/uml`). Budget: the core grows by no more than 15% gzipped over 0.16.0 | 1 |
| C6 | `box`, `c4` and `uml` skins are mistaken for diagram types | They stay, for maps. Documentation names them "card skins" and the new ones "diagram types"; `uml` the skin is described as UML-style cards on a map | 1 |
| C7 | `render: "sequence"` is mistaken for a sequence diagram | It stays and is documented as a numbered view. A helper turns one into a `uml.sequence` view | 3 |
| C8 | Two ways to draw C4: untyped maps with the `c4` skin, and typed C4 views | Both stay valid. Readers keep writing untyped maps until milestone 2; an explicit command upgrades a model, never `migrate()` | M2 |
| C9 | `nodeOverrides.label` renames a typed element in one view only | Allowed for maps. On a typed node it is a warning: a name is meaning | 1 |
| C10 | The `map-repo` skill, the MCP server and the diff Action meet typed models | Each gets a test with one typed model per shipped stage; `describe()`, `paths()` and `diff()` get per-type writers as their types ship | Each |

## 3. Model and identity

| # | Risk or edge case | What to do | Stage |
|---|---|---|---|
| M1 | Id clashes: today a line may share a card's id, and a view may share one on purpose | One id space for typed nodes, edges, members and fragments. Views keep their own. An untyped clash stays legal | 1 |
| M2 | Ids that look positional | A new id may not contain `->` | 1 |
| M3 | A type or id named `constructor` or `__proto__` | Look types up with own-key checks, as `hasKey` does for kinds today | 1 |
| M4 | Deleting an element leaves references behind | `apply()` deletes in one transaction: the element, its members, lines to them, its pins and `present` entries, its place in every view, operands and fragments left empty, story steps and lens picks that name it. Undo restores all of it. A `references(model, id)` helper lists them for hosts with their own store | 1 |
| M5 | An element shown in no view cannot be found | The views list gains an outline of elements, with "in no diagram" as a filter; delete-from-model works there | 1 |
| M6 | A child is shown and its owner is not, or the reverse | Child alone: drawn at top level with its qualified name (`sales::Order`). Owner alone: drawn closed. Some children: only those | 1, 2 |
| M7 | Ownership cycles; a `parent` that is a member of the element itself | Validation errors | 1 |
| M8 | Types as text (`"valueType": "Money"`) do not follow a rename | Accepted for 1.0.0 and documented. Rename offers "also change 3 mentions" by text match. References by id come later | 1 |
| M9 | Generic fields duplicate typed ones (`sublabel` against `props.technology`) | A type draws from `props` only. Readers stop writing the generic twin once the typed field exists | M2 |
| M10 | One JSON Schema for 28 vocabularies becomes unreadable | Generate it from the registry's descriptors at build time; CI checks the examples against it | 1 |
| M11 | A reorder of members reads as "changed" in `diff()` | Correct but vague. The per-type diff writer says "moved" | 1 |
| M12 | Two views order the same messages differently | Allowed only when messages are inline. Messages shared by id carry one order, in the view that owns the interaction; the spike settles which form is the default | 1, 3 |
| M13 | A model from a newer release holds types this release lacks | Drawn as plain cards with a warning and written back unchanged; `ext` is never touched | 1 |

## 4. Layout, routing and notation

| # | Risk or edge case | What to do | Stage |
|---|---|---|---|
| L1 | Row pitch is constant; a 20-member class is taller than its row | Rows take the height of their tallest node. Long compartments collapse to "+n more" above a threshold the view sets | 1 |
| L2 | Node size depends on the font, so geometry differs between Node (an estimate) and a browser, and between fonts | Hashes use the estimate, as now. Each fixture is also laid out under three fonts in the browser tests, with no overlap or overflow allowed | 1 |
| L3 | Top-to-bottom direction touches every part of the layered layout | Implement as a transform of the finished left-to-right geometry where that is exact (ports, labels and shapes rotate with it); otherwise a `direction` threaded through. Decide in the design note; maps stay left to right | 1 |
| L4 | Several typed lines between one pair crowd each other's labels and ends | Ports spread along the side; end labels sit in reserved boxes by each end; the label step treats them as obstacles. The fixture has four lines between two classes | 1 |
| L5 | End labels (role, multiplicity) collide where many lines meet one side | The side widens before labels overlap, as gaps widen for labels today | 1 |
| L6 | Inheritance wants the parent above; associations have no direction | A relation may carry a layout hint; hints never override a pin | 1 |
| L7 | A line that ends on another line: a note on an association, an association class, a constraint between two lines | Out of the subsets. `uml.CommentLink` ends on nodes and members only; a later stage may add ends on lines | Later |
| L8 | Lines that cross the border of a compound node, at several depths | The router already crosses box borders. Fixtures: three levels of nesting, a line from depth 3 to depth 0 | 2, 4, 5 |
| L9 | Ports: order along a side, labels inside or outside, ports on nested parts | `present.<port>.side` and order; the router ends on the port's point. A time-boxed trial of the own engine decides whether ELK is offered | 5 |
| L10 | Lanes: a node in no lane; a flow across lanes; nested lanes; a lane with nothing in it | A node in no lane sits outside the lanes with a warning; empty lanes keep a minimum size | 4 |
| L11 | Regions of a composite state; a transition from a substate to a state outside | Regions are stacked compartments of the compound node; the transition crosses borders as any line does | 4 |
| L12 | Shapes that are not boxes take ports badly: an ellipse, a diamond, a bar, a small circle | Each shape gives its outline and where a line may end, as `inset` does today; small nodes (20 px) get one port per side | 3, 4 |
| L13 | Unlabelled nodes (an initial node, a fork) have no accessible name | The type names them: "Initial node", "Fork" | 4 |
| L14 | A view of several hundred elements | State and test a ceiling: 150 nodes and 250 lines per view. Above it, `validate()` hints at splitting the view | 1 |

## 5. Editing

| # | Risk or edge case | What to do | Stage |
|---|---|---|---|
| E1 | The host updates the model while a name field or a property field is open | The field stays if its element still exists, as the name field does today | 1 |
| E2 | Undo steps are too fine or too coarse | One transaction per committed field, per drag, per multi-select delete. Map views keep one event per card | 1 |
| E3 | A label does not parse (`+ total Money`) | Kept as written, with a warning; never half-applied. `print(parse(x))` is stable for every fixture line | 1 |
| E4 | Multiplicity forms: `*`, `1..*`, `0..1`, `2..5`; lower above upper | Parsed into bounds; the text is kept as written | 1 |
| E5 | Remove from this view against delete from the model | Two commands and two keys (Delete, Shift + Delete). The last view of an element asks nothing: the element stays in the model, findable in the outline | 1 |
| E6 | Dropping a line on an illegal target | The target is not offered while dragging; the hint line says why | 1 |
| E7 | Copy, paste and duplicate | Not planned before 1.0.0. If added: paste in another view shows the same element; duplicate makes a new one with new ids | Decide |
| E8 | Touch screens: drag to connect, small ports | Every gesture has a keyboard path and a menu path; hit areas are 24 px at least | 1 |
| E9 | Reordering a message across an operand's border | The message takes the operand it lands in (`parent`). An operand left empty stays, with a warning | 3 |
| E10 | Deleting the only message of an operand, or a lifeline with messages | Cascade (M4): the lifeline's messages go with it; the operand stays empty | 3 |
| E11 | Pins after a regeneration removes pinned elements | A pin for an id that is gone is dropped silently; all others hold | 1 |
| E12 | The host refuses an edit | As today: nothing is drawn until `update()`. With the reference store the refusal carries its problems to the hint line | 1 |

## 6. By family

| # | Family | Edge cases to cover with fixtures |
|---|---|---|
| G1 | Classifier graphs | A class with no members; with 60; an abstract class; static and derived members; a reflexive association; four lines between two classes; a package holding a package; an enumeration with no literals |
| G2 | Structure graphs | Two parts of one type, each with the same port (why `ends.part` exists); a delegation from an outer port to an inner one; an artifact deployed by nesting and one deployed by a line |
| G3 | Plain graphs | A use case in no subject; two messages each way on one link; a C4 relationship that a view implies between two parents |
| F | Flow graphs | A decision with three exits; a merge and a decision drawn alike; a fork with one branch that ends early; a self-transition; a transition to history; a choice with no `else` |
| T | Time axis | A self-message; a call inside a call on the same lifeline; a reply with no call; a `create` that lowers the lifeline's head; a `delete`; an operand with no messages; a fragment inside a fragment; an interaction use across two lifelines; lifelines that no message touches; timing changes at the same instant on two lifelines |
| R | Tree | One topic; a branch with 30 children; all branches on one side; long topic text |
| ER | | A composite key; a self-reference; a many-to-many through a junction; a foreign key that is also part of the primary key; a nullable foreign key |
| BPMN | | A boundary event moves with its task; a message flow to a black-box pool; a gateway with one exit; a sub-process shown closed and open; a flow that would leave its pool (refused) |
| Cloud | | An icon the pack lacks; a pack never fetched (offline): a plain glyph with the label; a pack version that renamed an icon: an alias table; five levels of groups; dark theme, where icons are never recoloured |

## 7. Readers, writers and interchange

| # | Risk or edge case | What to do | Stage |
|---|---|---|---|
| R1 | A reader silently flattens what it cannot map | Every reader returns a report; each item is `skipped`, `approximated` or `kept`. A test file with every construct of the source language pins the report | Each |
| R2 | Hostile or huge input | Hand-written, linear readers; an input size limit; no regular expression with nested repetition on a whole line | Each |
| R3 | Regeneration renames ids | Readers derive ids from the source's own names; a test reads the same source twice and compares ids | Each |
| R4 | Mermaid changes its syntax | The reader states the Mermaid version it was written against; fixtures are copied from Mermaid's own documentation | 1 |
| R5 | BPMN files carry positions; D1 lays out automatically | Positions are not kept on import, and the report says so once per file. Export writes diagram interchange from the layout | M4 |
| R6 | Users expect XMI | Out of scope through 1.0.0 and said so in each UML type's conformance note | All |
| R7 | New readers are JavaScript; `umlimator.py import` is Python | The command calls the module through Node, as `diff` and `trace` do; without Node it says which formats need it | 1 |

## 8. Performance, accessibility, security, theming

| # | Risk or edge case | What to do | Stage |
|---|---|---|---|
| P1 | Editing feels slow | Budgets in CI: 100 ms from an edit to paint for a 40-element view with positions kept; 1 s for a full layout of 50 nodes; measured on the stress fixture of each type | 1 |
| P2 | Layout blocks the page | Only what changed is routed again. A worker option for full layouts if the budget is missed | 1 |
| P3 | Snapshots for undo grow with large models | Kept until a model passes 2 MB of JSON; inverse patches then | Later |
| A1 | New shapes and panels are not reachable by keyboard or screen reader | Each type defines its reading order and names; each gesture has a key; the written-out axe rules and the contrast test cover the palette, the properties panel and the problems list | Each |
| A2 | Motion on typed views | Follows today's rules: none under reduced motion, in exports or in an instant page | 1 |
| S1 | Markup in labels, guards, notes and constraint text | Every string goes through `esc()` as today; no new `innerHTML` from model text | Each |
| S2 | Vendor icon files are SVG and may carry script | Drawn through `<image>` from a data URL, never inlined as markup; fetched only from the owner's address in the manifest, checked by hash | M4 |
| T1 | Hosts set today's `--um-*` variables only | New colours are mixed from existing tokens; no new variable is required | 1 |
| T2 | Notation needs black-on-white conventions (filled diamonds, hollow triangles) in a dark theme | "Hollow" is the stage's background, "filled" the line's colour; checked in both themes | 1 |

## 9. Process, with agents building in parallel

| # | Risk | What to do |
|---|---|---|
| X1 | Parallel pull requests collide in one file of over 5,000 lines | The split is the first work package and lands alone. After it, a work package owns its files (see the lanes in `plan.md`) |
| X2 | Two branches add the same helper, or pass CI alone and fail together | Rehearse the merge of open branches in a scratch worktree before merging the first; compare against the true merge base |
| X3 | Geometry hashes change by accident, or are rewritten to make CI pass | `--write-expected` only in a commit that says why, with the count of issues before and after, as the 0.16.0 commits do |
| X4 | A type ships drawable but not editable | The definition of done in `plan.md` is the merge checklist; the stage's release notes list what is left out |
| X5 | The registry freezes around the class diagram | The sequence spike runs in stage 1; the registry is documented only after it |
| X6 | Releases are dropped when several pull requests merge back to back | Merge the release pull request after earlier runs on `main` finish, as `check.yml` says |
| X7 | The plan and the code drift apart | Every pull request updates the status table in [`README.md`](README.md) |
| X8 | Scope grows inside a type | A subset is fixed in the stage's design note; additions wait for a later release |

## 10. Not checked

- No prototype exists of variable heights, a direction, ports, or the time-axis layout. Section 4 is reasoning.
- The browser test suites and `bench/bench.py` were not run for this review; `node --test` was (102 pass).
- How host applications call the module was not read. Section 2 rests on the public API and its tests.
- The vendors' icon terms still need reading before milestone 4 (`proposal.md` §6.5).
