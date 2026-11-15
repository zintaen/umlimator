# Icons and icon packs

Cards can carry two kinds of icon: line icons and brand logos, from umlimator's own manifest, and the cloud vendors'
service icons, from packs you fetch yourself. umlimator ships line icons only. Logos and vendor icons belong to their
owners, so the package never bundles them.

## Line icons and logos

A node's `icon` names an entry in [`icons/manifest.json`](../../icons/manifest.json).

- **Line icons** ship in `icons/` and take the card's colour.
- **Brand logos** do not ship: they are their owners' trademarks. The manifest records each logo's official source and
  a sha256; the first render that needs one downloads it into `~/.cache/umlimator/icons` (or `$UMLIMATOR_ICON_CACHE`)
  and uses it only if the hash matches. A logo is never recoloured; follow each brand's guidelines for its use.

To add an icon to the manifest (maintainers):

```bash
python3 -I tools/fetch_icons.py icons "name:slug"            # a brand logo: svgl, then devicon, then gilbarbara/logos
python3 -I tools/fetch_icons.py icons "name=https://..."     # a brand's own official file
python3 -I tools/fetch_icons.py icons "name:lucide/<icon>"   # a line icon
python3 umlimator.py pin-icons                                # records each new logo's sha256
```

With `UMLIMATOR_OFFLINE=1` the CLI fetches nothing: a logo not in the cache keeps its card's sigil (`mcp` sets it).

## Cloud icon packs

The Google Cloud, Azure and AWS diagrams draw each vendor's own service icons, which umlimator never ships, never
bundles and never downloads on its own. You fetch a pack yourself, once:

```bash
python3 umlimator.py pack list          # each pack's label, and whether it is fetched and accepted
python3 umlimator.py pack fetch gcp     # or azure, or aws
```

- **The terms first.** The vendor's terms are shown in full, with the line below, before any byte of the pack is
  downloaded, and you type `yes`. With no terminal (an agent, a script), `--accept-terms gcp@2026-11-14` (the pack and
  its label, as `pack list` prints them) is the yes: it prints the terms too and is recorded as given by flag. An agent
  shows you the terms and passes the flag only on your yes; the MCP server offers neither. A new label asks again.
- **Pinned.** Each zip comes from its vendor's own address, pinned in `icons/packs.json` by size and SHA-256; a file
  that differs is not kept. Azure's `Microsoft_Terms_of_Use.pdf` is checked against its pinned hash too. A vendor that
  changes its file without a version waits for a later release's re-pin.
- **Cached for you only.** A fetched pack lives in `<icon cache>/packs/` (`~/.cache/umlimator/icons`, or
  `$UMLIMATOR_ICON_CACHE`). A render reads it and copies the icons it draws into the page, as it does a logo, and never
  downloads a pack; with none fetched the cards draw a glyph and one line says how to fetch it.
  `UMLIMATOR_NO_PACKS=1` draws glyphs whatever the cache holds.
- **Drawn as they are.** An icon is scaled, never recoloured, cropped or reshaped, on a tile for contrast, with the
  full service name beside it.
- **Logos from Microsoft's pack.** The logos `azuredevops`, `foundry` and `containerapps` are read from the Azure pack
  once you fetched it; `entra` is read from the cache if it is there. A render does not download any of them.
- **The only fetcher a user runs.** `tools/fetch_icons.py` is upstream's maintainer script, kept unmodified and not in
  the npm package; it downloads without these pins, terms or yes, so it is not a way to get a pack.

### Legal lines

Wherever a vendor's icon is drawn, in a card or a legend, its line is drawn under the picture and ends its description:

| Pack | Line |
|---|---|
| Google Cloud | "Google Cloud and the Google Cloud logo are trademarks of Google LLC." |
| AWS | "Amazon Web Services, AWS and the AWS service icons shown are trademarks of Amazon.com, Inc. or its affiliates." |

AWS accepted this use by email to the maintainer (14 Nov 2026), and agreed on 16 Nov 2026 to its icons on this
project's own GitHub Pages site.

### What this project publishes

The repository, the npm package, the releases and the committed example pages and stills hold no vendor icon: they
are built with `UMLIMATOR_NO_PACKS=1`. Since 16 Nov 2026, the GitHub Pages site's build fetches the three packs with
their terms accepted, so its live cloud examples show the vendor icons, with their legal lines and the notice below.

### For a host

A host other than the CLI gives the same table with the model: `model.icons`, keyed `<pack>/<id>`, from icons it
fetched under the same terms. The model's `iconPacks` records the label of the pin each pack's ids were chosen from
([The model](./model.md); [`docs/module-api.md`](../module-api.md)).

Umlimator is not affiliated with, endorsed by or sponsored by Amazon Web Services, Google or Microsoft.
