# Stage 6 design note: profile and timing

Status: **approved** by the maintainer 13 Nov 2026, with every recommendation of §16 taken; the maintainer approves it before work package 6.0 starts. Written against `main` at 5f20041
(0.21.0's release merged, #228; stage 5's 5.0 to 5.6 merged). Stage 5's open branches were read for what they touch, not
for what they do: `stage5-followups` (the review's fixes on 5.4 to 5.6), `stage5-docs` (5.8) and `stage5-elk-trial` (5.7,
a scratch branch). Symbols are named, not line numbers. Revised after two reviews (feasibility against `src/`, fidelity
against UML 2.5.1 and the examples): each finding taken is in the section it changes; the ones that became choices are
decisions 21 to 23 (§16).

Stage 6 ships release 0.23.0: the profile diagram (`uml.profile`) and the timing diagram (`uml.timing`) (`plan.md` §5,
row 6), the last two of UML's 14. Its new engine work: stereotype definitions, and a check of every applied stereotype
across the model whatever diagram its element is drawn in; the time-ruler strategy. It has no reader: Mermaid has neither
diagram (§10). With it the Bookshop atlas holds the 14 UML types, and takes its full pass (§14, `plan.md` §7).

## 1. What this note settles

| # | Point | Decision (recommended) | Section |
|---|---|---|---|
| S1 | The vocabulary of `model.md` rows 7 and 14 | Kept, with refinements: a stereotype may be named `Profile::name`; a stereotype may be abstract; a profile may own `uml.Enumeration` (a tag's type); a metaclass reference names a metaclass of a stated table; a timing view's changes are ordered by `at`, not by list; `present.<lifeline>.as: "values"` draws a value lifeline; a constraint's ends are changes | §3 |
| S2 | Where the cross-model check runs | A hook slot in `validate()`: `TYPED.across(model)`, filled by `src/uml/stereotypes.js`, run on every version-2 model that holds a `uml.Profile`, whatever views it has. About 35 B in the core | §5.1 |
| S3 | Where a profile applies | Through ownership: a profile applied to a package applies to everything the package owns, at any depth; a member takes its owner's; a line its `parent`'s, else its `from` end's | §5.2 |
| S4 | A name that is not a defined stereotype | Outside any applied profile, a keyword, as today: nothing said. Inside one, warned, unless UML's standard profile or UML's keywords (Annex C: `use`, `import`, …) have it. The first letter compares either case (`Entity` is «entity»). `Profile::name` picks one of two profiles that share a name | §5.3 |
| S5 | Which elements a stereotype fits | Its extensions' metaclasses, its generals' too, and every metaclass that specializes them, by a table of UML 2.5.1's generalizations with a row for every `uml.*` type the registry's types use, and a stated mapping for the five that are not metaclasses | §5.4 |
| S6 | A required extension (`isRequired`) | Applied by the tool to every element of that metaclass in the profile's scope (UML 2.5.1, 12.3.3 says such a model must have it; supplying it is this tool's reading, a departure in §15): no warning that it is missing; its tags are the element's; `describe()`, the profile view and the panel show it. An abstract required stereotype is met by a concrete specialization the element applies (decision 22) | §5.5 |
| S7 | Tags (tagged values) | Text values in `props.tags`, keyed by stereotype then tag (`{ "column": { "name": "placed_at" } }`, decision 21), checked against the tag's definition: defined, of its type (Boolean, Integer, Real, UnlimitedNatural, an enumeration of the profile; any text otherwise), present when its lower bound is 1 and it has no default | §5.6 |
| S8 | Editing tags on any view | A hook slot in the properties panel, `TYPED.fields(model, element)`, filled by `src/uml/stereotypes.js`: one field per tag of the stereotypes the element has, on every typed view. About 12 B in the core | §5.7 |
| S9 | Where tags are drawn | On the profile view: a compartment per applied stereotype under the element's name, a member's tags in braces after it. Other types draw their stereotypes as now and no tags | §5.8 |
| S10 | The time ruler | A new strategy, `src/layout/timeruler.js`: a pure function in the contract `layoutTimeAxis` set (sizes in, geometry and problems out, slots for the gestures), sharing its ends and constants, not its rows: the time axis is ordinal, a timing view's time is a quantity | §6.1 |
| S11 | The scale (`model.md` §3, stage 6) | One time base for every lifeline of a view; linear; derived, never stored: the narrowest unit that keeps every step 12 px apart and every value's text inside its segment, within 480 to 4,800 px of plot, a 1, 2 or 5 step of ticks at least 64 px apart | §6.3 |
| S12 | Value lifelines | In the subset (`proposal.md` §8.5 left them out): `present.<lifeline>.as: "values"` draws the lifeline as a band that crosses at each change, its value inside; `S` toggles it | §3, §6.4 |
| S13 | Messages on a timing view | A straight line from the sender's state at `sentAt` to the receiver's state at `receivedAt`, slanted when they differ; the ends of the sequence type's sorts | §6.5 |
| S14 | Time and duration constraints | Drawn in a strip under the lane of their first change: a duration as a dimension line with an arrow at each end, stacked on levels where two overlap; a time constraint as a tick with its label | §6.6 |
| S15 | Deleting a lifeline or a change | The core's `references()` and `delete` learn the timeline: `refs()` reports a change's `lifeline` and a constraint's `from` and `to` as kind `end`, so a change goes with its lifeline, a constraint with its change, and `hide` (which skips `end`) keeps them. About 60 B in `src/core/apply.js` | §7.3 |
| S16 | Editing times | By pointer and Alt + arrows, to a minor tick (a fifth of the step, the one rule); exactly, by F2 with `state @ 140` on a change and `label @ 100 → 140` on a message. No number field kind | §8 |
| S17 | Hiding (DoD 4) | A change, a message or a constraint cannot be hidden: Delete deletes it, said first (stage 3's P12, stage 5's S20). Delete on a lifeline hides it; its changes stay in the timeline, not drawn; its messages leave the view with it, said first (decision 23) | §8.3 |
| S18 | The core's budget (C5) | Stage 6 spends at most 300 B of the 4,451 B left once stage 5's follow-ups merge (4,561 B at 5f20041, less their measured 110 B) (target: about 150 B, in §2.3's four lines); the rest is in family files | §2.3 |
| S19 | P1 | Stages 4 and 5's rule: the profile view lays out with `repair: false` and `reroute: false`; CI holds 1 s and prints each common edit against the 100 ms target, best of seven in CPU time after a warm-up, in tests whose titles end " (timed)". The cross-model check alone (`TYPED.across`) is printed against 10 ms on 2,000 elements, and held to linear time as `tests/package.test.mjs` does (4x the input under 10x the time, best of five) | §12 |
| S20 | The two examples and the atlas | `07-profile.json` agrees with the class example (Order applies «entity»); `14-timing.json` takes the sequence's lifeline ids. The package view shows the profile and its application, and opens the profile view; `fulfil-activity`'s "Record the payment" opens the timing view | §14 |
| S21 | Order with stage 5 | 6.0 to 6.5 start on approval, beside 5.8 and the ELK trial: none of them owns a file a stage 5 branch changes, but 6.0's one line of `tests/embed.py` (it lists the stage's three pages as placeholders, so no later lane edits it), rehearsed once against 5.8 (X2). `lib/*.js` and `examples/bookshop.html` are rebuilt in every lane of both stages. 6.6 and 6.7 start when 5.8 has merged. 0.23.0 after 0.22.0 | §13.3 |
| S22 | Readers | None. Mermaid has no profile or timing diagram; its `timeline` and `gantt` are other things | §10 |
| S23 | Departures from UML | Stated in §15: a required stereotype supplied by the tool, and not drawn on other views; no `sd` frame round a timing view, as round a sequence view; nothing drawn before a lifeline's first change; message events not constraint ends; a lifeline's name drawn across, not upright | §15 |

What is left out of the subsets is in §15.

## 2. Where stage 6 starts

### 2.1 What it builds on

- **The class type's look** (`typeGeo`, `drawnLines`, `lineLook`, `IMPLIED`, the member micro-syntax `parseMember` and
  `printMember`, `member` in `src/uml/class.js`): a classifier with keywords over its name and compartments of rows, a
  generalization's hollow triangle, a dependency's dashed open arrow, a package. A stereotype and a metaclass reference
  are classifiers with a keyword; a tag definition is a `uml.Property` row, `name : Type [mult] = default`.
- **Stage 2's boxes** (`ownersOn`, `src/uml/owners.js`): a profile is a package, drawn as a box holding its stereotypes.
- **Stereotypes as keywords.** Every UML type already draws `props.stereotypes` as «name» over an element's name or a
  line's label, and every type's properties form has a Stereotypes list (the class, object, package, sequence,
  communication, use case, activity, state, overview, component, deployment and composite types). Nothing checks them:
  any name is a keyword. Stage 6 checks them where a profile says what they mean, and changes no picture of those types.
- **Stage 3's time axis** (`src/layout/timeaxis.js`) for its contract, and the sequence type for its message sorts and
  their ends (`SQ_END`, `src/uml/sequence.js`) and the shape of a typed view with its own layout (`layout.run`,
  `pins: false`, `draw`, `slots`).
- **Stage 4's and 5's hooks** (`src/typed/edit.js`): `connect`, `moveTo`, `add`, `remove`, `rename`, `member`, `key`,
  `{ pick, then }`; a geometry id that no element has, selected, renamed and deleted through the hooks (stage 5 §6).
- **4.9's PDF tables** (`rows(model, view, id)` and `word(model, id)`, `src/page/print.js`).
- **The Bookshop atlas** (`tools/atlas.mjs`, `tools/atlas-links.json`, `tests/atlas.test.mjs`).

### 2.2 What was read at 5f20041

| # | What was read | What it says | Where it is handled |
|---|---|---|---|
| Q1 | `validate()` (`src/map/validate.js`) | A type's `validate` runs once for each view of that type; one that takes no view argument runs once a type. A model with no view of a type never runs its rules. Nothing runs over the model for every type | S2 |
| Q2 | `classProblems` (`src/uml/class.js`) | Runs on the whole model whenever a class view is in it. Its `generalization-kinds` refuses a generalization between two stereotypes: measured, `07-profile.json` with a class view added gives the error "stereotype "aggregateRoot" specializes stereotype "entity"". In the atlas, which has class views, the profile example would add that error | §4.2 |
| Q3 | `IMPLIED` and `stereoText` (`src/uml/class.js`) | The class type writes «interface», «enumeration», «dataType», «primitive» from an element's type, then its `props.stereotypes`. A `uml.Stereotype` or `uml.MetaclassReference` today is a plain classifier with no keyword | §4.1 |
| Q4 | The properties panel (`props()`, `src/canvas/edit.js`) | Fields are `text`, `list`, `enum`, `bool`, and may name a `path` inside `props` (`ends.from.role`), committed as `set` of that path. The fields are the type's, by element type, fixed: no field can depend on what the element applies | S8 |
| Q5 | `index()`, `refs()` and `delete` (`src/core/apply.js`) | The index holds a timing view's changes and constraints (kind `time`); `refs()` does not look in a timeline. Measured on `14-timing.json`: deleting the lifeline `worker` leaves its four changes; deleting the change `w-waiting` leaves `c-wait.from` naming nothing. `references('w-waiting')` is empty | S15 |
| Q6 | `delete`'s cascade | A line whose end is deleted goes; a type's `refs` (by element type) may cascade a property. A constraint has a `type` (`uml.DurationConstraint`), so `refs` could cascade its `from` and `to`; a change has none, so its `lifeline` cannot be declared | S15 |
| Q7 | `layoutTimeAxis` (`src/layout/timeaxis.js`) | Rows are ordinal: a row's y is where the row above it ended, never a time. Columns are lifelines; the pure-function contract, measured sizes in, `problems` out, `slots` `{ index, y, parent, after }` for the gestures | S10 |
| Q8 | `near()` in `src/typed/edit.js` | A slot may carry `x`; the slot nearest a point is found by `x` and `y` | §6.7 |
| Q9 | A node whose id is no element (stage 5 §6, `tests/type-hooks.html`) | Selection, F2 and Delete hand its geometry id to `rename` and `remove`; the panel shows nothing for it | §7.1 |
| Q10 | `tools/atlas.mjs`'s `KEYS` and `merge` | Props `tags`, `states`, `sentAt`, `receivedAt` and a view's `timeline` are not known: the build stops on the two examples. By id: `14-timing.json`'s `worker` and `payments` are cards of `bookshop.json` (type differs: the build stops); `07-profile.json`'s Order applies `["aggregateRoot", "owned"]`, `sales-classes.json`'s `["entity"]` (the build stops) | S20, §14 |
| Q11 | `tests/atlas.test.mjs` | Pins the atlas's `validate()` problems (two, both the class rule on use cases and actors) and that the map reaches every view by drill-down | §14 |
| Q12 | `check.mjs`'s hand check for timing | Each change on a lifeline of the view, in one of its states, no earlier than the one before; each constraint's `from` and `to` a change | §7.2 |
| Q13 | The two examples, today | Both validate with one warning each ("not drawn by this release"); drawn as plain cards, the profile view in 10 ms, the timing view in 1 ms | §11 |
| Q14 | `upstream_view()` and F4 (`umlimator.py`) | A view with no slots of the layered layout bakes nothing: the timing view is named there already | §13.2 |
| Q15 | `ENDS` (`src/typed/draw.js`) | Hollow triangle, filled arrow, open arrow, diamonds, socket. No filled triangle, which an extension needs | §4.1 |
| Q16 | The core's size | `gzip -9 < lib/umlimator.js \| wc -c`: 185,136 B at 5f20041, 185,246 B on `stage5-followups` and `stage5-docs` (+110 B; its commits say +37, +37, +36). The cap is 189,697 B (0.16.0's 164,954 B plus 15%): 4,561 B left at 5f20041, 4,451 B once the follow-ups merge | S18 |
| Q17 | Stage 5's open branches | `stage5-followups`: `src/canvas/render.js`, `src/core/registry.js` (the "Stage 5's:" line of its long comment), `src/layout/audit.js`, `src/layout/layered.js`, `src/typed/layout.js`, the three type files and their tests. `stage5-docs` (5.8): those, and `src/uml/composite.js`, `src/uml/structure.js`, `examples/`, the atlas and its tools (`tools/atlas.mjs`, `tools/atlas-links.json`), `tests/embed.py` (the pages' tuple, one line), `tests/notation.html`, `tests/core-diet.json`, the fixtures, `docs/diagrams/notes/stage-4.md`, `package.json`; by its Owns also `tests/cli.py`, `tests/mcp.py`, `lib/umlimator.d.ts`, `lib/umlimator.schema.json`, `check.mjs` and `docs/`. `stage5-elk-trial`: `notes/spike-elk.md` and `spike/elk/*.mjs` (its other diffs are the follow-ups'). No stage 6 lane owns any of these but 6.0's line of `tests/embed.py`, 6.6's `tests/core-diet.json` and 6.7's `tools/atlas-links.json`, each after 5.8 or rehearsed against it | S21, §13.4 |

