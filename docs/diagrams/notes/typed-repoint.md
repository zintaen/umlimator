# A re-pointed line in a typed view that lists its lines

Status: decided and built, after 0.45.0 (lane fix-known-gaps). The pick needs no new public field, so it is in the code; the maintainer may still choose another option from section 3, and the PR that brought this note names the choice.

## 1. The gap

`diff()` draws a line that a change takes out of a view back in that view, marked removed, so the reader sees what went. A re-pointed line (one whose `from` or `to` changed) is taken out of a view when the view drew it before and no longer draws it: the view stopped listing it, or one of its old ends left the view. Audit 60 made map views draw such a line back between its old ends as a copy with no id, since a copy under the model line's id with other ends is a second line to `validate()`.

Typed views were left out of that fix, and 0.45.0 listed the result as a known gap. In a typed view that lists its lines (`view.edges`), the line came back as a copy of the model line under the model line's id, between its old ends. `validate()` reads a view's copy as the model line drawn back only when its ends match the model line's, so it reported the id as used twice. A sweep of the typed examples (every listed line, each end re-pointed to another card of the same type, the line unlisted, its old end hidden, or both) found 1,158 such diff models before this change, across the use case, C4 container and dynamic, component, package, communication, deployment, class and SysML block definition views.

## 2. What constrains the answer

A typed view's own line is a typed element, and `validate()` requires every typed element to carry an id ("a typed element needs an id"). An id-less copy, as the map views draw, fails that rule.

A C4 dynamic view's step must name a model relationship: a step written in the view under an id no relationship holds fails the type's own rule ("a step names a relationship"). A copy of a step between other ends can never satisfy that rule, whatever its id.

The model `diff()` returns has to pass `validate()` (audits 53 to 55 made this a promise), and no public field may be added without the maintainer.

## 3. The options

Option A, an id-less own line, as the map views draw. Consequences: `validate()` fails on every such model with "a typed element needs an id" unless the typed rules learn to accept an id-less line marked removed. That would be a rule change every reader of typed models would have to know, and a line with no id cannot be selected, referenced or named in the drawing's `data-id`. A C4 step still fails its type's rule.

Option B, a derived id: the model line's id followed by `~old`, or `~old2`, `~old3` and so on when the model already holds that id. Consequences: the copy is an ordinary own line of the view, so `validate()` and the drawing read it as they read any other; the diff page shows it removed between the old ends, as a map view does. The new id exists only in the model `diff()` returns, never in either input, so a host that reads ids from a diff model sees one it did not write; it is marked removed, and `rules()`, `describe()` and the path tools already leave removed lines out. It fails for a C4 dynamic step, as option A does.

Option C, drawing nothing and saying so. Consequences: the summary already says "takes the line from X to Y out of the view V" when the view stopped listing it, and says it with the card when its old end left. Nothing invalid is drawn, at the cost of the picture: the reader sees the line gone with no ghost of it, unlike a map view.

## 4. The pick

Option B for every typed view that lists its lines, and option C for a view that numbers its steps (`steps: true` on its type, today the C4 dynamic view), where no copy can be valid. This keeps the picture the map views give wherever the type allows it, and passes `validate()` everywhere. It adds no field: the id is a string in the existing `id` field, and the view lists the copy as it lists any own line.

A typed view that lists no lines, and one that still lists the line while its new end is off the view, behave as 0.45.0 describes; this note does not change them.

## 5. Where it lives

`src/map/diff.js`: `oldId` finds the free id, and the ghost map gives a typed view's copy that id; `noCopy` skips the copy, and the line drawn back with a card that left, in a view that numbers its steps. The test is the "known gap of 0.45.0" case in `tests/typed-diff.test.mjs`, which re-points one listed line in every typed example view that lists its lines, unlisted and with its old end hidden, and checks that the diff model has no id used twice or missing, that the copy is drawn removed between the old ends under `<id>~old` (none in the C4 dynamic view), and that an id the model already holds is passed over.
