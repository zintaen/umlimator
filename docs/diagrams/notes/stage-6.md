# Stage 6 design note: profile and timing

Status: **proposed**, for the maintainer to approve before work package 6.0 starts. Written against `main` at 5f20041
(0.21.0's release merged, #228; stage 5's 5.0 to 5.6 merged). Stage 5's open branches were read for what they touch, not
for what they do: `stage5-followups` (the review's fixes on 5.4 to 5.6), `stage5-docs` (5.8) and `stage5-elk-trial` (5.7,
a scratch branch). Symbols are named, not line numbers.

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
| S4 | A name that is not a defined stereotype | Outside any applied profile, a keyword, as today: nothing said. Inside one, warned, unless UML's standard profile has it (`entity`, `utility`, `create`, …). `Profile::name` picks one of two profiles that share a name | §5.3 |
| S5 | Which elements a stereotype fits | Its extensions' metaclasses, its generals' too, and every metaclass that specializes them, by a table of UML 2.5.1's generalizations among the subsets' types | §5.4 |
| S6 | A required extension (`isRequired`) | Applied by itself to every element of that metaclass in the profile's scope (UML 2.5.1, 22.3.3): no warning that it is missing; its tags are the element's; `describe()`, the profile view and the panel show it | §5.5 |
| S7 | Tags (tagged values) | Text values in `props.tags`, checked against the tag's definition: defined, of its type (Boolean, Integer, Real, UnlimitedNatural, an enumeration of the profile; any text otherwise), present when its lower bound is 1 and it has no default | §5.6 |
| S8 | Editing tags on any view | A hook slot in the properties panel, `TYPED.fields(model, element)`, filled by `src/uml/stereotypes.js`: one field per tag of the stereotypes the element has, on every typed view. About 12 B in the core | §5.7 |
| S9 | Where tags are drawn | On the profile view: a compartment per applied stereotype under the element's name, a member's tags in braces after it. Other types draw their stereotypes as now and no tags | §5.8 |
| S10 | The time ruler | A new strategy, `src/layout/timeruler.js`: a pure function in the contract `layoutTimeAxis` set (sizes in, geometry and problems out, slots for the gestures), sharing its ends and constants, not its rows: the time axis is ordinal, a timing view's time is a quantity | §6.1 |
| S11 | The scale (`model.md` §3, stage 6) | One time base for every lifeline of a view; linear; derived, never stored: the narrowest unit that keeps every step 12 px apart and every value's text inside its segment, within 480 to 4,800 px of plot, a 1, 2 or 5 step of ticks at least 64 px apart | §6.3 |
| S12 | Value lifelines | In the subset (`proposal.md` §8.5 left them out): `present.<lifeline>.as: "values"` draws the lifeline as a band that crosses at each change, its value inside; `S` toggles it | §3, §6.4 |
| S13 | Messages on a timing view | A straight line from the sender's state at `sentAt` to the receiver's state at `receivedAt`, slanted when they differ; the ends of the sequence type's sorts | §6.5 |
| S14 | Time and duration constraints | Drawn in a strip under the lane of their first change: a duration as a dimension line with an arrow at each end, stacked on levels where two overlap; a time constraint as a tick with its label | §6.6 |
| S15 | Deleting a lifeline or a change | The core's `references()` and `delete` learn the timeline: a change goes with its lifeline, a constraint with its change. About 60 B in `src/core/apply.js` | §7.3 |
| S16 | Editing times | By pointer and Alt + arrows, to a fifth of a tick; exactly, by F2 with `state @ 140` on a change and `label @ 100 → 140` on a message. No number field kind | §8 |
| S17 | Hiding (DoD 4) | A change, a message or a constraint cannot be hidden: Delete deletes it, said first (stage 3's P12, stage 5's S20). Delete on a lifeline hides it; its changes stay in the timeline, not drawn | §8.3 |
| S18 | The core's budget (C5) | Stage 6 spends at most 300 B of the 4,561 B left at 5f20041 (target: about 150 B, in §2.3's four lines); the rest is in family files | §2.3 |
| S19 | P1 | Stages 4 and 5's rule: the profile view lays out with `repair: false` and `reroute: false`; CI holds 1 s and prints each common edit against the 100 ms target, best of seven in CPU time after a warm-up, in tests whose titles end " (timed)". The cross-model check is also held to linear time | §12 |
| S20 | The two examples and the atlas | `07-profile.json` agrees with the class example (Order applies «entity»); `14-timing.json` takes the sequence's lifeline ids. The package view shows the profile and its application, and opens the profile view; `fulfil-activity`'s "Record the payment" opens the timing view | §14 |
| S21 | Order with stage 5 | 6.0 to 6.5 start on approval, beside 5.8 and the ELK trial: none of them owns a file a stage 5 branch changes, but `src/core/registry.js`'s comment and `tests/embed.py`'s list, both rehearsed (X2). 6.6 and 6.7 start when 5.8 has merged. 0.23.0 after 0.22.0 | §13.3 |
| S22 | Readers | None. Mermaid has no profile or timing diagram; its `timeline` and `gantt` are other things | §10 |
| S23 | Departures from UML | Stated in §15: a required stereotype not drawn on other views; no `sd` frame round a timing view, as round a sequence view; nothing drawn before a lifeline's first change; message events not constraint ends | §15 |

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
| Q16 | The core's size | `gzip -9 < lib/umlimator.js \| wc -c`: 185,136 B at 5f20041. The cap is 189,697 B (0.16.0's 164,954 B plus 15%): 4,561 B left | S18 |
| Q17 | Stage 5's open branches | `stage5-followups`: `src/canvas/render.js`, `src/core/registry.js`, `src/layout/audit.js`, `src/layout/layered.js`, `src/typed/layout.js`, the three type files and their tests. `stage5-docs` (5.8): those, and `examples/`, the atlas and its tools, `tests/embed.py`, `tests/notation.html`, the fixtures; by its Owns also `tests/cli.py`, `tests/mcp.py`, `lib/umlimator.d.ts`, `lib/umlimator.schema.json`, `check.mjs` and `docs/`. `stage5-elk-trial`: `notes/spike-elk.md` only | S21, §13.4 |

