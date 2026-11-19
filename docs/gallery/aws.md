---
title: "AWS diagram examples"
description: "Accounts, regions, VPCs, subnets and the services in them: 3 examples, live."
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json and tools/types.json: edit those, not this file. -->

# AWS diagram examples

<p class="ex-lead">Accounts, regions, VPCs, subnets and the services in them. The page below holds its 3 examples: its overview has a card for each, and each card opens it. Pan, zoom, select and go into the cards that stack.</p>

<div class="ex-frame"><iframe src="/umlimator/examples/types/aws.html" title="AWS diagram examples, live" loading="lazy"></iframe></div>
<div class="ex-links"><a href="/umlimator/examples/types/aws.html" target="_self">Open full screen<span class="visually-hidden"> (AWS)</span></a><a href="../conformance/aws.html">Conformance<span class="visually-hidden"> (AWS)</span></a><a href="/umlimator/examples/types/aws.pdf" target="_self">PDF<span class="visually-hidden"> (AWS)</span></a><a href="/umlimator/examples/types/aws.json" target="_self">Model<span class="visually-hidden"> (AWS)</span></a></div>

## The examples {#examples}

<div class="ex-variants">
<article class="ex-variant" id="view-bookshop-aws-aws-on-aws">
<h3><a href="/umlimator/examples/types/aws.html#view=bookshop-aws-aws-on-aws" target="_self">Bookshop on AWS</a></h3>
<p class="ex-sub">accounts, VPCs, subnets, services</p>
<p>Accounts, regions, VPCs, availability zones, subnets and security groups as nested boxes, each service or resource a card with its icon and full service name. On this site the icons are the vendor's own, fetched with AWS's terms accepted; in a copy of this repository the diagram draws glyphs until you fetch them with <code>umlimator.py pack fetch aws</code>. Umlimator is not affiliated with, endorsed by or sponsored by Amazon Web Services, Google or Microsoft.</p>
</article>
<article class="ex-variant" id="view-serverless-serverless">
<h3><a href="/umlimator/examples/types/aws.html#view=serverless-serverless" target="_self">Serverless, no VPC</a></h3>
<p class="ex-sub">serverless, a generic group</p>
<p>A cycle hire API with no VPC: a region holding managed services, a generic group of functions that a line leaves from its border, and riders on a mobile client.</p>
</article>
<article class="ex-variant" id="view-accounts-accounts">
<h3><a href="/umlimator/examples/types/aws.html#view=accounts-accounts" target="_self">Two accounts</a></h3>
<p class="ex-sub">two accounts, a security group</p>
<p>A library's production account and its log archive account side by side in one cloud, a VPC, a private subnet and a security group nested in turn, and a line from the VPC's border to a bucket in the other account.</p>
</article>
</div>
