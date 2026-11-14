# Conformance: the AWS architecture diagram

Release 0.26.0 (milestone 4a, `docs/diagrams/notes/milestone-4a.md`, work package 4a.8). Support is claimed by level
(decision D3): **render** and **edit** on the subset below. No interchange: AWS publishes no diagram format, and no
claim is made of AWS's own diagram guidelines (§13).

A view of a version-2 model (`"schemaVersion": 2`) whose `diagram` is `"aws"` is an AWS diagram. It is drawn by
`lib/umlimator-all.js` (`umlimator/all`), which the CLI's page inlines; `lib/umlimator.js`, what a map host loads, draws
it as plain cards with a warning. The vocabulary is `docs/diagrams/model.md` §2, row 26; the example is
[`examples/bookshop-aws.json`](../../examples/bookshop-aws.json).

Umlimator is not affiliated with, endorsed by or sponsored by Amazon Web Services, Google or Microsoft.

## AWS's icons

AWS accepted the maintainer's request by email (14 Nov 2026) that Umlimator download the AWS Architecture Icons at a
user's request. What was asked, and what the tool does:

| Asked | Done |
|---|---|
| Never bundled | No AWS icon in the repository, the npm package, a release, the gallery, the stills, the site or CI (CI tests a synthetic pack, `tests/packs.py`) |
| Downloaded only when the user asks, from the pinned official address, checked by SHA-256 | `umlimator.py pack fetch aws` only; `icons/packs.json`'s `aws` row pins AWS's `Icon-package_07312026` zip by address, size (13,988,918 bytes) and SHA-256 (`d2d166c4…dc6526`). A render, `check`, `stills`, `pdf`, the MCP server and the module never download it |
| AWS's terms shown and a yes first | The row's terms, then the not-affiliated line, before any byte; a yes typed at a terminal, or `--accept-terms aws@2026-07-31` given by the user who read them |
| Cached on the user's machine | `<icon cache>/packs/aws/2026-07-31/` (`~/.cache/umlimator/icons`, or `$UMLIMATOR_ICON_CACHE`) |
| Icons unmodified, the service name beside each | Each icon through `<image>`, scaled with `meet`, never clipped, filtered, masked, faded or transformed; the full service name under the label on its card and in the legend |
| A not-affiliated line and AWS's trademark line | The line above, in the terms prompt, `pack list` and the docs; under any picture that draws an AWS icon, inside its bounds, and at the end of its legend and `describe()`: "Amazon Web Services, AWS and the AWS service icons shown are trademarks of Amazon.com, Inc. or its affiliates." |

## The subset

| In the model | Drawn as |
|---|---|
| `aws.Group`, `props.groupType` one of `cloud`, `account`, `region`, `availability-zone`, `vpc`, `public-subnet`, `private-subnet`, `security-group`, `generic` | A box titled "<label> [<kind>]", dashed for a region and an availability zone, nested by `parent`; holding nothing shown, a card of that title |
| `aws.Service`, `aws.Resource`, `props.icon` an id of the pinned pack (`Amazon-Simple-Storage-Service`, `Amazon-VPC_NAT-Gateway`, `Users`) | The family's card: the icon at 32 px on the logo tile, the label, the full service name under it; with no icon given or fetched, a 24 px outlined square and "icon not available" in its name |
| `aws.Connection` | Solid, an open arrow at `to`, its label cut at 280 px; from or to a group, it ends on the group's border |

An icon id is the name of the pack's 64 px service icon (`Arch_<id>_64.svg`) or 48 px resource icon (`Res_<id>_48.svg`,
the general icons' light set); the name drawn is the id with hyphens as spaces, or the row's `names` entry
(`Amazon-VPC_NAT-Gateway` is "Amazon VPC NAT Gateway"). Three ids are filed twice in the zip
(`AWS-Compute-Optimizer`, `AWS-Management-Console`, `Amazon-Kinesis-Video-Streams`); the first is used.

Rules: `group-kind`, `line-inside` (errors); `group-nesting`, `icon-set`, `icon-missing` (warnings), as for the family
(`notes/milestone-4a.md` §5.5). `umlimator.py check` names an id the fetched pack lacks with the nearest three.

## Fidelity

| Output | Carries |
|---|---|
| The page, SVG and PNG | The icons the host gave (the CLI: the fetched pack) and the trademark line; without the pack, glyphs and full names |
| The PDF | The same, and the tables: a service's full name, icon id and group |
| This project's examples, gallery and atlas | Glyphs only: they are rendered with `UMLIMATOR_NO_PACKS=1` |

## Left out

Group icons and AWS's group colours (decision 10); a picker of the pack's icons (decision 9); AWS's PowerPoint toolkit
and category icons; any icon size but the service 64 px and resource 48 px ones.