### 2.3 The core's budget (C5, S18)

4,561 B are left at 5f20041 for stage 6 and the three milestones; stage 5's open follow-ups may spend about 20 B more
(decision 22 of its note). Stage 6's two new pieces of machinery, the stereotype check and the time ruler, are family code:
`src/uml/stereotypes.js` and `src/layout/timeruler.js`, listed in `tools/build.mjs`'s `ALL` only.

What stays out of the core:

- the metaclass table, UML's standard profile, scope, names, tags and every rule of §5 (`src/uml/stereotypes.js`);
- the time ruler, scale, ticks, lanes, steps, value bands, messages, constraints and slots (`src/layout/timeruler.js`);
- the extension's filled triangle (`src/typed/draw.js`'s `ENDS`);
- the profile and timing types: definitions, shapes, looks, rules, `describe()`, names, legends, rows, words, hooks;
- the new slots' documentation, beside the code that fills them, with one pointer line in `src/core/registry.js`.

What touches the core, each change stating its bytes in its pull request:

| Change | File | Lane | Target |
|---|---|---|---|
| `validate()` runs `TYPED.across(m)` once on a typed model, and adds its problems (S2) | `src/map/validate.js` | 6.1 | 35 B |
| The properties panel adds `TYPED.fields(model, x)`'s fields after the type's own (S8) | `src/canvas/edit.js` | 6.1 | 12 B |
| `refs()` walks a timeline's changes (`lifeline`) and constraints (`from`, `to`) as ends; `delete` takes a time item whose lifeline or change is gone (S15) | `src/core/apply.js` | 6.1 | 60 B |
| The registry's pointer line names `TYPED.across` and `TYPED.fields` | `src/core/registry.js` | 6.1 | 40 B |
| | | | **about 150 B** (measured on a scratch copy of the built file: the first three lines 99 B before the delete loop's) |

| Option | For | Against |
|---|---|---|
| **(a) Stage 6 spends at most 300 B; over that waits for the maintainer (recommended)** | 150 B of slack; leaves over 4,200 B for milestones 2 to 4 | The fallbacks below are worse |
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
  types' pictures change only for elements of the new types (§4.1), which none of their examples has.
- **The API is additive only** (C2). The two types and their helpers are internal, in `lib/umlimator-all.js`; the slots
  and the new fields (`present.<id>.as: "values"`, a qualified stereotype name) are optional and provisional.
- **Nothing after a layout edits what it returned** (stage 4 §2.4): the change nodes, the slots and the tag compartments
  are built on a copy. A test lays each view out twice from one memo and checks the markup is byte-identical.
- **No host application's name** appears in code, tests or docs (`plan.md` §8).

## 3. Vocabulary (S1)

The rows of `model.md`, refined. `uml.Comment`, `uml.CommentLink` and `props.stereotypes` are on every UML view already.

| # | `diagram` | Nodes | Members | Edges | Notes |
|---|---|---|---|---|---|
| 7 | `uml.profile` | `uml.Profile`, `uml.Stereotype`, `uml.MetaclassReference`, `uml.Enumeration`, `uml.Package`, `uml.Comment`, any element that applies a stereotype | `uml.Property` (a tag definition, on a stereotype); `uml.EnumerationLiteral` | `uml.Extension` (`props.isRequired`), `uml.ProfileApplication`, `uml.Generalization`, `uml.CommentLink` | A stereotype's and a metaclass reference's `parent` is a profile; an enumeration's may be. Stereotype props: `isAbstract`. A metaclass reference's `label` is a metaclass of §5.4's table. Stereotypes are applied anywhere as `props.stereotypes`, each a stereotype's `label` or `Profile::label`, and `props.tags`, a map from a tag's name to its value as text (§5) |
| 14 | `uml.timing` | `uml.Lifeline` | | `uml.Message` (inline) | Lifeline props: `represents`, `states` (top to bottom). `present.<lifeline>.as: "values"` draws it as a value lifeline, whose changes' `state` is any text. `timeline`: `unit` (text, optional), `changes` (`[{ id, lifeline, at, state }]`, in any order: drawn by `at`), `constraints` (`[{ id, type, from, to, label }]`; `from` and `to` name changes; a `uml.TimeConstraint` has `from` only). A message's props: `sort` (call, async, reply), `replyTo`, `sentAt`, `receivedAt` |

What changed against `model.md`:

- **A qualified stereotype name.** `"stereotypes": ["BookshopConventions::entity"]` picks the profile when two applied
  profiles define one name. Unqualified stays the usual form.
- **A profile may own an enumeration,** the type of a tag (`valueType` names it by label, M8). Its literals are members.
- **The order of a timing view's changes is not meaning** (`model.md` rule 8 says order is meaning only where the type
  says so): they are drawn by `at`, and two on one lifeline at one instant are warned (§7.2). `check.mjs`'s hand rule
  "no earlier than the one before" goes when the type's rules run there (6.6).