### 2.3 The core's budget (C5, S18)

4,561 B are left at 5f20041; stage 5's open follow-ups spend 110 B (measured on `stage5-followups` and `stage5-docs`,
Q16), so 4,451 B are left for stage 6 and the three milestones. Stage 6's two new pieces of machinery, the stereotype check and the time ruler, are family code:
`src/uml/stereotypes.js` and `src/layout/timeruler.js`, listed in `tools/build.mjs`'s `ALL` only.

What stays out of the core:

- the metaclass table, UML's standard profile, scope, names, tags and every rule of §5 (`src/uml/stereotypes.js`);
- the time ruler, scale, ticks, lanes, steps, value bands, messages, constraints and slots (`src/layout/timeruler.js`);
- the extension's filled triangle (`src/typed/draw.js`'s `ENDS`);
- the profile and timing types: definitions, shapes, looks, rules, `describe()`, names, legends, rows, words, hooks;
- the new slots' documentation, beside the code that fills them, with one pointer line in `src/core/registry.js`, in the
  comment above `const TYPED = {}`, away from the long comment's "Stage 5's:" line that the follow-ups change (a line
  added after it would touch the next line, `*/`, and the two hunks would conflict).

What touches the core, each change stating its bytes in its pull request:

| Change | File | Lane | Target |
|---|---|---|---|
| `validate()` runs `TYPED.across(m)` once on a typed model, and adds its problems (S2) | `src/map/validate.js` | 6.1 | 35 B |
| The properties panel adds `TYPED.fields(model, x)`'s fields after the type's own (S8) | `src/canvas/edit.js` | 6.1 | 12 B |
| `refs()` walks a timeline's changes (`lifeline`) and constraints (`from`, `to`) as kind `end`; `clear()` then takes the whole item from `timeline.changes` or `constraints` on delete, and `hide` already skips `end` (S15) | `src/core/apply.js` | 6.1 | 60 B |
| The registry's pointer line, above `const TYPED = {}`, names `TYPED.across` and `TYPED.fields` | `src/core/registry.js` | 6.1 | 40 B |
| | | | **about 150 B** (measured on a scratch copy of the built file: the first three lines 99 B before the delete loop's) |

As built (6.1): 180 B, `gzip -9 < lib/umlimator.js` from 185,246 B to 185,426 B: the two slots and the pointer line 111 B,
the timeline in `refs()` and `delete` 69 B.

| Option | For | Against |
|---|---|---|
| **(a) Stage 6 spends at most 300 B; over that waits for the maintainer (recommended)** | 150 B of slack; leaves over 4,100 B for milestones 2 to 4 | The fallbacks below are worse |
| (b) First come, first served | Nothing to decide | M2's scope rules and M4b's boundary events may find no room |
| (c) Raise C5 | No wait | The maintainer's call; maps' hosts pay for UML |

Fallbacks, in this order: the cross-model check runs from the profile type's own `validate(model)` (§5.1's option b,
0 B); tags are edited on the profile view only (§5.7's option c, 0 B). The timeline's references have no fallback: without
them a deleted lifeline leaves changes that name nothing (Q5).

### 2.4 Rules every package keeps

- **Maps draw exactly as now.** Geometry hashes (`bench/expected.json`), the examples' stills, every map test: unchanged in
  every pull request (C1). The two slots are empty in `lib/umlimator.js`; a map has no properties panel of fields and no
  timeline.
- **Every typed example draws exactly as now,** and validates as now: a model with no `uml.Profile` gets no new problem
  (S2), checked on every example, every target example and every fixture under `tests/`. The class, package and object
  types' pictures change only for elements of the new types (§4.1), which none of their examples has. One exception, as
  DoD 12 allows for 2.2: 6.7 adds the profile and its application to `bookshop-packages.json` (§14, decision 18), so
  that example's stills change, in 6.7's pull request for the maintainer.
- **Geometry hashes and stills unchanged in every lane** (DoD 12): 6.1 to 6.5 each run them, not only 6.6.
- **The API is additive only** (C2). The two types and their helpers are internal, in `lib/umlimator-all.js`; the slots
  and the new fields (`present.<id>.as: "values"`, a qualified stereotype name) are optional and provisional.
- **Nothing after a layout edits what it returned** (stage 4 §2.4): the change nodes, the slots and the tag compartments
  are built on a copy. A test lays each view out twice from one memo and checks the markup is byte-identical.
- **No host application's name** appears in code, tests or docs (`plan.md` §8).

## 3. Vocabulary (S1)

The rows of `model.md`, refined. `uml.Comment`, `uml.CommentLink` and `props.stereotypes` are on every UML view already.

| # | `diagram` | Nodes | Members | Edges | Notes |
|---|---|---|---|---|---|
| 7 | `uml.profile` | `uml.Profile`, `uml.Stereotype`, `uml.MetaclassReference`, `uml.Enumeration`, `uml.Package`, `uml.Comment`, any element that applies a stereotype | `uml.Property` (a tag definition, on a stereotype); `uml.EnumerationLiteral` | `uml.Extension` (`props.isRequired`), `uml.ProfileApplication`, `uml.Generalization`, `uml.CommentLink` | A stereotype's and a metaclass reference's `parent` is a profile; an enumeration's may be. Stereotype props: `isAbstract`. A metaclass reference's `label` is a metaclass of §5.4's table. Stereotypes are applied anywhere as `props.stereotypes`, each a stereotype's `label` or `Profile::label`, and `props.tags`, a map from each stereotype (as written in `stereotypes`, or a required one's label) to a map from a tag's name to its value as text (§5.6, decision 21) |
| 14 | `uml.timing` | `uml.Lifeline` | | `uml.Message` (inline) | Lifeline props: `represents`, `states` (top to bottom). `present.<lifeline>.as: "values"` draws it as a value lifeline, whose changes' `state` is any text. `timeline`: `unit` (text, optional), `changes` (`[{ id, lifeline, at, state }]`, in any order: drawn by `at`), `constraints` (`[{ id, type, from, to, label }]`; `from` and `to` name changes; a `uml.TimeConstraint` has `from` only). A message's props: `sort` (call, async, reply), `replyTo`, `sentAt`, `receivedAt` |

What changed against `model.md`:

- **A qualified stereotype name.** `"stereotypes": ["BookshopConventions::entity"]` picks the profile when two applied
  profiles define one name. Unqualified stays the usual form.
- **A profile may own an enumeration,** the type of a tag (`valueType` names it by label, M8). Its literals are members.
- **The order of a timing view's changes is not meaning** (`model.md` rule 8 says order is meaning only where the type
  says so): they are drawn by `at`, and two on one lifeline at one instant are warned (§7.2). `check.mjs`'s hand rule
  "no earlier than the one before" goes when the type's rules run there (6.6). In UML each change is an
  OccurrenceSpecification on the lifeline with a StateInvariant (its `state`) after it; the subset stores the pair as one
  item.
- **Tags keyed by stereotype** (decision 21): `props.tags` is `{ stereotype: { tag: value } }`, so two stereotypes that
  both define `name` keep two values, as UML keeps tagged values per stereotype application.
- **One time base, linear** (`model.md` §3's stage 6 row): every lifeline of a view on one ruler (§6.3).
- **Value lifelines** (S12):

  | Option | For | Against |
  |---|---|---|
  | **(a) In the subset: `present.<lifeline>.as: "values"`, a band crossed at each change, its value inside; `S` toggles it (recommended)** | UML 2.5.1's compact form, the "general value lifeline" (17.11.4), the form most timing views of data use; presentation, so per view (rule 10), as stage 5's `as: "ball"`; the ruler measures its texts anyway | Widens `proposal.md` §8.5's subset, which left value lifelines out; a second drawing and its fixtures |
  | (b) Left out, as §8.5 says | Less to build | A lifeline whose states are values (a counter, a status code) needs a row for each value |

- **A constraint's ends are changes.** UML lets a duration constraint join any two occurrences, a message's sending and
  receipt among them; the subset keeps changes (§15).

## 4. The profile diagram

### 4.1 Drawing

Laid out by `layoutTyped` from the host's ranking, as the class type is, through `typeGeo` with the profile's own look;
down by default, as `07-profile.json` asks; `repair: false`, `reroute: false` (§12). An extension ranks the metaclass first
(`rankFlip`, as a generalization ranks the general first), so metaclasses sit above the stereotypes that extend them.

| Element | Drawn | Where |
|---|---|---|
| Profile | A package with «profile» over its name; a box holding its stereotypes, metaclasses and enumerations when they are shown | `class.js`'s `typeGeo`, `nodeName` and `drawnLines`; `owners.js`'s `OWN_BOXES`, `owner-kinds`, `holdsLine`, `ownerChoices` and the box title |
| Stereotype | A classifier, «stereotype» over its name, italic when abstract; its tag definitions as attribute rows (`name : Type [mult] = default`) | `class.js`'s `IMPLIED` |
| Metaclass reference | A classifier, «metaclass» over its name, no compartment | `class.js`'s `IMPLIED` |
| Enumeration | The class type's, «enumeration» and its literals | as now |
| Package, and any other element shown | Its class or package look; under its name a compartment for each stereotype it has, headed «name», each row `tag = value` (a default in the muted colour, a missing required value as `tag = ?`); a member that applies a stereotype is listed with it in front and its tags in braces after (`«column» -placedAt : Instant {name = placed_at, indexed = true}`). The element's other members are not shown | `profile.js` |
| `uml.Extension` | A solid line with a filled triangle at the metaclass, `{required}` by that end when required | `draw.js`'s `ENDS` (`filled-triangle`), `class.js`'s `lineLook` |
| `uml.ProfileApplication` | A dashed line with an open arrow at the profile, «apply» | `class.js`'s `lineLook` and `keyword` |
| `uml.Generalization` | The class type's | as now |

The keywords and the two line looks are entries in `src/uml/class.js`'s tables (`IMPLIED`, `lineLook`, `keyword`). The
profile's package shape is not a table entry: today `typeGeo` and `nodeName` test `n.type === 'uml.Package'` in code,
`drawnLines` calls `ownersOn(model, view)` with no `look` (so no `boxTypes`), a box's title comes only from stored
stereotypes (`stereoOf`), and `owners.js`'s `owner-kinds` warns any owned type (an enumeration included) whose owner is
not a `uml.Package`. So 6.3 also owns those lines: a "package-like" test (`uml.Package`, `uml.Profile`) in `typeGeo`,
`nodeName`, `holdsLine` and `ownerChoices`; `uml.Profile` in `OWN_BOXES`; `owner-kinds` counting a profile as a package;
the box title adding «profile» from the type. Then the package view shows a profile and its application with no code of
its own (§14). A class, package or object view draws them for elements of the new types only; none of their examples or
fixtures has one.

| Option | For | Against |
|---|---|---|
| **(a) The class type's look, its tables gaining the new keywords and the two lines, and the package tests above counting a profile (recommended)** | One look for every classifier of UML; the package view shows profiles with the same edits (§14) | 6.3 edits lines of `class.js` and `owners.js`, stage 1 and 2 files no other open package touches |
| (b) The profile type's own copy of the classifier look | `class.js` untouched | Two looks to keep in step; the package view cannot show a profile |

### 4.2 Validators

Each with a passing and a failing fixture (DoD 5). Rules on definitions are errors; rules on applications are warnings
(§5), so a model that was valid stays so.

| Rule | Level | Says |
|---|---|---|
| `profile-owns` | error | a stereotype's and a metaclass reference's owner is a profile |
| `stereotype-names` | error | stereotypes in one profile have different names |
| `extension-ends` | error | an extension runs from a stereotype to a metaclass reference |
| `application-ends` | error | a profile application runs from a package to a profile |
| `metaclass-known` | warning | a metaclass reference names a metaclass of §5.4's table |
| `generalization-kinds` (the class type's) | error | as now, with `uml.Stereotype` a classifier kind of its own: a stereotype specializes a stereotype (Q2) |

The class rule's change is one entry in `src/uml/class.js` (6.3): `uml.Stereotype` joins `CLASSIFIERS`, and
`tests/class.test.mjs`'s cross-kind loop (each pair of different classifier kinds refused) must still pass, the new kind
included. Without it the atlas, which has class views and will hold the profile, reports the profile's generalization as
an error (Q2).

### 4.3 Editing

| Gesture | Command |
|---|---|
| Palette: Profile, Stereotype, Metaclass, Enumeration, Package, Comment | `add`. A stereotype, metaclass or enumeration goes into the selected profile, else the view's first; with none, `{ error }` "add a profile first". A metaclass's name is checked against §5.4's table; one not in it opens `{ pick, then }` of the closest names, then adds what was picked |
| Lines: Extension, Generalization, Profile application, Comment link | `connect`, checked against §4.2's ends: an extension from a stereotype to a metaclass, an application from a package to a profile, a generalization between stereotypes; else `{ error }` with the rule's words |
| A stereotype's rows | The class type's member micro-syntax (`member`), as a class's attributes |
| Required | `isRequired`, a `bool` field on `uml.Extension` |
| Abstract | `isAbstract`, a `bool` field on `uml.Stereotype` |
| Showing an element of the model (a class, to apply a stereotype to it here) | The existing gesture: Show (outline), Enter on it, `set` of the view's `nodeIds` (`docs/editing.md`, "show an element here") |
| Applying | Stereotypes (list) on each element, as every type has it; tags by §5.7's fields |
| Hide and delete | Delete hides a node; Shift + Delete deletes. A stereotype deleted does not rewrite the elements that name it: they are warned (`stereotype-unknown`), as a renamed one is (M8). A stereotype's compartment and its tag rows cannot be hidden on their own (S17's reasoning: a row with no cause would be shown or not by a key of its own); the element's whole node is hidden instead |

### 4.4 As built (6.3)

Where `src/uml/profile.js` and its lines in `class.js`, `owners.js`, `package.js` and `draw.js` depart from or settle §4:

- **The package view's palette is unchanged.** `package.js`'s `PACKAGE_LINES` gains `uml.ProfileApplication`, so a package
  view that lists no lines draws an application (§14), but its `elements` and `lines` (the palette) do not gain Profile and
  Profile application: `tests/package.test.mjs` and `tests/package-fixtures.test.mjs` pin them, and the schema they are
  checked against is 6.6's. A profile is added on the profile view. *For the maintainer to decide* (6.6 or 6.7 may add them).
- **`typeGeo` takes three more look fields:** `node(d, n, model, pic)`, a node's drawing input before it is sized (the tag
  compartments, the accessible name), `box(b, model, pic)`, an open package's or profile's box as drawn (its title and
  accessible name), and `dg`, more of `layoutTyped`'s input (`repair: false`, `reroute: false`). The class, package and object
  looks give none. `compartmentsOf` returns none for a profile (as for a package) and for a metaclass reference, which is
  where §4.1's "no compartment" lands besides `IMPLIED`. `ownersOn`'s default box word is "Profile" for a profile, so its
  accessible name starts "Profile BookshopConventions" on every view. `describeAs` says a profile application ("applies BookshopConventions"); `lineName`
  is exported for the profile's `describe()`.
- **`{required}` is the extension's label,** at the line's middle as «apply» is, not by its end: the accessible name then says
  it ("Extension from owned to Class: {required}").
- **A default tag value is drawn in the text colour,** like a set one: the classifier draws every row alike, and 6.3 owns only
  `ENDS` in `draw.js`. The rows say `tag = value` either way; a missing required value is `tag = ?`.
- **`SHAPE.profiled`** is the classifier with the node's own accessible name (the classifier writes one from its compartments,
  which here are tags). A stereotype shows its attributes (its tag definitions) and no operations compartment. A metaclass
  reference and an enumeration keep their own compartments (none; the literals) under the tag compartments of the
  stereotypes they have. A package on the profile view keeps its package look, closed or open: over its name the stereotypes
  it has, the required ones supplied too; its tags are in its accessible name (`describe()` reads it), the panel and the PDF.
