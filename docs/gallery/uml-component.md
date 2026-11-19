---
title: "Component diagram"
description: "Components and the interfaces they provide and require: one example that shows all it draws, live."
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json and tools/types.json: edit those, not this file. -->

# Component diagram

<p class="ex-lead">The bookshop's software as components: the Shop API holding its Basket and Checkout, the Storefront that calls it, sign-in from the accounts package, the outside payment provider, the order worker and the jar the API ships in. The page below opens on it, <a href="/umlimator/examples/types/uml-component.html#view=components" target="_self">The bookshop's components</a>, live: pan, zoom, select and go into the cards that stack.</p>

<div class="ex-frame"><iframe src="/umlimator/examples/types/uml-component.html" title="Component diagram, live" loading="lazy"></iframe></div>
<div class="ex-links"><a href="/umlimator/examples/types/uml-component.html" target="_self">Open full screen<span class="visually-hidden"> (Component)</span></a><a href="../conformance/uml-component.html">Conformance<span class="visually-hidden"> (Component)</span></a><a href="/umlimator/examples/types/uml-component.pdf" target="_self">PDF<span class="visually-hidden"> (Component)</span></a><a href="/umlimator/examples/types/uml-component.json" target="_self">Model<span class="visually-hidden"> (Component)</span></a></div>

## What it shows {#shows}

<p>In the order you find them in the picture:</p>

<ol class="ex-shows">
<li>A package drawn as a box holding a component and a class (accounts)</li>
<li>Components as rectangles with UML's component icon at the top right</li>
<li>A class realizing a component: dashed, a hollow triangle at the component (SessionStore to Accounts and sign-in)</li>
<li>An interface drawn as a rectangle with &lt;&lt;interface&gt;&gt; and its operation (SignIn)</li>
<li>A provided interface as a rectangle: dashed, a hollow triangle (Accounts and sign-in provides SignIn)</li>
<li>A required interface as a rectangle: dashed, an open arrowhead and &lt;&lt;use&gt;&gt; (Shop API uses SignIn)</li>
<li>A dependency with a stereotype: &lt;&lt;call&gt;&gt; from Order worker to Shop API</li>
<li>An artifact with &lt;&lt;artifact&gt;&gt; and UML's document icon (shop-api.jar)</li>
<li>A manifestation: dashed, an open arrowhead, &lt;&lt;manifest&gt;&gt; (shop-api.jar to Shop API)</li>
<li>A note linked to the artifact by a dashed line</li>
<li>A component holding components, drawn as a box with its name and icon in the header (Shop API holding Basket and Checkout)</li>
<li>Ports as small squares on their owners' borders, each named beside it</li>
<li>A delegation inward: a solid line with an open arrowhead from Shop API's orders port to Basket's</li>
<li>An assembly connector joining two parts directly (Basket and Checkout)</li>
<li>A delegation outward, from Checkout's payments port to Shop API's</li>
<li>An assembly connector between the ports of two components (Shop API's payments to Payment provider's charges)</li>
<li>A typed port, named <code>name : Type</code> (charges : Charging)</li>
<li>A provided interface as a ball on a plain stem, from a port (Orders, provided at Shop API's orders port)</li>
<li>A required interface as a socket, a half circle round the ball (Storefront requires Orders)</li>
<li>A component with a stereotype: &lt;&lt;web app&gt;&gt; over Storefront</li>
</ol>

## In another setting {#alternatives}

<p>The same example, where a setting cannot share the picture above:</p>

<div class="ex-variants">
<article class="ex-variant" id="view-components-down">
<h3><a href="/umlimator/examples/types/uml-component.html#view=components-down" target="_self">The same components, laid out down</a></h3>
<p>Laid out down (<code>direction</code> <code>down</code>) instead of right: the same components, ports, interfaces and lines.</p>
</article>
</div>
