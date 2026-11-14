"""umlimator.py pack (milestone 4a, notes/milestone-4a.md §4): the cloud vendors' icon packs, fetched only when the user
asks, after the vendor's terms are shown and accepted, from the pinned addresses in icons/packs.json, checked by size
and SHA-256, and kept in the user's cache, never in anything this project publishes. Standard library only.

  umlimator.py pack list                                      # each pack's pin, whether it is fetched and accepted
  umlimator.py pack fetch gcp [--accept-terms gcp@<label>]    # the terms, a yes, then the pinned zips

A render reads a fetched pack (icons()) and never downloads one; the module never fetches at all (§4.5).
"""
import base64, datetime, difflib, hashlib, io, json, os, re, sys, urllib.request, zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
CACHE = Path(os.environ.get("UMLIMATOR_ICON_CACHE", Path.home() / ".cache" / "umlimator" / "icons"))  # as umlimator.py's
NOT_AFFILIATED = "Umlimator is not affiliated with, endorsed by or sponsored by Amazon Web Services, Google or Microsoft."


def rows():
    """icons/packs.json, or under UMLIMATOR_TEST the file UMLIMATOR_PACKS names (a synthetic pack's addresses): a test's
    only, since it redirects where a pack is downloaded from (risks.md S2)."""
    alt = os.environ.get("UMLIMATOR_PACKS")
    if alt and os.environ.get("UMLIMATOR_TEST") != "1":
        sys.exit("UMLIMATOR_PACKS is for umlimator's tests only, and is read only with UMLIMATOR_TEST=1; unset it")
    return json.loads(Path(alt or HERE / "icons" / "packs.json").read_text(encoding="utf-8"))


def folder(pack, row):
    return CACHE / "packs" / pack / row["label"]


def sha(b):
    return hashlib.sha256(b).hexdigest()


def accepted(pack, row):
    """The yes recorded for this pack, label and terms, or None: a new label or changed terms ask again."""
    try:
        a = json.loads((folder(pack, row) / "accepted.json").read_text())
    except (OSError, ValueError):
        return None
    return a if (a.get("pack"), a.get("label"), a.get("terms_sha256")) == (pack, row["label"], row["terms"]["sha256"]) else None


def zips(pack, row):
    """The pack's zips as read from the cache, each checked against its pin; None unless every one is there, whole and
    accepted."""
    if not accepted(pack, row):
        return None
    out = []
    for n, z in enumerate(row["zips"]):
        f = folder(pack, row) / f"{n}.zip"
        b = f.read_bytes() if f.is_file() else b""
        if sha(b) != z.get("sha256"):
            return None
        out.append(zipfile.ZipFile(io.BytesIO(b)))
    return out


def white(b):
    """White paint and no other (upstream fetch_icons.py's white_fill rule, the module's own lines): drawn on a dark tile."""
    white = colored = False
    for p in re.findall(r'(?:fill|stroke|stop-color)[=:]\s*"?([#a-zA-Z][^";\s>]*)', b.decode("utf-8", "ignore")):
        p = p.strip().lower()
        if p in ("none", "transparent", "currentcolor") or p.startswith("url("):
            continue
        if re.fullmatch(r"#f{3}(f{3})?|white", p):
            white = True
        else:
            colored = True
    return white and not colored


def index(row, zs):
    """{id: (zip, member)}, an id being group 1 of the row's pattern with spaces as hyphens, the member first in the zips'
    order winning; and the ids filed more than once. Members are read in memory, never extracted (no zip-slip)."""
    pat, ids, dup = re.compile(row["icons"]), {}, {}
    for z in zs:
        for name in z.namelist():
            m = pat.fullmatch(name)
            if m:
                i = m.group(1).replace(" ", "-")
                if i in ids:
                    dup.setdefault(i, []).append(name)
                else:
                    ids[i] = (z, name)
    return ids, dup


def name_of(row, i):
    return row.get("names", {}).get(i) or " ".join(i.replace("_", " ").replace("-", " ").split())  # AWS: Amazon-VPC_NAT-Gateway, Map-


_ids = {}  # a fetched pack's index, by its cache folder and its files' stamps: a render reads each zip once


def ids_of(pack, row):
    """{id: (zip, member)} of a fetched, accepted pack, or None."""
    d = folder(pack, row)
    key = (str(d), tuple((f.name, f.stat().st_mtime_ns) for f in sorted(d.glob("*")) if f.is_file()) if d.is_dir() else ())
    if key not in _ids:
        zs = zips(pack, row)
        _ids[key] = zs and index(row, zs)[0]
    return _ids[key]


def icon(pack, i, row=None):
    """One icon of a fetched, accepted pack as (bytes, white), after the row's aliases; None if the pack is not fetched or
    lacks it. Nothing is downloaded."""
    row = row or rows().get(pack)
    ids = row and ids_of(pack, row)
    hit = ids and ids.get(row.get("aliases", {}).get(i, i))
    if not hit:
        return None
    b = hit[0].read(hit[1])
    return b, white(b)


