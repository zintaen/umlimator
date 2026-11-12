/* ---------- the transition micro-syntax (work package 4.2, notes/stage-4.md §7) ----------
   UML's `trigger-list ['[' guard ']'] ['/' effect]`, shared by the state machine's transitions and internal transitions,
   the activity's and the overview's flow labels (src/uml/flow.js) and the Mermaid state reader:
   - the trigger runs to the first [ or / outside brackets and parentheses: evt(a/b), pay(amount[0]), after 30 days, a, b;
   - the guard runs from that [ to its matching ], brackets and parentheses nested in it (max(a, b[1]) > 2, x / y > 1);
   - the effect is everything after the first / outside the guard: any text.
   Each part is trimmed text, or undefined when absent or empty. Refused, as { error }: an unbalanced or crossed [, ], ( or
   ) in the trigger or the guard; a second guard, or any text between the guard and the /; a text over 4,096 characters.
   Hand-written and linear, no regular expression (risks.md R2, E3). Ships in lib/umlimator-all.js only. */

const TR_MAX = 4096, TR_OPEN = { '[': ']', '(': ')' }, TR_CLOSE = { ']': '[', ')': '(' };
const trPart = x => { const s = x == null ? '' : String(x).trim(); return s === '' ? undefined : s; };

function parseTransition(text, form = 'a transition is trigger [guard] / effect') { // form: what the error says the text should be
  const s = String(text ?? ''), fail = why => ({ error: `${form}: ${why}` });
  if (s.length > TR_MAX) return fail(`the text is over ${TR_MAX} characters`);
  const stack = []; let i = 0, guardAt = -1, guardEnd = -1, slash = -1;
  for (; i < s.length && slash < 0; i++) { const c = s[i];
    if (guardEnd >= 0) { // after the guard: spaces, then the effect's /
      if (c === '/') slash = i; else if (c === '[') return fail('it has a second guard'); else if (c.trim()) return fail(`"${c}" after the guard, where only / effect may follow`);
    } else if (TR_OPEN[c]) { if (!stack.length && c === '[' && guardAt < 0) guardAt = i; stack.push(c); }
    else if (TR_CLOSE[c]) { const o = stack.pop(); if (o !== TR_CLOSE[c]) return fail(`the ${c} at ${i + 1} ${o ? `meets an open ${o}` : 'closes nothing'}`); if (!stack.length && guardAt >= 0) guardEnd = i; }
    else if (c === '/' && !stack.length) slash = i;
  }
  if (stack.length) return fail(`the ${stack[stack.length - 1]} it opens is not closed`);
  const tEnd = guardAt >= 0 ? guardAt : slash >= 0 ? slash : s.length;
  return { trigger: trPart(s.slice(0, tEnd)), guard: guardAt >= 0 ? trPart(s.slice(guardAt + 1, guardEnd)) : undefined, effect: slash >= 0 ? trPart(s.slice(slash + 1)) : undefined };
}

// the parts as drawn: "trigger [guard] / effect", each part left out when absent. A text the parser may read otherwise
// (a host wrote "[" or "/" into a trigger) is drawn so too: printTransition says whether it reads back
const transitionText = p => [trPart(p && p.trigger), trPart(p && p.guard) && `[${trPart(p.guard)}]`, trPart(p && p.effect) && `/ ${trPart(p.effect)}`].filter(Boolean).join(' ');

// the text that reads back as the same parts (trimmed, an empty part absent), or null when none does (§7.1): the line is
// then drawn by transitionText, warned of by label-syntax, and edited part by part in the properties panel
function printTransition(p) {
  const t = transitionText(p), r = parseTransition(t);
  return !r.error && ['trigger', 'guard', 'effect'].every(k => r[k] === trPart(p && p[k])) ? t : null;
}

export { parseTransition, printTransition, transitionText };
