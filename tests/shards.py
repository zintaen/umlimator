"""Splits a long serial test script into named parts, so CI can run it as n jobs side by side: with
UMLIMATOR_TEST_SHARD=k/n set, only the parts given to shard k of n run, and every part is given to exactly one shard.
With the variable unset, every part runs, in order, as the script always ran.

A script declares its parts and roughly how long each takes on a CI runner (seconds; they only balance the shards), and
wraps each in `if part("name"):`, or starts a loop's body with `if not part(name): continue`. A part declared with
another part's name in place of its seconds runs in that part's shard (it reads what that one wrote), and a check that
reads what a part wrote is wrapped in `if part.of("that part"):`, which runs it in that part's shard.

The guard, on every run, sharded or not: a part the script names but did not declare, reaches twice, or declares and
never reaches fails the run, and so does a check (a call of `ok`, or a `failed |=`) outside every part, which would run
in no shard or in all of them.
"""
import ast, os, sys, time


class Parts:
    def __init__(self, script, weights):
        self.script, self.weights, self.seen, self.at = script, dict(weights), [], []
        self.k, self.n = 1, 1
        spec = os.environ.get("UMLIMATOR_TEST_SHARD", "").strip()
        if spec:
            try:
                self.k, self.n = map(int, spec.split("/"))
                assert 1 <= self.k <= self.n
            except (ValueError, AssertionError):
                sys.exit(f"UMLIMATOR_TEST_SHARD={spec!r}: expected k/n, 1 <= k <= n")
        self.owner = self.plan(self.n)
        self.unguarded()

    def root(self, name):
        seen = []
        while isinstance(self.weights.get(name), str):
            if name in seen:
                sys.exit(f"parts tied in a ring: {', '.join(seen)}")
            seen.append(name)
            name = self.weights[name]
        if name not in self.weights:
            sys.exit(f"part {seen[-1]!r} is tied to {name!r}, which is no part")
        return name

    def plan(self, n):
        """Each part's shard: the longest groups first (a part with the parts tied to it), each to the shard with the
        least so far (the same on every run)."""
        groups = {}
        for name in self.weights:
            groups.setdefault(self.root(name), []).append(name)
        cost = {r: sum(self.weights[x] for x in xs if not isinstance(self.weights[x], str)) for r, xs in groups.items()}
        load, owner, order = [0.0] * n, {}, list(groups)
        for r in sorted(order, key=lambda x: (-cost[x], order.index(x))):
            i = min(range(n), key=lambda j: (load[j], j))
            load[i] += cost[r]
            for name in groups[r]:
                owner[name] = i + 1
        shards = [{x for x in owner if owner[x] == j + 1} for j in range(n)]
        assert set().union(*shards) == set(self.weights) and sum(map(len, shards)) == len(self.weights), "a part in no shard or in two"
        return owner

    def unguarded(self):
        """The checks outside every part, by line: they would run in no shard, or in every one."""
        def is_part(test):
            t = test.operand if isinstance(test, ast.UnaryOp) and isinstance(test.op, ast.Not) else test
            f = t.func if isinstance(t, ast.Call) else None
            return (isinstance(f, ast.Name) and f.id == "part"
                    or isinstance(f, ast.Attribute) and f.attr == "of" and isinstance(f.value, ast.Name) and f.value.id == "part")

        def checks(node):
            for n in ast.walk(node):
                if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id == "ok":
                    return True
                if isinstance(n, ast.AugAssign) and isinstance(n.target, ast.Name) and n.target.id == "failed":
                    return True
            return False

        bad = []
        def walk(body):
            for s in body:
                if isinstance(s, (ast.FunctionDef, ast.ClassDef)):
                    continue
                if isinstance(s, ast.If) and is_part(s.test):
                    continue
                if isinstance(s, (ast.For, ast.While)) and s.body and isinstance(s.body[0], ast.If) and is_part(s.body[0].test):
                    continue
                if isinstance(s, ast.With):
                    walk(s.body)
                    continue
                if checks(s):
                    bad.append(s.lineno)
        walk(ast.parse(open(self.script, encoding="utf-8").read()).body)
        if bad:
            sys.exit(f"{self.script}: a check outside every part, at line {', '.join(map(str, bad))}: "
                     "put it in an `if part(...):` block (tests/shards.py)")

    def __call__(self, name):
        if name not in self.weights:
            sys.exit(f"part {name!r} is in no shard: declare it in the script's parts")
        if name in self.seen:
            sys.exit(f"part {name!r} is reached twice")
        self.seen.append(name)
        self.at.append(time.monotonic())
        return self.owner[name] == self.k

    def of(self, name):
        """Whether this shard runs the part `name` ran in: for a check that reads what that part wrote."""
        if name not in self.seen:
            sys.exit(f"part.of({name!r}) before that part was reached")
        return self.owner[name] == self.k

    def done(self):
        """Fails the run if a declared part was never reached (so never run in any shard); says which parts ran."""
        never = [x for x in self.weights if x not in self.seen]
        if never:
            sys.exit(f"parts declared but never reached: {', '.join(never)}")
        took = [b - a for a, b in zip(self.at, self.at[1:] + [time.monotonic()])]
        ran = [f"{x} ({s:.0f} s)" for x, s in zip(self.seen, took) if self.owner[x] == self.k]
        if self.n > 1 or os.environ.get("UMLIMATOR_TEST_TIMES"):  # each part's time, to keep the declared seconds near
            print(f"shard {self.k}/{self.n} ran {len(ran)} of {len(self.seen)} parts: {', '.join(ran)}")