def pick(n):
    """A node's (family, props.icon); ("", None) where the model is malformed, which then renders as it did before."""
    if not isinstance(n, dict):
        return "", None
    t, p = n.get("type"), n.get("props")
    return t.split(".")[0] if isinstance(t, str) else "", p.get("icon") if isinstance(p, dict) else None


_told = set()


def tell(p, row):
    """The one line per pack, per run, that says a pack is not fetched and how to fetch it (§4.5)."""
    if p not in _told:
        _told.add(p)
        print(f"icons: the {row['vendor']} pack is not fetched, so its cards draw a glyph or their sigil; "
              f"`umlimator.py pack fetch {p}` fetches it after showing its terms", file=sys.stderr)


def table(models):
    """The page's pack entries (§4.5): `<pack>/<id>` -> {src, dark, name} for every node whose family has a pack row and
    whose props.icon the fetched pack holds, and `<pack>/` -> {legal} for a pack with a legal line (Google). A pack not
    fetched adds nothing and one line says how to fetch it. UMLIMATOR_NO_PACKS: nothing (renders whose output is
    committed, so a maintainer's packs never reach the repository)."""
    if os.environ.get("UMLIMATOR_NO_PACKS"):
        return {}
    rs, out = rows(), {}
    for n in (n for m in models for n in lists(m.get("nodes"))):
        p, i = pick(n)
        if p not in rs or not isinstance(i, str) or not i:
            continue
        if ids_of(p, rs[p]) is None:
            tell(p, rs[p])
            continue
        if rs[p].get("legal"):
            out[f"{p}/"] = {"legal": rs[p]["legal"]}
        if got := icon(p, i, rs[p]):
            pid = rs[p].get("aliases", {}).get(i, i)
            out[f"{p}/{i}"] = {"src": "data:image/svg+xml;base64," + base64.b64encode(got[0]).decode(),
                               "dark": got[1], "name": name_of(rs[p], pid)}
    return out


def lists(x):
    """A model's nodes as a list: a malformed model's other value names no icon (the engine reports it)."""
    return x if isinstance(x, list) else []


def check(model):
    """What only the cached pack knows, for `umlimator.py check` (§5.5): an id the pack lacks with the three nearest, an
    id an alias moved, and a model's iconPacks label other than the pin. Lines on stderr; nothing fails on them."""
    rs = rows()
    asked = model.get("iconPacks")
    for p, label in (asked.items() if isinstance(asked, dict) else ()):
        if p in rs and label != rs[p]["label"]:
            print(f"icons: the model's icons were chosen from the {p} pack's pin {label}; this release pins {rs[p]['label']}", file=sys.stderr)
    seen = set()
    for n in lists(model.get("nodes")):
        p, i = pick(n)
        if p not in rs or not isinstance(i, str) or (p, i) in seen:
            continue
        seen.add((p, i))
        ids = ids_of(p, rs[p])
        if ids is None:
            continue
        to = rs[p].get("aliases", {}).get(i)
        if to:
            print(f"icons: {p} icon {i!r} is {to!r} in the pin {rs[p]['label']} (an alias); write {to!r}", file=sys.stderr)
        elif i not in ids:
            near = difflib.get_close_matches(i, list(ids), 3, 0.4)
            print(f"icons: the {p} pack has no icon {i!r} ({n.get('id')}); nearest: {', '.join(near) or 'none'}", file=sys.stderr)


def terms(pack, row):
    t = row["terms"]
    print(f"{row['vendor']}'s terms for its icons ({t['url']}, as read on {t['read']}):\n\n{t['text']}\n\n{NOT_AFFILIATED}\n")


def download(url, size, to):
    """At most `size` bytes of `url` into `to`; refused when there are more."""
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "umlimator"}), timeout=60) as r, open(to, "wb") as f:
        got = 0
        while chunk := r.read(min(1 << 16, size + 1 - got)):
            got += len(chunk)
            if got > size:
                raise OSError(f"larger than the {size} bytes this release pinned")
            f.write(chunk)
        if got != size:  # a network failure, not a vendor's changed file
            raise OSError(f"cut short at {got} of the {size} bytes this release pinned")


