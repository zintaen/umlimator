"""umlimator.py import (#90): diagrams a team already has, as a map model. Standard library only.

  structurizr   Structurizr DSL: workspace, model, views; person, softwareSystem, container and component, nested;
                -> relationships with description and technology; tags; groups as boxes, nested; systemLandscape,
                systemContext, container and component views with include * (or ids) and exclude; element styles' shapes
  plantuml      C4-PlantUML: Person, System, Container, Component (with Db, Queue and _Ext), Rel, Rel_*, BiRel, and
                *_Boundary(alias, label) { ... } as boxes
  mermaid       flowchart and graph (nodes, labelled links, subgraphs as boxes), and C4Context, C4Container and
                C4Component, whose macros are C4-PlantUML's (a classDiagram, a sequenceDiagram or a stateDiagram is the
                module's to read: umlimator.py import runs src/readers/mermaid-class.js, mermaid-sequence.js or
                mermaid-state.js in Node)
  compose       `docker compose config --format json`: services, depends_on and links, networks as boxes
  kubernetes    `kubectl get ... -o json` (a List or one object): Deployments, StatefulSets, DaemonSets, Services (to the
                workloads their selector picks), Ingresses (to their Services), and env values that name a Service

read(fmt, text, name) returns (model, unread): unread lists what was not imported, each as (where, message), where
being a line number, or an item's path in a JSON source.
"""
import itertools, json, re
from pathlib import Path

FORMATS = ["structurizr", "plantuml", "mermaid", "compose", "kubernetes"]
EXT = {".dsl": "structurizr", ".puml": "plantuml", ".plantuml": "plantuml", ".pu": "plantuml", ".iuml": "plantuml",
       ".mmd": "mermaid", ".mermaid": "mermaid"}
MERMAID = re.compile(r"(flowchart|graph|C4Context|C4Container|C4Component|classDiagram|sequenceDiagram|stateDiagram)\b")
TYPED = ("classDiagram", "sequenceDiagram", "stateDiagram")  # the diagrams the module's readers read, in Node (src/readers/)

# ponytail: a keyword guess over names, technologies, tags and images, the first match winning; a source's own type
# (a cylinder, ContainerDb, _Ext, a StatefulSet) comes first. Add words when a common stack lands on the wrong colour.
GUESS = [("database", r"database|\bdb\b|sql|postgres|mysql|maria|mongo|redis|valkey|memcache|cassandra|dynamo|couch|elastic"
                      r"|opensearch|clickhouse|influx|neo4j|etcd|\bcache\b|\bs3\b|minio|bucket|storage|\bstore\b|warehouse"),
         ("queue", r"queue|kafka|rabbit|amqp|\bsqs\b|\bsns\b|pub/?sub|\bnats\b|activemq|event ?bus|\bbus\b|stream|topic|broker"),
         ("security", r"\bauth(?!or)|oauth|oidc|keycloak|identity|\biam\b|vault|\bsso\b|ldap|sign.?in|log.?in|password|security"),
         ("ai", r"\bai\b|\bllm|openai|anthropic|ollama|vllm|inference|embedding|\bml\b|machine learning"),
         ("cloud", r"nginx|traefik|haproxy|envoy|caddy|proxy|gateway|load.?balancer|\bcdn\b|ingress|prometheus|grafana|jaeger"
                   r"|zipkin|\bloki\b|otel|opentelemetry|monitor"),
         ("backend", r"\bapi\b|service|server|worker|backend|function|lambda"),
         ("frontend", r"web.?app|frontend|front.?end|browser|\bui\b|\bspa\b|single.?page|mobile|android|\bios\b|react|angular"
                      r"|\bvue\b|svelte|next\.?js|flutter|\bapps?\b|\bclient\b|storefront|\bweb\b"
                      r"|\b(users?|customers?|shoppers?|visitors?|people|person)\b"),
         ("file", r"\bfiles?\b|document|\bcsv\b|spreadsheet|\bftp\b")]


def guess(words, default="backend"):
    t = " ".join(w for w in words if w).lower()
    return next((k for k, rx in GUESS if re.search(rx, t)), default)


# a C4 source's app that runs on a phone: a mobile card, which a map draws as a phone (0.15.0)
MOBILE = r"\bmobile\b|android|\bios\b|iphone|ipad|xamarin|flutter|react.?native|swiftui"


# the kinds a map draws as one of C4's tools (NOTED in lib/umlimator.js): a browser, a phone, a cylinder, a pipe, a page.
# Structurizr and C4-PlantUML draw only a container in a tool's shape by its words, so a software system or component that
# guesses one keeps its kind (its colour) and is drawn a box (0.15.0). A cloud card a map draws as a node, which C4 never
# draws: a C4 source's gateway, proxy or monitor keeps its colour and is drawn a box, a container's too (0.21.0)
TOOL_KINDS = ("frontend", "mobile", "database", "queue", "file")


def c4guess(words):
    k = guess(words)
    return "mobile" if k == "frontend" and re.search(MOBILE, " ".join(w for w in words if w).lower()) else k


def clip(s, n):
    s = re.sub(r"\s+", " ", re.sub(r"<br\s*/?>|\\n", " ", str(s or ""))).strip()
    return s if len(s) <= n else s[:n - 1].rsplit(" ", 1)[0].rstrip(",;:") + "…"


def ident(s):
    """An alias as an id: as it is when it is plain, else a slug."""
    s = str(s).strip()
    return s if re.fullmatch(r"[\w.-]+", s) else re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-") or "x"


