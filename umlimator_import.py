"""umlimator.py import (#90): diagrams a team already has, as a map model. Standard library only.

  structurizr   Structurizr DSL: workspace, model, views; person, softwareSystem, container and component, nested;
                -> relationships with description and technology; tags; groups as boxes, nested; systemLandscape,
                systemContext, container and component views with include * (ids, expressions) and exclude; element styles' shapes
  plantuml      C4-PlantUML: Person, System, Container, Component (with Db, Queue and _Ext), Rel, Rel_*, BiRel, and
                *_Boundary(alias, label) { ... } as boxes
  mermaid       flowchart and graph (nodes, labelled links, subgraphs as boxes), and C4Context, C4Container and
                C4Component, whose macros are C4-PlantUML's (a classDiagram, a sequenceDiagram or a stateDiagram is the
                module's to read: umlimator.py import runs src/readers/mermaid-class.js, mermaid-sequence.js or
                mermaid-state.js in Node, an erDiagram, or a flowchart given --typed, mermaid-er.js or
                mermaid-flowchart.js, and a requirementDiagram mermaid-requirement.js)
  compose       `docker compose config --format json`: services, depends_on and links, networks as boxes
  kubernetes    `kubectl get ... -o json` (a List or one object): Deployments, StatefulSets, DaemonSets, Services (to the
                workloads their selector picks), Ingresses (to their Services), and env values that name a Service

detect() also knows two formats the module's readers read typed, in Node (NODE_FORMATS): a Structurizr JSON workspace
(`model` and `views` at the top: src/readers/structurizr.js) and a .dbml file (@dbml/core parses it, src/readers/dbml.js
reads what it parsed).

BPMN XML (.bpmn) is told here and read by the module's adapter, src/readers/bpmn-xml.js, in Node through bpmn-moddle.

read(fmt, text, name) returns (model, unread): unread lists what was not imported, each as (where, message), where
being a line number, or an item's path in a JSON source.
"""
import itertools, json, math, re, sys
from pathlib import Path

FORMATS = ["structurizr", "plantuml", "mermaid", "compose", "kubernetes"]
NODE_FORMATS = ["structurizr-json", "dbml"]  # read typed by the module's readers, in Node (umlimator.py import)
LIMIT = 1 << 20  # bytes: a Structurizr JSON or .dbml file over it is refused before it is parsed (notes/milestone-2.md §8); a
# Structurizr DSL, C4-PlantUML or Mermaid text over it (in characters) is not read
DEEP = 64  # elements nested deeper are read flat from there, so an id (the dotted path) stays short (the module's SZ_DEEP, R2)
VIEW_WORK = 500000  # a DSL's views: elements and relationships walked in all, each view walking every one (the module's SZ_WORK)
FLOWS = 100000  # a flowchart's links at most: a & b --> c & d is a product (the module's MF_FLOWS)
SELECTS = 1000000  # a Kubernetes file's Service selectors: workloads checked in all, each Service checking those under a label (audit 45)
EXT = {".dbml": "dbml", ".dsl": "structurizr", ".puml": "plantuml", ".plantuml": "plantuml", ".pu": "plantuml", ".iuml": "plantuml",
       ".mmd": "mermaid", ".mermaid": "mermaid", ".bpmn": "bpmn"}  # bpmn: XML the module's adapter reads (umlimator.py import)
MERMAID = re.compile(r"(flowchart(?:-elk)?|graph|C4Context|C4Container|C4Component|C4Dynamic|C4Deployment|classDiagram|sequenceDiagram|stateDiagram|erDiagram|requirementDiagram|mindmap)\b")
TYPED = ("classDiagram", "sequenceDiagram", "stateDiagram", "erDiagram", "requirementDiagram", "mindmap")  # the diagrams the module's readers read, in Node (src/readers/)

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
    t = " ".join(str(w) for w in words if w).lower()
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
    return "mobile" if k == "frontend" and re.search(MOBILE, " ".join(str(w) for w in words if w).lower()) else k


def clip(s, n):
    s = re.sub(r"\s+", " ", re.sub(r"<br\s*/?>|\\n", " ", str(s or ""))).strip()
    return s if len(s) <= n else s[:n - 1].rsplit(" ", 1)[0].rstrip(",;:") + "…"


def whole(s):
    """A text the details panel shows (a description, a view's caption): on one line as clip() puts it, never cut. The
    file it comes from is LIMIT at most; a cut here would be silent (audit 21)."""
    return clip(s, float("inf"))


def ident(s):
    """An alias as an id: as it is when it is plain, else a slug."""
    s = str(s).strip()
    return s if re.fullmatch(r"[\w.-]+", s) else re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-") or "x"


class Model:
    def __init__(self, title):
        self.title, self.nodes, self.edges, self.views, self.unread, self.ids, self.next = title, {}, [], [], [], set(), {}

    def say(self, where, msg):
        self.unread.append((where, msg))

    def uniq(self, *hints, where=None):
        """The first hint no card, line or view has yet, else the first one numbered. An id holds no "->" (it names lines
        by position): a hint with one has it as "-", said once (audit 38: a C4 alias, a compose service or a Kubernetes name)."""
        said, hints = hints[0], [re.sub(r"->+", "-", h) if isinstance(h, str) else h for h in hints]
        got = next((h for h in hints if h not in self.ids), None)
        if got is None:  # ids are never freed, so the search goes on from where the last one for this hint stopped (linear)
            n = next(n for n in itertools.count(self.next.get(hints[0], 2)) if f"{hints[0]}-{n}" not in self.ids)
            got, self.next[hints[0]] = f"{hints[0]}-{n}", n + 1
        self.ids.add(got)
        if hints[0] != said:
            self.say(where, f'{said}: an id holds no "->", so it is {got}')
        return got

    def named(self, h, where):
        """A source's own name for a card or box as its id: as written, unless it holds "->" or another name took the id
        that gives, each said (audit 38)."""
        got = self.uniq(h, where=where)
        if got != h and "->" not in h:
            self.say(where, f"{h}: the id is taken, so it is {got}")
        return got

    def card(self, cid, label, kind, sub=None, what=None, **more):
        if clip(label, 34) != whole(label):  # a name cut short is whole in the details panel
            what = whole(label) + (f"\n\n{what}" if what else "")
        n = {"id": cid, "label": clip(label, 34) or cid, "kind": kind, "sublabel": clip(sub, 44), "what": whole(what), **more}
        self.nodes[cid] = {k: v for k, v in n.items() if v or k == "id"}  # a blank id stays, for validate to say, never dropped unsaid

    def line(self, a, b, label=None, sub=None, where=None, hint=None, **more):
        if a == b:
            return self.say(where, f"{a} -> {b}: a line from a card to itself is not drawn")
        if hint:  # a source's own id for the line (Mermaid's A e1@--> B): as written, as the typed reader keeps it (audit 31: it was
            t = re.sub(r"->+", "-", hint)  # slugged, e:1 as e-1, which then took the id another link names); an id holds no "->"
            if t != hint:
                self.say(where, f'the edge id {hint}: an id holds no "->", so it is {t}')
            lid = self.uniq(t) if t not in self.ids else None
            if lid is None:
                lid = self.uniq(f"{a}-{b}")
                self.say(where, f"the edge id {t} is taken, so {a} --> {b} is {lid}")
        else:
            lid = self.uniq(f"{a}-{b}")
        e = {"id": lid, "from": a, "to": b, "label": clip(label, 28), "sublabel": clip(sub, 28), **more}
        if clip(label, 28) != whole(label):  # a label cut short is whole in the details panel
            e["what"] = whole(label) + (f"\n\n{e['what']}" if e.get("what") else "")
        self.edges.append({k: v for k, v in e.items() if v or k in ("id", "from", "to")})
        return e["id"]

    def view(self, hint, nodes, boxes=(), **more):
        kids, up, parents = set(), [b.get("parent") for b in boxes if b["nodeIds"]], {}  # kids: each id with cards in a box below
        for b in boxes:
            parents.setdefault(b["id"], []).append(b.get("parent"))
        while up:  # one pass up from each box with cards, never twice through an id (deep or many boxes stay linear)
            if (p := up.pop()) is not None and p not in kids:
                kids.add(p)
                up += parents.get(p, [])
        full = lambda b: b["nodeIds"] or b["id"] in kids
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
        except (ValueError, RecursionError):  # too deep for Python's parser: cmd_import says so
            d = None
        if isinstance(d, dict) and isinstance(d.get("model"), dict) and isinstance(d.get("views"), dict):
            return "structurizr-json"
        if isinstance(d, dict) and isinstance(d.get("services"), dict):
            return "compose"
        if isinstance(d, list) or isinstance(d, dict) and ("items" in d or "apiVersion" in d):
            return "kubernetes"
    if text.lstrip()[:1] == "<" and "http://www.omg.org/spec/BPMN/20100524/MODEL" in text[:4096]:
        return "bpmn"
    if re.search(r"^[^\S\n]*@startuml", text, re.M):  # not \s*: from every line it would run over the blank ones after it
        return "plantuml"
    body, i, parts = front(text)[1], 0, []  # /* ... */ cut by one scan (a lazy .*? rescanned to the end from each unclosed /*)
    while (j := body.find("/*", i)) >= 0 and (k := body.find("*/", j + 2)) >= 0:
        parts.append(body[i:j])
        i = k + 2
    body = "".join(parts) + body[i:]
    first = next((s for _, s in mermaid_lines(body) if s and not s.startswith(("//", "#", "'"))), "")
    if MERMAID.match(first):
        return "mermaid"
    if re.match(r"workspace\b", first, re.I):
        return "structurizr"
    return EXT.get(Path(path).suffix.lower())


