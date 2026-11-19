---
title: "AWS diagram"
description: "Accounts, regions, VPCs, subnets and the services in them: one example that shows all it draws, live."
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json and tools/types.json: edit those, not this file. -->

# AWS diagram

<p class="ex-lead">The bookshop on AWS: shoppers reach DNS and a CDN, which serves the storefront files and passes the api to a load balancer in a VPC across two availability zones, with the database, the order queue and its workers, logs and a separate log archive account. The page below opens on it, <a href="/umlimator/examples/types/aws.html#view=on-aws" target="_self">The bookshop on AWS</a>, live: pan, zoom, select and go into the cards that stack.</p>

<div class="ex-frame"><iframe src="/umlimator/examples/types/aws.html" title="AWS diagram, live" loading="lazy"></iframe></div>
<div class="ex-links"><a href="/umlimator/examples/types/aws.html" target="_self">Open full screen<span class="visually-hidden"> (AWS)</span></a><a href="../conformance/aws.html">Conformance<span class="visually-hidden"> (AWS)</span></a><a href="/umlimator/examples/types/aws.pdf" target="_self">PDF<span class="visually-hidden"> (AWS)</span></a><a href="/umlimator/examples/types/aws.json" target="_self">Model<span class="visually-hidden"> (AWS)</span></a></div>

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