class Model:
    def __init__(self, title):
        self.title, self.nodes, self.edges, self.views, self.unread, self.ids = title, {}, [], [], [], set()

    def say(self, where, msg):
        self.unread.append((where, msg))

    def uniq(self, *hints):
        """The first hint no card, line or view has yet, else the first one numbered."""
        got = next(h for h in itertools.chain(hints, (f"{hints[0]}-{n}" for n in itertools.count(2))) if h not in self.ids)
        self.ids.add(got)
        return got

    def card(self, cid, label, kind, sub=None, what=None, **more):
        if clip(label, 34) != clip(label, 600):  # a name cut short is whole in the details panel
            what = clip(label, 600) + (f"\n\n{what}" if what else "")
        n = {"id": cid, "label": clip(label, 34) or cid, "kind": kind, "sublabel": clip(sub, 44), "what": clip(what, 600), **more}
        self.nodes[cid] = {k: v for k, v in n.items() if v}

    def line(self, a, b, label=None, sub=None, where=None, **more):
        if a == b:
            return self.say(where, f"{a} -> {b}: a line from a card to itself is not drawn")
        e = {"id": self.uniq(f"{a}-{b}"), "from": a, "to": b, "label": clip(label, 28), "sublabel": clip(sub, 28), **more}
        if clip(label, 28) != clip(label, 600):  # a label cut short is whole in the details panel
            e["what"] = clip(label, 600) + (f"\n\n{e['what']}" if e.get("what") else "")
        self.edges.append({k: v for k, v in e.items() if v})
        return e["id"]

    def view(self, hint, nodes, boxes=(), **more):
        full = lambda b: b["nodeIds"] or any(full(c) for c in boxes if c.get("parent") == b["id"])
        for b in boxes:
            if not full(b):
                self.say(b.pop("line", None), f"box {b['id']}: holds no card, so it is not drawn")
        kept = [{k: v for k, v in b.items() if (v or k == "nodeIds") and k != "line"} for b in boxes if full(b)]
        v = {"id": self.uniq(*(hint if isinstance(hint, tuple) else (hint,))), "title": clip(self.title, 60), "nodeIds": list(nodes), "containers": kept, **more}
        self.views.append({k: x for k, x in v.items() if x or k in ("nodeIds", "edges")})  # edges: [] draws no line
        return {b["id"] for b in kept}

    def model(self):
        root = next((v["id"] for v in self.views if not v.get("parent")), None)
        return {"title": self.title, **({"root": root} if root else {}),
                "nodes": list(self.nodes.values()), "edges": self.edges, "views": self.views}


def detect(path, text):
    """The format, from the content, else from the file's extension; None if neither says."""
    if text.lstrip()[:1] in "{[":
        try:
            d = json.loads(text)
        except ValueError:
            d = None
        if isinstance(d, dict) and isinstance(d.get("services"), dict):
            return "compose"
        if isinstance(d, list) or isinstance(d, dict) and ("items" in d or "apiVersion" in d):
            return "kubernetes"
    if re.search(r"^\s*@startuml", text, re.M):
        return "plantuml"
    body = re.sub(r"/\*.*?\*/", "", front(text)[1], flags=re.S)
    first = next((s for s in (l.strip() for l in body.splitlines()) if s and not s.startswith(("%%", "//", "#", "'"))), "")
    if MERMAID.match(first):
        return "mermaid"
    if re.match(r"workspace\b", first, re.I):
        return "structurizr"
    return EXT.get(Path(path).suffix.lower())


def mermaid_typed(text):
    """The Mermaid diagram the module's readers read (src/readers/, through Node), classDiagram, sequenceDiagram or
    stateDiagram (stateDiagram-v2 too), or None: this file reads Mermaid's flowcharts and C4 diagrams only."""
    directive = False  # a %%{ ... }%% directive may run over several lines
    for s in (l.strip() for l in front(text)[1].splitlines()):
        if directive:
            directive = "}%%" not in s
        elif s.startswith("%%"):
            directive = s[2:].strip().startswith("{") and "}%%" not in s
        elif s:
            return next((t for t in TYPED if re.match(t + r"\b", s)), None)
    return None


def front(text):
    """Mermaid's front matter (--- title: ... ---): its title, and the text with the block as blank lines."""
    m = re.match(r"\s*---\n(.*?)\n---\n", text, re.S)
    if not m:
        return None, text
    title = re.search(r"^title:\s*(.+)$", m.group(1), re.M)
    return title and title.group(1).strip().strip("\"'"), "\n" * m.group(0).count("\n") + text[m.end():]


def read(fmt, text, name):
    if fmt in ("compose", "kubernetes"):
        m = (compose if fmt == "compose" else kubernetes)(json.loads(text), name)
    else:
        m = {"structurizr": structurizr, "plantuml": plantuml, "mermaid": mermaid}[fmt](text, name)
    return m.model(), sorted(m.unread, key=lambda u: [int(t) if t.isdigit() else t for t in re.split(r"(\d+)", str(u[0]))])


# ---------- Structurizr DSL ----------

TOKEN = re.compile(r'"((?:[^"\\]|\\.)*)"|(\S+)')
C4TYPE = {"person": "Person", "softwaresystem": "Software system", "container": "Container", "component": "Component"}
LEVELS = ["systemlandscape", "systemcontext", "container", "component"]
SCOPE = {"systemcontext": "softwaresystem", "container": "softwaresystem", "component": "container"}
TAG = {"person": "Person", "softwaresystem": "Software System", "container": "Container", "component": "Component"}  # built in
# a Structurizr style's shape as one of the map's (0.15.0); Circle, Ellipse, Diamond, Bucket and Component have none
# !impliedRelationships: Structurizr's strategy names, as umlimator draws them (None: no implied lines)
IMPLIED = {"false": None, "none": None, "defaultimpliedrelationshipsstrategy": None,
           "true": "any", "createimpliedrelationshipsunlessanyrelationshipexistsstrategy": "any",
           "createimpliedrelationshipsunlesssamerelationshipexistsstrategy": "same"}