def mermaid_typed(text, typed=False):
    """The Mermaid diagram the module's readers read (src/readers/, through Node), classDiagram, sequenceDiagram,
    stateDiagram (stateDiagram-v2 too), erDiagram, requirementDiagram or mindmap, and with typed (import --typed) "flowchart" for a flowchart or a
    graph; else None: this file reads Mermaid's flowcharts and C4 diagrams, as maps."""
    for _, s in mermaid_lines(front(text)[1]):
        if s:
            return next((t for t in TYPED if re.match(t + r"\b", s)), None) or (typed and re.match(r"(flowchart|graph)\b", s) and "flowchart" or None)
    return None


def split_lines(text):
    """The text's lines, split at a line feed, CR LF or CR only: str.splitlines() also splits at U+2028, a form feed
    and others, which a label may hold."""
    parts = re.split(r"\r\n?|\n", text)
    return parts[:-1] if parts[-1] == "" else parts  # as splitlines(): no line after the last line break


def mermaid_lines(text, said=None):
    """Each line of Mermaid text as (number from 1, stripped), a %% comment and a %%{ ... }%% directive, on one line or
    several, blank; of an accDescr { ... } over several lines, only its first line is kept. With said, a list, each
    directive's first line goes in it, (number, what is said), as the typed readers say it (audit 24)."""
    directive = acc = False
    for no, l in enumerate(split_lines(text), 1):
        s = l.strip()
        if acc:
            acc, s = "}" not in s, ""
        elif directive:
            directive, s = "}%%" not in s, ""
        elif re.match(r"accDescr\s*\{", s):
            acc = "}" not in s
        elif s.startswith("%%"):
            if said is not None and s[2:].strip().startswith("{"):
                said.append((no, "a %%{init}%% directive: Mermaid's configuration is not read"))
            directive, s = s[2:].strip().startswith("{") and "}%%" not in s, ""
        yield no, s


# JavaScript's whitespace (its \s and trim()), which the typed readers' front matter reading uses: str.strip() and
# isspace() also take U+001C to U+001F and U+0085 and leave U+FEFF, so a title read here and the same title read --typed
# came out different (audit 28)
JS_SPACE = "\t\n\v\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"
JS_S = "[" + re.escape(JS_SPACE) + "]"


def js_strip(s):
    """s trimmed as JavaScript's trim() trims it."""
    return s.strip(JS_SPACE)


def js_indented(s):
    r"""Whether s starts with whitespace as JavaScript's /^\s/ finds it."""
    return s[:1] != "" and s[:1] in JS_SPACE


def js_indent(s):
    """How many characters of whitespace s starts with, as JavaScript's trimStart() counts them."""
    return len(s) - len(s.lstrip(JS_SPACE))


def front(text, said=None):
    """Mermaid's front matter (--- title: ... ---): its title, and the text with the block as blank lines. The title is
    read as YAML (Mermaid's js-yaml) reads it, as the typed readers' mermaidTitle(): a plain one to a # comment, a
    "double-quoted" one with its escapes, a 'single-quoted' one with '' as a quote (audit 24). With said, a list, each
    other key of the block goes in it, (line, what is said), as the typed readers say it: its configuration is not read."""
    m = re.match(r"\s*---[^\S\n]*\n(.*?)\n---[^\S\n]*(?:\n|$)", text, re.S)
    if not m:
        return None, text
    title, first, lines, j = None, text[:m.start(1)].count("\n") + 1, split_lines(m.group(1)), 0
    while j < len(lines):
        l, no = lines[j], first + j
        if not js_strip(l) or js_strip(l).startswith("#") or js_indented(l):
            j += 1
            continue
        key = js_strip(l.partition(":")[0])
        if key == "title":
            title, rest, j = front_title(lines, j)
            if rest and said is not None:
                said.append((no, f"front matter title: {rest}, after the quoted title, is not read"))
        elif said is not None:
            said.append((no, f"front matter {key}: Mermaid's configuration is not read"))
        j += 1
    return title, "\n" * m.group(0).count("\n") + text[m.end():]


def front_title(lines, j):
    """The title whose key is on lines[j], read over the lines that carry it as js-yaml reads them, (title, what follows a
    closed quote or None, the last of its lines): the typed readers' mermaidFrontTitle() (src/readers/mermaid-front.js).
    A block scalar (title: >, title: |-) holds the more-indented lines under it, | with their line breaks, > folded as
    YAML folds them; a plain or quoted value goes on over the indented lines after it, joined with a space. Line breaks
    at the title's start and end are dropped (audit 25: the block indicator was the title, a second line was lost)."""
    val = js_strip(lines[j].partition(":")[2])
    more = lambda k: k < len(lines) and js_strip(lines[k]) != "---" and (not js_strip(lines[k]) or js_indented(lines[k]))
    end = j
    while more(end + 1):
        end += 1
    while end > j and not js_strip(lines[end]):  # blank lines after the value are not its own
        end -= 1
    body, block = lines[j + 1:end + 1], re.fullmatch(r"([|>])(?:([1-9])[+-]?|[+-]([1-9])?)?(?:" + JS_S + "+#[^\n\r\u2028\u2029]*)?", val)  # JS's . stops at a line terminator
    if block:
        # the indicator's own ASCII digit, never one in the comment after it (audit 29)
        digit, first = block[2] or block[3], next((x for x in body if js_strip(x)), None)
        base = int(digit) if digit else js_indent(first) if first else 0
        out, prev, blanks = "", None, 0
        for k, x in enumerate(body):
            if not js_strip(x):
                blanks += 1
                continue
            if js_indent(x) < base:  # less indented: the block ends (YAML refuses what follows)
                end = j + k
                break
            t = x[base:]
            wide = js_indented(t)
            if prev is None:
                out = "\n" * blanks + t
            elif block[1] == ">" and prev and not wide:
                out += "\n" * blanks + t if blanks else " " + t
            else:
                out += "\n" * (blanks + 1) + t
            prev, blanks = not wide, 0
        return out.strip("\n"), None, end
    parts, held, nl = [val], bool(val), False  # held: a word read so far; nl: a blank line since the last
    for x in body:  # in parts, joined once: a title over many lines is read in linear time (hostile input, R2)
        y = js_strip(x)
        if not y:
            parts.append("\n")
            nl = True
            continue
        if not held:
            parts = []  # what came before held no word: the title starts here
        parts.append(y if nl or not held else " " + y)
        held, nl = True, False
    title, rest = yaml_title("".join(parts))
    return title.strip("\n"), rest, end


def utf16_clip(s, n=60):
    """s as the typed readers' mermaidClip() quotes it: up to n UTF-16 units, else its first n - 3 and ..., never cut
    between the halves of an astral letter (audit 25: this cut at 60 letters and added ..., 63 in all)."""
    if len(s.encode("utf-16-le")) // 2 <= n:
        return s
    out, units = [], 0
    for ch in s:
        units += 2 if ord(ch) > 0xFFFF else 1
        if units > n - 3:
            break
        out.append(ch)
    return "".join(out) + "..."


def yaml_title(val):
    """A front-matter title's value, val stripped, as YAML reads it, and what follows a closed quote that is no comment
    (cut as utf16_clip() cuts it), or None: the typed readers' mermaidTitle() (src/readers/mermaid-front.js)."""
    q = val[:1]
    if q not in ('"', "'"):
        return js_strip(re.sub(r"(^|" + JS_S + r")#.*$", "", val, flags=re.S)), None
    k = 1
    while k < len(val):
        if q == '"' and val[k] == "\\":
            k += 1
        elif val[k] == q:
            if q == "'" and val[k + 1:k + 2] == "'":
                k += 1
            else:
                break
        k += 1
    span, after = val[1:k], js_strip(val[k + 1:])
    title = span.replace("''", "'") if q == "'" else span
    if q == '"':
        try:
            title = json.loads(f'"{span}"')
        except ValueError:  # YAML's own escape, \x41 say: the text as written
            pass
    return title, utf16_clip(after) if after and not after.startswith("#") else None


def _finite(s):
    if not math.isfinite(x := float(s)):
        raise ValueError(f"the number {s[:40]} is out of range")
    return x


def _whole(s):
    if abs(x := int(s)) > sys.float_info.max:  # JavaScript reads it as Infinity
        raise ValueError(f"the number {s[:40]}... is out of range")
    return x


def _no_constant(c):
    raise ValueError(f"{c} is not a JSON number")


def loads(text):
    """JSON as umlimator.py's load_json reads it for every command: a number out of range (1e400) and Python's NaN and
    Infinity raise ValueError, never reaching the model as the text "Infinity" (audit 31)."""
    return json.loads(text, parse_float=_finite, parse_int=_whole, parse_constant=_no_constant)


# a character XML 1.0 cannot hold: a C0 control but tab, line feed and carriage return, a lone surrogate, U+FFFE, U+FFFF
RAW = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\ud800-\udfff\ufffe\uffff]")


def raw_char(c):
    """The report's message for such a character, as the module's mermaidRawChar."""
    return f"the character U+{ord(c):04X}, which SVG or XML cannot hold, is read as U+FFFD"


