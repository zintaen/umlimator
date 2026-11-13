# Conformance: the UML timing diagram

Release 0.23.0 (stage 6, `docs/diagrams/notes/stage-6.md`). Support is claimed by level (decision D3): **render** and
**edit** on the subset below. No interchange: Mermaid has no UML timing diagram (its `timeline` and `gantt` are other
things), and there is no XMI and no UML diagram interchange (`docs/diagrams/proposal.md` §8.1, `notes/stage-6.md` §10).

A view of a version-2 model (`"schemaVersion": 2`) whose `diagram` is `"uml.timing"` is a timing diagram. It is drawn by
`lib/umlimator-all.js` (`umlimator/all`), which the CLI's page inlines; `lib/umlimator.js`, what a map host loads, draws
it as plain cards with a warning. The vocabulary is `docs/diagrams/model.md` §2, row 14; the example is
[`examples/bookshop-timing.json`](../../examples/bookshop-timing.json).

## The subset, and UML 2.5.1's clauses

| UML 2.5.1 | In the model | Drawn as |
|---|---|---|
| 17.11 timing diagram, Lifeline | `uml.Lifeline` the view lists in `nodeIds`, top to bottom; `props.represents`, `props.states` | a lane across the view: its name (`name : Type`, cut at 160 px) in a column on the left, a column of its state names, then the plot |
| state or condition timeline | `timeline.changes`, `[{ id, lifeline, at, state }]`, drawn by `at` | a step line, level at its state's row between changes, upright at each; nothing before the first change; the last state to the plot's end |
| general value lifeline | `present.<lifeline>.as: "values"` | a 24 px band whose edges cross over 8 px at each change, the value centred, cut to its segment (no text under 16 px) |
| time ruler | the view's `timeline.unit` | under the last lane: major ticks with labels, minor ticks a fifth of a step, the unit after the last label |
| Message | `uml.Message` inline in the view's `edges`: `sort` (call, async, reply), `replyTo`, `sentAt`, `receivedAt` | a straight line from the sender's level at `sentAt` to the receiver's at `receivedAt`, with the sequence type's ends (a call filled, async open, a reply dashed and open); its label at its middle, moved up off what was placed before it |
| 8.5 DurationConstraint | `timeline.constraints`, `type: "uml.DurationConstraint"`, `from` and `to` changes, `label` | a dimension line in a strip under the lane of its earlier change, an open arrow at each end, extension lines up to each change, its label over it; overlapping ones on levels 20 px apart |
| 8.5 TimeConstraint | `type: "uml.TimeConstraint"`, `from` a change, `label` | a 6 px tick in the strip, its label to its right |

The scale (`notes/stage-6.md` §6.3): one time base for every lane, from the earlier of 0 and the first time; linear,
derived, never stored; the narrowest that keeps consecutive changes on a lane 12 px apart and every value's text inside
its segment, with a plot of 480 to 4,800 px; ticks a 1, 2 or 5 step at least 64 px apart.