SZ_SHAPE = {"box": "box", "roundedbox": "box", "person": "person", "robot": "robot", "cylinder": "cylinder", "pipe": "pipe",
            "folder": "folder", "webbrowser": "browser", "window": "window", "terminal": "terminal", "shell": "terminal",
            "mobiledeviceportrait": "mobile", "mobiledevicelandscape": "mobile", "hexagon": "hexagon"}


def structurizr(text, name):
    m = Model(name)
    els, ref, path, rels, specs, stack, groups, styles = {}, {}, {}, [], [], [], [], []
    implied, comment, opened = "any", 0, []  # comment: the line a /* ... */ opened on; opened: each open block's line and text
    for no, raw in enumerate(text.splitlines(), 1):
        s = raw.strip()
        if comment or s.startswith("/*"):
            comment = (comment or no) if "*/" not in s else 0
            continue
        if not s or s.startswith(("//", "#")):
            continue
        if s == "}":
            if stack:
                stack.pop()
                opened.pop()
            else:
                m.say(no, "a } that closes nothing")
            continue
        found = TOKEN.findall(s)
        opens = found[-1][1] == "{"
        toks = [b or q.replace('\\"', '"') for q, b in (found[:-1] if opens else found)]
        where, at = stack[-1] if stack else ("top", None)
        kw, push = toks[0].lower() if toks else "", None
        if where == "skip":
            pass
        elif where == "top" and kw == "workspace":
            if toks[1:2] == ["extends"]:
                m.say(no, f"workspace extends {' '.join(toks[2:3])}: the workspace it extends is not read")
            elif len(toks) > 1:
                m.title = toks[1]
            push = ("workspace", None)
        elif where == "workspace" and kw in ("model", "views"):
            push = (kw, None)
        elif where == "workspace" and kw in ("name", "description"):
            m.title = toks[1] if kw == "name" and len(toks) > 1 else m.title
        elif where in ("workspace", "model") and kw == "!identifiers":
            pass  # flat and hierarchical identifiers both resolve
        elif where in ("workspace", "model") and kw == "!impliedrelationships":
            # Structurizr's names (ImpliedRelationshipsParser): false is its default strategy, which creates none; true is
            # "unless any relationship exists", and "unless the same relationship exists" (same description) has its own;
            # another class is said, and drawn as the DSL's default ("unless any")
            how = toks[1].rsplit(".", 1)[-1].lower() if len(toks) > 1 else "true"
            implied = IMPLIED.get(how, "any")
            if how not in IMPLIED:
                m.say(no, f"!impliedRelationships {toks[1]}: a strategy umlimator does not know, so implied lines are drawn as Structurizr's default draws them")
        elif where in ("model", "group", "el"):
            parent, grp = (None, None) if where == "model" else (at, None) if where == "el" else at  # a group's frame: (element, group)
            e, r = element(toks), relationship(toks, at if where == "el" else None)
            if e:
                alias, typ, nm, desc, tech, tags = e
                full = f"{path[parent]}.{alias}" if alias and parent in path else alias
                cid = m.uniq(*[h for h in (alias and ident(alias), full and ident(full.replace(".", "-")), ident(nm)) if h])
                els[cid] = {"type": typ, "name": nm, "desc": desc, "tech": tech, "tags": tags, "parent": parent, "group": grp}
                if alias:
                    path[cid] = full
                    ref.setdefault(alias, cid)
                    ref[full] = cid
                push = ("el", cid)
            elif r:
                rels.append({**r, "line": no})
                push = ("rel", rels[-1])
            elif kw in ("group", "enterprise"):  # a box around its members, in the group around it, in the element it is in
                groups.append({"label": (toks[1:2] or [kw])[0], "parent": grp, "owner": parent})
                push = ("group", (parent, len(groups) - 1))
            elif where == "el" and kw in ("description", "technology", "tags") and len(toks) > 1:
                prop(els[at], kw, toks[1:])
            else:
                m.say(no, f"not imported: {clip(s, 80)}")
        elif where == "rel" and kw in ("description", "technology", "tags") and len(toks) > 1:
            prop(at, kw, toks[1:])
        elif where == "views" and kw in LEVELS:
            rest = toks[1:] if kw == "systemlandscape" else toks[2:]
            specs.append({"type": kw, "scope": None if kw == "systemlandscape" else (toks[1:2] or [""])[0],
                          "key": rest[0] if rest else None, "desc": rest[1] if len(rest) > 1 else None, "include": [], "exclude": [], "line": no})
            push = ("view", specs[-1])
        elif where == "view" and kw in ("include", "exclude"):
            at[kw] += [(t, no) for t in toks[1:]]
        elif where == "view" and kw in ("title", "description") and len(toks) > 1:
            at["title" if kw == "title" else "desc"] = toks[1]
        elif where == "view" and kw in ("autolayout", "default"):
            pass  # the map lays every view out itself
        elif where == "views" and kw == "styles":
            push = ("styles", None)
        elif where == "styles" and kw == "element" and len(toks) > 1:
            push = ("style", toks[1].strip())
        elif where == "style" and kw == "shape" and len(toks) > 1:
            styles.append((at, toks[1]))
            if toks[1].lower() not in SZ_SHAPE:
                m.say(no, f'element "{at}": shape {toks[1]} has no counterpart, so a card it falls on is drawn as it would be without it')
        else:
            m.say(no, f"not imported: {clip(s, 80)}")
        if opens:
            stack.append(push or ("skip", None))
            opened.append((no, s))
    left_open(m, opened, comment and ("/*", comment, len(text.splitlines())))
    for cid, e in els.items():
        tags = " ".join(e["tags"]).lower()
        kind = ("user" if "external" in tags else "person") if e["type"] == "person" else "external" if "external" in tags else c4guess([tags, e["tech"], e["name"]])
        # Structurizr's precedence (Styles.findElementStyle): the element's tags in order, Element and its type's tag first;
        # for each tag its styles in the order written; a later shape wins
        shape = None
        for t in dict.fromkeys(["Element", TAG[e["type"]], *e["tags"]]):
            shape = next((sh for tag, sh in reversed(styles) if tag == t), shape)
        shape = shape and SZ_SHAPE.get(shape.lower())
        if not shape and (e["type"] in ("softwaresystem", "component") and kind in TOOL_KINDS or kind == "cloud"):
            shape = "box"  # the colour its words give, but a box, as Structurizr draws it: only a container takes a tool's shape
        m.card(cid, e["name"], kind, e["tech"] or C4TYPE[e["type"]], e["desc"], icon="user" if e["type"] == "person" else None, shape=shape)
    for g in groups:  # after the cards, so a group's name never takes an element's alias
        g["id"] = m.uniq(ident(g["label"]), f"group-{ident(g['label'])}")
    find = lambda t: ref.get(t) or (t if t in els else None)
    lines = []
    for r in rels:
        a, b = find(r["src"]), find(r["dst"])
        if not (a and b):
            m.say(r["line"], f"{r['src']} -> {r['dst']}: {r['src'] if not a else r['dst']} is not an element")
        elif eid := m.line(a, b, r["desc"], r["tech"], where=r["line"], loop=els[b]["type"] == "person"):
            lines.append((a, b, eid, r))
    if not specs:  # no views to follow: the landscape, then a view per system with containers and per container with components
        specs = [{"type": "systemlandscape", "scope": None, "include": [], "exclude": [], "line": None}] + [
            {"type": "container" if e["type"] == "softwaresystem" else "component", "scope": c, "include": [], "exclude": [], "line": None}
            for c, e in els.items() if any(x["parent"] == c for x in els.values())]
    views(m, els, lines, specs, find, implied, groups)
    return m


