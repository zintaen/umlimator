---
title: "AWS diagram"
description: "Accounts, regions, VPCs, subnets and the services in them: one example that shows all it draws, live, how to write it, and what is drawn and left out."
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json, tools/types.json, tools/types.md and docs/diagrams/conformance/: edit those, not this file. -->

# AWS diagram

<p class="ex-lead">Accounts, regions, VPCs, subnets and the services in them. The bookshop on AWS: shoppers reach DNS and a CDN, which serves the storefront files and passes the api to a load balancer in a VPC across two availability zones, with the database, the order queue and its workers, logs and a separate log archive account. The page below opens on it, <a href="/umlimator/examples/types/aws.html#view=on-aws" target="_self">The bookshop on AWS</a>, live: pan, zoom, select and go into the cards that stack.</p>

<div class="ex-frame"><iframe src="/umlimator/examples/types/aws.html" title="AWS diagram, live" loading="lazy"></iframe></div>
<div class="ex-links"><a href="/umlimator/examples/types/aws.html" target="_self">Open full screen<span class="visually-hidden"> (AWS)</span></a><a href="/umlimator/examples/types/aws.pdf" target="_self">PDF<span class="visually-hidden"> (AWS)</span></a><a href="/umlimator/examples/types/aws.json" target="_self">Model<span class="visually-hidden"> (AWS)</span></a></div>

## What it shows {#shows}

<p>In the order you find them in the picture:</p>

<ol class="ex-shows">
<li>A resource outside the cloud with its icon and full name (Shoppers, Users)</li>
<li>Connections, solid with an open arrow and a label (looks up, HTTPS, storefront, /api)</li>
<li>The cloud group, AWS Cloud [Cloud], holding global services (DNS, Amazon Route 53; CDN, Amazon CloudFront)</li>
<li>An account group, Bookshop production [Account]</li>
<li>A region group drawn dashed, Europe (Ireland) [Region]</li>
<li>Each service card with its icon, its label and the full service name under it (Storefront files, Amazon Simple Storage Service)</li>
<li>A VPC group, Bookshop VPC [VPC]</li>
<li>Availability zone groups drawn dashed, two of them (eu-west-1a, eu-west-1b)</li>
<li>Private subnet groups, one in each zone</li>
<li>A security group holding a service, nested four groups inside the VPC (Database security group around Database, primary)</li>
<li>A public subnet group holding a resource (NAT gateway, Amazon VPC NAT Gateway)</li>
<li>A connection from a group, ending on its border (Private subnet to NAT gateway, outbound; the VPC to the Order queue and to Logs and alarms)</li>
<li>A generic group, Order workers [Group], two functions inside, and a connection ending on its border (triggers)</li>
<li>A group whose content the view does not show, drawn as a card of its title, a connection ending on it (Log archive [Account], archived)</li>
</ol>

## How to write it {#model}

The view's `diagram`, the types its elements, members and lines may have, and its props types, which describe `props` (every field in them is optional). The element envelope, typed views and the props all UML types share are on [Typed diagrams](../api/typed-diagrams.md).

`diagram: 'gcp'`, `'azure'` or `'aws'`. Groups own what they hold by `parent`. A service's icon is drawn from the model's `icons` table at `<pack>/<props.icon>`, else as a glyph with its full name; the module never fetches an icon.

