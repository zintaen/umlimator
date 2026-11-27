// Small helpers shared by the tools in tools/evolve/: command-line flags, durations and a seeded random number generator.
// No dependency.

// --name value, --name=value and --flag (true); everything else is positional. A flag named in booleans never takes the
// next argument as its value, so `--json <folder>` leaves the folder positional (audit 67). Given `values` (the flags that
// take a value), the parse is strict (audit 72): a flag named in neither list, a value flag with no value or an empty one
// (`--file`, `--file=`), or a boolean given a value (`--json=yes`) throws, so a mistyped `--fille STOP` is a usage error
// and never read as no option at all
export function parseArgs(argv, booleans = [], values) {
  const flags = {}, rest = [];
  const strict = Array.isArray(values), bad = why => { throw new Error(why); };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { rest.push(a); continue; }
    const eq = a.indexOf('='), name = eq > 0 ? a.slice(2, eq) : a.slice(2);
    if (strict && !booleans.includes(name) && !values.includes(name)) bad(`unknown option ${eq > 0 ? a.slice(0, eq) : a}`);
    if (eq > 0) {
      if (strict && booleans.includes(name)) bad(`--${name} takes no value`);
      if (strict && eq === a.length - 1) bad(`--${name} needs a value`);
      flags[name] = a.slice(eq + 1); continue;
    }
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--') && !booleans.includes(name)) {
      if (strict && next === '') bad(`--${name} needs a value`);
      flags[name] = next; i++;
    } else if (strict && !booleans.includes(name)) bad(`--${name} needs a value`);
    else flags[name] = true;
  }
  return { flags, rest };
}

// '90s', '15m', '2h', '1d' or a number of milliseconds
export function duration(s, fallback) {
  if (s === undefined || s === true) return fallback;
  const m = /^(\d+(?:\.\d+)?)(ms|s|m|h|d)?$/.exec(String(s).trim());
  if (!m) throw new Error(`not a duration: ${s} (write 90s, 15m, 2h or 1d)`);
  const unit = { ms: 1, s: 1e3, m: 6e4, h: 36e5, d: 864e5 }[m[2] || 'ms'];
  return Math.round(Number(m[1]) * unit);
}

// a time given as ISO text (or now); thrown on text that is not a time
export function instant(s) {
  if (s === undefined || s === true) return new Date();
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new Error(`not a time: ${s}`);
  return d;
}

// mulberry32 seeded from a string (FNV-1a hash), so a date gives the same sequence every run
export function seeded(seed) {
  let h = 2166136261 >>> 0;
  for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  let a = h || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