def left_open(m, opened, comment=None):
    """What a file leaves open at its end, each said with its line: a block never closed (a file cut short ends inside
    one), and a comment never closed, (mark, its line, the last line), which hid every line after it."""
    if comment:
        mark, no, last = comment
        m.say(no, f"{mark} is never closed, so lines {no + 1} to {last} are not read")
    for no, s in opened:
        m.say(no, f"never closed: {clip(s, 60)} (is the file cut short?)")


def element(toks):
    alias = None
    if len(toks) > 2 and toks[1] == "=":
        alias, toks = toks[0], toks[2:]
    if not toks or toks[0].lower() not in C4TYPE or toks[1:2] == ["->"]:
        return None
    typ, a = toks[0].lower(), toks[1:] + [""] * 4
    tech, tags = (a[2], a[3]) if typ in ("container", "component") else ("", a[2])
    return alias, typ, a[0], a[1], tech, [t.strip() for t in tags.split(",") if t.strip()]


def relationship(toks, this):
    if len(toks) > 3 and toks[1] == "=":
        toks = toks[2:]
    if toks[:1] == ["->"] and this and len(toks) > 1:
        src, dst, a = this, toks[1], toks[2:]
    elif len(toks) > 2 and toks[1] == "->":
        src, dst, a = (this if toks[0] == "this" else toks[0]), toks[2], toks[3:]
    else:
        return None
    return {"src": src, "dst": dst, "desc": (a + [""])[0], "tech": (a + ["", ""])[1]}


def prop(x, kw, args):
    if kw == "tags":
        x["tags"] = x.get("tags", []) + [t.strip() for a in args for t in a.split(",") if t.strip()]
    else:
        x["desc" if kw == "description" else "tech"] = args[0]