def scrub(text, say):
    """A source's text with each character XML cannot hold as U+FFFD, each line that held one said once, as the module's
    mermaidScrub: a raw one in a label made the page's SVG export not well-formed (audit 49). Lines are split as
    split_lines splits them, so the numbers are the readers' own. Linear."""
    if not RAW.search(text):
        return text
    parts = re.split(r"(\r\n?|\n)", text)
    for k in range(0, len(parts), 2):
        if c := RAW.search(parts[k]):
            say(k // 2 + 1, raw_char(c[0]))
            parts[k] = RAW.sub("\ufffd", parts[k])
    return "".join(parts)


def legal(d, say):
    """Parsed JSON (compose, Kubernetes) with each character XML cannot hold, which an escape such as \\u0001 gives, as
    U+FFFD in every key and value, each character said once (audit 49). Keys first, then values: a value that is a key's
    source text (depends_on: [web\\u0002]) reads as the name that key was given, so a reference follows a key kept apart
    (audit 52). One pass over the keys and one over the values, with no recursion."""
    told, top, named, given = set(), [d], {}, set()  # named: a key's source text -> the text it is read as, given those

    def fix(v):
        if not isinstance(v, str) or not RAW.search(v):
            return v
        for c in RAW.findall(v):
            if c not in told:
                told.add(c)
                say(None, raw_char(c))
        return named.get(v) or RAW.sub("\ufffd", v)

    def keys(v):
        """v's keys fixed, in their order: two that differ only in such characters (web\\u0001 and web\\u0002) or a fixed one
        that is another's text kept apart, the later taking the first free of key-2, key-3 ... each said (audit 50), as the
        module's readers keep two names that scrub to one text apart. A source text keeps the name it was first given in
        every map it keys (a service and its depends_on map, a selector and the pod labels it picks), and no other source
        text is given that name, so the same key reads as one name throughout (audit 52). Linear in the keys
        but for the free-key search."""
        if not any(isinstance(a, str) and RAW.search(a) for a in v):
            return v
        used, out = set(a for a in v if not (isinstance(a, str) and RAW.search(a))), {}
        for a, b in v.items():
            if not (isinstance(a, str) and RAW.search(a)):
                out[a] = b
                continue
            f = fix(a)
            if f in used or (a not in named and f in given):
                g, n = RAW.sub("\ufffd", a), 2
                while f"{g}-{n}" in used or (a not in named and f"{g}-{n}" in given):
                    n += 1
                say(None, f"key {g}: another key reads as the same text, so this one is read as {g}-{n}")
                f = f"{g}-{n}"
            if a not in named:
                named[a] = f
                given.add(f)
            used.add(f)
            out[f] = b
        return out
    todo, leaves = [(top, 0)], []
    while todo:
        box, k = todo.pop()
        v = box[k]
        if isinstance(v, dict):
            box[k] = v = keys(v)
            todo += [(v, a) for a in v]
        elif isinstance(v, list):
            todo += [(v, i) for i in range(len(v))]
        else:
            leaves.append((box, k))
    for box, k in leaves:
        box[k] = fix(box[k])
    return top[0]


def read(fmt, text, name):
    if len(text) > LIMIT:  # hostile input (risks.md R2), as the module's readers refuse it
        m = Model(name)
        m.say(None, f"{len(text)} characters, over the limit of {LIMIT} (1 MiB) for {fmt}: nothing read")
    else:
        said = []  # said before reading, then kept in the model's report
        if fmt in ("compose", "kubernetes"):
            d = legal(loads(text), lambda no, msg: said.append((no, msg)))
            m = compose(d, name) if fmt == "compose" else kubernetes(d, name)
        else:
            text = scrub(text, lambda no, msg: said.append((no, msg)))
            m = {"structurizr": structurizr, "plantuml": plantuml, "mermaid": mermaid}[fmt](text, name)
        m.unread += said
    return m.model(), sorted(m.unread, key=lambda u: [int(t) if t.isdigit() else t for t in re.split(r"(\d+)", str(u[0]))])


# ---------- Structurizr DSL ----------

TOKEN = re.compile(r'"((?:[^"\\]|\\.)*)"|(\S+)')
C4TYPE = {"person": "Person", "softwaresystem": "Software system", "container": "Container", "component": "Component"}
LEVELS = ["systemlandscape", "systemcontext", "container", "component"]
SCOPE = {"systemcontext": "softwaresystem", "container": "softwaresystem", "component": "container"}
HOLDER = {"person": None, "softwaresystem": None, "container": "softwaresystem", "component": "container"}  # what each is written in
TAG = {"person": "Person", "softwaresystem": "Software System", "container": "Container", "component": "Component"}  # built in
# a Structurizr style's shape as one of the map's (0.15.0); Circle, Ellipse, Diamond, Bucket and Component have none
# !impliedRelationships: Structurizr's strategy names, as umlimator draws them (None: no implied lines)
IMPLIED = {"false": None, "none": None, "defaultimpliedrelationshipsstrategy": None,
           "true": "any", "createimpliedrelationshipsunlessanyrelationshipexistsstrategy": "any",
           "createimpliedrelationshipsunlesssamerelationshipexistsstrategy": "same"}
SZ_SHAPE = {"box": "box", "roundedbox": "box", "person": "person", "robot": "robot", "cylinder": "cylinder", "pipe": "pipe",
            "folder": "folder", "webbrowser": "browser", "window": "window", "terminal": "terminal", "shell": "terminal",
            "mobiledeviceportrait": "mobile", "mobiledevicelandscape": "mobile", "hexagon": "hexagon"}


def dsl_lines(text):
    """The DSL's statements, stripped, with their first line's number: a line ending in \\ goes on in the next."""
    buf, start = [], 0
    for no, raw in enumerate(split_lines(text), 1):
        start = start or no
        raw = raw.rstrip()
        if raw.endswith("\\"):
            buf.append(raw[:-1])
            continue
        yield start, "".join(buf + [raw]).strip()
        buf, start = [], 0
    if buf:
        yield start, "".join(buf).strip()


def structurizr(text, name):
    m = Model(name)
    # ref: each identifier, lowered, as (its spelling, its element): Structurizr compares identifiers ignoring case
    # (IdentifiersRegister); fulls: the lowered full identifiers (an alias alone may name another, nested, element)
    els, ref, path, rels, specs, stack, groups, styles, depth, fulls = {}, {}, {}, [], [], [], [], [], {}, set()
    bare = {}  # each alias, lowered: the full identifiers that end in it (two: a bare use is no one element's, audit 32)
    implied, comment, opened, flat = "any", 0, [], False  # comment: the line a /* ... */ opened on; opened: each open block's line and text
    for no, s in dsl_lines(text):
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
            if len(toks) > 2 and toks[1:2] != ["extends"]:  # its description: said, not dropped (audit 38)
                m.say(no, "the workspace's description is not imported")
            push = ("workspace", None)
        elif where == "workspace" and kw in ("model", "views"):
            push = (kw, None)
        elif where == "workspace" and kw in ("name", "description"):
            m.title = toks[1] if kw == "name" and len(toks) > 1 else m.title
            if kw == "description":
                m.say(no, "the workspace's description is not imported")
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
            held = els[parent]["type"] if parent in els else None  # what it is written in: None in the model or a group there
            if e and held != HOLDER[e[1]]:  # Structurizr refuses it: no view would show it, or one would at the wrong level (audits 33, 34)
                m.say(no, f"{'softwareSystem' if e[1] == 'softwaresystem' else e[1]} {e[0] or e[2]} is " + (f"in no {C4TYPE[HOLDER[e[1]]].lower()}" if held is None and HOLDER[e[1]] else
                      f"in {C4TYPE[held].lower()} {path.get(parent, els[parent]['name'])}, where a {C4TYPE[e[1]].lower()} cannot be")
                      + ": not imported (nor what it holds)")
            elif e:
                alias, typ, nm, desc, tech, tags = e
                if depth.get(parent, 0) >= DEEP:  # beside its holder, said once
                    flat or m.say(no, f"{nm} is nested over {DEEP} deep: it and what it holds are read flat from there")
                    flat, parent = True, els[parent]["parent"]
                full = f"{path[parent]}.{alias}" if alias and parent in path else alias
                cid = m.uniq(*[h for h in (alias and ident(alias), full and ident(full.replace(".", "-")), ident(nm)) if h])
                depth[cid] = depth.get(parent, 0) + 1
                els[cid] = {"type": typ, "name": nm, "desc": desc, "tech": tech, "tags": tags, "parent": parent, "group": grp}
                if alias:
                    path[cid] = full
                    ref.setdefault(alias.lower(), (alias, cid))
                    bare.setdefault(alias.lower(), []).append(full)
                    was = ref.get(full.lower())
                    if was and was[0] != full and full.lower() in fulls:  # one identifier twice, in two cases: Structurizr refuses it
                        m.say(no, f"{full}: Structurizr reads identifiers ignoring case, so this is {was[0]} again; references name {was[0]}")
                    else:
                        ref[full.lower()] = (full, cid)
                        fulls.add(full.lower())
                push = ("el", cid)
            elif r:  # its identifiers are read from the element it is written in outwards, as Structurizr reads them (audit 32)
                rels.append({**r, "line": no, "scope": parent})
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
    left_open(m, opened, comment and ("/*", comment, len(split_lines(text))))
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
    def twice(t):  # the full identifiers a bare alias names when it names more than one element, else []
        return bare.get(t.lower(), []) if isinstance(t, str) and t.lower() not in fulls and len(bare.get(t.lower(), [])) > 1 else []

    def find(t, scope=None):
        """The element identifier t names: written inside an element (scope), first as one nested in it or in what holds it
        (hierarchical identifiers: api inside softwareSystem b is b.api), then as written. A bare alias two elements share
        names neither: it was the first one's, and a line written inside b ran between a's cards (audit 32)."""
        if not isinstance(t, str):
            return None
        s, seen = scope, set()
        while s is not None and s not in seen:
            seen.add(s)
            if s in path and (hit := ref.get(f"{path[s]}.{t}".lower())):
                return hit[1]
            s = els[s]["parent"] if s in els else None
        if twice(t):
            return None
        return (ref.get(t.lower()) or ("", None))[1] or (t if t in els else None)
    lines = []
    for r in rels:
        if r["src"] is None:  # this -> x with no element around it, in the model or a group there (audit 25)
            m.say(r["line"], f"this -> {r['dst']}: this names no element here")
            continue
        a, b = r["src"] if r.get("this") else find(r["src"], r["scope"]), find(r["dst"], r["scope"])
        if not (a and b):
            t = r["src"] if not a else r["dst"]
            m.say(r["line"], f"{r['src']} -> {r['dst']}: " + (f"{t} names {clip(', '.join(twice(t)), 80)}: write the one it means" if twice(t) else f"{t} is not an element"))
            continue
        if r["tags"]:  # a relationship's tags style it in Structurizr; nothing here reads them, so they are said (audit 20)
            m.say(r["line"], f"{r['src']} -> {r['dst']}: tags {clip(', '.join(r['tags']), 60)} are not imported")
        if eid := m.line(a, b, r["desc"], r["tech"], where=r["line"], loop=els[b]["type"] == "person"):
            lines.append((a, b, eid, r))
    holders = {e["parent"] for e in els.values()}
    # no views to follow: the landscape, then a view per system with containers and per container with components
    default = [{"type": "systemlandscape", "scope": None, "include": [], "exclude": [], "line": None}] + [
        {"type": "container" if e["type"] == "softwaresystem" else "component", "scope": c, "cid": c, "include": [], "exclude": [], "line": None}
        for c, e in els.items() if c in holders]
    views(m, els, lines, specs or default, find, implied, groups)
    if specs and not m.views and els:  # every view left out (a mistyped scope, say): the same, rather than a model with none (audit 19)
        m.say(None, "no view in the workspace is drawn, so the landscape and a view per system and container are drawn instead")
        views(m, els, lines, default, find, implied, groups)
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
    return {"src": src, "dst": dst, "desc": (a + [""])[0], "tech": (a + ["", ""])[1], "tags": [t.strip() for t in (a + ["", "", ""])[2].split(",") if t.strip()],
            "this": src is not None and src == this and (toks[:1] == ["->"] or toks[0] == "this")}


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
    def up(c):  # c and the elements it is in, innermost first (a loop: deep nests are not too deep for it)
        out = []
        while c:
            out.append(c)
            c = els[c]["parent"]
        return out
    # implied: "any" draws one implied line per pair unless a relationship joins them; "same" one per description, unless a
    # relationship with that description joins them (Structurizr's two strategies)
    key = lambda x, y, r: (x, y) if implied == "any" else (x, y, r["desc"])
    direct, made, placed, work = {key(a, b, r) for a, b, _, r in lines}, {}, [], 0

    def joined(ts):  # a -> b written with spaces is one relationship expression, a->b, as Structurizr reads it
        out, i = [], 0  # each: its parts, its line (joined once: a long chain is not copied at each arrow, R2)
        while i < len(ts):
            if ts[i][0] == "->" and out and i + 1 < len(ts):
                out[-1][0].append(ts[i + 1][0])
                i += 2
            else:
                out.append(([ts[i][0]], ts[i][1]))
                i += 1
        return [("->".join(p), no) for p, no in out]

    def under(x, c):  # c is x or in it (an implied relationship runs from what holds its end)
        return x is None or x in up(c)

    # each element's and relationship's tags, lowercased once for the whole file: a tag expression then costs at most the
    # smaller of its values and an element's tags per element, never a fresh set of every tag list per expression (R2)
    etags, rtags = {}, {}
    def etag(c):
        if c not in etags:
            etags[c] = frozenset(g.lower() for g in ["Element", TAG[els[c]["type"]], *els[c]["tags"]])
        return etags[c]
    def rtag(eid, r):
        if eid not in rtags:
            rtags[eid] = frozenset(g.lower() for g in ["Relationship", *r["tags"]])
        return rtags[eid]

    def expr(t, lift):
        """What a Structurizr expression includes or excludes, as ("els", elements) or ("rels", relationships), where an
        element's relationships are its own and its members' (the implied ones); None for an expression not read here:
        element.type, element.tag and element.parent (== or !=, values with commas), ->x->, ->x and x-> (x and what it
        relates to), a->b and *->* (those relationships), relationship==* and relationship.tag, and && and || of them."""
        for op, join in (("||", set.union), ("&&", set.intersection)):
            if op in t:
                got = [expr(x.strip(), lift) for x in t.split(op)]
                if None in got or len({g[0] for g in got}) > 1:
                    return None
                return got[0][0], join(*[g[1] for g in got])
        if q := re.fullmatch(r"(element|relationship)\.(type|tag|parent)\s*(==|!=)\s*(\S.*)", t, re.I):
            kind, what, want = q[1].lower(), q[2].lower(), {v.strip().lower().replace(" ", "") if q[2].lower() == "type" else v.strip().lower() for v in q[4].split(",") if v.strip()}
            if kind == "element" and what == "type":
                hit = lambda c: els[c]["type"] in want
            elif kind == "element" and what == "tag":
                hit = lambda c: not want.isdisjoint(etag(c))
            elif kind == "element":
                held = {find(v.strip()) for v in q[4].split(",") if v.strip()}  # a, b as a,b, as type and tag read it (audit 36)
                if None in held:
                    return None
                hit = lambda c: els[c]["parent"] in held
            elif what == "tag":
                return "rels", {eid for _, _, eid, r in lines if (not want.isdisjoint(rtag(eid, r))) == (q[3] == "==")}
            else:
                return None
            return "els", {c for c in els if hit(c) == (q[3] == "==")}
        if re.fullmatch(r"relationship\s*==\s*\*", t, re.I):
            return "rels", {eid for _, _, eid, _ in lines}
        pre, post = t.startswith("->"), t.endswith("->") and len(t) > 2
        core = t[2 if pre else 0:len(t) - 2 if post else len(t)]
        if "->" in core and not (pre or post):
            a, b = (v.strip() for v in core.split("->", 1))
            x, y = (None if v == "*" else find(v) for v in (a, b))
            if "->" in b or (a != "*" and not x) or (b != "*" and not y):
                return None
            return "rels", {eid for p, q2, eid, _ in lines if under(x, p) and under(y, q2)}
        if (pre or post) and "->" not in core and (x := find(core)):
            out = {x}
            # a line between two of x's own members is no coupling of x: Structurizr implies none between a parent and its
            # child, so ->s on s's own container view drew web and api for web->api (audit 36)
            for a, b, _, _ in lines:
                out |= {lift(b)} if post and x in up(a) and x not in up(b) else set()
                out |= {lift(a)} if pre and x in up(b) and x not in up(a) else set()
            return "els", out - {None}
        return None
    for s in specs:
        incl, excl = joined(s["include"]), joined(s["exclude"])
        # each expression walks every element or relationship once more (R2)
        work += (1 + sum(1 + t.count("&&") + t.count("||") + t.count(",") for t, _ in incl + excl if t != "*" and not find(t))) * (len(els) + len(lines)) + len(incl) + len(excl)  # a value list costs per value
        if work > VIEW_WORK:  # hostile input (R2): views x elements is unbounded under the 1 MiB limit
            m.say(s["line"], f"over {VIEW_WORK} elements and relationships walked in all views: this view and the rest are left out")
            break
        # a default view's scope is the card itself (cid), never read as an identifier: a bare alias two elements share
        # (a.api, b.api) names neither, and the first one's component view was left out (audit 33)
        typ, scope = s["type"], s["cid"] if "cid" in s else find(s["scope"]) if s["scope"] else None
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
        # an include list with no * shows what it names, as Structurizr draws it (a context view still shows its system),
        # audit 34; an expression names what it matches (audit 35); one not read here leaves the view as its scope shows it
        star = not incl or any(t == "*" for t, _ in incl)
        shown, hidden, unread = set() if level != 1 and not star else set(inner), set(), False
        if star:
            for a, b, _, _ in lines:
                shown |= {y for x, y in ((lift(a), lift(b)), (lift(b), lift(a))) if x in inner and y}
        for t, no in incl:
            if t == "*":
                continue
            if find(t):
                if lift(find(t)) == find(t):
                    shown.add(find(t))
                else:
                    m.say(no, f"include {t}: not shown at this level")
                continue
            got = expr(t, lift)
            if got is None and re.fullmatch(r"[\w.]+", t):  # an identifier that names no element: it adds nothing
                m.say(no, f"include {clip(t, 80)}: not an element")
                continue
            if got is None:
                unread = True
                m.say(no, f"include {clip(t, 80)}: an expression umlimator does not read, so the view shows its scope's elements")
                continue
            if got[0] == "rels":  # a relationship brings its two ends, as near as this view draws them, when it draws both
                pick = {e for a, b, eid, _ in lines if eid in got[1] and lift(a) and lift(b) for e in (lift(a), lift(b))}
            else:
                pick = {c for c in got[1] if lift(c) == c}
            if not pick - {None}:
                m.say(no, f"include {clip(t, 80)}: matches nothing this view shows")
            shown |= pick - {None}
        if unread:
            shown |= inner
        for t, no in excl:
            got = ("els", {find(t)}) if find(t) else expr(t, lift)
            if got is None:
                m.say(no, f"exclude {clip(t, 80)}: " + ("not an element" if re.fullmatch(r"[\w.]+", t) else "an expression umlimator does not read"))
            elif got[0] == "rels":
                hidden |= got[1]
            else:
                shown -= got[1]
        ids, drawn, seen = [c for c in els if c in shown], [], set()
        for a, b, eid, r in lines:
            x, y = lift(a), lift(b)
            if x not in shown or y not in shown or x == y or eid in hidden:
                continue
            if (x, y) == (a, b):
                drawn.append(eid)
            elif implied and (k := key(x, y, r)) not in direct and k not in seen:
                made[k] = made.get(k) or m.line(x, y, r["desc"], r["tech"], loop=els[y]["type"] == "person")
                drawn.append(made[k])
                seen.add(k)
        if not ids:
            m.say(s["line"], f"{typ} view{' ' + s['key'] if s.get('key') else ''}: shows nothing, so it is left out")
            continue
        word = ["landscape", "context", "containers", "components"][level]
        hint = (ident(s["key"]), f"{ident(s['key'])}-{word}") if s.get("key") else f"{scope}-{word}" if scope else word
        title = s.get("title") or (els[scope]["name"] + ["", "", " containers", " components"][level] if scope else m.title)
        box = [{"id": scope, "label": clip(els[scope]["name"], 40), "nodeIds": [c for c in ids if els[c]["parent"] == scope and els[c]["group"] is None]}] if level > 1 else []
        made_box = {}

        def group_box(g):  # a group's box: in the group around it, else in the scope's box when the group is in the scope
            chain, h = [], g  # the groups around g not yet boxed, made outermost first (a loop: deep nests are not too deep)
            while h is not None and h not in made_box:
                chain.append(h)
                h = groups[h]["parent"]
            for h in reversed(chain):
                G = groups[h]
                made_box[h] = {"id": G["id"], "label": clip(G["label"], 40), "nodeIds": [],
                               "parent": made_box[G["parent"]]["id"] if G["parent"] is not None else scope if level > 1 and G["owner"] == scope else None}
                box.append(made_box[h])
            return made_box[g]
        if level > 1 and els[scope]["group"] is not None:  # the scope's box, in its own group's box
            box[0]["parent"] = group_box(els[scope]["group"])["id"]
        for c in ids:
            if els[c]["group"] is not None:
                group_box(els[c]["group"])["nodeIds"].append(c)
        m.view(hint, ids, box, title=clip(title, 60), caption=whole(s.get("desc")), edges=drawn)
        if level > 1:
            m.nodes[scope].setdefault("opensView", m.views[-1]["id"])
        placed.append((m.views[-1], level, scope))
    first = [{}, {}, {}, {}]  # per level: a card -> the first view of that level showing it
    for w, lv, _ in placed:
        for c in w["nodeIds"]:
            first[lv].setdefault(c, w["id"])
    for v, level, scope in placed:  # its parent: the most detailed view above it that shows its scope as a card
        v["parent"] = next((first[lv][scope] for lv in range(level - 1, -1, -1) if scope in first[lv]), None)


# ---------- C4-PlantUML, and Mermaid's C4 diagrams (the same macros) ----------

CALL = re.compile(r"([A-Za-z_]\w*)\s*\((.*)\)\s*(\{)?$")
ARG = re.compile(r'\s*(?:\$(\w+)\s*=\s*)?("(?:[^"\\]|\\.)*"\s*|[^,]*)(,|$)')
ELEMENT = re.compile(r"(Person|System|Container|Component)(Db|Queue)?(_Ext)?")
# each macro's arguments, in order (C4-PlantUML's, and Mermaid's C4, which takes the same); READ are those imported, the
# rest are said (audit 20)
ARGS = {"Person": "alias label descr sprite tags link type", "System": "alias label descr sprite tags link type baseshape",
        "Container": "alias label techn descr sprite tags link baseshape", "Component": "alias label techn descr sprite tags link baseshape"}
RELARGS = "from to label techn descr sprite tags link"
# a boundary's: only Boundary takes a $type; Enterprise_, System_ and Container_Boundary take $tags third (audit 21)
BOXARGS = {"Boundary": "alias label type tags link descr"}
READ = {"alias", "label", "descr", "techn", "tags", "from", "to"}  # tags: read only where c4guess reads them, else said
REL = re.compile(r"(Bi)?Rel(_Back)?(_(U|Up|D|Down|L|Left|R|Right|Neighbor))?")
BOUNDARY = re.compile(r"(Enterprise_|System_|Container_)?Boundary")
QUIET = re.compile(r"Lay_\w+|LAYOUT_\w+|SHOW_\w+|HIDE_\w+|Update\w+|Add\w*Tag|SetSketchStyle")
PROPS = re.compile(r"AddProperty|SetPropertyHeader|WithoutPropertyHeader")  # an element's property table: data, so said (audit 38)
TYPE = {"Person": "Person", "System": "Software system", "Container": "Container", "Component": "Component"}


def call_args(s):
    pos, named, i = [], {}, 0
    while True:
        a = ARG.match(s, i)
        key, val, sep = a.groups()
        val = val.rstrip()
        val = val[1:-1].replace('\\"', '"') if val[:1] == '"' and val[-1:] == '"' and len(val) > 1 else val
        if key:
            named[key.lower()] = val
        else:
            pos.append(val)
        if not sep:
            return pos, named
        i = a.end()


def unread(names, pos, named, read=READ):
    """A macro's arguments that are written and not imported, as one phrase (or ""): named ones past its known
    positions, and those its reader does not read."""
    a = {**dict(zip(names.split(), pos)), **named}
    left = [f"${k}={clip(v, 40)}" for k, v in a.items() if k not in read and v.strip()]
    left += [f"argument {j + 1} ({clip(v, 40)})" for j, v in enumerate(pos) if j >= len(names.split()) and v.strip()]
    return "; ".join(left) and "; ".join(left) + (" is" if len(left) == 1 else " are") + " not imported"


def c4(lines, m):
    """Macro calls, one per line: elements, boundaries ({ ... } boxes), relationships. One view."""
    boxes, stack, rels, bases, people, opened, named_as = [], [], [], set(), set(), [], {}  # named_as: each alias's id
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
            if not a.get("alias") or a["alias"] in named_as:
                m.say(no, f"{name}({a.get('alias', '')}): {'its alias is used already' if a.get('alias') else 'no alias'}")
            else:
                cid, kind = named_as.setdefault(a["alias"], m.named(a["alias"], no)), "database" if shape == "Db" else "queue" if shape == "Queue" else ("user" if ext else "person") if base == "Person" \
                    else "external" if ext else "backend" if base == "System" else c4guess([a.get("tags"), a.get("techn"), a.get("label")])
                m.card(cid, a.get("label"), kind, a.get("techn") or ("External " + TYPE[base].lower() if ext else TYPE[base]),
                       a.get("descr"), icon="user" if base == "Person" else None,
                       shape="box" if not shape and (base == "Component" and kind in TOOL_KINDS or kind == "cloud") else None)  # a component its words guess is a box, as a Structurizr one; a cloud is never a node
                guessed = base in ("Container", "Component") and not shape and not ext  # its tags guess its kind, else they are said (audit 21)
                if left := unread(ARGS[base], pos, named, READ if guessed else READ - {"tags"}):
                    m.say(no, f"{name}({a['alias']}): {left}")
                bases.add(base)
                if base == "Person":
                    people.add(cid)
                for b in boxes:
                    if b["id"] == box:
                        b["nodeIds"].append(cid)
        elif c and BOUNDARY.fullmatch(name):
            if not pos or not pos[0] or pos[0] in named_as:
                m.say(no, f"{name}({pos[0] if pos else ''}): {'its alias is used already' if pos and pos[0] else 'no alias'}")
            else:
                alias = named_as.setdefault(pos[0], m.named(pos[0], no))
                boxes.append({"id": alias, "label": clip(named.get("label") or (pos + [""])[1] or alias, 40), "nodeIds": [], "parent": box, "line": no})
                if left := unread(BOXARGS.get(name, "alias label tags link descr"), pos, named, {"alias", "label"}):
                    m.say(no, f"{name}({pos[0]}): {left}")
        elif c and (r := REL.fullmatch(name)):
            a = {**dict(zip(RELARGS.split(), pos)), **named}
            rels.append((no, a, r.group(1), r.group(2), name, unread(RELARGS, pos, named, READ - {"tags"})))  # a line's tags style nothing here
        elif c and PROPS.fullmatch(name):
            m.say(no, f"{name}({clip(c.group(2), 60)}): an element's properties are not imported")
        elif not (c and QUIET.fullmatch(name)):
            m.say(no, f"not imported: {clip(s, 80)}")
        elif named.get("shape"):  # ponytail: a tag's $shape (RoundedBoxShape, EightSidedShape) is said, not drawn
            m.say(no, f"{name}({clip((pos or [''])[0], 40)}): $shape={named['shape']} is not imported")
        if opens:
            stack.append(alias)
            opened.append((no, s))
    left_open(m, opened)
    ids = m.view("components" if "Component" in bases else "containers" if "Container" in bases else "context", list(m.nodes), boxes)
    for no, a, bi, back, name, left in rels:
        x, y = (a.get("to"), a.get("from")) if back else (a.get("from"), a.get("to"))
        said = f"{name}({', '.join(v for v in (a.get('from'), a.get('to')) if v is not None)})"
        # an end not written, or blank, is said so: Python's None or an empty name in the message read as a card's (audit 20)
        if gap := next((f"it names no {k}" if a.get(e) is None else f"its {k} is empty" for e, k in (("from", "source"), ("to", "target"))
                        if not (a.get(e) or "").strip()), None):
            m.say(no, f"{said}: {gap}")
            continue
        if bad := [v for v in (x, y) if named_as.get(v) not in m.nodes and named_as.get(v) not in ids]:
            m.say(no, f"{said}: {bad[0]} is not defined")
            continue
        x, y = named_as[x], named_as[y]  # an alias's id: one with "->" has it as "-" (audit 38)
        if left:
            m.say(no, f"{said}: {left}")
        m.line(x, y, a.get("label"), a.get("techn"), where=no, what=a.get("descr"), loop=y in people)
        if bi:
            m.line(y, x, a.get("label"), a.get("techn"), where=no, what=a.get("descr"), loop=x in people)


PUML_QUIET = re.compile(r"(@startuml|!include|!theme|!pragma|!define|skinparam|hide|show|scale|(left to right|top to bottom) direction)\b", re.I)


def plantuml(text, name):
    m, lines, block, done, start = Model(name), [], 0, None, None  # block: the line a /' ... '/ opened on
    for no, raw in enumerate(split_lines(text), 1):
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
    left_open(m, [], block and ("/'", block, len(split_lines(text))))
    if start and not done:
        m.say(start, "@startuml has no @enduml (is the file cut short?)")
    return m


# ---------- Mermaid ----------

def mermaid(text, name):
    said = []  # its configuration, which is not read: front matter keys and %%{init}%% directives (audit 24)
    title, body = front(text, said)
    m = Model(title or name)
    lines = [(no, s) for no, s in mermaid_lines(body, said) if s]
    head = MERMAID.match(lines[0][1]) if lines else None
    if head and head.group(1) in ("C4Dynamic", "C4Deployment"):  # a C4 diagram, but not one read: said as such (audit 33)
        m.say(lines[0][0], f"{head.group(1)}: a Mermaid C4 diagram umlimator does not read (C4Context, C4Container and C4Component are): nothing imported")
        return m
    if not head or head.group(1) in TYPED:
        m.say(lines[0][0] if lines else 1, f"{'an' if head.group(1)[0] == 'e' else 'a'} {head.group(1)} is read by the module's reader, in Node (umlimator.py import): nothing imported here"
              if head else "not a flowchart, graph or C4 diagram: nothing imported")
        return m
    for no, what in said:
        m.say(no, what)
    rest = re.sub(r"^\s*(TB|TD|BT|RL|LR)?\s*;?", "", lines[0][1][head.end():])
    body = ([(lines[0][0], rest)] if rest.strip() else []) + lines[1:]
    if head.group(1).startswith("C4"):
        for no, s in body:  # said, as a flowchart's is (audit 38)
            if q := re.match(r"acc(Title|Descr)\b", s):
                m.say(no, f"{q[0]}: accessibility text is not imported")
        c4([(no, s) for no, s in body if not re.match(r"acc(Title|Descr)\b", s)], m)
    else:
        flowchart(body, m)
    return m


SHAPES = [("(((", ")))"), ("([", "])"), ("[[", "]]"), ("[(", ")]"), ("((", "))"), ("{{", "}}"), ("[/", "/]"), ("[/", "\\]"),
          ("[\\", "\\]"), ("[\\", "/]"), ("[", "]"), ("(-", "-)"), ("(", ")"), ("{", "}"), (">", "]")]
NODE = re.compile(r"\s*([\w$]+(?:[.-][\w$]+)*)")
LINK = re.compile(r"""\s*(?:(?P<plain>[<ox]?(?:-{2,}[->ox]|={2,}[=>ox]|-?\.+-[>ox]?|~{3,}))
                     |(?P<open>[<ox]?(?:--|==|-\.))(?P<text>(?:"[^"]*"|"(?![^"]*")|[^"])+?)(?P<close>-{2,}[->ox]|={2,}[=>ox]|(?<!\.)\.+-[>ox]?))
                     \s*(?:\|(?P<pipe>"[^"]*"|[^|]*)\|)?""", re.X)  # a quoted text may hold | (audit 20), as the typed reader's MF_PIPE
# the dash form's text, Mermaid's edgeText, holds any character, | too, up to the first close outside quotes (audit 34); a
# quote with no partner is one character, so each " reads one way and a link with no close fails in linear time
WS, BREAK = re.compile(r"\s*"), re.compile(r'[\s"&|]')  # an edge id ends at a break (statement())
FLOW_QUIET = re.compile(r"(classDef|class|style|linkStyle|click|direction|accTitle|accDescr)\b")


ENTITY = {"quot": '"', "lt": "<", "gt": ">", "amp": "&"}


def markdown(s):
    """Whether a flowchart label is a Markdown string, "`...`", which text() reads as plain text (as the module's mfText)."""
    s = (s or "").strip()
    return len(s) > 3 and s[0] == s[-1] == '"' and s[1] == s[-2] == "`"


def char(e, bad=None):
    """The character an entity code (#n;) names, as the module's mermaidChar: above U+10FFFF as U+10FFFF; one XML 1.0 cannot
    hold (#0;, a C0 control but tab, line feed and carriage return, a lone surrogate, U+FFFE, U+FFFF) as U+FFFD, and
    bad(code) told, as a raw one would make the model's SVG and XML exports not well-formed (audit 48)."""
    v = min(int(e[1]), 0x10FFFF)
    if v in (9, 10, 13) or 0x20 <= v <= 0xD7FF or 0xE000 <= v <= 0xFFFD or v >= 0x10000:
        return chr(v)
    if bad:
        bad(e[0])
    return "\ufffd"


def text(s, bad=None):
    """A flowchart label: quotes and a Markdown string's backticks taken off, Mermaid's entity codes read (as the module's
    mfText), a code naming no character XML holds as U+FFFD, bad(code) told; markdown() says which labels lose their
    Markdown, for the caller to say (audit 25)."""
    s = (s or "").strip()
    s = s[2:-2] if markdown(s) else s[1:-1] if len(s) > 1 and s[0] == s[-1] == '"' else s
    return re.sub(r"#(quot|lt|gt|amp|\d{1,6});", lambda e: ENTITY.get(e[1]) or char(e, bad), s)


def bad_code(m, no):
    """bad for text(): a code naming no character XML holds, said at line no, as the module's mermaidBadChar."""
    return lambda code: m.say(no, f"{clip(code, 60)} names no character SVG or XML can hold: read as U+FFFD")


def fnode(s, i, find=None, bad=None):
    """A node at i: (id, label, shape, end), or None; find(c, frm) is s.find with the statement's misses remembered."""
    find = find or s.find
    n = NODE.match(s, i)
    if not n:
        return None
    nid, i = n.group(1), n.end()
    for o, _ in SHAPES:
        if s.startswith(o, i):
            j = find('"', i + len(o) + 1) + 1 if s.startswith('"', i + len(o)) else i + len(o)
            # of the closers this opener takes ([/ takes /] and \]), the nearest: [/a\] --> B[\b/] is two trapezoids
            k, c = min(((k, c) for p, c in SHAPES if p == o and (k := find(c, j)) > 0), default=(-1, ""))
            if j and k > 0:  # j is 0 when a quote opens and never closes: find no ] behind it
                i, label, shape, md = k + len(c), text(s[i + len(o):k], bad), o, markdown(s[i + len(o):k])
                break
    else:
        label = shape = md = None
    cls = re.compile(r":::([\w-]+)").match(s, i)
    return nid, label, shape, cls.end() if cls else i, cls and cls[1], md


def statement(s, bad=None):
    """Node groups (a & b) joined by links, each link (its match, its edge id or None), or None."""
    groups, links, i, miss, at, brk = [], [], 0, {}, -1, -1

    def find(c, frm):  # a closer missing from frm on is missing from any later frm: each node does not rescan the line (as mfStatement)
        if frm >= miss.get(c, len(s) + 1):
            return -1
        k = s.find(c, frm)
        if k < 0:
            miss[c] = frm
        return k

    while True:
        grp = []
        while (n := fnode(s, i, find, bad)):
            grp.append((*n[:3], n[4], n[5]))
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
        # A e1@--> B: an edge id runs from the link's start to the next @, holding no space, " & or | (Mermaid's LINK_ID), with
        # no { or " after the @ (audit 29: the statement was not imported). The next @ and the next break are each kept
        # while the line is read left to right, as the typed reader's mfStatement: a scan at each link would be quadratic (R2)
        j = WS.match(s, i).end()
        if at < j:
            at = k if (k := s.find("@", j)) >= 0 else len(s) + 1
        if brk < j:
            b = BREAK.search(s, j)
            brk = b.start() if b else len(s) + 1
        eid = j < at < brk and at + 1 < len(s) and s[at + 1] not in '{"'
        lk = LINK.match(s, at + 1 if eid else i)
        if not lk:
            return None
        links.append((lk, s[j:at] if eid else None))
        i = lk.end()


def flowchart(lines, m):
    nodes, subs, boxes, claimed, links, nsub = {}, [], {}, {}, [], 0
    lines = list(lines)
    for k, (no, line) in enumerate(lines):  # a quoted label over several lines (Mermaid's lexer allows it) is one line
        if line.count('"') % 2:  # its close is the next line with an odd count of quotes; none: left as it is
            if (j := next((j for j in range(k + 1, len(lines)) if lines[j][1].count('"') % 2), None)) is not None:
                lines[k:j + 1] = [(no, "\n".join(x for _, x in lines[k:j + 1]))] + [(n, "") for n, _ in lines[k + 1:j + 1]]
    for no, line in lines:
        # statements: split at each ; outside quotes and entity codes (#35;), in one scan (a lookahead per ; rescanned the line); no \s* beside the label (R2)
        for s in (x.strip() for x in re.findall(r'(?:"[^"]*"?|#[0-9A-Za-z_]+;|[^;"])*', line)):
            g = re.match(r'subgraph(?:\s+(?:([^\s\["]+)\s*\[([^\]]*)\]|"(.+)"|(\S+)$|(.+))|$)', s)
            if g:
                raw = g.group(2) or (g.group(3) and f'"{g.group(3)}"') or g.group(4) or g.group(5)  # its quotes kept, so a Markdown string is seen
                label, nsub = text(raw, bad_code(m, no)), nsub + 1
                # Mermaid's subGraph<n> for a bare one, and for a title with no id of its own that holds whitespace, which
                # flowDb.addSubGraph takes for no id (audit 51)
                none = g.group(0) == "subgraph" or (not g.group(1) and re.search(JS_S, g.group(3) or g.group(5) or ""))
                subs.append({"id": f"subGraph{nsub - 1}" if none else ident(g.group(1) or g.group(4) or label), "label": clip(label, 40), "seen": [], "line": no,
                             "parent": subs[-1]["id"] if subs else None})
                if markdown(raw):
                    m.say(no, f"subgraph {subs[-1]['id']}: a Markdown string is read as plain text")
            elif s == "end" and not subs:
                m.say(no, "an end that closes no subgraph")
            elif s == "end":
                sg = subs.pop()  # a subgraph is known by its id: one opened again adds to its box, first label and parent kept (audit 16)
                b = boxes.setdefault(sg["id"], {k: sg[k] for k in ("id", "label", "parent", "line")} | {"nodeIds": {}})
                b["nodeIds"].update(dict.fromkeys(n for n in sg["seen"] if claimed.setdefault(n, sg["id"]) == sg["id"]))
            elif not s:
                pass
            elif q := FLOW_QUIET.match(s):
                m.say(no, f"{q[1]}: accessibility text is not imported" if q[1].startswith("acc") else f"not imported: {clip(s, 80)}")
            elif p := statement(s, bad_code(m, no)):
                groups, joins = p
                for nid, label, shape, cls, md in (n for grp in groups for n in grp):
                    if cls:  # said, as the typed reader says it (audit 20)
                        m.say(no, f"{nid}:::{cls}: a style class is not imported")
                    if md:  # its ** and _ are drawn as written: said, as the typed reader says it (audit 25)
                        m.say(no, f"{nid}: a Markdown string is read as plain text")
                    old = nodes.setdefault(nid, {"label": nid, "shape": None})
                    if label is not None:
                        old.update(label=label, shape=shape)
                    if subs:
                        subs[-1]["seen"].append(nid)
                for k, (lk, _) in enumerate(joins):
                    if markdown(lk["pipe"] or lk["text"]) and not (lk["plain"] or lk["open"]).startswith("~"):
                        m.say(no, f"{' & '.join(n[0] for n in groups[k])} -> {' & '.join(n[0] for n in groups[k + 1])}: a Markdown string is read as plain text")
                if len(links) <= FLOWS:  # a & b --> c & d is a product: lazily, never past the cap (hostile input, R2)
                    links += itertools.islice(((a[0], b[0], lk, no) for k, lk in enumerate(joins) for a in groups[k] for b in groups[k + 1]),
                                              FLOWS + 1 - len(links))
                    if len(links) > FLOWS:
                        links.pop()
                        m.say(no, f"over {FLOWS} links: the rest are not imported")
            else:
                m.say(no, f"not imported: {clip(s, 80)}")
    for sg in subs:
        m.say(sg["line"], f"subgraph {sg['id']} has no end: its nodes are imported, without the box")
    state = {}  # a parent that is no box (a subgraph with no end) or a box inside itself: drawn at the top level, in one linear walk (audit 16)
    for b in boxes.values():
        path, x = [], b
        while x and x["id"] not in state:
            state[x["id"]] = b["id"]
            path.append(x)
            x = boxes.get(x["parent"])
        if not path:
            continue
        if path[-1]["parent"] is not None and not x:
            path[-1]["parent"] = None
        elif x and state[x["id"]] == b["id"]:
            m.say(path[-1]["line"], f"subgraph {path[-1]['id']} is inside itself: drawn at the top level")
            path[-1]["parent"] = None
    sgs = set(boxes)
    for nid, n in nodes.items():
        if nid not in sgs:  # a subgraph's id in a link is its box
            m.ids.add(nid)
            m.card(nid, n["label"], "database" if n["shape"] == "[(" else guess([n["label"], nid]))
    for b in boxes.values():
        b["nodeIds"] = [n for n in b["nodeIds"] if n not in sgs]
    ids = m.view("flowchart", list(m.nodes), list(boxes.values()))
    for a, b, (lk, eid), no in links:
        arrow = lk["plain"] or lk["open"] + lk["close"]
        if arrow.startswith("~"):  # an invisible link only spaces Mermaid's layout
            m.say(no, f"{a} ~~~ {b}: an invisible link is not imported")
            continue
        if bad := [x for x in (a, b) if x not in m.nodes and x not in ids]:
            m.say(no, f"{a} -> {b}: {bad[0]} is a subgraph that is not drawn")
            continue
        style = {"style": "async"} if "." in arrow else {"weight": 2} if "=" in arrow else {}
        label = text(lk["pipe"] or lk["text"], bad_code(m, no))
        m.line(a, b, label, where=no, hint=eid, **style)  # the edge id names its first line
        if arrow[0] == "<":
            m.line(b, a, label, where=no, **style)


# ---------- docker compose ----------

def many(x):
    """A JSON value as a list of its entries: one string is one entry, an object its keys, anything else none."""
    return [x] if isinstance(x, (str, int, float)) and not isinstance(x, bool) else list(x) if isinstance(x, (list, dict)) else []


def word(x):
    """A JSON string as itself, a number as JSON writes it; None for anything else (true, null, a list, an object), which
    the caller says is not imported, never writing Python's spelling of it into the model (audit 30)."""
    ok = isinstance(x, (int, float)) and not isinstance(x, bool) and (not isinstance(x, float) or math.isfinite(x))  # inf and nan are no JSON number (audit 31)
    return x if isinstance(x, str) else json.dumps(x) if ok else None


def spell(x):
    """A JSON value quoted in a message as JSON spells it (true, null, {"a": 1}), cut to 60 characters."""
    try:
        t = x if isinstance(x, str) else json.dumps(x, ensure_ascii=False)
    except (TypeError, ValueError):
        t = type(x).__name__
    return t if len(t) <= 60 else t[:57] + "..."


def compose(d, name):
    d = d if isinstance(d, dict) else {}  # not compose's object: nothing to import
    title = word(d.get("name"))
    m, svcs, nets, cid = Model(title or name), {}, {}, {}  # cid: each service's card id
    if d.get("name") is not None and title is None:
        m.say("name", f"{spell(d.get('name'))} is not text: not imported")
    if not isinstance(d.get("services") or {}, dict):
        m.say("services", "not an object of services: not imported")
    for s, c in (d.get("services") if isinstance(d.get("services"), dict) else {}).items():
        if not s.strip():  # compose itself refuses a blank name; as a card id it would make a model that does not validate (audit 27)
            m.say(f"services.{s!r}", "a service with no name: not imported")
        elif c is None or isinstance(c, dict):
            svcs[s] = c or {}
        else:
            m.say(f"services.{s}", "not an object: not imported")
    for s, c in svcs.items():
        # a value of the wrong JSON type (an image that is a list, a port that is true) is said, never written (audit 30)
        def words(xs, field, what):
            out = []
            for x in xs:
                if word(x) is None:
                    m.say(f"services.{s}.{field}", f"{spell(x)} is not {what}: not imported")
                else:
                    out.append(word(x))
            return out
        build = c.get("build")
        ctx = build.get("context") if isinstance(build, dict) else build
        ctx = (words([ctx], "build", "a path") or [None])[0] if ctx else None
        nets[s] = words(many(c.get("networks")), "networks", "a network's name") or ([] if c.get("network_mode") else ["default"])
        ports = words([(p.get("published") or p.get("target")) if isinstance(p, dict) else p for p in many(c.get("ports"))], "ports", "a port")
        what = [f"Publishes {', '.join(ports)}." if ports else "", f"On networks {', '.join(nets[s])}." if len(nets[s]) > 1 else ""]
        image = (words([c.get("image")], "image", "an image's name") or [None])[0] if c.get("image") is not None else None
        cid[s] = m.named(s, f"services.{s}")  # as written, unless it holds "->" (audit 38)
        m.card(cid[s], s, guess([image, s]), image or (f"build {Path(ctx).name or '.'}" if ctx else None), " ".join(what))
    for s, c in svcs.items():
        deps = {}  # a link is a dependency too: one line per pair, the first word for it
        for t, label in [(t, "depends on") for t in many(c.get("depends_on"))] + [(t, "links") for t in many(c.get("links"))]:
            if word(t) is None:
                m.say(f"services.{s}", f"{label} {spell(t)}, which is not a service's name: not imported")
                continue
            deps.setdefault(word(t).split(":")[0] if label == "links" else word(t), label)
        for t, label in deps.items():
            if t in svcs:
                m.line(cid[s], cid[t], where=f"services.{s}", what=label)  # every line is one: no label on each
            else:
                m.say(f"services.{s}", f"{label} {t if t.strip() else repr(t)}, which is not a service here")
    used, alone = sorted({n for ns in nets.values() for n in ns}), {}
    for s in svcs:
        if len(nets[s]) == 1:
            alone.setdefault(nets[s][0], []).append(cid[s])
    boxes = [{"id": m.uniq(f"network-{n}", where=f"networks.{n}"), "label": n, "nodeIds": alone.get(n, [])} for n in used] if len(used) > 1 else []
    m.view("services", [cid[s] for s in svcs], [b for b in boxes if b["nodeIds"]])  # a service on several networks stays between their boxes
    for k in d:
        if k not in ("name", "services", "networks"):
            m.say(k, "not imported")
    return m


# ---------- Kubernetes ----------

SHORT = {"Deployment": "deploy", "StatefulSet": "sts", "DaemonSet": "ds", "Service": "svc", "Ingress": "ing"}
# a host, or a URL's: its scheme may be words joined by colons (jdbc:postgresql://, jdbc:oracle:thin:@//, audit 18), and
# after a scheme the rest may start with ; or ? (jdbc:sqlserver://db:1433;databaseName=x); Oracle's thin URL may name its host
# after a bare @ and end in :SID (jdbc:oracle:thin:@db:1521:ORCL, audit 19)
HOST = re.compile(r"(?P<scheme>(?:[a-z][a-z0-9+.-]*:)+(?:@?//|@))?(?:[^@/\s]*@)?(?P<host>[a-z0-9-]+(?:\.[a-z0-9-]+)*)(?::\d+)?"
                  r"(?(scheme)(?:[/;?]\S*|:[a-z_][\w$#]*)?|(?:/\S*)?)", re.I)


def obj(x):
    """x when it is a JSON object, else an empty one: a field of the wrong kind reads as missing."""
    return x if isinstance(x, dict) else {}


def objs_in(x):
    """The JSON objects in a list (a field of the wrong kind holds none)."""
    return [o for o in x if isinstance(o, dict)] if isinstance(x, list) else []


def owner(md):
    """An object's owner, as (kind, name): its controller among its ownerReferences, else the first; None when none names both."""
    refs = [r for r in objs_in(md.get("ownerReferences")) if isinstance(r.get("kind"), str) and word(r.get("name"))]
    r = next((r for r in refs if r.get("controller") is True), refs[0] if refs else None)
    return (r["kind"], word(r["name"])) if r and word(r["name"]) is not None else None


def kubernetes(d, name):
    m = Model(name)
    if isinstance(d, list):
        items, at = d, lambda i: f"[{i}]"
    elif isinstance(d, dict) and isinstance(d.get("items"), list):
        items, at = d["items"], lambda i: f"items[{i}]"
    else:
        items, at = [d], lambda i: "the object"
    objs = []
    # each object by (namespace, kind, name), and who owns it: a Pod, ReplicaSet or ControllerRevision is drawn as the
    # workload its owners lead to; one whose workload is not in the file is said, never dropped (audit 21)
    here = {}
    for o in items:
        md = obj(o.get("metadata")) if isinstance(o, dict) else {}
        if isinstance(o, dict) and isinstance(o.get("kind"), str) and word(md.get("name")):
            here[(word(md.get("namespace")) or "default", o["kind"], word(md["name"]))] = owner(md)

    led = {}  # (namespace, kind, name) -> where its chain ends: each chain walked once (linear)

    def drawn_as(ns, ref):
        """Where an owner reference leads, as (the workload in the file it leads to, as a Pod's ReplicaSet to its
        Deployment, else None; the last owner of the chain that is in the file, None when the chain leaves the file;
        the owner the chain leaves the file at, else None): walked with a set, so a long or circular chain of owners ends."""
        path, seen, got, end, miss = [], set(), None, None, None
        while ref is not None and ref not in seen:  # no owner past `end`, or a circle back to it: the chain ends in the file
            if (ns, *ref) not in here:  # an owner that is not in the file
                end, miss = None, ref
                break
            if (ns, *ref) in led:
                got, end, miss = led[(ns, *ref)]
                break
            if ref[0] in ("Deployment", "StatefulSet", "DaemonSet"):
                got = end = ref
                break
            seen.add(ref)
            path.append((ns, *ref))
            end, ref = ref, here[(ns, *ref)]
        led.update(dict.fromkeys(path, (got, end, miss)))
        return got, end, miss

    for i, o in enumerate(items):
        if not isinstance(o, dict):
            m.say(at(i), "not an object: not imported")
            continue
        kind, md = o.get("kind"), obj(o.get("metadata"))
        # a kind or name of the wrong JSON type is quoted as JSON spells it, never as Python does (audit 30)
        said = f"{kind if isinstance(kind, str) else spell(kind)} {word(md.get('name')) or spell(md.get('name', ''))}"
        kind = kind if isinstance(kind, str) else None
        if kind in ("Pod", "ReplicaSet", "ControllerRevision") and md.get("ownerReferences"):
            ns, ref = word(md.get("namespace")) or "default", owner(md)
            got, end, miss = drawn_as(ns, ref)
            by = f"{ref[0]} {ref[1]}" if ref else "an owner reference that names no kind and name"
            if end and not got:  # every owner is in the file, and the last is a kind not imported (a Job's CronJob, audit 22)
                m.say(at(i), f"{said}: owned by {by}" + (f" ({end[0]} {end[1]})" if end != ref else "") + ", which is not imported")
            elif not got and miss and miss[0] not in ("Deployment", "StatefulSet", "DaemonSet", "ReplicaSet", "ControllerRevision"):
                # the owner that is not in the file is a kind not imported either (a Job's CronJob): exporting it draws nothing (audit 23)
                m.say(at(i), f"{said}: owned by {by} (" + (f"{miss[0]} {miss[1]}, " if miss != ref else "") + "not in the file), which is not imported")
            elif not got:  # its owner, or the owner's own, is not in the file
                m.say(at(i), f"{said}: owned by {by}, " + ("whose workload is not in the file" if ref and (ns, *ref) in here else "which is not in the file")
                      + ": not imported (export its workload too, a Deployment, StatefulSet or DaemonSet)")
            continue  # drawn as the workload that owns it
        if kind not in SHORT or not word(md.get("name")):
            m.say(at(i), f"{said}: not imported" if kind not in SHORT or md.get("name") is None else f"{said}: its name is not text: not imported")
            continue
        nm, ns, spec = word(md["name"]), word(md.get("namespace")) or "default", obj(o.get("spec"))
        if md.get("namespace") is not None and word(md.get("namespace")) is None:
            m.say(at(i), f"{kind} {nm}: namespace {spell(md.get('namespace'))} is not text: read as default")
        cid = m.uniq(f"{SHORT[kind]}-{nm}", f"{SHORT[kind]}-{nm}-{ns}", where=at(i))
        objs.append((i, kind, ns, nm, spec, cid))
        if kind == "Service":
            ext = spec.get("type") == "ExternalName"
            ports = ", ".join(f"{word(p.get('port'))}→{word(p.get('targetPort')) or word(p.get('port'))}" for p in objs_in(spec.get("ports")) if word(p.get("port")))
            m.card(cid, nm, "external" if ext else "cloud", f"Service · {word(spec.get('externalName')) if ext else word(spec.get('type')) or 'ClusterIP'}" + (f" · {ports}" if ports and not ext else ""))
        elif kind == "Ingress":
            hosts = [word(r["host"]) for r in objs_in(spec.get("rules")) if word(r.get("host"))]
            m.card(cid, nm, "cloud", f"Ingress · {hosts[0]}" if hosts else "Ingress", f"Hosts: {', '.join(hosts)}." if len(hosts) > 1 else None)
        else:
            pod = obj(obj(spec.get("template")).get("spec"))
            cs = objs_in(pod.get("containers"))
            for c in cs:  # an image of the wrong JSON type is said, not written (audit 30)
                if c.get("image") is not None and word(c.get("image")) is None:
                    m.say(at(i), f"{kind} {nm}: image {spell(c.get('image'))} is not text: not imported")
            images = [word(c.get("image")) for c in cs if word(c.get("image"))]
            n = spec.get("replicas")  # a count, 0 too (scaled down: audit 23); one that is no whole number is not said
            what = " ".join(x for x in [f"{n} replica{'s' * (n != 1)}." if isinstance(n, int) and not isinstance(n, bool) else "", f"Images: {', '.join(images)}." if images else ""] if x)
            m.card(cid, nm, guess([*images, nm], "database" if kind == "StatefulSet" else "backend"), f"{kind} · {images[0].rsplit('/', 1)[-1]}" if images else kind, what)
    svc, pods = {(ns, nm): cid for _, kind, ns, nm, _, cid in objs if kind == "Service"}, {}
    for _, k2, ns2, _, s2, wid in objs:  # each workload under each of its pods' labels, so a selector looks at the few it may pick
        if k2 not in ("Service", "Ingress"):
            labels = obj(obj(obj(s2.get("template")).get("metadata")).get("labels"))
            for kv in labels.items():
                pods.setdefault((ns2, *map(str, kv)), []).append((labels, wid))
    picked, work = 0, SELECTS  # Services by workloads is a product: lines at most FLOWS, checks at most SELECTS, each said once (audit 45)
    for i, kind, ns, nm, spec, cid in objs:
        if kind == "Service" and obj(spec.get("selector")):  # to each workload whose pods it selects (its ports are on its card)
            if picked > FLOWS or work < 0:
                continue
            sel = spec["selector"].items()  # the workloads under its rarest label: every one it selects is among them
            for labels, wid in min((pods.get((ns, *map(str, kv)), []) for kv in sel), key=len):
                work -= 1
                if work < 0:
                    m.say(at(i), f"over {SELECTS} workloads checked against Service selectors: the rest of their lines are not imported")
                    break
                if sel <= labels.items():
                    picked += 1
                    if picked > FLOWS:
                        m.say(at(i), f"over {FLOWS} lines from Services to the workloads they select: the rest are not imported")
                        break
                    m.line(cid, wid, what="selects its pods")
        elif kind == "Ingress":  # each path to its Service, labelled with the path (and the host, when there are several)
            rules = objs_in(spec.get("rules"))
            hosts = len({word(x.get("host")) for x in rules}) > 1
            routes = [(((word(r.get("host")) or "") if hosts else "") + (word(p.get("path")) or "/"), obj(p.get("backend")))
                      for r in rules for p in objs_in(obj(r.get("http")).get("paths"))]
            for label, b in routes + ([("default", obj(spec["defaultBackend"]))] if spec.get("defaultBackend") else []):
                to = obj(b.get("service")).get("name") or b.get("serviceName")  # networking.k8s.io/v1, or the older v1beta1
                if isinstance(to, str) and (ns, to) in svc:
                    m.line(cid, svc[(ns, to)], label)
                else:
                    m.say(at(i), f"Ingress {nm} routes to Service {to if isinstance(to, str) else spell(to)}, which is not here")
        elif kind not in ("Service", "Ingress"):  # an env value that names a Service: its host, as name, name.namespace or name.namespace.svc...
            # ponytail: a value that is one host or URL; a list of hosts, envFrom and ConfigMaps are not read
            seen = set()
            for c in objs_in(obj(obj(spec.get("template")).get("spec")).get("containers")):
                for env in objs_in(c.get("env")):
                    h = HOST.fullmatch(word(env.get("value")) or "")
                    parts = re.sub(r"\.svc(\.cluster\.local)?$", "", h.group("host")).split(".") if h else []
                    to = svc.get((parts[1] if len(parts) == 2 else ns, parts[0])) if 0 < len(parts) <= 2 else None
                    if to and to not in seen:
                        seen.add(to)
                        m.line(cid, to, word(env.get("name")))
    spaces = sorted({ns for _, _, ns, _, _, _ in objs})
    boxes = [{"id": m.uniq(f"namespace-{ns}"), "label": ns, "nodeIds": [c for _, _, n, _, _, c in objs if n == ns]} for ns in spaces] if len(spaces) > 1 else []
    m.view("cluster", [c for *_, c in objs], boxes)
    return m
