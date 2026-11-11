const warned = new Set(), warn = m => { if (hush) hush.push(m); else if (!warned.has(m)) { warned.add(m); console.warn('umlimator: ' + m); } }; // each warning once
let hush = null; // a layout tried and maybe dropped (unfolding, #71) keeps its warnings here: only the one kept says them
/* f(), with the warnings it gives held back: [its result, what it would have said] */
const held = f => { const prev = hush; hush = []; try { return [f(), hush]; } finally { hush = prev; } };

export { warn, held };