def views(m, els, lines, specs, find, implied, groups):
    """Each view's cards, box and lines, as Structurizr draws them. A view shows elements of its level: people and
    software systems; in a container view also its system's containers (in a box); in a component view also its
    container's components (in a box) and that system's other containers. A relationship between elements a view
    doesn't show lifts to the nearest ones it does (an implied line), unless a relationship joins those two already."""
    up = lambda c: [c, *up(els[c]["parent"])] if c else []
    # implied: "any" draws one implied line per pair unless a relationship joins them; "same" one per description, unless a
    # relationship with that description joins them (Structurizr's two strategies)
    key = lambda x, y, r: (x, y) if implied == "any" else (x, y, r["desc"])
    direct, made, placed = {key(a, b, r) for a, b, _, r in lines}, {}, []
    for s in specs:
        typ, scope = s["type"], find(s["scope"]) if s["scope"] else None
        if typ != "systemlandscape" and not (scope and els[scope]["type"] == SCOPE[typ]):
            m.say(s["line"], f"{typ} view of {s['scope'] or '?'}: that is not a {C4TYPE[SCOPE[typ]].lower()}, so the view is left out")
            continue
        level = LEVELS.index(typ)
        system = els[scope]["parent"] if typ == "component" else scope
        top = lambda c: els[c]["type"] in ("person", "softwaresystem")
        allowed = {c for c in els if top(c)} if level < 2 else \
                  {c for c, e in els.items() if top(c) and c != system or e["parent"] in (system, scope) and c != scope}
        lift = lambda c: next((x for x in up(c) if x in allowed), None)
        inner = allowed if level == 0 else {scope} if level == 1 else {c for c in allowed if els[c]["parent"] == scope}
        shown = set(inner)
        if not s["include"] or any(t == "*" for t, _ in s["include"]):
            for a, b, _, _ in lines:
                shown |= {y for x, y in ((lift(a), lift(b)), (lift(b), lift(a))) if x in inner and y}
        for t, no in s["include"]:
            if find(t) and lift(find(t)) == find(t):
                shown.add(find(t))
            elif t != "*":
                m.say(no, f"include {t}: {'not shown at this level' if find(t) else 'not an element (expressions are not read)'}")
        for t, no in s["exclude"]:
            if find(t):
                shown.discard(find(t))
            else:
                m.say(no, f"exclude {t}: not an element (expressions are not read)")
        ids, drawn, seen = [c for c in els if c in shown], [], set()
        for a, b, eid, r in lines:
            x, y = lift(a), lift(b)
            if x not in shown or y not in shown or x == y:
                continue
            if (x, y) == (a, b):
                drawn.append(eid)
            elif implied and (k := key(x, y, r)) not in direct and k not in seen:
                made[k] = made.get(k) or m.line(x, y, r["desc"], r["tech"], loop=els[y]["type"] == "person")
                drawn.append(made[k])
                seen.add(k)
        if not ids:
            m.say(s["line"], f"{typ} view {s.get('key') or ''}: shows nothing, so it is left out")
            continue
        word = ["landscape", "context", "containers", "components"][level]
        hint = (ident(s["key"]), f"{ident(s['key'])}-{word}") if s.get("key") else f"{scope}-{word}" if scope else word
        title = s.get("title") or (els[scope]["name"] + ["", "", " containers", " components"][level] if scope else m.title)
        box = [{"id": scope, "label": clip(els[scope]["name"], 40), "nodeIds": [c for c in ids if els[c]["parent"] == scope and els[c]["group"] is None]}] if level > 1 else []
        made_box = {}

        def group_box(g):  # a group's box: in the group around it, else in the scope's box when the group is in the scope
            if g not in made_box:
                G = groups[g]
                made_box[g] = {"id": G["id"], "label": clip(G["label"], 40), "nodeIds": [],
                               "parent": group_box(G["parent"])["id"] if G["parent"] is not None else scope if level > 1 and G["owner"] == scope else None}
                box.append(made_box[g])
            return made_box[g]
        if level > 1 and els[scope]["group"] is not None:  # the scope's box, in its own group's box
            box[0]["parent"] = group_box(els[scope]["group"])["id"]
        for c in ids:
            if els[c]["group"] is not None:
                group_box(els[c]["group"])["nodeIds"].append(c)
        m.view(hint, ids, box, title=clip(title, 60), caption=clip(s.get("desc"), 200), edges=drawn)
        if level > 1:
            m.nodes[scope].setdefault("opensView", m.views[-1]["id"])
        placed.append((m.views[-1], level, scope))
    for v, level, scope in placed:  # its parent: the most detailed view above it that shows its scope as a card
        above = [(lv, w) for w, lv, _ in placed if lv < level and scope in w["nodeIds"]]
        v["parent"] = max(above, key=lambda x: x[0])[1]["id"] if above else None


# ---------- C4-PlantUML, and Mermaid's C4 diagrams (the same macros) ----------

CALL = re.compile(r"([A-Za-z_]\w*)\s*\((.*)\)\s*(\{)?$")
ARG = re.compile(r'\s*(?:\$(\w+)\s*=\s*)?("(?:[^"\\]|\\.)*"|[^,]*?)\s*(,|$)')
ELEMENT = re.compile(r"(Person|System|Container|Component)(Db|Queue)?(_Ext)?")
ARGS = {"Person": "alias label descr", "System": "alias label descr", "Container": "alias label techn descr", "Component": "alias label techn descr"}
REL = re.compile(r"(Bi)?Rel(_Back)?(_(U|Up|D|Down|L|Left|R|Right|Neighbor))?")
BOUNDARY = re.compile(r"(Enterprise_|System_|Container_)?Boundary")
QUIET = re.compile(r"Lay_\w+|LAYOUT_\w+|SHOW_\w+|HIDE_\w+|Update\w+|Add\w*Tag|AddProperty|SetPropertyHeader|WithoutPropertyHeader|SetSketchStyle")
TYPE = {"Person": "Person", "System": "Software system", "Container": "Container", "Component": "Component"}


def call_args(s):
    pos, named, i = [], {}, 0
    while True:
        a = ARG.match(s, i)
        key, val, sep = a.groups()
        val = val[1:-1].replace('\\"', '"') if val[:1] == '"' and val[-1:] == '"' and len(val) > 1 else val
        if key:
            named[key.lower()] = val
        else:
            pos.append(val)
        if not sep:
            return pos, named
        i = a.end()