- **One time base, linear** (`model.md` §3's stage 6 row): every lifeline of a view on one ruler (§6.3).
- **Value lifelines** (S12):

  | Option | For | Against |
  |---|---|---|
  | **(a) In the subset: `present.<lifeline>.as: "values"`, a band crossed at each change, its value inside; `S` toggles it (recommended)** | UML 2.5.1's compact form (17.11.4), the form most timing views of data use; presentation, so per view (rule 10), as stage 5's `as: "ball"`; the ruler measures its texts anyway | Widens `proposal.md` §8.5's subset, which left value lifelines out; a second drawing and its fixtures |
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
| Profile | A package with «profile» over its name; a box holding its stereotypes, metaclasses and enumerations when they are shown (`ownersOn`, `look.boxTypes`: `uml.Profile`, `uml.Package`) | `class.js`'s tables, `owners.js` read only |
| Stereotype | A classifier, «stereotype» over its name, italic when abstract; its tag definitions as attribute rows (`name : Type [mult] = default`) | `class.js`'s `IMPLIED` |
| Metaclass reference | A classifier, «metaclass» over its name, no compartment | `class.js`'s `IMPLIED` |
| Enumeration | The class type's, «enumeration» and its literals | as now |
| Package, and any other element shown | Its class or package look; under its name a compartment for each stereotype it has, headed «name», each row `tag = value` (a default in the muted colour, a missing required value as `tag = ?`); a member that applies a stereotype is listed with it in front and its tags in braces after (`«column» -placedAt : Instant {name = placed_at, indexed = true}`). The element's other members are not shown | `profile.js` |
| `uml.Extension` | A solid line with a filled triangle at the metaclass, `{required}` by that end when required | `draw.js`'s `ENDS` (`filled-triangle`), `class.js`'s `lineLook` |
| `uml.ProfileApplication` | A dashed line with an open arrow at the profile, «apply» | `class.js`'s `lineLook` and `keyword` |
| `uml.Generalization` | The class type's | as now |

The keywords, the profile's package look and the two line looks are entries in `src/uml/class.js`'s tables (`IMPLIED`,
`lineLook`, `keyword`), so the package view can show a profile and its application with no code of its own (§14):
6.3 owns those lines. A class, package or object view draws them for elements of the new types only; none of their
examples or fixtures has one.

| Option | For | Against |
|---|---|---|
| **(a) The class type's look, its tables gaining the new keywords and the two lines (recommended)** | One look for every classifier of UML; the package view gets profiles for free (§14) | 6.3 edits lines of `class.js`, a stage 1 file no other open package touches |
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

The class rule's change is one entry in `src/uml/class.js` (6.3). Without it the atlas, which has class views and will
hold the profile, reports the profile's generalization as an error (Q2).

### 4.3 Editing

| Gesture | Command |
|---|---|
| Palette: Profile, Stereotype, Metaclass, Enumeration, Package, Comment | `add`. A stereotype, metaclass or enumeration goes into the selected profile, else the view's first; with none, `{ error }` "add a profile first". A metaclass's name is checked against §5.4's table; one not in it opens `{ pick, then }` of the closest names, then adds what was picked |
| Lines: Extension, Generalization, Profile application, Comment link | `connect`, checked against §4.2's ends: an extension from a stereotype to a metaclass, an application from a package to a profile, a generalization between stereotypes; else `{ error }` with the rule's words |
| A stereotype's rows | The class type's member micro-syntax (`member`), as a class's attributes |
| Required | `isRequired`, a `bool` field on `uml.Extension` |
| Abstract | `isAbstract`, a `bool` field on `uml.Stereotype` |
| Applying | Stereotypes (list) on each element, as every type has it; tags by §5.7's fields |
| Hide and delete | Delete hides a node; Shift + Delete deletes. A stereotype deleted does not rewrite the elements that name it: they are warned (`stereotype-unknown`), as a renamed one is (M8) |

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
3. Else, with a profile in scope, a name of UML's standard profile (UML 2.5.1, 22.4: auxiliary, buildComponent, call,
   create, derive, destroy, document, entity, executable, file, focus, framework, implement, implementationClass,
   instantiate, library, metaclass, modelLibrary, process, realization, refine, responsibility, script, send, service,
   source, specification, subsystem, systemModel, trace, type, utility): fine, as a keyword. Any other name:
   `stereotype-unknown`.
4. Else, with no profile in scope, a stereotype of a profile in the model that is not applied here:
   `stereotype-applied` ("«entity» is a stereotype of BookshopConventions, which is not applied to catalog or its owners").
5. Else a keyword, as today: nothing said.

Names compare exactly, case and all. The types' own keywords (`interface`, `actor`, `datastore`) are written by the types
from an element's type, not stored, so the check never sees them; a stored `actor` (the sequence examples' shopper) is on
an element with no package, so no scope (rule 5).

| Option | For | Against |
|---|---|---|
| **(a) Checked inside an applied profile's scope, a keyword outside it; the standard profile always known (recommended)** | Every model that validates today still does; a profile's author gets the check where the profile applies | A misspelt name outside every profile is still silent |
| (b) Every name must be a defined stereotype once the model has a profile | Strict | «actor», «service» and every free keyword in a model with one profile turn into warnings |

### 5.4 Metaclasses (S5)

A stereotype fits an element when one of its extensions, or one of its generals', names the element's metaclass or one the
metaclass specializes. An element's metaclass is its type without the notation (`uml.Class` is `Class`). The table, in
`src/uml/stereotypes.js`, is UML 2.5.1's generalizations among the subsets' types (about 40 entries), each metaclass with
the ones above it:

| Metaclass | Specializes |
|---|---|
| Class | EncapsulatedClassifier, StructuredClassifier, BehavioredClassifier, Classifier |
| Component, Node, Stereotype, Activity, StateMachine, Interaction | Class |
| Device, ExecutionEnvironment | Node |
| Interface, DataType, Actor, UseCase, Collaboration, Artifact, InformationItem | Classifier |
| Enumeration, PrimitiveType | DataType |
| DeploymentSpecification | Artifact |
| Profile, Model | Package |
| Port | Property |
| Usage, Abstraction | Dependency |
| Realization, Manifestation | Abstraction |
| InterfaceRealization, ComponentRealization | Realization |
| Deployment | Dependency |
| Association, Generalization, Dependency, Extension, ProfileApplication, PackageImport, PackageMerge, Include, Extend, InformationFlow | Relationship |
| Action, CallBehaviorAction, SendSignalAction, AcceptEventAction | ActivityNode |
| Classifier, Package, Property, Operation, Relationship, ActivityNode, Lifeline, Message, State, Comment, … | Element |

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

