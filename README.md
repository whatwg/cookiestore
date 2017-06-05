# ⎇🍪️ async-cookies-api
Sketching an asynchronous JavaScript cookies API for documents and workers

At present the best starting point for understanding this API is [the explainer](explainer.md). This API is inspired by and loosely based on the discussion at https://github.com/slightlyoff/ServiceWorker/issues/707 and [elsewhere](https://github.com/WICG/async-cookies-api/issues/14).

The [document-based polyfill](cookies.js) runs best in [🔒&#xFE0F; an `https` page](https://wicg.github.io/async-cookies-api/cookies_test) - the polyfill is also usable but some [tests](cookies_test.js) fail when run in [⚠&#xFE0F; an unsecured `http` page](http://wicg.github.io/async-cookies-api/cookies_test.html) due to its reliance on `Secure` cookie access.

There is also a [related WICG discourse thread](https://discourse.wicg.io/t/rfc-proposal-for-an-asynchronous-cookies-api/1652) and a [Blink intent-to-implement discussion](https://groups.google.com/a/chromium.org/d/msg/blink-dev/gU-tSdjR4rA/hAYgmxiHCAAJ) for this proposal.