def c4(lines, m):
    """Macro calls, one per line: elements, boundaries ({ ... } boxes), relationships. One view."""
    boxes, stack, rels, bases, people, opened = [], [], [], set(), set(), []
    for no, s in lines:
        if s == "}":
            if stack:
                stack.pop()
                opened.pop()
            else:
                m.say(no, "a } that closes nothing")
            continue
        if s.lower().startswith("title "):
            m.title = s[6:].strip().strip('"')
            continue
        c = CALL.match(s)
        name, (pos, named), opens = (c.group(1), call_args(c.group(2)), c.group(3)) if c else (None, ([], {}), s.endswith("{"))
        box, alias = next((b for b in reversed(stack) if b), None), None
        if c and (e := ELEMENT.fullmatch(name)):
            base, shape, ext = e.groups()
            a = {**dict(zip(ARGS[base].split(), pos)), **named}
            if not a.get("alias") or a["alias"] in m.ids:
                m.say(no, f"{name}({a.get('alias', '')}): {'its alias is used already' if a.get('alias') else 'no alias'}")
            else:
                cid, kind = m.uniq(a["alias"]), "database" if shape == "Db" else "queue" if shape == "Queue" else ("user" if ext else "person") if base == "Person" \
                    else "external" if ext else "backend" if base == "System" else c4guess([a.get("tags"), a.get("techn"), a.get("label")])
                m.card(cid, a.get("label"), kind, a.get("techn") or ("External " + TYPE[base].lower() if ext else TYPE[base]),
                       a.get("descr"), icon="user" if base == "Person" else None,
                       shape="box" if not shape and (base == "Component" and kind in TOOL_KINDS or kind == "cloud") else None)  # a component its words guess is a box, as a Structurizr one; a cloud is never a node
                bases.add(base)
                if base == "Person":
                    people.add(cid)
                for b in boxes:
                    if b["id"] == box:
                        b["nodeIds"].append(cid)
        elif c and BOUNDARY.fullmatch(name):
            if not pos or not pos[0] or pos[0] in m.ids:
                m.say(no, f"{name}({pos[0] if pos else ''}): {'its alias is used already' if pos and pos[0] else 'no alias'}")
            else:
                alias = m.uniq(pos[0])
                boxes.append({"id": alias, "label": clip(named.get("label") or (pos + [""])[1] or alias, 40), "nodeIds": [], "parent": box, "line": no})
        elif c and (r := REL.fullmatch(name)):
            a = {**dict(zip("from to label techn descr".split(), pos)), **named}
            rels.append((no, a, r.group(1), r.group(2)))
        elif not (c and QUIET.fullmatch(name)):
            m.say(no, f"not imported: {clip(s, 80)}")
        elif named.get("shape"):  # ponytail: a tag's $shape (RoundedBoxShape, EightSidedShape) is said, not drawn
            m.say(no, f"{name}({clip((pos or [''])[0], 40)}): $shape={named['shape']} is not imported")
        if opens:
            stack.append(alias)
            opened.append((no, s))
    left_open(m, opened)
    ids = m.view("components" if "Component" in bases else "containers" if "Container" in bases else "context", list(m.nodes), boxes)
    for no, a, bi, back in rels:
        x, y = (a.get("to"), a.get("from")) if back else (a.get("from"), a.get("to"))
        if bad := [v for v in (x, y) if v not in m.nodes and v not in ids]:
            m.say(no, f"Rel({a.get('from')}, {a.get('to')}): {bad[0]} is not defined")
            continue
        m.line(x, y, a.get("label"), a.get("techn"), where=no, what=a.get("descr"), loop=y in people)
        if bi:
            m.line(y, x, a.get("label"), a.get("techn"), where=no, what=a.get("descr"), loop=x in people)


PUML_QUIET = re.compile(r"(@startuml|!include|!theme|!pragma|!define|skinparam|hide|show|scale|(left to right|top to bottom) direction)\b", re.I)


def plantuml(text, name):
    m, lines, block, done, start = Model(name), [], 0, None, None  # block: the line a /' ... '/ opened on
    for no, raw in enumerate(text.splitlines(), 1):
        s = raw.strip()
        if block or s.startswith("/'"):
            block = (block or no) if "'/" not in s else 0
        elif done and s and not s.startswith("'"):
            m.say(no, f"only the first diagram is imported (its @enduml is line {done})")
            break
        elif s.lower().startswith("@enduml"):
            done = no
        elif s.lower().startswith("!include") and "c4" not in s.lower():
            m.say(no, f"not followed: {clip(s, 80)}")
        elif s and not s.startswith("'") and not PUML_QUIET.match(s):
            lines.append((no, s))
        start = start or (no if not block and s.lower().startswith("@startuml") else None)
    c4(lines, m)
    left_open(m, [], block and ("/'", block, len(text.splitlines())))
    if start and not done:
        m.say(start, "@startuml has no @enduml (is the file cut short?)")
    return m


# ---------- Mermaid ----------

def mermaid(text, name):
    title, body = front(text)
    m = Model(title or name)
    lines = [(no, s) for no, s in ((no, l.strip()) for no, l in enumerate(body.splitlines(), 1)) if s and not s.startswith("%%")]
    head = MERMAID.match(lines[0][1]) if lines else None
    if not head or head.group(1) in TYPED:
        m.say(lines[0][0] if lines else 1, f"a {head.group(1)} is read by the module's reader, in Node (umlimator.py import): nothing imported here"
              if head else "not a flowchart, graph or C4 diagram: nothing imported")
        return m
    rest = re.sub(r"^\s*(TB|TD|BT|RL|LR)?\s*;?", "", lines[0][1][head.end():])
    body = ([(lines[0][0], rest)] if rest.strip() else []) + lines[1:]
    if head.group(1).startswith("C4"):
        c4([(no, s) for no, s in body if not re.match(r"acc(Title|Descr)\b", s)], m)
    else:
        flowchart(body, m)
    return m


SHAPES = [("(((", ")))"), ("([", "])"), ("[[", "]]"), ("[(", ")]"), ("((", "))"), ("{{", "}}"), ("[/", "/]"), ("[/", "\\]"),
          ("[\\", "\\]"), ("[\\", "/]"), ("[", "]"), ("(", ")"), ("{", "}"), (">", "]")]
NODE = re.compile(r"\s*([\w$]+(?:[.-][\w$]+)*)")
LINK = re.compile(r"""\s*(?:(?P<plain>[<ox]?(?:-{2,}[->ox]|={2,}[=>ox]|-?\.+-[>ox]?|~{3,}))
                     |(?P<open>[<ox]?(?:--|==|-\.))\s*(?P<text>[^|]+?)\s*(?P<close>-{2,}[->ox]|={2,}[=>ox]|\.+-[>ox]?))
                     \s*(?:\|(?P<pipe>[^|]*)\|)?""", re.X)