| Option | For | Against |
|---|---|---|
| **(a) Applied by itself to every element of the metaclass in the profile's scope (UML 2.5.1, 22.3.3: "an instance of the stereotype is automatically created"), with no warning; its tags are the element's; `describe()`, the profile view and the tags fields show it; other views draw stored stereotypes only (recommended)** | UML's meaning; no model is warned for what UML supplies | The class view of an element does not show the required stereotype (stated in §15) |
| (b) Warn each element of the metaclass in scope that does not list it (`stereotype-required`) | Each model says what it has | Every class of the atlas's `sales` would be warned for «owned» |
| (c) `{required}` drawn, not checked | Nothing to compute | The flag means nothing |

### 5.6 Tags (S7)

Tags are `props.tags`, a map from a tag's name to its value as text. The tags an element may have are those of its
stereotypes (stored, and required by §5.5) and of their generals.

| Rule | Level | Says |
|---|---|---|
| `tag-defined` | warning | a tag is defined by a stereotype the element has, or by one of its generals |
| `tag-value` | warning | a value fits its tag's type: Boolean `true` or `false`; Integer `-?\d+`; Real a number; UnlimitedNatural a whole number or `*`; an enumeration of the profile (by label) one of its literals; any text for String and every other type |
| `tag-required` | warning | a tag whose multiplicity's lower bound is 1 (as with no multiplicity) and that has no default has a value |
| `stereotype-unknown`, `stereotype-applied`, `stereotype-ambiguous`, `stereotype-extends`, `stereotype-abstract` | §5.3, §5.4 | |

Multiplicities are read with the class type's `multBounds`. A tag of multiplicity above 1 is one text value (its list form
is left out, §15).

### 5.7 Editing tags (S8)

The panel's fields are fixed per element type (Q4); the tags an element has depend on its stereotypes.