def fetch(pack, accept=None):
    """`pack fetch` (§4.2, §4.3): refused offline or for a pack with no row; the terms and a yes before any byte; each zip
    downloaded within its pinned size and checked by SHA-256, and Azure's terms PDF by its own, before anything is kept;
    then renamed into place with accepted.json."""
    if os.environ.get("UMLIMATOR_OFFLINE"):
        sys.exit("pack fetch: UMLIMATOR_OFFLINE is set, so nothing is fetched")
    rs = rows()
    row = rs.get(pack) or sys.exit("pack fetch: the AWS pack is not offered in this release" if pack == "aws" else
                                   f"pack fetch: no pack {pack!r}; packs: {', '.join(rs)}")
    t, want = row["terms"], f"{pack}@{row['label']}"
    if sha(t["text"].encode()) != t["sha256"]:
        sys.exit(f"pack fetch: the {pack} terms in packs.json do not match their pinned sha256")
    if not all(z.get("sha256") and z.get("bytes") for z in row["zips"]) or (t.get("member") and not t.get("memberSha256")):
        sys.exit(f"pack fetch: the {row['vendor']} pack is not pinned in this release (no size or sha256 yet)")
    test = os.environ.get("UMLIMATOR_TEST") == "1" and os.environ.get("UMLIMATOR_PACKS")
    if bad := [z["url"] for z in row["zips"] if not z["url"].startswith("https://") and not test]:
        sys.exit(f"pack fetch: {bad[0]} is not an https address")
    if zips(pack, row):
        print(f"the {row['vendor']} pack {row['label']} is fetched already: {folder(pack, row)}")
        return
    prior = accepted(pack, row)
    via = prior and prior.get("via")
    if not prior:
        terms(pack, row)
        if accept is not None:
            if accept != want:
                sys.exit(f"pack fetch: --accept-terms {accept} does not name this pack and pin: these are {want}'s terms")
            via = "flag"
        elif sys.stdin.isatty():
            said = input(f"Type yes to accept these terms and download the {row['vendor']} icons ({row['label']}): ")
            if said.strip().lower() != "yes":
                sys.exit("pack fetch: the terms were not accepted, so nothing was downloaded")
            via = "terminal"
        else:
            sys.exit(f"pack fetch: no terminal to answer, so nothing was downloaded; once you (the user) have read the "
                     f"terms above, `--accept-terms {want}` is your yes")
    d = folder(pack, row)
    d.mkdir(parents=True, exist_ok=True)
    tmps = [d / f".{n}.{os.urandom(4).hex()}.part" for n in range(len(row["zips"]))]
    try:
        for z, tmp in zip(row["zips"], tmps):
            try:
                download(z["url"], z["bytes"], tmp)
            except OSError as e:
                sys.exit(f"pack fetch: cannot download {z['url']} ({e}); nothing was kept")
            if sha(tmp.read_bytes()) != z["sha256"]:
                sys.exit(f"pack fetch: {row['vendor']}'s file at {z['url']} is not the one this release pinned"
                         f"{' (Google changes these files without a version)' if pack == 'gcp' else ''}. "
                         "A later release pins the new one. Nothing was kept")
        pdf = None
        if t.get("member"):
            try:
                pdf = next(z.read(n) for f in tmps for z in [zipfile.ZipFile(f)] for n in z.namelist() if n.rsplit("/", 1)[-1] == t["member"])
            except (StopIteration, zipfile.BadZipFile):
                pdf = b""
            if sha(pdf) != t["memberSha256"]:
                sys.exit(f"pack fetch: {t['member']} in the {row['vendor']} zip is not the one this release pinned: "
                         "Microsoft's terms changed, so the pack waits for a re-pin. Nothing was kept")
        for n, tmp in enumerate(tmps):
            os.replace(tmp, d / f"{n}.zip")
        if pdf:
            (d / t["member"]).write_bytes(pdf)
        (d / "accepted.json").write_text(json.dumps({"pack": pack, "label": row["label"], "terms_sha256": t["sha256"],
                                                     "via": via,
                                                     "date": prior["date"] if prior else datetime.date.today().isoformat()}) + "\n")
    finally:
        for tmp in tmps:
            tmp.unlink(missing_ok=True)
    ids, dup = index(row, zips(pack, row))
    if dup:
        differ = sorted(i for i, ns in dup.items() if any(sha(ids[i][0].read(ids[i][1])) != sha(ids[i][0].read(n)) for n in ns))
        print(f"{len(dup)} ids are filed more than once, the first in the zip used: {', '.join(sorted(dup))}"
              + (f"; these differ, an alias row picks one at the next pin: {', '.join(differ)}" if differ else ""))
    print(f"fetched the {row['vendor']} pack {row['label']}: {len(ids)} icons in {d}"
          + (f"; Microsoft's terms: {d / t['member']}" if pdf else ""))


def listing():
    for p, row in rows().items():
        a = accepted(p, row)
        state = "fetched" if zips(p, row) else "not fetched"
        print(f"{p}  {row['vendor']}  pin {row['label']}  {state}, terms {'accepted (' + (a.get('via') or 'how not recorded') + ')' if a else 'not accepted'}")
    print(NOT_AFFILIATED)


def main(a):
    fetch(a.pack, a.accept_terms) if a.what == "fetch" else listing()