FLOW_QUIET = re.compile(r"(classDef|class|style|linkStyle|click|direction|accTitle|accDescr)\b")


def text(s):
    s = (s or "").strip()
    return s[1:-1].strip("`") if len(s) > 1 and s[0] == s[-1] == '"' else s


def fnode(s, i):
    """A node at i: (id, label, shape, end), or None."""
    n = NODE.match(s, i)
    if not n:
        return None
    nid, i = n.group(1), n.end()
    for o, c in SHAPES:
        if s.startswith(o, i):
            j = s.find('"', i + len(o) + 1) + 1 if s.startswith('"', i + len(o)) else i + len(o)
            k = s.find(c, j)
            if k > 0:
                i, label, shape = k + len(c), text(s[i + len(o):k]), o
                break
    else:
        label = shape = None
    cls = re.compile(r":::[\w-]+").match(s, i)
    return nid, label, shape, cls.end() if cls else i


def statement(s):
    """Node groups (a & b) joined by links, or None."""
    groups, links, i = [], [], 0
    while True:
        grp = []
        while (n := fnode(s, i)):
            grp.append(n[:3])
            i = n[3]
            amp = re.compile(r"\s*&").match(s, i)
            if not amp:
                break
            i = amp.end()
        if not grp:
            return None
        groups.append(grp)
        if not s[i:].strip():
            return groups, links
        lk = LINK.match(s, i)
        if not lk:
            return None
        links.append(lk)
        i = lk.end()


def flowchart(lines, m):
    nodes, subs, boxes, claimed, links = {}, [], [], {}, []
    for no, line in lines:
        for s in (x.strip() for x in re.split(r';(?=(?:[^"]*"[^"]*")*[^"]*$)', line)):
            g = re.match(r'subgraph\s+(?:([^\s\["]+)\s*\[\s*(.*?)\s*\]|"(.+)"|(\S+)$|(.+))', s)
            if g:
                label = text(g.group(2) or g.group(3) or g.group(4) or g.group(5))
                subs.append({"id": ident(g.group(1) or g.group(4) or label), "label": clip(label, 40), "seen": [], "line": no,
                             "parent": subs[-1]["id"] if subs else None})
            elif s == "end" and not subs:
                m.say(no, "an end that closes no subgraph")
            elif s == "end":
                sg = subs.pop()
                boxes.append({k: sg[k] for k in ("id", "label", "parent", "line")} | {"nodeIds": [n for n in dict.fromkeys(sg["seen"]) if claimed.setdefault(n, sg["id"]) == sg["id"]]})
            elif not s or FLOW_QUIET.match(s):
                pass
            elif p := statement(s):
                groups, joins = p
                for nid, label, shape in (n for grp in groups for n in grp):
                    old = nodes.setdefault(nid, {"label": nid, "shape": None})
                    if label is not None:
                        old.update(label=label, shape=shape)
                    if subs:
                        subs[-1]["seen"].append(nid)
                links += [(a[0], b[0], lk, no) for k, lk in enumerate(joins) for a in groups[k] for b in groups[k + 1]]
            else:
                m.say(no, f"not imported: {clip(s, 80)}")
    for sg in subs:
        m.say(sg["line"], f"subgraph {sg['id']} has no end: its nodes are imported, without the box")
    sgs = {b["id"] for b in boxes}
    for nid, n in nodes.items():
        if nid not in sgs:  # a subgraph's id in a link is its box
            m.ids.add(nid)
            m.card(nid, n["label"], "database" if n["shape"] == "[(" else guess([n["label"], nid]))
    for b in boxes:
        b["nodeIds"] = [n for n in b["nodeIds"] if n not in sgs]
    ids = m.view("flowchart", list(m.nodes), boxes)
    for a, b, lk, no in links:
        arrow = lk["plain"] or lk["open"] + lk["close"]
        if arrow.startswith("~"):
            continue  # an invisible link only spaces Mermaid's layout
        if bad := [x for x in (a, b) if x not in m.nodes and x not in ids]:
            m.say(no, f"{a} -> {b}: {bad[0]} is a subgraph that is not drawn")
            continue
        style = {"style": "async"} if "." in arrow else {"weight": 2} if "=" in arrow else {}
        m.line(a, b, text(lk["pipe"] or lk["text"]), where=no, **style)
        if arrow[0] == "<":
            m.line(b, a, text(lk["pipe"] or lk["text"]), where=no, **style)


# ---------- docker compose ----------

def compose(d, name):
    m, svcs, nets = Model(d.get("name") or name), d.get("services") or {}, {}
    for s, c in svcs.items():
        c = c or {}
        build = c.get("build")
        ctx = build.get("context") if isinstance(build, dict) else build
        nets[s] = list(c.get("networks") or ([] if c.get("network_mode") else ["default"]))
        ports = [str(p.get("published") or p.get("target")) if isinstance(p, dict) else str(p) for p in c.get("ports") or []]
        what = [f"Publishes {', '.join(ports)}." if ports else "", f"On networks {', '.join(nets[s])}." if len(nets[s]) > 1 else ""]
        m.ids.add(s)
        m.card(s, s, guess([c.get("image"), s]), c.get("image") or (f"build {Path(str(ctx)).name or '.'}" if ctx else None), " ".join(what))
    for s, c in svcs.items():
        deps = {}  # a link is a dependency too: one line per pair, the first word for it
        for t, label in [(t, "depends on") for t in (c or {}).get("depends_on") or []] + [(str(t).split(":")[0], "links") for t in (c or {}).get("links") or []]:
            deps.setdefault(t, label)
        for t, label in deps.items():
            if t in svcs:
                m.line(s, t, where=f"services.{s}", what=label)  # every line is one: no label on each
            else:
                m.say(f"services.{s}", f"{label} {t}, which is not a service here")
    used = sorted({n for ns in nets.values() for n in ns})
    boxes = [{"id": m.uniq(f"network-{n}"), "label": n, "nodeIds": [s for s in svcs if nets[s] == [n]]} for n in used] if len(used) > 1 else []
    m.view("services", list(svcs), [b for b in boxes if b["nodeIds"]])  # a service on several networks stays between their boxes
    for k in d:
        if k not in ("name", "services", "networks"):
            m.say(k, "not imported")
    return m