- **`stereotype-names`** (6.2's `styKey`) says two stereotypes of one profile whose names meet with the first letter in either
  case, and two profiles of one label, which `Profile::name` could not tell apart. An exact duplicate is also the class
  rule's `classifier-names`, since `uml.Stereotype` is a classifier kind.
- **`application-ends`** takes a profile as the applying package (UML's Profile is a Package), but not a profile applying
  itself, which the rule and **connect** both refuse; a package applying a profile it holds is not checked. **connect**
  refuses on the profile view a generalization that is not between two stereotypes.
- **`profile-owns` asks for a profile as the direct owner,** narrower than UML 2.5.1 (12.4.9's `containingProfile()` is the
  closest profile owning a stereotype directly or indirectly). 6.2's index (§5.9) reads only a profile's direct stereotypes,
  so a stereotype in a package inside a profile would otherwise be valid and never found. *For the maintainer to decide*
  whether to widen both (rule, Owner field and 6.2's index) later.
- **add** puts a stereotype, a metaclass or an enumeration into the profile selected, else the profile holding what is
  selected, else the view's first. A metaclass with no name is added unnamed (`metaclass-known` warns of it), with no picker.
- **The Owner field** offers profiles for a stereotype and a metaclass reference, and packages and profiles for anything else
  a package may own. The profile view's geometry has a slot at each node and box (`composite.js`'s), so the palette's add
  hears the profile selected.

## 5. Stereotypes applied across the model

### 5.1 Where the check runs (S2)

`validate()` runs a type's rules once per view of that type (Q1). An element applying «entity» is drawn in a class view, a
component view or the atlas's map; the profile that defines «entity» may have no view at all.

| Option | For | Against |
|---|---|---|
| **(a) A hook slot: `validate()` calls `TYPED.across(model)` once on a version-2 model, after the typed checks; `src/uml/stereotypes.js` fills it and returns `[]` at once when the model holds no `uml.Profile` (recommended)** | The profile's rules hold wherever its elements are drawn, whichever views a model has: adding or removing a view does not change what is valid; one place; about 35 B | A slot in the core (C5 allows exactly that); `lib/umlimator.js` alone checks nothing, as it draws no UML |
| (b) The profile type's `validate(model)`, which takes no view, so runs once a type | No core byte | Only when the model has a profile view: a host that keeps its profile in a model with only class views gets no check |
| (c) Each UML type's `validate` calls a shared check, and the problems are said once | No core byte | Twelve type files touched; the check must live in a file loaded before all of them (`owners.js`), away from the profile |

The problems are `{ level, rule, path, ids, message }`, said once (the same key as a type's, `[level, path, message]`),
with `rules` naming them for the problems list and `rules()`.

### 5.2 Scope (S3)

A profile applies to a package by a `uml.ProfileApplication` from the package to the profile; then to everything the
package owns, at any depth. An element's scope is the union of the profiles applied to its owners, walked up `parent`
(UML 2.5.1, 12.3.3: "applying a Profile means ... it is allowed, but not necessarily required, to apply the Stereotypes").

- A member's owner is its element; then that element's owners.
- A line's owner is its `parent` when it has one, else the owner of its `from` end (a line is usually owned by the package
  of its client).
- A view's own element (a sequence's inline message, a fragment) has no owner: no scope.
- An element no package owns has no scope.

| Option | For | Against |
|---|---|---|
| **(a) By ownership, as UML (recommended)** | Two packages may apply two profiles; nesting is already `parent` (rule 6); the atlas's `sales` applies the conventions and the catalog does not | An element outside every package is never in scope |
| (b) A profile in the model applies everywhere | Simplest | A model with two profiles cannot say which applies where; not UML |

### 5.3 Names (S4)

For each name in an element's `props.stereotypes`:

1. `Profile::name`: the stereotype of that name in the profile of that name.
2. Else the stereotype of that name in a profile of the element's scope; two such profiles: `stereotype-ambiguous`.
3. Else, with a profile in scope, a name of UML's standard profile (UML 2.5.1, clause 22: auxiliary, buildComponent, call,
   create, derive, destroy, document, entity, executable, file, focus, framework, implement, implementationClass,
   instantiate, library, metaclass, modelLibrary, process, realization, refine, responsibility, script, send, service,
   source, specification, subsystem, systemModel, trace, type, utility) or one of UML's keywords (Annex C: access, apply,
   artifact, centralBuffer, component, dataStore, deploy, device, executionEnvironment, extend, import, include,
   information, interface, manifest, merge, model, primitive, profile, signal, stereotype, use, …; the whole list is
   copied into the file): fine, as a keyword. Standard-profile names are not checked against their own metaclasses
   (Entity extends Component, Utility Class): they are free keywords here. Any other name: `stereotype-unknown`. (Without
   the keywords, the atlas's `order-uses-money`, a dependency inside `sales` that stores «use», would be warned.)
4. Else, with no profile in scope, a stereotype of a profile in the model that is not applied here, unless it is also a
   standard-profile name or a keyword: `stereotype-applied` ("«aggregateRoot» is a stereotype of BookshopConventions,
   which is not applied to catalog or its owners"). So «entity» outside `sales` stays the standard keyword.
5. Else a keyword, as today: nothing said.

Names compare with the first letter in either case and the rest exactly: UML 2.5.1 names the standard stereotypes with a
capital (`Entity`) and diagrams write them in lower case («entity», 12.3.4's convention), so `Entity`, `entity` and a user
profile's `Entity` all meet. The types' own keywords (`interface`, `actor`, `datastore`) are written by the types from an
element's type, not stored, so the check never sees them; a stored `actor` (the sequence examples' shopper) is on an
element with no package, so no scope (rule 5).

| Option | For | Against |
|---|---|---|
| **(a) Checked inside an applied profile's scope, a keyword outside it; the standard profile always known (recommended)** | Every model that validates today still does; a profile's author gets the check where the profile applies | A misspelt name outside every profile is still silent |
| (b) Every name must be a defined stereotype once the model has a profile | Strict | «actor», «service» and every free keyword in a model with one profile turn into warnings |

### 5.4 Metaclasses (S5)

A stereotype fits an element when one of its extensions, or one of its generals', names the element's metaclass or one the
metaclass specializes. An element's metaclass is its type without the notation (`uml.Class` is `Class`), but for the
five registry types that are not UML metaclasses, mapped below. The table, in `src/uml/stereotypes.js`, has a row for
every `uml.*` element type any registered type uses (about 75), each with its UML 2.5.1 generals, nearest first; a name
in either column is a known metaclass (`Classifier`, `BehavioredClassifier` and `Element` may be extended). 6.2's test
reads every registered type's element types and checks each `uml.*` one has a row or a stated mapping.

| Metaclass | Specializes (nearest first) |
|---|---|
| Class | EncapsulatedClassifier, StructuredClassifier, BehavioredClassifier, Classifier |
| Component, Node, Stereotype, Behavior | Class |
| Activity, StateMachine, Interaction | Behavior (Interaction also InteractionFragment) |
| Device, ExecutionEnvironment | Node |
| Interface, DataType, Artifact, InformationItem, Association, Signal | Classifier |
| Actor, UseCase | BehavioredClassifier |
| Collaboration | StructuredClassifier, BehavioredClassifier |
| Extension, CommunicationPath | Association |
| Enumeration, PrimitiveType | DataType |
| DeploymentSpecification | Artifact |
| Profile, Model | Package |
| Property | StructuralFeature, Feature |
| Port | Property |
| Operation | BehavioralFeature, Feature |
| Connector | Feature |
| Feature | RedefinableElement |
| InstanceSpecification | PackageableElement |
| EnumerationLiteral | InstanceSpecification |
| Slot, Comment | Element |
| Dependency | DirectedRelationship, PackageableElement |
| Usage, Abstraction, Deployment | Dependency |
| Realization, Manifestation | Abstraction |
| InterfaceRealization, ComponentRealization | Realization |
| Generalization, PackageImport, PackageMerge, ProfileApplication, Include, Extend, InformationFlow, ElementImport | DirectedRelationship |
| MetaclassReference | ElementImport (UML: an ElementImport of a profile) |
| DirectedRelationship | Relationship |
| ExecutableNode, ControlNode, ObjectNode | ActivityNode |
| Action | ExecutableNode |
| InvocationAction, AcceptEventAction | Action |
| CallAction, SendSignalAction | InvocationAction |
| CallBehaviorAction | CallAction |
| InitialNode, DecisionNode, MergeNode, ForkNode, JoinNode, FinalNode | ControlNode |
| ActivityFinalNode, FlowFinalNode | FinalNode |
| CentralBufferNode | ObjectNode |
| DataStoreNode | CentralBufferNode |
| ControlFlow, ObjectFlow | ActivityEdge |
| ActivityPartition | ActivityGroup |
| State, Pseudostate | Vertex |
| FinalState | State |
| Region, Transition, Vertex, ExtensionPoint, Lifeline, Message, CollaborationUse | NamedElement (Region and Transition through Namespace) |
| CombinedFragment, InteractionUse, InteractionOperand | InteractionFragment |
| DurationConstraint, TimeConstraint | IntervalConstraint, Constraint |
| Classifier, Package, Relationship, ActivityNode, ActivityEdge, ActivityGroup, InteractionFragment, NamedElement, … | Element |

| Registry type, not a metaclass | Treated as |
|---|---|
| `uml.InternalTransition` | Transition (one of kind internal) |
| `uml.Subject` | Classifier (the use cases' subject) |
| `uml.Link` | InstanceSpecification (of an association) |
| `uml.RoleBinding` | Dependency |
| `uml.CommentLink` | none: it is a Comment's annotatedElement, not an element; no stereotype fits it (`stereotype-extends`) |

A metaclass reference whose name is in neither column is warned (`metaclass-known`) and fits only that exact name. A
SysML type (`sysml.Block`) is a stereotyped UML class in SysML v1.7; until milestone 3 maps it, no `sysml.` element is
checked against a metaclass.

| Option | For | Against |
|---|---|---|
| **(a) The table: a stereotype on Classifier fits a component (recommended)** | UML's meaning; profiles commonly extend Classifier or Element | A table to keep as types are added (M2, M3) |
| (b) Exact names only | No table | A stereotype extending Classifier fits nothing the subsets draw |

`stereotype-extends` (warning) says an applied stereotype does not fit; `stereotype-abstract` (error) says an abstract one
is applied.

### 5.5 Required extensions (S6)

UML 2.5.1, 12.3.3 (Extension, semantics): a required extension means an instance of the stereotype must always be linked
to an instance of the extended metaclass, and a model without it is not well formed. UML says it must be there, not who
puts it there; option (a) is this tool's reading, and §15 states it as a departure. 6.6's conformance note checks the clause's words
against the PDF, and the standard profile's place in clause 22, before quoting them.

| Option | For | Against |
|---|---|---|
| **(a) Supplied by the tool: applied to every element of the metaclass in the profile's scope, with no warning; its tags are the element's; `describe()`, the profile view and the tags fields show it; other views draw stored stereotypes only (recommended)** | No model is warned for what a profile's author meant to hold everywhere; the atlas stays quiet | Not UML's words (a departure, §15); the class view of an element does not show the required stereotype |
| (b) Warn each element of the metaclass in scope that does not list it (`stereotype-required`) | UML's words: each model says what it has | Every class of the atlas's `sales` would be warned for «owned» |
| (c) `{required}` drawn, not checked | Nothing to compute | The flag means nothing |

The reach is wide: Component, Node, Stereotype, Activity, StateMachine and Interaction all specialize Class (§5.4), so the
atlas's required «owned» on Class applies to every one of those owned by `sales`, at any depth. Today `sales` holds three
classes and an enumeration (not a Class), so three elements get «owned»; `describe()` and the panel show it on each. 6.7
pins that list in `tests/atlas.test.mjs`.

**An abstract required stereotype** (decision 22). §5.4's `stereotype-abstract` would otherwise be raised on every
element in scope by (a) itself.

| Option | For | Against |
|---|---|---|
| **(a) Met by any concrete specialization the element applies; warned (`stereotype-required`) when none, since the tool cannot pick one (recommended)** | UML's own reading for a required stereotype with subclasses (at most one instance of it or of a specialization is required); a profile can force "one of these" | One more rule and its fixtures |
| (b) A definition-time error, `extension-required-abstract` | Simple; the author fixes the profile | Refuses a profile UML allows |

### 5.6 Tags (S7)

Tags are `props.tags`, keyed by stereotype, then by tag: `{ "column": { "name": "placed_at", "indexed": "true" } }`. The
outer key is the stereotype as written in `stereotypes` (`BookshopConventions::entity` when qualified), or a required
stereotype's label. A tag a stereotype inherits from its general is stored under the stereotype applied. The tags an
element may have under a key are those of that stereotype and of its generals; a stereotype and its general that both
define a name are one tag, the specialization's (UML's redefinition), said by `tag-defined` on the profile only if their
types differ.

| Option, the shape of `props.tags` (decision 21) | For | Against |
|---|---|---|
| **(a) Keyed by stereotype, then tag (recommended)** | UML keeps tagged values per stereotype application, so two stereotypes that both define `name` (07-profile's «column» and any other) keep two values, and `tag-defined` and `tag-value` know which definition to check; the panel's keys follow from it | One level more in the JSON than `model.md` row 7's flat map; 6.6 rewrites the profile example's tags |
| (b) A flat map from tag name to value, with a definition-time error (`tag-clash`) when two stereotypes that can apply to one metaclass share a tag name | The JSON as `model.md` row 7 wrote it | Refuses profiles UML allows; two applied profiles by different authors may clash on `name` and neither can be fixed by the user |

| Rule | Level | Says |
|---|---|---|
| `tag-defined` | warning | a key of `props.tags` is a stereotype the element has (stored or required), and each tag under it is defined by that stereotype or one of its generals |
| `tag-value` | warning | a value fits its tag's type: Boolean `true` or `false`; Integer `-?\d+`; Real a number; UnlimitedNatural a whole number or `*`; an enumeration of the profile (by label) one of its literals; any text for String and every other type |
| `tag-required` | warning | a tag whose multiplicity's lower bound is 1 (as with no multiplicity) and that has no default has a value |
| `stereotype-unknown`, `stereotype-applied`, `stereotype-ambiguous`, `stereotype-extends`, `stereotype-abstract` | §5.3, §5.4 | |

Multiplicities are read with the class type's `multBounds`. A tag of multiplicity above 1 is one text value (its list form
is left out, §15).

### 5.7 Editing tags (S8)

The panel's fields are fixed per element type (Q4); the tags an element has depend on its stereotypes.

| Option | For | Against |
|---|---|---|
| **(a) A hook slot: the panel adds `TYPED.fields(model, element)` after the type's fields; `src/uml/stereotypes.js` gives one field per tag of the element's stereotypes, `{ key: 'p:<stereotype>:<name>', path: ['tags', stereotype, name], label: '«stereotype» tag' }` (the key carries the stereotype, so two stereotypes' `name` fields keep their own focus), kind `enum` for Boolean and enumerations, `text` otherwise (recommended)** | Tags edited on every typed view, by pointer and keyboard, with the panel's `path` and `set` as they are; about 12 B | A slot in the core |
| (b) A `map` field kind (`name = value, …` in one text field) that each type lists | One field | About 80 B in the core; twelve type files list it; the panel parses a micro-syntax |
| (c) On the profile view only, each tag row a node `<element>-><stereotype>.<tag>` renamed by F2 | No core byte (stage 5's geometry ids) | Tags of an element not on a profile view cannot be edited |

An empty value removes the tag (`set` to undefined); `set` makes the missing `props.tags` and stereotype objects on the
way. A tag stored but defined by no stereotype the element has stays in
the model and is warned (`tag-defined`), not shown as a field.

### 5.8 Where tags are drawn (S9)

| Option | For | Against |
|---|---|---|
| **(a) On the profile view (§4.1); elsewhere stereotypes as now, tags in the panel, `describe()` and the PDF rows of the profile view (recommended)** | No picture of another type changes; no other type file is touched | A class view does not show `{table = orders}` |
| (b) Every type draws tags in braces under the name | UML's other notation | Twelve type files and their pictures change; boxes grow |

### 5.9 As built (6.2)

Where `src/uml/stereotypes.js` departs from or settles what §5 left open:

- **The metaclass table** keeps UML 2.5.1's abstract metaclasses between a row and `Element` (`Namespace`, `Type`,
  `RedefinableElement`, `TypedElement`, `PackageableElement`, `ConnectableElement`, `StructuralFeature`, …), where §5.4's
  last row put `Classifier`, `Package` and the rest straight under `Element`: what fits is the same for every row §5.4
  names, and a stereotype on `NamedElement` or `Namespace` fits what UML says it does. Each row's generals are all those
  OMG's `UML.xmi` (20161101) lists, not only the first: `Node` is also a `DeploymentTarget`, `Artifact` a
  `DeployedArtifact`, `Operation` a `TemplateableElement` and `ParameterableElement`, `InformationFlow` a
  `PackageableElement`, `ObjectNode` a `TypedElement`, `PackageableElement` a `ParameterableElement`, `Vertex` a
  `RedefinableElement`. `tests/stereotypes.test.mjs` holds that every general is a row.
- **A stereotype applied outside its profile's scope** (`stereotype-applied`, qualified or not) is not one the element
  has: no tags, no required extension met by it; tags stored under it are `tag-defined`.
- **The keywords** (§5.3, 3) are UML 2.5.1's Table 22.1 and Table C.1 in full (`actor` and `datastore` among them; three
  are two words, `deployment spec`, `element access`, `element import`), with earlier UML's `after`, `all`, `at`,
  `dataStore`, `deploymentSpec`, `else`, `from` and `when`, which models still store.
- **The package that applies a profile is in its scope** (§5.2 says "everything the package owns"): `sales` may store
  «boundedContext» on itself, as UML tools allow (Eclipse UML2's nearest package of a package is itself). A required
  stereotype on `Package` reaches it too. *For the maintainer to confirm.*
- **A profile's own definitions** (the profile and what it owns, at any depth) are not reached by a required extension,
  so a profile inside the package that applies it does not get its own required «owned» on its stereotypes.
- **Two profiles in scope with a required stereotype of one name**: each is keyed `Profile::name` in `props.tags` and the
  fields, as §5.3 would write a stored one, so neither hides the other.
- **`Profile::name` with two profiles of that label**: the one applied in the element's scope that defines the name, else
  the first that does. Two profiles of one label, like two stereotypes whose names meet (`Entity`, `entity`), are 6.3's
  definition rules to refuse; `styKey` is exported so `stereotype-names` compares names as §5.3 meets them.
- **`tag-defined` on the profile** is said once, by the stereotype that redefines (not by each specialization below it),
  and also when a stereotype inherits one tag name with two types from two unrelated generals ("redefine it").
- **A stereotype applied twice** (`entity` and `Conv::entity`) is one application; tags stored under the second name are
  `tag-defined`, pointing to the first name.
- **A tag's value** is text (a number or a boolean read as its text); a list or a map fits no type (`tag-value`, "is not
  text" for a String).
- **`appliedOf`** entries carry `key` too, the name `props.tags` keys them by (as written in `stereotypes`, or a required
  one's label); `stereotype` and `profile` are the elements. `required` is true for a required stereotype whether supplied
  or stored.
- **The rules' table** is exported as `STY_RULES`, for the profile type's `rules` (6.3), so the problems list and
  `rules()` name them. The table (`UML_META`, `UML_AS`, `metaOf`, `metaUp`, `metaKnown`) is exported for 6.3's
  `metaclass-known` and its pick of the closest names, and `styKey` for `stereotype-names`.

## 6. The time ruler (S10 to S14)

### 6.1 A strategy of its own

| Option | For | Against |
|---|---|---|
| **(a) `src/layout/timeruler.js`, `layoutTimeRuler(input) -> out`: a pure function in `layoutTimeAxis`'s contract (no DOM, no model; sizes measured in by the type; `problems` returned, never `warn()`; `slots` for the gestures), reusing `r2` and the sequence type's message ends, and none of the row walk (recommended)** | The time axis's rows are ordinal (Q7): a timing view needs x from a quantity; a small file, tested alone; the sequence layout, stage 3's hottest typed code, is untouched | A second interaction layout to maintain (`proposal.md` §5's "four strategies") |
| (b) A linear mode in `layoutTimeAxis`, turned (lifelines as rows, time across) | One file | Every branch of the row walk learns a second meaning of y; fragments, bars and creation have no timing meaning; risks stage 3's tests |
| (c) The layered layout | Its router | Time is not a rank; lines would be routed round each other, not drawn at their instants |

### 6.2 The contract

```js
// src/layout/timeruler.js (umlimator-all.js only)
layoutTimeRuler({
  lanes:   [{ id, name: { w, h }, form: 'states' | 'values', rows: [{ state, w }],   // states top to bottom; values: []
              changes: [{ id, at, state, w }] }],                                     // w: a value's text width
  messages:[{ id, from, to, sentAt, receivedAt, w, h }],                              // from, to: lane ids
  constraints: [{ id, kind: 'duration' | 'time', from, to, w, h }],                   // from, to: change ids
  unit,                                                                                // text or null
}) -> { lanes: [{ id, x, y, w, h, name: { x, y }, rows: [{ state, y }], strip: { y, h } }],
        steps: [{ lane, pts }], bands: [{ lane, segs: [{ x0, x1, text, cut }] }],
        changes: [{ id, x, y, w, h }],                                                 // hit boxes, one per change
        lines: [{ id, pts, lbl }], marks: [{ id, kind, pts, lbl }],
        ruler: { y, x0, x1, ticks: [{ t, x, major, label }], unit },
        slots: [{ index, x, y, parent, after, t }], scale: { t0, t1, k, step },
        bounds, problems }
```

As built (6.4), within that contract: a problem is `{ level, rule, message, ids }` (`timing-dense`, `timing-label`, and
`change-time`, `message-ends`, `constraint-ends` for an item it cannot place, which is not drawn); a duration mark's `pts`
are `[a, b, c, d]`, up the extension line at its earlier change, along the dimension line (arrows on `b` and `c`), up the
other; a time mark's are its 6 px tick; a band segment's `text` is null under 16 px and `cut` when its text (cut at 160
px) and 12 px do not fit; a state a lane does not list gets a row at the bottom, as wide as the change's `w`; a slot's
`index` counts the lane's drawn changes at or before its `t`. The tick labels are measured by the ruler itself with the
core's `textW` at 10 px (they are numbers it makes). With every time at one instant, or within 1e-90 of one another
(finer than a tick label's 100 digits), the ruler runs one unit from `t0`, and the changes it cannot part are `timing-dense`; a time past ±1e300 is an item it cannot place
(`change-time`), as the span and a step past it are no number. Constraints are placed before messages, so a message label
keeps off theirs too; a label moves up only. A change skipped at its instant has no hit box (one per drawn change), and
a constraint on it is drawn on the change drawn at that instant. A constraint whose `kind` is neither is not drawn
(`constraint-kind`). A duration's label sits on its dimension line; a time constraint's sits to its tick's right, their
bottoms level; a strip's level is 20 px, or its tallest label and 4 px.

### 6.3 Scale and ticks (S11)

- **One time base** for every lane of the view (UML draws one), from `t0 = min(0, every time)` to `t1`, the latest time
  plus room for the last state (half a step at least).
- **Linear,** `x(t) = X0 + (t - t0) × k`. `k` is the smallest that keeps, on every lane, consecutive changes at least
  12 px apart (a state step's hit area, E8; a zero gap, two changes at one instant, is skipped, `change-instant` says
  it) and every value's text plus 12 px inside its segment (text cut at 160 px), and makes the plot at least 480 px; it is capped where the plot would pass 4,800 px. Under the cap, what does not fit is cut
  (`fit`) and reported once, naming the changes (`timing-dense`, a layout problem).
- **Ticks:** the step is the smallest of 1, 2 or 5 × 10ⁿ units whose ticks lie at least 64 px apart and whose labels fit
  with 12 px between; minor ticks at a fifth of a step, whatever the step (one rule, the snap of S16 and §6.7). The ruler is drawn under the last lane,
  labels under the major ticks, the unit after the last label. Ticks start at the first minor tick (a multiple of a fifth
  of the step) at or after `t0`, and so do the slots (as built, 6.4).
- Derived, never stored (rule 9): the canvas's zoom is the way to look closer.

| Option | For | Against |
|---|---|---|
| **(a) Linear and derived, one base, capped (recommended)** | A duration looks as long as it is, which is a timing diagram's point; nothing to keep in step; D1 | A view from 0 to 1,000,000 with changes 1 apart cannot show both (the cap; `timing-dense`) |
| (b) Ordinal: each distinct instant one equal step, as the time axis | Compact | Draws 100 ms and 600 ms alike: not a timing diagram |
| (c) Linear, with `timeline.scale` (px per unit) stored, as `proposal.md` §8's "set the scale" | The user picks the density | A stored number that every change of times can make wrong; a view that is too wide or too dense by hand |
| (d) Linear with broken spans (axis breaks over idle gaps) | Long idles shown short | The ruler is no longer linear; more geometry; left out (§15) |

### 6.4 Lanes (S12)

Lifelines are lanes stacked top to bottom in `nodeIds` order, each a full-width rectangle: the lifeline's name in a
column on the left (`name : Type` with `represents`, cut at 160 px), a column of its state names (states form), then the
plot. One horizontal rule between lanes; the columns share widths across lanes.

- **States form** (the default): one row per state, 24 px apart, in `states` order from the top, plus 12 px above and
  below. The timeline is a step line: level at its state's row between changes, upright at each change. Nothing is drawn
  before the first change (§15); the last state runs to the plot's end. A change whose state is not listed is drawn on an
  extra row at the bottom, labelled with it, and warned (`change-state`).
- **Values form**: a band 24 px high; at each change the two edges cross over 8 px (UML's hexagon), the value centred in
  the segment, cut to it; a segment under 16 px shows no text (its name is in the change's accessible name and the PDF).
- **Under each lane, a strip** for its constraints (§6.6), 0 px when it has none.

### 6.5 Messages (S13)

A message is a straight line from `(x(sentAt), the sender's level at sentAt)` to `(x(receivedAt), the receiver's level
at receivedAt)`: a state's row in the states form, the band's middle in the values form; at a time before the lane's
first change, or on a lane with no change, the lane's middle. Equal times draw it upright.
Its sort draws its ends as the sequence type does (`SQ_END`: a call filled, async open, a reply dashed and open); create
and delete are not timing sorts (§15). Its label sits at the line's middle, 4 px above it, moved away 4 px at a time, at most the sender's lane's height,
until it meets no label, step or band text placed before it; one still meeting something is reported in the ruler's own
`problems` (`timing-label`). The layout check (`routeAudit`, `src/layout/audit.js`) is not used: it treats every
segment as upright or across, so two slanted messages fall into its "parallel" branch (false shares, missed crossings),
and steps, bands and strips are not its nodes or edges; `stage5-followups` is changing that file too. §11's timing
conditions are a predicate of their own, in `tests/timeruler.test.mjs` and `tests/stage6.html`. A message from a lane to
itself is a line within the lane.

### 6.6 Constraints (S14)

- **Duration constraint:** a dimension line in the strip under the lane of its earlier change, from `x(from.at)` to
  `x(to.at)`, an open arrow at each end, thin extension lines up to each change; its label centred over it. Two whose
  spans overlap in one strip take two levels, 20 px apart (greedy, by start). Its ends on two lanes: the strip of the lower
  lane, the extension lines reaching both.
- **Time constraint:** a 6 px tick at `x(from.at)` in the strip, its label to its right.
- A label wider than its span overflows it, centred; the strip is as wide as the plot.

| Option | For | Against |
|---|---|---|
| **(a) Strips under the lanes, stacked by level (recommended)** | Never over a state line or a message; one place to read every constraint of a lane | Lanes grow by 20 px a level |
| (b) Over the plot, at the change | UML tools do so | Meets steps and messages; the layout check would report most |

### 6.7 Slots and hit boxes

- Each change has a hit box: 12 px wide, centred on its upright (its crossing in the values form), as tall as its step,
  12 px at least. Its id is the change's: an element of the model's id space (rule 5) drawn as a node no view lists,
  selected and handed to the hooks as stage 5's port on a part is (Q9).
- Slots: on each lane, one at every minor tick, `{ index, x, y: the lane's middle, parent: the lane, after: the change
  before it, t }`. The canvas finds the nearest by `x` and `y` (Q8): a drop, a release or a keyboard add at a time.

## 7. The timing type

### 7.1 Drawing

`layout: { run: tmRun, pins: false }`: the type measures in the host's measure, builds §6.2's input, and turns the output
into the geometry `svgOf` draws (lanes and names as nodes, changes as nodes with their hit boxes, messages as lines,
steps, bands, ruler and constraints as the type's layers, as `sqDraw` does). Lines and outlines `--um-muted`; the step
line and the band's edges `--um-text`, 1.5 px; texts `--um-text`. No `sd` frame (§15).

### 7.2 Validators

| Rule | Level | Says |
|---|---|---|
| `change-lifeline` | error | a change names a lifeline of the model |
| `change-time` | error | a change's `at`, a message's `sentAt` and `receivedAt` are numbers |
| `change-state` | warning | in the states form, a change's state is one of its lifeline's `states` (drawn on an extra row) |
| `change-instant` | warning | one lifeline has one change at an instant (the one whose id sorts last is drawn, so list order means nothing) |
| `message-ends` | error | a message joins one or two lifelines of the view (one: a message within a lane) |
| `message-times` | error | a message is received no earlier than sent |
| `sort`, `reply-call` | as the sequence type's | a timing message's sort is call, async or reply; a reply names a call of the view going the other way, sent no later |
| `constraint-ends` | error | a duration constraint's `from` and `to` are changes of the view; a time constraint has a `from` and no `to` |
| `constraint-order` | warning | a duration constraint's `to` is no earlier than its `from` |

A lifeline the view does not list keeps its changes, not drawn and not warned: that is a hidden lifeline (§8.3).

### 7.3 Deleting (S15)

| Option | For | Against |
|---|---|---|
| **(a) The core learns the timeline: `refs()` reports a change's `lifeline` and a constraint's `from` and `to` as kind `end`; `delete` takes a time item whose lifeline or change is gone, so a lifeline takes its changes and their constraints, from any view (about 60 B, recommended)** | Deleting the lifeline from a sequence view of the same model leaves no change naming nothing; `references()` lists them (the hint line counts what goes); DoD 6 for every view of a shared lifeline | Core bytes |
| (b) The timing type's `remove` hook builds the whole transaction | No core byte | Only from a timing view: Shift + Delete of `lifeline-payments` on the sequence view leaves the timing view's changes naming nothing (Q5); the test that deleting any element leaves a valid model fails |
| (c) Constraints by the type's `refs` (they have a `type`), changes by the hook | Half in the core | Two mechanisms for one section |

`hide` keeps them: it clears every reference but kinds `end`, `parent`, `part` and `prop`, so a lifeline hidden keeps its
changes and their constraints in the view's timeline, and they come back with it. Under any new kind, `hide` would clear
them, against S17; 6.1 tests that hiding `worker` keeps its changes. A hidden lifeline's messages are another matter
(§8.3).

## 8. Editing

### 8.1 Hooks used

| Hook | Profile | Timing |
|---|---|---|
| `add` | §4.3 | Lifeline (name typed), into `nodeIds` at the end; Change (state or value typed), on the slot's lane at its `t` (keyboard: the selected change's lane, a minor tick after it; else the selected lifeline at `t0`): in the states form a state not yet listed is added to `states` in the same transaction, and the hint line says so; Time constraint (label typed) on the selected change, else `{ error }` |
| `connect` | §4.3 | Lifeline to lifeline: a message at the release slot's `t`, sent and received then, its sort from the picker (Call, Async, Reply). Change to change: a message from the first's time to the second's, or, picking Duration constraint, a duration between them in time order |
| `moveTo` | null (pins, as the class type) | A change dropped: `set at` to the drop's `t`; Alt + ← / →: one minor tick; Alt + ↑ / ↓ on a states-form change: the state above or below. A message dropped or Alt + ← / →: both times by the same amount. A lifeline, Alt + ↑ / ↓: its place in `nodeIds` |
| `rename` (F2) | as the class type | A change: `state` or `state @ t`; a message: `label`, `label @ t`, or `label @ t1 → t2` (`->` too); a constraint: its label; a lifeline: its name, or `name : Type`; a state's row (a geometry id, stage 5 §6): the state's name, rewriting `states` and every change of that lifeline in that state in one transaction; the ruler: the view's `timeline.unit` (empty removes it) |
| `remove` | null | §8.3 |
| `key` | null | `S` on a lifeline: `present.<id>.as` to `values` or removed |
| `member` | the class type's, on a stereotype | null |

How the hooks write time items. The core's `add` cannot place them: it puts an element in `nodes`, `edges` or `fragments`,
and a duration constraint (`from`, `to`) would go to `v.edges` as a line, a change (no type) to `nodes`. So the timing
hooks emit `set` with `view` and `path: ['timeline', 'changes']` (or `['timeline', 'constraints']`), carrying the whole
new array; since `set` skips `checkNew`, the hook checks the new id is unused in the model first. A change or constraint
moved or relabelled is a `set` by its `id` (`index()` holds time items, Q5).

A message's ends and a constraint's `from` and `to` are not re-attached: delete it and connect again (the hint line says
so on F2 of one). Renaming a state in the panel's `states` list is a plain `set` of the list: changes in the old name are
then warned (`change-state`) and drawn on the extra row; F2 on the state's row is the way that rewrites them.

`S` is not one of the canvas's keys (`E`, `F`, `0`, `1`, `+`, `-`, the arrows, Enter, Escape, Delete, F2, `L`, `N`, `W`,
`V`); a type's `key` hook hears it first and returns null for anything else.

| Option, exact times (S16) | For | Against |
|---|---|---|
| **(a) Snap to a minor tick (a fifth of the step) by pointer and Alt + arrows; exact by F2's `@` (recommended)** | No core byte; every time typed from the keyboard; the text says what it sets | A micro-syntax to learn, shown on the hint line when F2 opens |
| (b) A `number` field kind in the panel | Plain fields | About 30 B in the core; the panel learns a kind for two fields |

### 8.2 Gestures and their keys

Palettes: profile (Profile, Stereotype, Metaclass, Enumeration, Package, Comment; lines Extension, Generalization,
Profile application, Comment link); timing (Lifeline, Change, Time constraint, Comment; lines Call, Async, Reply,
Duration constraint, Comment link). Properties: a lifeline's `represents`, `states` (list), Stereotypes; a message's
`sort` (enum), `replyTo`; an extension's `isRequired`; a stereotype's `isAbstract`; tags on every element (§5.7). Every
gesture has a key; each is tested by pointer and by key through `apply()`.

### 8.3 Hiding (S17)

| Option | For | Against |
|---|---|---|
| **(a) A change, a message or a constraint cannot be hidden: Delete deletes it, and the hint line says so first; Delete on a lifeline hides it (it leaves `nodeIds`), its timeline kept and not drawn; Shift + Delete deletes it with its changes (recommended)** | Stage 3's P12 and stage 5's S20; nothing new in `present` | A view cannot show a lifeline without one of its changes |
| (b) `present.<id>.hidden` for time items | Detail can be left out | A new `present` key, its references and its tests; a hidden change leaves a step with no cause |

A hidden lifeline's messages (decision 23). The core's `hide` also drops the view's own lines whose ends are hidden, and
a timing message is inline, living only in the view's `edges`: hiding a lifeline deletes its messages for good.

| Option | For | Against |
|---|---|---|
| **(a) Stated: Delete on a timing lifeline hides it and its messages go, and the hint line says so first, with their count ("Hides worker; deletes its 3 messages"), as the sequence view's inline messages do (recommended)** | No new code; the sequence view behaves the same; undo brings them back | Showing the lifeline again does not bring its messages back |
| (b) The timing type's `remove` hook hides by `set` of `nodeIds` only, keeping the messages; they are not drawn while an end is hidden, and `message-ends` skips a hidden lifeline | A hidden lifeline comes back whole | A second way to hide, unlike the sequence view; messages kept that no view draws |

## 9. `describe()`, the PDF and the legend

Each type gives `describe(model, viewId)`, `geo.order`, accessible names for every node, line, change and constraint
(A1), a legend, and 4.9's `rows` and `word`:

| Element | `word` | `rows` |
|---|---|---|
| Profile | Profile | its stereotypes and metaclasses; the packages it is applied to |
| Stereotype | Stereotype (abstract) | `extends Class {required}`; its generals; each tag definition as its row |
| Metaclass reference | Metaclass | the stereotypes extending it |
| Any element on a profile view | its kind | each stereotype it has, `«name» tag = value, …` (a required one marked so); each member's |
| Lifeline | Lifeline | each change, `at unit: state` in time order; each message it sends, `label to receiver at sentAt → receivedAt`; each constraint on its changes |

- Timing's reading order: lanes top to bottom, each lane's changes by time, then messages by `sentAt`, then constraints.
  A change's name: "worker: Waiting for payment from 100 ms"; a message's: "Call charge(total) from worker at 100 ms to
  payments at 140 ms"; a duration constraint's: "Duration constraint {<= 800 ms} on worker from 100 ms to 760 ms". The
  ruler is one group named "Time ruler, 0 to 1000 ms, a tick every 100 ms"; its ticks are not read out.
- The profile view's names say each stereotype's extensions and tags; an element's says its stereotypes, the required
  ones too, and its tags.
- Legends: extension, profile application, generalization (profile); call, async, reply, duration and time constraint,
  states and value forms (timing).
- Contrast: lines `--um-muted` (5.95:1 light, 7.05:1 dark); step lines and texts `--um-text`.

## 10. Readers (S22)

None, as `plan.md` §5 says. Mermaid 12.3.0 has no profile diagram and no UML timing diagram: its `timeline` is a list of
periods and events, its `gantt` a schedule of tasks, neither of which has lifelines, states or constraints. PlantUML has a
timing diagram, but D12 makes Mermaid the first text notation and no other is in the plan; a reader of PlantUML's timing
syntax would be a package after 0.23.0, for the maintainer to ask for. `umlimator.py import` names neither type.

## 11. Fixtures

From `risks.md` §6: T (timing changes at the same instant on two lifelines) and G1 (the profile's classifier graph). Each
lives in `tests/`, laid out in Node and in Chrome under three fonts and both themes, with no overlap, no text overflow, no
line through a node (the layout check, for the profile); for timing, by the predicate of `tests/timeruler.test.mjs` and
`tests/stage6.html`, not the layout check (§6.5): no step or band text outside its lane, no label over a step, every
message's ends on its lanes' levels within 1 px.

| Fixture | Holds |
|---|---|
| `profile-minimal.json` | A profile with one stereotype extending Class with one tag; a package applying it; a class in it applying the stereotype with the tag set |
| `profile-stress.json`, view `edge-cases` | A generalization chain of three stereotypes with inherited tags; an abstract stereotype applied (error); a required extension, its stereotype on a class that lists nothing; a stereotype on Classifier applied to a component; one applied outside the applying package (warned); a standard-profile name in scope (fine); an unknown name in scope (warned); two applied profiles defining one name, used plain (warned) and qualified (fine); tag values of every checked type, right and wrong; an enumeration tag; a required tag missing; a tag no stereotype defines; a metaclass name not in the table; a member and a line applying stereotypes; a package nested two deep under the applying one; a 40-character stereotype name; two stereotypes on one element both defining `name`, each with its value; an abstract required stereotype, met by a specialization on one class and missing on another (decision 22); `Entity` and «entity» meeting (first letter); «use» on a dependency in scope (a keyword, fine) |
| `profile-stress.json`, view `all` | 3 profiles, 40 stereotypes, 50 metaclass references and applied elements, 60 lines (P1) |
| `timing-minimal.json` | One lifeline, two states, two changes, the ruler |
| `timing-stress.json`, view `edge-cases` | Changes at one instant on two lifelines (T); two at one instant on one lifeline (warned); a change before 0; a states and a values lifeline, a message between them; a message sent and received at one instant; one received before sent (error); a reply; a message within one lane; overlapping duration constraints on one lane (two levels); a duration across two lanes; a time constraint; a constraint whose `to` is earlier (warned); a lifeline of 20 states; a 40-character value in a short segment (cut); a lifeline with no change; a view from 0 to 1,000,000 with changes 1 apart (capped, `timing-dense`); no `unit` |
| `timing-stress.json`, view `all` | 12 lifelines, 400 changes, 100 messages, 40 constraints (P1) |
| `tests/notation.html` | Its arrowhead checks gain the extension's filled triangle and «apply» |

The cross-model check's own cases, one passing and one failing model per rule, are in `tests/stereotypes.test.mjs`, with
a check that no example, target example or fixture without a profile gets a new problem (§2.4).

## 12. Performance (P1, S19)

| Fixture | Budget, in Node, CPU time, best of seven after a warm-up |
|---|---|
| Each stress fixture's `all` view | A full layout plus SVG markup under 1 s |
| The profile stress view | The common edits, laid out and drawn, against 100 ms (CI holds 1 s and prints them): a tag value set; a stereotype added to an element |
| The timing stress view | The common edits, laid out and drawn, against 100 ms (CI holds 1 s and prints them): a change moved one tick; a message's label renamed; a state added to a lifeline |
| A generated model of 2,000 elements under 3 applied profiles | `TYPED.across(model)` alone (not the whole `validate()`, whose class rules also run) against 10 ms, printed (CI holds 1 s); linear as `tests/package.test.mjs` holds it: 4x the model under 10x the time, best of five after a warm-up |

- The profile type passes `repair: false` and `reroute: false`, as stage 4 and 5's types.
- The time ruler routes nothing; its one search is the message labels' (§6.5), against those placed before it:
  quadratic in messages. The stress fixture's 100 bound it; a grid of buckets is the upgrade if a host's views grow.
- The cross-model check indexes the model once (owners, profiles, stereotypes by name, applications) and keeps each
  owner's scope memoised, so no element walks its `parent` chain on its own: linear in elements and the names they
  apply. It matters on every edit: the canvas's `problems()` (`src/canvas/edit.js`) calls `validate(m)` on each panel
  refresh, so the check runs on every edit of every typed view in `umlimator-all.js`, which §12's edit budgets ("laid
  out and drawn") do not count; its 10 ms target is that cost.
- Every timed test's title ends " (timed)", so CI runs it in its serial step (the maintainer's decision of 13 Nov 2026).
- Browser timings under headless virtual time prove nothing (1.11): budgets are enforced in Node.
- No test asserts 100 ms: each prints its time against the target and holds 1 s, in a test whose title ends " (timed)".

## 13. Work packages

### 13.1 Before stage 6 starts

- This note is approved; `model.md` and `risks.md` take §17's changes with 6.6 (5.8 owns `docs/` until it merges).
- Stage 5's 5.0 to 5.6 have merged (they have).

### 13.2 The packages

Each is one pull request. "Owns" lists the only files that package changes while it is open. Built files
(`lib/umlimator.js`, `lib/umlimator-all.js`) and `examples/bookshop.html` are rebuilt by every package that changes `src/`,
after merging `main`, never merged by hand (X2). The lead keeps `docs/diagrams/README.md`'s status table (X7); a package
proposes its row and writes its release notes in its pull request's description, for 6.6 to gather.

| # | Work package | Owns | Depends on | Done when |
|---|---|---|---|---|
| 6.0 | **List the files** (the lead). The stage's four sources as empty files, in `ALL` after stage 5's, in load order: `uml/stereotypes`, `uml/profile`, `layout/timeruler`, `uml/timing`. The stage's three browser pages, `tests/profile.html`, `tests/timing.html` and `tests/stage6.html`, as placeholders that report ok, listed in `tests/embed.py`'s pages with their header lines, as the sources are listed in `ALL` | `tools/build.mjs`, the four empty sources, the three placeholder pages, `tests/embed.py` (its one pages line) | This note | `lib/umlimator-all.js` changes by blank lines only; `lib/umlimator.js` not at all; `tests/embed.py` runs the three pages ok; no other stage 6 lane edits `ALL` or `tests/embed.py`; the merge with 5.8's `tests/embed.py` line rehearsed (X2) |
| 6.1 | **The core's slots.** `TYPED.across` in `validate()`; `TYPED.fields` in the panel; the timeline in `refs()` (kind `end`) and `delete` (§7.3); the pointer line above `const TYPED = {}`. Tested with test-only fills of both slots | `src/map/validate.js`, `src/canvas/edit.js`, `src/core/apply.js`, `src/core/registry.js` (the comment above `const TYPED = {}` only), `tests/stage6-core.test.mjs` (new), `tests/typed-edit.html` (adds cases) | 6.0 | Maps unchanged (hashes, stills, `tests/edit.html`); every typed type's tests and `tests/core-diet.*` unchanged; with the slots empty `validate()` and the panel are as before; a test fill's problems are said once, its fields edit through `set` with a `path`; on an inline copy of `14-timing.json` (or one read through `targets()`, ids found by label, so 6.6's move and renames do not break it): deleting the worker lifeline takes its four changes and `c-wait`, `c-finished`; deleting `w-waiting` takes `c-wait`; `references()` lists them; hiding the worker lifeline keeps its changes and constraints; deleting any element of any example or target leaves a model that validates; the core's bytes before and after, within §2.3 |
| 6.2 | **Stereotypes across the model.** `src/uml/stereotypes.js`: the metaclass table, the standard profile and UML's keywords, scope (memoised per owner), names, required extensions, tags keyed by stereotype, the rules of §5.3 to §5.6, `TYPED.across` and `TYPED.fields` filled; `appliedOf(model, id) -> [{ stereotype, profile, required, tags: [{ name, def, value }] }]` for 6.3 and 6.5 to read | `src/uml/stereotypes.js`, `tests/stereotypes.test.mjs` (new) | 6.0; 6.1 for the slots' end-to-end cases (its rules are tested by calling them before) | Each rule has a passing and a failing model (inline); no example, target or fixture without a `uml.Profile` gets a new problem; the current `07-profile.json` gets only the problems its present form earns, each listed in the test (6.6 checks the revised one gets none); every `uml.*` type of every registered type has a metaclass row or a stated mapping; §12's 10 ms print and linear-time test; geometry hashes and stills unchanged |
| 6.3 | **The profile type.** §4: definition, look (`class.js`'s `IMPLIED`, `lineLook`, `keyword` entries, the package-like test in `typeGeo`, `nodeName` and `drawnLines`' boxes, and `generalization-kinds`' stereotype kind in `CLASSIFIERS`; `owners.js`'s `OWN_BOXES`, `owner-kinds`, `holdsLine`, `ownerChoices` and the box title's «profile»; `package.js`'s element and line lists gain `uml.Profile` and `uml.ProfileApplication`), the filled triangle in `ENDS`, tag compartments from `appliedOf`, rules, `describe()`, names, legend, `rows` and `word`, hooks | `src/uml/profile.js`, `src/uml/class.js` (those lines only), `src/uml/owners.js` (those lines only), `src/uml/package.js` (its two lists only), `src/typed/draw.js` (`ENDS` only), `tests/profile.test.mjs` (new), `tests/profile.html` (replaces 6.0's placeholder) | 6.0, 6.2's `appliedOf` (written against §5's contract until it merges) | Definition of done 2, 4, 5, 6 and 8 on row 7's subset; every gesture by pointer and key through `apply()`; a 30-step session undone, redone and reopened to byte-identical models; an inline copy of `07-profile.json` lays out clean, down and right; class, package and object tests (`tests/class.test.mjs`'s cross-kind loop with `uml.Stereotype` among the kinds) and `tests/core-diet.*` unchanged; geometry hashes and stills unchanged |
| 6.4 | **The time ruler.** §6: `layoutTimeRuler`, tested alone on hand-built inputs | `src/layout/timeruler.js`, `tests/timeruler.test.mjs` (new) | 6.0 | On a table of inputs: the scale and step chosen as §6.3 (zero gaps skipped; a level before a lane's first change or on a lane with none at its middle; minor ticks a fifth of the step); consecutive changes 12 px apart or `timing-dense`; values inside their segments or cut and reported; strips' levels; message labels clear of steps and of each other within the lane's height, or reported (`timing-label`); §11's timing predicate; slots at every minor tick; the same input twice gives the same output; the stress fixture's size laid out, printed against 100 ms and held to 1 s in a " (timed)" test; geometry hashes and stills unchanged |
| 6.5 | **The timing type.** §7 and §8 for timing: input, drawing, change nodes, slots, rules, `describe()`, names, legend, `rows` and `word`, hooks (`add` and `connect` writing time items by `set` of the timeline path, `moveTo`, `rename` with the state row and the ruler's unit, `remove`, `key`) | `src/uml/timing.js`, `tests/timing.test.mjs` (new), `tests/timing.html` (replaces 6.0's placeholder) | 6.4; 6.1 for the delete cascade's gesture tests | As 6.3 on row 14; an inline copy of `14-timing.json` lays out clean; F2's `@` forms parse and print back; a new time item's id checked unused; the sequence type's tests unchanged, and its panel and `describe()` ignore a lifeline's `states` (asserted) |
| 6.6 | **Fixtures, examples, docs, CLI.** §11's files and their tests (`tests/stage6-fixtures.test.mjs`, `tests/stage6.html`); the two examples revised (§14) and moved, with `check.mjs`'s `MOVED` (and its hand timing rule dropped); `tests/core-diet.json` re-recorded for the two moved and revised targets (as 5.8 did for 04 to 06); `render`, `check`, `stills` and `pdf` on each; the schema and `.d.ts`; C10's tests; every document of `plan.md` §7; `docs/conformance/uml-profile.md` and `uml-timing.md`, each with its departures and a fidelity table of every writer's limits (SVG, PNG, PDF: value text cut in short segments, constraint labels overflowing their span, tag rows cut, …); `model.md` and `risks.md` (§17); the lanes' release notes gathered into `docs/module-api.md` | `examples/` but the atlas's files and `bookshop-packages.json`, `tests/profile-*.json`, `tests/timing-*.json`, `tests/stage6-fixtures.test.mjs`, `tests/stage6.html` (replaces 6.0's placeholder), `tests/notation.html`, `tests/cli.py`, `tests/mcp.py`, `tests/core-diet.json`, `lib/umlimator.d.ts`, `lib/umlimator.schema.json`, `docs/diagrams/examples/check.mjs`, `docs/` (but the status table) | 6.2 to 6.5; 5.8 merged | Definition of done 1, 3, 7 (the fidelity tables), 9, 10, 11 and 12 for both types; the revised `bookshop-profile.json` gets no problem; §12's budgets in CI; each PDF lists §9's rows; both examples in the gallery and CI |
| 6.7 | **The Bookshop atlas, full pass** (`plan.md` §7: the 14 UML types). The two examples join by drill-down (§14); `tools/atlas.mjs`'s `KEYS.props` gain `tags`, `states`, `sentAt`, `receivedAt` and `isRequired`, and a view's `timeline`; the package example shows the profile and its application; a test that the atlas holds a view of each of the 14 UML diagram kinds, each reached from the map, each laid out as in its own file, `describe()` and the PDF of the whole atlas succeeding | `examples/bookshop-atlas.json`, `examples/bookshop-packages.json`, `tools/atlas.mjs`, `tools/atlas-links.json`, `tests/atlas.test.mjs` | 6.6 (the moved examples); 6.3 for the package view's profile | `node tools/atlas.mjs` builds with no clash; `tests/atlas.test.mjs`'s pinned problems stay the class rule's two (none from `order-uses-money`'s «use» or any other stored keyword); exactly the elements that get «owned» pinned (§5.5); deleting `lifeline-worker` from the sequence view takes its timing changes; the atlas's class view's `describe()` and PDF rows checked for `placedAt`'s new stereotype and tags; the package example's new stills in the pull request for the maintainer |

6.1's "deleting any element of any example or target leaves a model that validates" is held, as `tests/apply.test.mjs`
holds it, with `lib/umlimator.js`'s `validate()` and, since no type checks a timeline before 6.5, a check that no change
or constraint names what is gone. With every type's rules (`lib/umlimator-all.js`'s `validate()`) it does not hold
today, for reasons outside stage 6 (none touches a timeline). Of 1,495 deletes over the examples and targets, 29 raise a
new error under four rules:

| Rule | Deletes | Example |
|---|---|---|
| `extend-points` | 4 | the atlas and `shopping-use-cases.json`: deleting `checkout.payment` or `checkout.extras` leaves an extend naming no extension point (the use case type's `refs` drop it from the list) |
| `message-link` | 18 | the atlas: deleting the connector `shopper-storefront` leaves `cm1` and `cm9` with no connector of their communication view |
| `reply-once` | 6 | the atlas: deleting fragment `f1` or one of its operands leaves `m5` and `m8` both answering `m4` outside an alt |
| `subject-shown` | 1 | `04-composite-structure.json`: deleting `order-service` leaves view `internals` with subject null |

A use case cascade (an extend left with no point goes with it) would close only the first; each of the others needs its
own type's delete to cascade or its rule to accept what a delete leaves. That is the maintainer's to decide, after stage 6.

Two smaller choices as built. With no field list for its type, the panel shows a slot's fields to edit and still lists
every prop to read, `tags` among them as JSON, as before the slot (`tests/typed-edit.html` asserts it). The delete
cascade walks every element once a level of the chain, so a chain stored in reverse order is quadratic (2,000 changes
each naming the one before, about 0.4 s); a timeline is two levels deep (lifeline, change, constraint), and lines
cascade the same way already.

Existing tests a package edits, and why: 6.0 lists the stage's three pages in `tests/embed.py`; 6.1 adds cases to
`tests/typed-edit.html` (the fields slot) and none elsewhere; 6.6 adds the two examples to `tests/cli.py` and
`tests/mcp.py`, the extension's ends to `tests/notation.html`, two rows to `check.mjs`'s `MOVED`, drops its hand timing
rule, and re-records `tests/core-diet.json` (it fingerprints every target through `targets()`, 07 and 14 included, so
their revision changes it); 6.7 edits `tests/atlas.test.mjs` for the two views and the full pass. No other existing test
changes. 6.1 to 6.5 test inline copies of the examples (or read them through `targets()` and find ids by label), so
6.6's move and its renames (`worker` to `lifeline-worker`) break none of their tests.

### 13.3 What runs at the same time (S21)

```
approved ─▶ 6.0 ──┬─▶ 6.1 core slots ───────────────────────────────┐
                  ├─▶ 6.2 stereotypes ──────▶ 6.3 profile ───────────┤
                  └─▶ 6.4 time ruler ───────▶ 6.5 timing ────────────┼─▶ 6.6 ─▶ 6.7 ─▶ 0.23.0
   (stage 5)  5.8 merged ────────────────────────────────────────────┘           (after 0.22.0)
```

- **Stage 6 can run beside stage 5's end.** 6.0, 6.1, 6.2 and 6.4 start on approval, 6.3 and 6.5 as soon as they like
  (each writes against this note's contracts before its needs merge, and tests its drawing and gestures once they have).
  None owns a file that `stage5-followups`, 5.8 or the ELK trial changes, but one line, below.
- **One edit is shared with stage 5:** `tests/embed.py` runs its pages from one tuple on one line, which 5.8 rewrites to
  add `tests/stage5.html`; any lane that adds a page rewrites the same line, so it is not append-like. 6.0 adds all three
  of stage 6's pages there at once, as placeholders, and no later lane touches the file: one shared edit, 6.0's against
  5.8's, rehearsed once in a scratch worktree by whichever merges second (X2).
- **`src/core/registry.js` is not shared in practice:** the follow-ups change the long comment's "Stage 5's:" line; 6.1's
  pointer goes in the comment above `const TYPED = {}`, several unchanged lines away, so the hunks do not touch.
- **`lib/*.js` and `examples/bookshop.html`** (the latter in 5.8's `examples/`) are rebuilt in every lane of both stages,
  after each merge of `main`, never merged by hand (X2).
- **This note's own pull request** edits `plan.md` (§5's stage 6 row), under 5.8's `docs/`: one line no stage 5 branch
  changes, harmless, said here.
- **6.6 and 6.7 wait for 5.8.** They own what 5.8 owns: `examples/`, the atlas and its tools, `tests/cli.py`,
  `tests/mcp.py`, `tests/notation.html`, the schema and `.d.ts`, `check.mjs`, `docs/`.
- Only 6.1 touches the core.
- 0.23.0 ships after 0.22.0.
- One reviewing agent that did not write the code checks each pull request against the definition of done.

| Option | For | Against |
|---|---|---|
| **(a) 6.0 to 6.5 on approval, beside 5.8 and 5.7; 6.6 and 6.7 after 5.8; 0.23.0 after 0.22.0 (recommended)** | Six lanes busy while stage 5's documents finish; one shared line (`tests/embed.py`, 6.0's), rehearsed once | `lib/` rebuilt on each merge of `main` in both stages' branches |
| (b) Stage 6 after 0.22.0 is released | No overlap | Lanes idle through 5.8, the ELK trial and the release |

### 13.4 Files two packages touch

| File | First | Then |
|---|---|---|
| `tools/build.mjs` | 6.0 | No other stage 6 package; no stage 5 branch |
| `src/core/registry.js` | `stage5-followups` (or 5.8, which carries it): the "Stage 5's:" line; 6.1: the comment above `const TYPED = {}` | Hunks apart: no conflict; the second still runs the merge in a scratch worktree (X2) |
| `src/map/validate.js`, `src/canvas/edit.js`, `src/core/apply.js` | 6.1 | Read only by 6.2 to 6.5; no stage 5 branch touches them |
| `src/uml/stereotypes.js` | 6.2 | Read only by 6.3, 6.5 |
| `src/uml/class.js`, `src/uml/owners.js`, `src/uml/package.js`, `src/typed/draw.js` | 6.3 (the lines named) | No other package; no stage 5 branch |
| `src/layout/timeruler.js` | 6.4 | Read only by 6.5 |
| `src/typed/edit.js`, `src/typed/layout.js`, `src/layout/layered.js`, `src/layout/audit.js`, `src/canvas/render.js` | Read only | `stage5-followups` changes the last four |
| `tests/embed.py` | 5.8 and 6.0, each rewriting the one pages line | The second rehearses the merge; no other stage 6 lane touches it |
| `tests/core-diet.json` | 5.8 (re-records 04 to 06) | 6.6 (re-records 07 and 14), after 5.8 |
| `tests/profile.html`, `tests/timing.html`, `tests/stage6.html` | 6.0 (placeholders) | 6.3, 6.5, 6.6 replace them, one each |
| `examples/`, atlas files (`tools/atlas.mjs`, `tools/atlas-links.json`), `tests/cli.py`, `tests/mcp.py`, `tests/notation.html`, `check.mjs`, `lib/*.d.ts`, schema, `docs/` | 5.8 | 6.6, then 6.7 (the atlas's files and the package example) |

### 13.5 The release

0.23.0 after 6.0 to 6.7, by the repository's rule: `package.json`, `## 0.23.0:` in `docs/module-api.md`, merged when the
maintainer approves that pull request by number. Its notes say:

- new: the profile and timing diagrams; stereotypes applied anywhere checked against their profile, with their tags
  edited in the panel on every UML view; value lifelines; the 14 UML types complete; the atlas's full pass;
- changed: a generalization between two stereotypes is no longer an error of the class type's; deleting a lifeline
  deletes its timing changes and their constraints;
- left out: §15.

C10: in 6.6, as 4.10 and 5.8 do: the MCP server's read tools and the diff Action's step tested with one model of each
type. The `map-repo` skill's pin does not move: it writes neither type.

## 14. The examples and the atlas (S20)

Both examples are read by `tools/atlas.mjs`, which stops on a clash (Q10). 6.6 revises them so they agree with the files
already in the atlas; 6.7 joins them.

- **`07-profile.json` → `examples/bookshop-profile.json`.** Order applies `["entity"]`, as `sales-classes.json` has it,
  with `tags: { "entity": { "table": "orders" }, "owned": { "team": "checkout" } }` (keyed by stereotype, decision 21; the
other tags rewritten the same way); «aggregateRoot» stays defined, a specialization of «entity» with
  its own tag, and is applied in the stress fixture, not here; `owned` stays required (applied by itself to every class
  of `sales`, §5.5) and its `team` tag becomes `0..1`, so the classes of `sales` that do not set it are not warned in the
  atlas; `order.placedAt` gains `multiplicity: "0..1"` (it has none today), to match the class example's and the atlas's.
  The atlas's merged `order.placedAt` then gains `stereotypes: ["column"]` and its tags: the class view keeps member
  stereotypes undrawn, so no class picture changes, but the atlas's class view's `describe()` and PDF rows may, which
  6.7 checks against `tests/atlas.test.mjs`.

  | Option | For | Against |
  |---|---|---|
  | **(a) The profile example agrees with the class example (recommended)** | No picture of the class example changes; the atlas builds | The example applies a plain stereotype to Order, not the specialized one |
  | (b) The class example's Order applies «aggregateRoot» | The example shows the specialization in use | The class example's stills and the atlas's class view change: a picture change for the maintainer |

- **`14-timing.json` → `examples/bookshop-timing.json`.** Its lifelines take the sequence's ids, `lifeline-worker` and
  `lifeline-payments` (the overview's and the sequence's, same labels and `represents`), and gain `states`; the map's
  cards `worker` and `payments` are other elements. After the merge the sequence view's lifelines carry `states`: the
  sequence type's panel and `describe()` ignore them (6.5 asserts it), and deleting `lifeline-worker` from the sequence
  view takes its timing changes (S15; 6.7's atlas test).
- **How a reader reaches them,** since the atlas's test asks that the map reach every view:

  | Option | For | Against |
  |---|---|---|
  | **(a) The package view (`bookshop-packages.json`) shows the profile `conventions` and `sales`' application of it, drawn by §4.1's entries, and `conventions` opens the profile view; `fulfil-activity`'s `record` ("Record the payment on the order") opens the timing view (recommended)** | UML shows profile application on package diagrams (12.3.4); both elements have no link yet; the worker's "Recording payment" state is that action | The package example's picture changes (two elements and a line): its stills are for the maintainer |
  | (b) The two views are reached from the views list only; the atlas test names them as exceptions | No example's picture changes | Two views the drill-down never reaches |

## 15. Left out of the subsets

| Type | Left out |
|---|---|
| Profile | Stereotype icons and custom shapes (`proposal.md` §8.5); stereotypes shown in a comment symbol (12.3.4's third form); a profile's metamodel references and imports; ProfileApplication's `isStrict`; constraints owned by stereotypes (OCL); stereotype operations; a tag's list value; a tag whose type is a metaclass (a reference to a model element: its value passes as any text); a stereotype's associations; nested profiles; the `sysml.` types checked against metaclasses (milestone 3); tags drawn on other types' views (§5.8); XMI profiles (R6) |
| Timing | Continuous timelines (`proposal.md` §8.5); message events as constraint ends; message labels (the lettered connectors that split a long message); found and lost messages; lifeline destruction (the X at a timeline's end); a duration constraint on a single element and `firstEvent`; time observations (`t = now`); duration observations; general orderings; gates; create and delete messages; lifelines decomposed; ruler breaks; a stored scale (`proposal.md` §8's "set the scale", §6.3); an `sd` frame and its name |
| Both | Copy and paste (E7); per-type `diff()` writers; a reader (§10) |

Departures from UML 2.5.1, which 6.6's conformance notes carry in a "Departures" line:

- **A required stereotype is supplied by the tool** (§5.5): UML 2.5.1, 12.3.3 says a model without it is not well formed;
  this tool applies it to every element in scope instead of warning. It is not drawn on other views; its tags are the
  element's, and the profile view, `describe()` and the panel show it.
- **Names meet with the first letter in either case** (§5.3), UML's own lower-case convention for guillemets.
- **No `sd` frame** round a timing view, as round a sequence view (stage 3); the view's title names it.
- **Nothing is drawn before a lifeline's first change.** UML leaves the state there undefined; a line drawn from the
  ruler's start would claim one.
- **Times are numbers in one unit,** with no expressions (`t + 3`).
- **A lifeline's name is drawn across,** in its column on the left, where UML draws it upright in its compartment.
- **A change is one item** where UML has an OccurrenceSpecification and a StateInvariant (§3).

## 16. The decisions for the maintainer

Each is set out with its options and trade-offs in the section named; the recommendation is the first option there.

| # | Question | Recommended | Other options | Section |
|---|---|---|---|---|
| 1 | How much of the core's 4,451 B (after stage 5's follow-ups) stage 6 may spend | At most 300 B (target about 150 B), fallbacks named | First come; raise C5 | §2.3 |
| 2 | Where the cross-model check runs | `TYPED.across(model)` from `validate()`, on every model with a profile (about 35 B) | The profile type's `validate(model)`, only with a profile view; every type calls a shared check | §5.1 |
| 3 | Where a profile applies | By ownership: the applying package and all it owns; a member by its owner, a line by its `parent` or `from` | Everywhere in the model | §5.2 |
| 4 | Names that are not defined stereotypes | A keyword outside an applied profile; warned inside, unless UML's standard profile or keywords have it; first letter either case; `Profile::name` resolves a clash | Every name checked once a model has a profile | §5.3 |
| 5 | Which elements a stereotype fits | By a table of UML's metaclass generalizations, a row for every registered `uml.*` type, five non-metaclass types mapped | Exact metaclass names only | §5.4 |
| 6 | A required extension | Supplied by the tool, no warning (a departure from UML 12.3.3's "not well formed", stated); not drawn on other views | Warn every element lacking it; draw `{required}` only | §5.5 |
| 7 | Editing tags | `TYPED.fields`, one panel field per tag on every typed view (about 12 B) | A `map` field kind each type lists (about 80 B); on the profile view only | §5.7 |
| 8 | Where tags are drawn | The profile view; elsewhere in the panel, `describe()` and the PDF | Every type draws them in braces | §5.8 |
| 9 | The time ruler | Its own strategy, `src/layout/timeruler.js`, in `layoutTimeAxis`'s contract | A linear mode inside `layoutTimeAxis`; the layered layout | §6.1 |
| 10 | The scale (`model.md` §3) | One time base, linear, derived, 480 to 4,800 px, 1-2-5 ticks | Ordinal; a stored scale; ruler breaks | §6.3 |
| 11 | Value lifelines | In the subset, `present.<id>.as: "values"`, `S` toggles | Left out, as `proposal.md` §8.5 | §3, §6.4 |
| 12 | Constraints' place | Strips under the lanes, stacked by level | Over the plot | §6.6 |
| 13 | Deleting a lifeline or a change | The core's `refs()` and `delete` learn the timeline (about 60 B) | The type's `remove` hook only; half and half | §7.3 |
| 14 | Exact times | F2's `@` micro-syntax; pointer and Alt + arrows snap to a minor tick (a fifth of the step) | A `number` field kind (core) | §8.1 |
| 15 | Hiding a change, message or constraint (DoD 4) | Cannot be hidden; Delete deletes, said first; a hidden lifeline keeps its timeline | A `present` key for time items | §8.3 |
| 16 | P1 | Stages 4 and 5's rule, " (timed)" tests, 100 ms printed, 1 s held; `TYPED.across` printed against 10 ms on 2,000 elements and held linear (4x under 10x) | Keep port repair and rerouting on for the profile view (more time per edit) | §12 |
| 17 | The profile example against the atlas | It agrees with the class example: Order applies «entity» | The class example's Order applies «aggregateRoot» (its picture changes) | §14 |
| 18 | How the atlas reaches the two views | The package view shows the profile and opens it (the package example's picture changes); `fulfil-activity`'s "Record the payment" opens the timing view | The views list only, named as exceptions in the test | §14 |
| 19 | Order with stage 5 | 6.0 to 6.5 on approval beside 5.8 and 5.7; one shared line (6.0's in `tests/embed.py`) rehearsed once; 6.6 and 6.7 after 5.8; 0.23.0 after 0.22.0 | Start after 0.22.0 | §13.3 |
| 20 | Readers | None: Mermaid has neither diagram; a PlantUML timing reader only if asked for later | | §10 |
| 21 | The shape of `props.tags` | Keyed by stereotype, then tag (`{ "column": { "name": "placed_at" } }`): UML's per-application values, no clash between two stereotypes' `name`; costs one JSON level against `model.md` row 7 | A flat map plus a definition-time `tag-clash` error: `model.md`'s shape, but refuses profiles UML allows and clashes between two authors' profiles no user can fix | §5.6 |
| 22 | An abstract required stereotype | Met by any concrete specialization the element applies; `stereotype-required` (warning) when none: UML's reading for a required stereotype with subclasses; one more rule | A definition-time error `extension-required-abstract`: simple, but refuses a profile UML allows | §5.5 |
| 23 | A hidden timing lifeline's messages | Stated: they leave the view with it (the core's `hide` drops the view's own lines), said first with their count, as on a sequence view; no code, but showing the lifeline again does not bring them back (undo does) | The type's `remove` hook hides by `set` of `nodeIds` only, keeping the messages undrawn and `message-ends` skipping hidden lifelines: comes back whole, but a second way to hide | §8.3 |

The maintainer's question of 13 Nov 2026, whether stages 5 and 6 can run in parallel, is decision 19: yes, for everything
but stage 6's documents, examples and atlas (6.6, 6.7), which wait for 5.8 because they own the same files
(`examples/`, `docs/`, the atlas, `tests/core-diet.json`, …). The one edit both stages make while open is a single line
of `tests/embed.py` (5.8's and 6.0's), rehearsed once; every other stage 6 lane touches no file a stage 5 branch changes.

## 17. What this note changes elsewhere

- **`model.md`.** Every difference §3 makes, with 6.6. Row 7: `uml.Enumeration` and its `uml.EnumerationLiteral` members
  in a profile; `uml.Comment` and `uml.CommentLink` on the view; any element that applies a stereotype as a node;
  `uml.Package` on the view; a qualified stereotype name `Profile::name`; `isAbstract` on a stereotype; a metaclass
  reference's label from §5.4's table; `props.tags` keyed by stereotype (decision 21). Row 14: `uml.Message` inline (the
  view's own); `present.<id>.as: "values"`; changes ordered by `at`, not by list; a constraint's ends are changes, a
  time constraint `from` only; `unit` optional. §3's stage 6 row settled: one time base, linear and derived; a stage 6
  row points here.
- **`risks.md`.** C5 records stage 6's share (§2.3) and the two slots; P1 gains §12's common edits and the linear-time
  check; T and G1 point to §11; a new row for a timing view too dense for the cap (`timing-dense`, §6.3); C10 records
  stage 6's tests. With 6.6.
- **`plan.md`.** §5's stage 6 row points here (done with this note); §4.3 lists `src/layout/timeruler.js` and
  `src/uml/stereotypes.js` (6.6).
- **`proposal.md`.** §8.5's timing subset gains value lifelines if decision 11 takes them; both subsets point to §15.
- **`check.mjs`.** Its hand timing rule goes, the type's rules running there (6.6).
- **`README.md` in this folder.** The status table shows this note and, once approved, stage 6's work packages; the log
  records the decisions taken. (The lead's.)
