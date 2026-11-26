/* The layout's tuning constants, in one place (docs/diagrams/notes/layout-flow.md section 9.1): the only file the weekly
   propose-measure-keep loop may change. Each value is the one the code had before it moved here, so moving them changed no
   picture; tests/tune.test.mjs pins every value and checks the code reads it from here. */

// untangle (layered.js): alternating barycentre sweeps over the columns, down then up, the order that crosses least kept
const BARY_SWEEPS = 8;
// rowsFor (layered.js): the sweeps that set each card's row from its neighbours', in order; 1 runs left to right from the
// lines coming in, -1 right to left from the lines going out
const ROW_SWEEPS = Object.freeze([1, -1, 1]);
// bestFlow and gridKey (context.js): a plain map view of FLOW_MIN to FLOW_CAP cards is placed each of these ways (flowPos's
// options; the first is the way a larger or smaller view takes) and keeps the one scoreGeo scores lowest
const FLOW_MIN = 3, FLOW_CAP = 30;
const FLOW_WAYS = Object.freeze([{}, { pull: true }, { packed: true }, { pull: true, packed: true }].map(o => Object.freeze(o)));
// fan-in (layered.js, context.js): a card that this many lines or more come into has them routed first, and layoutGraph's
// fan-in search tries at most FAN_TRIES layouts more for their crossings
const FAN_IN = 6, FAN_TRIES = 14;
// layoutGraph's searches after the pass (a side change, round the outside, fan-in) run on map views of up to CROSS_CAP
// cards; round the outside tries at most OUTSIDE_TRIES layouts
const CROSS_CAP = 30, OUTSIDE_TRIES = 4;
// scoreGeo (context.js), which chooses among candidate layouts: issues * issue + (crossings + fallbacks) * cross + labels not
// drawn * dropped + length / lengthPer + corners * corner + area / areaPer
const SCORE_WEIGHTS = Object.freeze({ issue: 1000, cross: 150, dropped: 40, lengthPer: 15, corner: 12, areaPer: 4e5 });
// placeLabel (layered.js): the order fits() passes are tried in (0 strict to 5 relaxed); late: a label the first tries left
// out, placed after the others (and lateOn's test of where it would go)
const LABEL_PASSES = Object.freeze({ map: Object.freeze([0, 1, 2]), typed: Object.freeze([0]), mapLate: Object.freeze([4, 3]), late: Object.freeze([0, 4, 3, 5, 1, 2]) });
// the branch side balance of section 6.2 (context.js sidesOf: a column with this many more cards on one side of the main row
// sends the next branch to the other); and a placeholder read by no code yet, the stability guard of section 8.2 (a stable
// layout is kept unless its score is worse than a fresh one's by more than this many label units)
const BRANCH_BALANCE = 2, STABLE_SLACK = 1;

export { BARY_SWEEPS, ROW_SWEEPS, FLOW_MIN, FLOW_CAP, FLOW_WAYS, FAN_IN, FAN_TRIES, CROSS_CAP, OUTSIDE_TRIES, SCORE_WEIGHTS, LABEL_PASSES, BRANCH_BALANCE, STABLE_SLACK };