Rules (`notes/stage-6.md` §7.2): `change-lifeline`, `change-time` (a change's `at`, a message's times are numbers),
`message-ends`, `message-times` (received no earlier than sent), `reply-call` and `constraint-ends` (errors);
`change-state` (a state its lifeline does not list, drawn on an extra row), `change-instant` (two changes of one
lifeline at one instant: the one whose id sorts last is drawn), `sort` and `constraint-order` (warnings). The layout's
own problems: `timing-dense` (at the 4,800 px cap, what does not fit, named once), `timing-label` (a message label it
could not place clear). A lifeline the view does not list keeps its changes, not drawn and not warned (a hidden one).
Deleting a lifeline deletes its changes and their constraints, from every view (the core's cascade, 0.23.0).

**Departures from UML 2.5.1:** no `sd` frame round the view, as round a sequence view (the view's title names it);
nothing is drawn before a lifeline's first change (UML leaves the state there undefined); times are numbers in one unit,
with no expressions (`t + 3`); a lifeline's name is drawn across, in its column, where UML draws it upright; a change is
one item where UML has an OccurrenceSpecification and a StateInvariant after it.

## Left out

`notes/stage-6.md` §15: continuous timelines; message events as constraint ends; message labels (the lettered
connectors that split a long message); found and lost messages; lifeline destruction; a duration constraint on a single
element and `firstEvent`; time and duration observations; general orderings; gates; create and delete messages;
decomposed lifelines; ruler breaks; a stored scale; an `sd` frame; comments and comment links on the view (decision 24,
the maintainer's of 13 Nov 2026). And copy and paste, per-type `diff()` writers and a reader.

Layout limits, measured on `examples/bookshop-timing.json` and `tests/timing-stress.json`. The layout check (`check()`,
the CLI's `check`) treats a lane as a holder, so its own rows, changes and labels inside it are not overlaps, and the
browser's text checks leave lanes out altogether (no text, header or line label is checked against a lane, its own or
another's); the timing views are held to §11's own predicate in `tests/stage6-fixtures.test.mjs` instead:

- The example lays out clean: `check()` finds nothing, and the predicate holds (every step and row in its lane, every
  message's ends on its lanes' levels within 1 px, no label over a step, a row, a value or another label).
- A lifeline's name is cut at 160 px: on the example, "payments : PaymentProv…" (its whole name is in its accessible
  name and the PDF).
- `tests/timing-stress.json`'s `edge-cases` view holds the predicate; the 40-character value in a 5 ms segment takes the
  ruler to its cap and is cut (`timing-dense`, one change named). Its `dense` view, from 0 to 1,000,000 with changes 1
  apart, runs 4,800 px and names the three it cannot part. Its generated `all` view (12 lifelines, 400 changes, 100
  messages, 40 constraints) has 43 labels the ruler says it could not place (`timing-label`), and five more it does not
  count: three labels of messages sent at 0 to 20 ms over the state column's names, and two over a step; pinned as
  limits of a crowded view.
- Message label placement is quadratic in a lane's messages (§12); a grid of buckets is the upgrade if views grow.

## Writers: what each shows of a timing diagram

Measured on `examples/bookshop-timing.json` (0.23.0): `umlimator.py stills` (SVG and PNG) and `umlimator.py pdf`. The PNG
was looked at, the SVG read, the PDF's text read back (`tests/cli.py` reads its tables).

| | SVG: `handle.toSVG()`, `umlimator.py stills` | PNG: `handle.toPNG()`, `umlimator.py stills` | PDF: `umlimator.py pdf` |
|---|---|---|---|
| Lanes, state rows, step lines, value bands, the ruler and its labels | Yes | Yes | Yes, in vectors |
| A lifeline's name over 160 px; a value in a short segment | Cut with an ellipsis | Cut alike | Cut alike in the picture; whole in the tables |
| Messages with their ends, constraints in their strips | Yes; a constraint label wider than its span overflows it, centred | Yes | Yes |
| The legend (call, async, reply, duration and time constraint, states, values) | No: the legend is a piece of the page | No | Yes, under the picture |
| Text | Text, in the page's font family; not embedded unless `fontCSS` is given | Pixels | Selectable text |
| Accessible names | Each node's `aria-label` kept ("worker: Waiting for payment from 100 ms", "Time ruler, 0 to 900 ms, a tick every 200 ms"); the lines' `<title>` removed | None | None |
| Theme | The page's | The page's | `--theme`, light by default |
| Tables | None | None | "Elements": each lifeline, its changes in time order (`100 ms: Waiting for payment`), each message it sends (`charge(total) to payments at 100 ms → 140 ms`), each constraint on its changes. "Lines": every message, from → to, its label and kind |

## Accessibility

Every piece has a name: "Lifeline worker : OrderWorker, 3 states, 4 changes", "worker: Waiting for payment from 100 ms",
"Call charge(total) from worker at 100 ms to payments at 140 ms", "Duration constraint {<= 800 ms} on worker from 100 ms
to 760 ms", "Time ruler, 0 to 900 ms, a tick every 200 ms" (its ticks are not read out). Reading order: lanes top to
bottom, each lane's rows and its changes by time, then messages by `sentAt`, then constraints, then the ruler. Text
reads at 4.5:1, lines at 3:1 in both themes (`tests/timing.html`, `tests/stage6.html`). Every gesture has a key; times
are typed exactly with F2's `@` (`docs/editing.md`). `L` then typing reaches a change by its id, not its state
(decision 25, the maintainer's of 13 Nov 2026: no core bytes).

## Performance (P1)

`tests/stage6-fixtures.test.mjs` on `tests/timing-stress.json`'s `all` view (12 lifelines, 400 changes, 100 messages, 40
constraints), CPU time, best of seven after a warm-up, on an Apple laptop at a load average of 5 to 7 (14 Nov 2026): a
full layout and its SVG 4 ms; a change moved one tick 3 to 5 ms; a message renamed 3 to 5 ms; a state added 3 to 4 ms,
against the 100 ms target. CI holds 1 s and prints the figures. The time ruler alone (`tests/timeruler.test.mjs`) lays
the same size out in about 1 ms.

## Tests

`tests/timeruler.test.mjs` (the ruler alone, on a table of inputs: scale, ticks, strips, labels, slots);
`tests/timing.test.mjs` and `tests/timing.html` (the type, its rules with a passing and a failing case each, the values
form, F2's `@` forms, every gesture by pointer and key, a 30-step session, the sequence type ignoring `states`);
`tests/stage6-core.test.mjs` (the delete cascade); `tests/timing-minimal.json` and `tests/timing-stress.json` with
`tests/stage6-fixtures.test.mjs` and `tests/stage6.html` (`notes/stage-6.md` §11: every edge case, the timing predicate,
P1); `tests/cli.py` (render, check, stills, pdf and its tables, the diff Action's step); `tests/mcp.py`.