| Type | Values |
|---|---|
| `GcpElementType` | `gcp.Zone`, `gcp.Product`, `gcp.User` |
| `GcpLineType` | `gcp.Path` |
| `AzureElementType` | `azure.Group`, `azure.Service` |
| `AzureLineType` | `azure.Connector` |
| `AwsElementType` | `aws.Group`, `aws.Service`, `aws.Resource` |
| `AwsLineType` | `aws.Connection` |
| `CloudElementProps` | `zoneType` (on `gcp.Zone`), `groupType` (on `azure.Group` and `aws.Group`), `icon` (the pinned pack's own id, such as `Cloud-Run`) |

## What is drawn and left out {#conformance}

<!-- the conformance note, as written: docs/diagrams/conformance/aws.md -->

Release 0.26.0 (milestone 4a, `docs/diagrams/notes/milestone-4a.md`, work package 4a.8). Support is claimed by level
(decision D3): **render** and **edit** on the subset below. No interchange: AWS publishes no diagram format, and no
claim is made of AWS's own diagram guidelines (§13).

A view of a version-2 model (`"schemaVersion": 2`) whose `diagram` is `"aws"` is an AWS diagram. It is drawn by
`lib/umlimator-all.js` (`umlimator/all`), which the CLI's page inlines; `lib/umlimator.js`, what a map host loads, draws
it as plain cards with a warning. The vocabulary is `docs/diagrams/model.md` §2, row 26; the example is
[`examples/bookshop-aws.json`](../../examples/bookshop-aws.json).

Umlimator is not affiliated with, endorsed by or sponsored by Amazon Web Services, Google or Microsoft.

### AWS's icons

AWS accepted the maintainer's request by email (14 Nov 2026) that Umlimator download the AWS Architecture Icons at a
user's request. What was asked, and what the tool does:

| Asked | Done |
|---|---|
| Never bundled | No AWS icon in the repository, the npm package, a release, the committed gallery and stills or CI's tests (CI tests a synthetic pack, `tests/packs.py`). The site: see below |
| Downloaded only when the user asks, from the pinned official address, checked by SHA-256 | `umlimator.py pack fetch aws` only; `icons/packs.json`'s `aws` row pins AWS's `Icon-package_07312026` zip by address, size (13,988,918 bytes) and SHA-256 (`d2d166c4…dc6526`). A render, `check`, `stills`, `pdf`, the MCP server and the module never download it |
| AWS's terms shown and a yes first | The row's terms, then the not-affiliated line, before any byte; a yes typed at a terminal, or `--accept-terms aws@2026-07-31` given by the user who read them |
| Cached on the user's machine | `<icon cache>/packs/aws/2026-07-31/` (`~/.cache/umlimator/icons`, or `$UMLIMATOR_ICON_CACHE`) |
| Icons unmodified, the service name beside each | Each icon through `<image>`, scaled with `meet`, never clipped, filtered, masked, faded or transformed; the full service name under the label on its card and in the legend |
| A not-affiliated line and AWS's trademark line | The line above, in the terms prompt, `pack list` and the docs; under any picture that draws an AWS icon, inside its bounds, and at the end of its legend and `describe()`: "Amazon Web Services, AWS and the AWS service icons shown are trademarks of Amazon.com, Inc. or its affiliates." |

On 16 Nov 2026, the maintainer reports, AWS agreed to its icons on this project's own GitHub Pages site. Since then the
site's build fetches the pack with `--accept-terms aws@2026-07-31`, as a user would, so the AWS example there shows the
real icons with the trademark line and the not-affiliated line; the table above (14 Nov 2026) is kept as it was answered,
and every other output in its first row stays icon-free (`docs/diagrams/notes/milestone-4a.md` §16).

### The subset

| In the model | Drawn as |
|---|---|
| `aws.Group`, `props.groupType` one of `cloud`, `account`, `region`, `availability-zone`, `vpc`, `public-subnet`, `private-subnet`, `security-group`, `generic` | A box titled "<label> [<kind>]", dashed for a region and an availability zone, nested by `parent`; holding nothing shown, a card of that title |
| `aws.Service`, `aws.Resource`, `props.icon` an id of the pinned pack (`Amazon-Simple-Storage-Service`, `Amazon-VPC_NAT-Gateway`, `Users`) | The family's card: the icon at 32 px on the logo tile, the label, the full service name under it; with no icon given or fetched, a 24 px outlined square and "icon not available" in its name |
| `aws.Connection` | Solid, an open arrow at `to`, its label cut at 280 px; from or to a group, it ends on the group's border |

An icon id is the name of the pack's 64 px service icon (`Arch_<id>_64.svg`) or 48 px resource icon (`Res_<id>_48.svg`,
the general icons' light set); the name drawn is the row's `names` entry, read with no pack fetched too, else the id with hyphens and underscores as spaces
(`Amazon-VPC_NAT-Gateway` is "Amazon VPC NAT Gateway"). Three ids are filed twice in the zip
(`AWS-Compute-Optimizer`, `AWS-Management-Console`, `Amazon-Kinesis-Video-Streams`); the first is used.

Rules: `group-kind`, `line-inside` (errors); `group-nesting`, `icon-set`, `icon-missing` (warnings), as for the family
(`notes/milestone-4a.md` §5.5). `umlimator.py check` names an id the fetched pack lacks with the nearest three.

### Fidelity

| Output | Carries |
|---|---|
| The page, SVG and PNG | The icons the host gave (the CLI: the fetched pack) and the trademark line; without the pack, glyphs and full names |
| The PDF | The same, and the tables: a service's full name, icon id and group |
| This project's committed examples, gallery and atlas | Glyphs only: they are rendered with `UMLIMATOR_NO_PACKS=1` |
| The GitHub Pages site (since 16 Nov 2026) | The real icons and the trademark line: its build fetches the pack |

### Left out

Group icons and AWS's group colours (decision 10); a picker of the pack's icons (decision 9); AWS's PowerPoint toolkit
and category icons; any icon size but the service 64 px and resource 48 px ones.