| Option | For | Against |
|---|---|---|
| **(a) A hook slot: the panel adds `TYPED.fields(model, element)` after the type's fields; `src/uml/stereotypes.js` gives one field per tag of the element's stereotypes, `{ key, path: ['tags', name], label: '«stereotype» tag' }`, kind `enum` for Boolean and enumerations, `text` otherwise (recommended)** | Tags edited on every typed view, by pointer and keyboard, with the panel's `path` and `set` as they are; about 12 B | A slot in the core |
| (b) A `map` field kind (`name = value, …` in one text field) that each type lists | One field | About 80 B in the core; twelve type files list it; the panel parses a micro-syntax |
| (c) On the profile view only, each tag row a node `<element>-><stereotype>.<tag>` renamed by F2 | No core byte (stage 5's geometry ids) | Tags of an element not on a profile view cannot be edited |

An empty value removes the tag (`set` to undefined). A tag stored but defined by no stereotype the element has stays in
the model and is warned (`tag-defined`), not shown as a field.

### 5.8 Where tags are drawn (S9)

| Option | For | Against |
|---|---|---|
| **(a) On the profile view (§4.1); elsewhere stereotypes as now, tags in the panel, `describe()` and the PDF rows of the profile view (recommended)** | No picture of another type changes; no other type file is touched | A class view does not show `{table = orders}` |
| (b) Every type draws tags in braces under the name | UML's other notation | Twelve type files and their pictures change; boxes grow |

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

### 6.3 Scale and ticks (S11)

- **One time base** for every lane of the view (UML draws one), from `t0 = min(0, every time)` to `t1`, the latest time
  plus room for the last state (half a step at least).
- **Linear,** `x(t) = X0 + (t - t0) × k`. `k` is the smallest that keeps, on every lane, consecutive changes at least
  12 px apart (a state step's hit area, E8) and every value's text plus 12 px inside its segment (text cut at 160 px), and
  makes the plot at least 480 px; it is capped where the plot would pass 4,800 px. Under the cap, what does not fit is cut
  (`fit`) and reported once, naming the changes (`timing-dense`, a layout problem).
- **Ticks:** the step is the smallest of 1, 2 or 5 × 10ⁿ units whose ticks lie at least 64 px apart and whose labels fit
  with 12 px between; minor ticks at a fifth of a step (a quarter of a 2-step). The ruler is drawn under the last lane,
  labels under the major ticks, the unit after the last label. Ticks start at the first multiple of the step at or after
  `t0`.
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
at receivedAt)`: a state's row in the states form, the band's middle in the values form. Equal times draw it upright.
Its sort draws its ends as the sequence type does (`SQ_END`: a call filled, async open, a reply dashed and open); create
and delete are not timing sorts (§15). Its label sits at the line's middle, 4 px above it, moved away 4 px at a time
until it meets no label, step or band text placed before it; one still meeting something is reported by the layout
check. A message from a lane to itself is a line within the lane.

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
| `change-instant` | warning | one lifeline has one change at an instant (the later listed is drawn) |
| `message-ends` | error | a message joins two lifelines of the view |
| `message-times` | error | a message is received no earlier than sent |
| `sort`, `reply-call` | as the sequence type's | a timing message's sort is call, async or reply; a reply names a call of the view going the other way, sent no later |
| `constraint-ends` | error | a duration constraint's `from` and `to` are changes of the view; a time constraint has a `from` and no `to` |
| `constraint-order` | warning | a duration constraint's `to` is no earlier than its `from` |

A lifeline the view does not list keeps its changes, not drawn and not warned: that is a hidden lifeline (§8.3).

### 7.3 Deleting (S15)

| Option | For | Against |
|---|---|---|
| **(a) The core learns the timeline: `refs()` reports a change's `lifeline` and a constraint's `from` and `to` as ends; `delete` takes a time item whose lifeline or change is gone, so a lifeline takes its changes and their constraints, from any view (about 60 B, recommended)** | Deleting the lifeline from a sequence view of the same model leaves no change naming nothing; `references()` lists them (the hint line counts what goes); DoD 6 for every view of a shared lifeline | Core bytes |
| (b) The timing type's `remove` hook builds the whole transaction | No core byte | Only from a timing view: Shift + Delete of `lifeline-payments` on the sequence view leaves the timing view's changes naming nothing (Q5); the test that deleting any element leaves a valid model fails |
| (c) Constraints by the type's `refs` (they have a `type`), changes by the hook | Half in the core | Two mechanisms for one section |

`hide` keeps them: a hidden lifeline's changes stay in the view's timeline and come back with it.

## 8. Editing

### 8.1 Hooks used

| Hook | Profile | Timing |
|---|---|---|
| `add` | §4.3 | Lifeline (name typed), into `nodeIds` at the end; Change (state or value typed), on the slot's lane at its `t` (keyboard: the selected change's lane, a minor tick after it; else the selected lifeline at `t0`): in the states form a state not yet listed is added to `states` in the same transaction, and the hint line says so; Time constraint (label typed) on the selected change, else `{ error }` |
| `connect` | §4.3 | Lifeline to lifeline: a message at the release slot's `t`, sent and received then, its sort from the picker (Call, Async, Reply). Change to change: a message from the first's time to the second's, or, picking Duration constraint, a duration between them in time order |
| `moveTo` | null (pins, as the class type) | A change dropped: `set at` to the drop's `t`; Alt + ← / →: one minor tick; Alt + ↑ / ↓ on a states-form change: the state above or below. A message dropped or Alt + ← / →: both times by the same amount. A lifeline, Alt + ↑ / ↓: its place in `nodeIds` |
| `rename` (F2) | as the class type | A change: `state` or `state @ t`; a message: `label`, `label @ t`, or `label @ t1 → t2` (`->` too); a constraint: its label; a lifeline: its name, or `name : Type` |
| `remove` | null | §8.3 |
| `key` | null | `S` on a lifeline: `present.<id>.as` to `values` or removed |
| `member` | the class type's, on a stereotype | null |

`S` is not one of the canvas's keys (`E`, `F`, `0`, `1`, `+`, `-`, the arrows, Enter, Escape, Delete, F2, `L`, `N`, `W`,
`V`); a type's `key` hook hears it first and returns null for anything else.

| Option, exact times (S16) | For | Against |
|---|---|---|
| **(a) Snap to a fifth of a tick by pointer and Alt + arrows; exact by F2's `@` (recommended)** | No core byte; every time typed from the keyboard; the text says what it sets | A micro-syntax to learn, shown on the hint line when F2 opens |
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
line through a node; for timing, no step or band text outside its lane, no label over a step, every message's ends on its
lanes' levels within 1 px.

| Fixture | Holds |
|---|---|
| `profile-minimal.json` | A profile with one stereotype extending Class with one tag; a package applying it; a class in it applying the stereotype with the tag set |
| `profile-stress.json`, view `edge-cases` | A generalization chain of three stereotypes with inherited tags; an abstract stereotype applied (error); a required extension, its stereotype on a class that lists nothing; a stereotype on Classifier applied to a component; one applied outside the applying package (warned); a standard-profile name in scope (fine); an unknown name in scope (warned); two applied profiles defining one name, used plain (warned) and qualified (fine); tag values of every checked type, right and wrong; an enumeration tag; a required tag missing; a tag no stereotype defines; a metaclass name not in the table; a member and a line applying stereotypes; a package nested two deep under the applying one; a 40-character stereotype name |
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
| A generated model of 2,000 elements under 3 applied profiles | `validate()` against 100 ms (CI holds 1 s and prints it); twice the model at most 2.5 times the time (linear) |

- The profile type passes `repair: false` and `reroute: false`, as stage 4 and 5's types.
- The time ruler routes nothing; its one search is the message labels' (§6.5), against those placed before it:
  quadratic in messages. The stress fixture's 100 bound it; a grid of buckets is the upgrade if a host's views grow.
- The cross-model check indexes the model once (owners, profiles, stereotypes by name, applications): linear in elements
  and the names they apply.
- Every timed test's title ends " (timed)", so CI runs it in its serial step (the maintainer's decision of 13 Nov 2026).
- Browser timings under headless virtual time prove nothing (1.11): budgets are enforced in Node.

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
| 6.0 | **List the files** (the lead). The stage's four sources as empty files, in `ALL` after stage 5's, in load order: `uml/stereotypes`, `uml/profile`, `layout/timeruler`, `uml/timing` | `tools/build.mjs`, the four empty files | This note | `lib/umlimator-all.js` changes by blank lines only; `lib/umlimator.js` not at all; no other stage 6 lane edits `ALL` |
| 6.1 | **The core's slots.** `TYPED.across` in `validate()`; `TYPED.fields` in the panel; the timeline in `refs()` and `delete` (§7.3); the pointer line. Tested with test-only fills of both slots | `src/map/validate.js`, `src/canvas/edit.js`, `src/core/apply.js`, `src/core/registry.js`, `tests/stage6-core.test.mjs` (new), `tests/typed-edit.html` (adds cases) | 6.0 | Maps unchanged (hashes, stills, `tests/edit.html`); every typed type's tests and `tests/core-diet.*` unchanged; with the slots empty `validate()` and the panel are as before; a test fill's problems are said once, its fields edit through `set` with a `path`; deleting `worker` from `14-timing.json` takes its four changes and `c-wait`, `c-finished`; deleting `w-waiting` takes `c-wait`; `references()` lists them; deleting any element of any example or target leaves a model that validates; the core's bytes before and after, within §2.3 |
| 6.2 | **Stereotypes across the model.** `src/uml/stereotypes.js`: the metaclass table, the standard profile, scope, names, required extensions, tags, the rules of §5.3 to §5.6, `TYPED.across` and `TYPED.fields` filled; `appliedOf(model, id) -> [{ stereotype, profile, required, tags: [{ name, def, value }] }]` for 6.3 and 6.5 to read | `src/uml/stereotypes.js`, `tests/stereotypes.test.mjs` (new) | 6.0; 6.1 for the slots' end-to-end cases (its rules are tested by calling them before) | Each rule has a passing and a failing model; no example, target or fixture without a `uml.Profile` gets a new problem; `07-profile.json` as revised (§14) gets none; §12's linear-time test passes |
| 6.3 | **The profile type.** §4: definition, look (`class.js`'s `IMPLIED`, `lineLook`, `keyword` entries and `generalization-kinds`' stereotype kind; `package.js`'s element and line lists gain `uml.Profile` and `uml.ProfileApplication`), the filled triangle in `ENDS`, tag compartments from `appliedOf`, rules, `describe()`, names, legend, `rows` and `word`, hooks | `src/uml/profile.js`, `src/uml/class.js` (those entries only), `src/uml/package.js` (its two lists only), `src/typed/draw.js` (`ENDS` only), `tests/profile.test.mjs` (new), `tests/profile.html` (new), `tests/embed.py` (appends its page) | 6.0, 6.2's `appliedOf` (written against §5's contract until it merges) | Definition of done 2, 4, 5, 6 and 8 on row 7's subset; every gesture by pointer and key through `apply()`; a 30-step session undone, redone and reopened to byte-identical models; `07-profile.json` lays out clean, down and right; class, package and object tests and `tests/core-diet.*` unchanged |
| 6.4 | **The time ruler.** §6: `layoutTimeRuler`, tested alone on hand-built inputs | `src/layout/timeruler.js`, `tests/timeruler.test.mjs` (new) | 6.0 | On a table of inputs: the scale and step chosen as §6.3; consecutive changes 12 px apart or `timing-dense`; values inside their segments or cut and reported; strips' levels; message labels clear of steps and of each other, or reported; slots at every minor tick; the same input twice gives the same output; the stress fixture's size laid out under 100 ms |
| 6.5 | **The timing type.** §7 and §8 for timing: input, drawing, change nodes, slots, rules, `describe()`, names, legend, `rows` and `word`, hooks (`add`, `connect`, `moveTo`, `rename`, `remove`, `key`) | `src/uml/timing.js`, `tests/timing.test.mjs` (new), `tests/timing.html` (new), `tests/embed.py` (appends its page) | 6.4; 6.1 for the delete cascade's gesture tests | As 6.3 on row 14; `14-timing.json` lays out clean; F2's `@` forms parse and print back; the sequence type's tests unchanged |
| 6.6 | **Fixtures, examples, docs, CLI.** §11's files and their tests (`tests/stage6-fixtures.test.mjs`, `tests/stage6.html`); the two examples revised (§14) and moved, with `check.mjs`'s `MOVED` (and its hand timing rule dropped); `render`, `check`, `stills` and `pdf` on each; the schema and `.d.ts`; C10's tests; every document of `plan.md` §7; `docs/conformance/uml-profile.md` and `uml-timing.md`; `model.md` and `risks.md` (§17); the lanes' release notes gathered into `docs/module-api.md` | `examples/` but the atlas's files and `bookshop-packages.json`, `tests/profile-*.json`, `tests/timing-*.json`, `tests/stage6-fixtures.test.mjs`, `tests/stage6.html`, `tests/notation.html`, `tests/cli.py`, `tests/mcp.py`, `tests/embed.py` (appends `tests/stage6.html`), `lib/umlimator.d.ts`, `lib/umlimator.schema.json`, `docs/diagrams/examples/check.mjs`, `docs/` (but the status table) | 6.2 to 6.5; 5.8 merged | Definition of done 1, 3, 7, 9, 10, 11 and 12 for both types; §12's budgets in CI; each PDF lists §9's rows; both examples in the gallery and CI |
| 6.7 | **The Bookshop atlas, full pass** (`plan.md` §7: the 14 UML types). The two examples join by drill-down (§14); `tools/atlas.mjs`'s `KEYS` gain `tags`, `states`, `sentAt`, `receivedAt` and a view's `timeline`; the package example shows the profile and its application; a test that the atlas holds a view of each of the 14 UML diagram kinds, each reached from the map, each laid out as in its own file, `describe()` and the PDF of the whole atlas succeeding | `examples/bookshop-atlas.json`, `examples/bookshop-packages.json`, `tools/atlas.mjs`, `tools/atlas-links.json`, `tests/atlas.test.mjs` | 6.6 (the moved examples); 6.3 for the package view's profile | `node tools/atlas.mjs` builds with no clash; `tests/atlas.test.mjs`'s pinned problems unchanged (the class rule's two) or each new one stated; the package example's new stills in the pull request for the maintainer |

Existing tests a package edits, and why: 6.1 adds cases to `tests/typed-edit.html` (the fields slot) and none elsewhere;
6.3 and 6.5 append their pages to `tests/embed.py`; 6.6 adds the two examples to `tests/cli.py` and `tests/mcp.py`, the
extension's ends to `tests/notation.html`, two rows to `check.mjs`'s `MOVED` and drops its hand timing rule; 6.7 edits
`tests/atlas.test.mjs` for the two views and the full pass. No other existing test changes.

### 13.3 What runs at the same time (S21)

```
approved ─▶ 6.0 ──┬─▶ 6.1 core slots ───────────────────────────────┐
                  ├─▶ 6.2 stereotypes ──────▶ 6.3 profile ───────────┤
                  └─▶ 6.4 time ruler ───────▶ 6.5 timing ────────────┼─▶ 6.6 ─▶ 6.7 ─▶ 0.23.0
   (stage 5)  5.8 merged ────────────────────────────────────────────┘           (after 0.22.0)
```

- **Stage 6 can run beside stage 5's end.** 6.0, 6.1, 6.2 and 6.4 start on approval, 6.3 and 6.5 as soon as they like
  (each writes against this note's contracts before its needs merge, and tests its drawing and gestures once they have).
  None owns a file that `stage5-followups`, 5.8 or the ELK trial changes, but two, below.
- **Two files are shared with stage 5:** `src/core/registry.js` (6.1's pointer line; the follow-ups change another line of
  its comment) and `tests/embed.py` (6.3 and 6.5 append, as 5.8 does). Whichever of two open branches merges second
  merges `main` first and rehearses it in a scratch worktree (X2).
- **6.6 and 6.7 wait for 5.8.** They own what 5.8 owns: `examples/`, the atlas and its tools, `tests/cli.py`,
  `tests/mcp.py`, `tests/notation.html`, the schema and `.d.ts`, `check.mjs`, `docs/`.
- `lib/` and `examples/bookshop.html` are rebuilt after each merge of `main`, never merged by hand (X2).
- Only 6.1 touches the core.
- 0.23.0 ships after 0.22.0.
- One reviewing agent that did not write the code checks each pull request against the definition of done.

| Option | For | Against |
|---|---|---|
| **(a) 6.0 to 6.5 on approval, beside 5.8 and 5.7; 6.6 and 6.7 after 5.8; 0.23.0 after 0.22.0 (recommended)** | Six lanes busy while stage 5's documents finish; no file but two shared, both append-like | `lib/` rebuilt on each merge of `main` in both stages' branches |
| (b) Stage 6 after 0.22.0 is released | No overlap | Lanes idle through 5.8, the ELK trial and the release |

### 13.4 Files two packages touch

| File | First | Then |
|---|---|---|
| `tools/build.mjs` | 6.0 | No other stage 6 package; no stage 5 branch |
| `src/core/registry.js` | `stage5-followups` (or 5.8, which carries it) and 6.1, one comment line each | The second rehearses the merge (X2) |
| `src/map/validate.js`, `src/canvas/edit.js`, `src/core/apply.js` | 6.1 | Read only by 6.2 to 6.5; no stage 5 branch touches them |
| `src/uml/stereotypes.js` | 6.2 | Read only by 6.3, 6.5 |
| `src/uml/class.js`, `src/uml/package.js`, `src/typed/draw.js` | 6.3 (the entries named) | No other package; no stage 5 branch |
| `src/layout/timeruler.js` | 6.4 | Read only by 6.5 |
| `src/typed/edit.js`, `src/typed/layout.js`, `src/layout/layered.js`, `src/layout/audit.js`, `src/canvas/render.js` | Read only | `stage5-followups` changes the last four |
| `tests/embed.py` | 5.8, 6.3, 6.5, 6.6: each appends its page and its header line, nothing else | The second of two open branches rehearses the merge |
| `examples/`, atlas files, `tests/cli.py`, `tests/mcp.py`, `tests/notation.html`, `check.mjs`, `lib/*.d.ts`, schema, `docs/` | 5.8 | 6.6, then 6.7 (the atlas's files and the package example) |

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
  with `tags: { "table": "orders", "team": "checkout" }`; «aggregateRoot» stays defined, a specialization of «entity» with
  its own tag, and is applied in the stress fixture, not here; `owned` stays required (applied by itself to every class
  of `sales`, §5.5) and its `team` tag becomes `0..1`, so the classes of `sales` that do not set it are not warned in the
  atlas; `order.placedAt` keeps `multiplicity: "0..1"`, as the class example has it.

  | Option | For | Against |
  |---|---|---|
  | **(a) The profile example agrees with the class example (recommended)** | No picture of the class example changes; the atlas builds | The example applies a plain stereotype to Order, not the specialized one |
  | (b) The class example's Order applies «aggregateRoot» | The example shows the specialization in use | The class example's stills and the atlas's class view change: a picture change for the maintainer |

- **`14-timing.json` → `examples/bookshop-timing.json`.** Its lifelines take the sequence's ids, `lifeline-worker` and
  `lifeline-payments` (the overview's and the sequence's, same labels and `represents`), and gain `states`; the map's
  cards `worker` and `payments` are other elements.
- **How a reader reaches them,** since the atlas's test asks that the map reach every view:

  | Option | For | Against |
  |---|---|---|
  | **(a) The package view (`bookshop-packages.json`) shows the profile `conventions` and `sales`' application of it, drawn by §4.1's entries, and `conventions` opens the profile view; `fulfil-activity`'s `record` ("Record the payment on the order") opens the timing view (recommended)** | UML shows profile application on package diagrams (12.3.4); both elements have no link yet; the worker's "Recording payment" state is that action | The package example's picture changes (two elements and a line): its stills are for the maintainer |
  | (b) The two views are reached from the views list only; the atlas test names them as exceptions | No example's picture changes | Two views the drill-down never reaches |

## 15. Left out of the subsets

| Type | Left out |
|---|---|
| Profile | Stereotype icons and custom shapes (`proposal.md` §8.5); a profile's metamodel references and imports; constraints owned by stereotypes (OCL); a tag's list value; a stereotype's associations; nested profiles; the `sysml.` types checked against metaclasses (milestone 3); tags drawn on other types' views (§5.8); XMI profiles (R6) |
| Timing | Continuous timelines (`proposal.md` §8.5); message events as constraint ends; time observations (`t = now`); duration observations; general orderings; gates; create and delete messages; lifelines decomposed; ruler breaks; a stored scale (`proposal.md` §8's "set the scale", §6.3); an `sd` frame and its name |
| Both | Copy and paste (E7); per-type `diff()` writers; a reader (§10) |

Departures from UML 2.5.1, which 6.6's conformance notes carry in a "Departures" line:

- **A required stereotype is not drawn on other views** (§5.5): it applies, its tags are the element's, and the profile
  view, `describe()` and the panel show it.
- **No `sd` frame** round a timing view, as round a sequence view (stage 3); the view's title names it.
- **Nothing is drawn before a lifeline's first change.** UML leaves the state there undefined; a line drawn from the
  ruler's start would claim one.
- **Times are numbers in one unit,** with no expressions (`t + 3`).

## 16. The decisions for the maintainer

Each is set out with its options and trade-offs in the section named; the recommendation is the first option there.

| # | Question | Recommended | Other options | Section |
|---|---|---|---|---|
| 1 | How much of the core's 4,561 B stage 6 may spend | At most 300 B (target about 150 B), fallbacks named | First come; raise C5 | §2.3 |
| 2 | Where the cross-model check runs | `TYPED.across(model)` from `validate()`, on every model with a profile (about 35 B) | The profile type's `validate(model)`, only with a profile view; every type calls a shared check | §5.1 |
| 3 | Where a profile applies | By ownership: the applying package and all it owns; a member by its owner, a line by its `parent` or `from` | Everywhere in the model | §5.2 |
| 4 | Names that are not defined stereotypes | A keyword outside an applied profile; warned inside, unless UML's standard profile has it; `Profile::name` resolves a clash | Every name checked once a model has a profile | §5.3 |
| 5 | Which elements a stereotype fits | By a table of UML's metaclass generalizations among the subsets' types | Exact metaclass names only | §5.4 |
| 6 | A required extension | Applied by itself, no warning (UML 22.3.3); not drawn on other views | Warn every element lacking it; draw `{required}` only | §5.5 |
| 7 | Editing tags | `TYPED.fields`, one panel field per tag on every typed view (about 12 B) | A `map` field kind each type lists (about 80 B); on the profile view only | §5.7 |
| 8 | Where tags are drawn | The profile view; elsewhere in the panel, `describe()` and the PDF | Every type draws them in braces | §5.8 |
| 9 | The time ruler | Its own strategy, `src/layout/timeruler.js`, in `layoutTimeAxis`'s contract | A linear mode inside `layoutTimeAxis`; the layered layout | §6.1 |
| 10 | The scale (`model.md` §3) | One time base, linear, derived, 480 to 4,800 px, 1-2-5 ticks | Ordinal; a stored scale; ruler breaks | §6.3 |
| 11 | Value lifelines | In the subset, `present.<id>.as: "values"`, `S` toggles | Left out, as `proposal.md` §8.5 | §3, §6.4 |
| 12 | Constraints' place | Strips under the lanes, stacked by level | Over the plot | §6.6 |
| 13 | Deleting a lifeline or a change | The core's `refs()` and `delete` learn the timeline (about 60 B) | The type's `remove` hook only; half and half | §7.3 |
| 14 | Exact times | F2's `@` micro-syntax; pointer and Alt + arrows snap to a fifth of a tick | A `number` field kind (core) | §8.1 |
| 15 | Hiding a change, message or constraint (DoD 4) | Cannot be hidden; Delete deletes, said first; a hidden lifeline keeps its timeline | A `present` key for time items | §8.3 |
| 16 | P1 | Stages 4 and 5's rule, " (timed)" tests; `validate()` held to linear time on 2,000 elements | Keep port repair and rerouting on for the profile view (more time per edit) | §12 |
| 17 | The profile example against the atlas | It agrees with the class example: Order applies «entity» | The class example's Order applies «aggregateRoot» (its picture changes) | §14 |
| 18 | How the atlas reaches the two views | The package view shows the profile and opens it (the package example's picture changes); `fulfil-activity`'s "Record the payment" opens the timing view | The views list only, named as exceptions in the test | §14 |
| 19 | Order with stage 5 | 6.0 to 6.5 on approval beside 5.8 and 5.7, two shared files rehearsed; 6.6 and 6.7 after 5.8; 0.23.0 after 0.22.0 | Start after 0.22.0 | §13.3 |
| 20 | Readers | None: Mermaid has neither diagram; a PlantUML timing reader only if asked for later | | §10 |

The maintainer's question of 13 Nov 2026, whether stages 5 and 6 can run in parallel, is decision 19: yes, for everything
but stage 6's documents, examples and atlas, which wait for 5.8 because they own the same files.

## 17. What this note changes elsewhere

- **`model.md`.** Rows 7 and 14 as §3 (qualified names, abstract stereotypes, enumerations in a profile, the metaclass
  table; changes by `at`, `present.<id>.as: "values"`, constraint ends, `unit` optional); §3's stage 6 row settled: one
  time base, linear and derived; a stage 6 row points here. With 6.6.
- **`risks.md`.** C5 records stage 6's share (§2.3) and the two slots; P1 gains §12's common edits and the linear-time
  check; T and G1 point to §11; a new row for a timing view too dense for the cap (`timing-dense`, §6.3); C10 records
  stage 6's tests. With 6.6.
- **`plan.md`.** §5's stage 6 row points here (done with this note); §4.3 lists `src/layout/timeruler.js` and
  `src/uml/stereotypes.js` (6.6).
- **`proposal.md`.** §8.5's timing subset gains value lifelines if decision 11 takes them; both subsets point to §15.
- **`check.mjs`.** Its hand timing rule goes, the type's rules running there (6.6).
- **`README.md` in this folder.** The status table shows this note and, once approved, stage 6's work packages; the log
  records the decisions taken. (The lead's.)