# ---------- Kubernetes ----------

SHORT = {"Deployment": "deploy", "StatefulSet": "sts", "DaemonSet": "ds", "Service": "svc", "Ingress": "ing"}
HOST = re.compile(r"(?:[a-z][a-z0-9+.-]*://)?(?:[^@/\s]*@)?([a-z0-9-]+(?:\.[a-z0-9-]+)*)(?::\d+)?(?:/\S*)?", re.I)


def kubernetes(d, name):
    m = Model(name)
    if isinstance(d, list):
        items, at = d, lambda i: f"[{i}]"
    elif isinstance(d.get("items"), list):
        items, at = d["items"], lambda i: f"items[{i}]"
    else:
        items, at = [d], lambda i: "the object"
    objs = []
    for i, o in enumerate(items):
        kind, md = o.get("kind"), o.get("metadata") or {}
        if kind in ("Pod", "ReplicaSet", "ControllerRevision") and md.get("ownerReferences"):
            continue  # drawn as the workload that owns it
        if kind not in SHORT or not md.get("name"):
            m.say(at(i), f"{kind} {md.get('name', '')}: not imported")
            continue
        nm, ns, spec = md["name"], md.get("namespace") or "default", o.get("spec") or {}
        cid = m.uniq(f"{SHORT[kind]}-{nm}", f"{SHORT[kind]}-{nm}-{ns}")
        objs.append((i, kind, ns, nm, spec, cid))
        if kind == "Service":
            ext, ports = spec.get("type") == "ExternalName", ", ".join(f"{p.get('port')}→{p.get('targetPort') or p.get('port')}" for p in spec.get("ports") or [])
            m.card(cid, nm, "external" if ext else "cloud", f"Service · {spec.get('externalName') if ext else spec.get('type') or 'ClusterIP'}" + (f" · {ports}" if ports and not ext else ""))
        elif kind == "Ingress":
            hosts = [r["host"] for r in spec.get("rules") or [] if r.get("host")]
            m.card(cid, nm, "cloud", f"Ingress · {hosts[0]}" if hosts else "Ingress", f"Hosts: {', '.join(hosts)}." if len(hosts) > 1 else None)
        else:
            pod = (spec.get("template") or {}).get("spec") or {}
            images = [c.get("image") or "" for c in pod.get("containers") or []]
            n = spec.get("replicas")
            what = " ".join(x for x in [f"{n} replica{'s' * (n != 1)}." if n else "", f"Images: {', '.join(images)}." if images else ""] if x)
            m.card(cid, nm, guess([*images, nm], "database" if kind == "StatefulSet" else "backend"), f"{kind} · {images[0].rsplit('/', 1)[-1]}" if images else kind, what)
    svc = {(ns, nm): cid for _, kind, ns, nm, _, cid in objs if kind == "Service"}
    for i, kind, ns, nm, spec, cid in objs:
        if kind == "Service" and spec.get("selector"):  # to each workload whose pods it selects (its ports are on its card)
            for _, k2, ns2, _, s2, wid in objs:
                labels = ((s2.get("template") or {}).get("metadata") or {}).get("labels") or {}
                if k2 not in ("Service", "Ingress") and ns2 == ns and spec["selector"].items() <= labels.items():
                    m.line(cid, wid, what="selects its pods")
        elif kind == "Ingress":  # each path to its Service, labelled with the path (and the host, when there are several)
            rules = spec.get("rules") or []
            routes = [((r.get("host") or "" if len({x.get("host") for x in rules}) > 1 else "") + (p.get("path") or "/"), p.get("backend") or {})
                      for r in rules for p in (r.get("http") or {}).get("paths") or []]
            for label, b in routes + ([("default", spec["defaultBackend"])] if spec.get("defaultBackend") else []):
                to = (b.get("service") or {}).get("name") or b.get("serviceName")  # networking.k8s.io/v1, or the older v1beta1
                if (ns, to) in svc:
                    m.line(cid, svc[(ns, to)], label)
                else:
                    m.say(at(i), f"Ingress {nm} routes to Service {to}, which is not here")
        elif kind not in ("Service", "Ingress"):  # an env value that names a Service: its host, as name, name.namespace or name.namespace.svc...
            # ponytail: a value that is one host or URL; a list of hosts, envFrom and ConfigMaps are not read
            seen = set()
            for c in ((spec.get("template") or {}).get("spec") or {}).get("containers") or []:
                for env in c.get("env") or []:
                    h = HOST.fullmatch(str(env.get("value") or ""))
                    parts = re.sub(r"\.svc(\.cluster\.local)?$", "", h.group(1)).split(".") if h else []
                    to = svc.get((parts[1] if len(parts) == 2 else ns, parts[0])) if 0 < len(parts) <= 2 else None
                    if to and to not in seen:
                        seen.add(to)
                        m.line(cid, to, env.get("name"))
    spaces = sorted({ns for _, _, ns, _, _, _ in objs})
    boxes = [{"id": m.uniq(f"namespace-{ns}"), "label": ns, "nodeIds": [c for _, _, n, _, _, c in objs if n == ns]} for ns in spaces] if len(spaces) > 1 else []
    m.view("cluster", [c for *_, c in objs], boxes)
    return m
