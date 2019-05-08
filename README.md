# Cookie Store API

[![Build Status](https://travis-ci.org/WICG/cookie-store.svg?branch=gh-pages)](https://travis-ci.org/WICG/cookie-store)

This repository documents an API for accessing HTTP cookies asynchronously from
Document and Service Worker global contexts.

* [The explainer](explainer.md) is a developer-oriented preview of the API.
* [The specification draft](https://wicg.github.io/cookie-store/) is aimed at
  browser developers.

The API has a test suite in the
[Web Platform Tests project](https://web-platform-tests.org/).

* Read the
  [test code](https://github.com/w3c/web-platform-tests/tree/master/cookie-store)
  for example usage.
* See the [test passing rates across browsers](https://wpt.fyi/cookie-store/).
* [Run the tests in your own browser](https://w3c-test.org/cookie-store/).


## Resources

This API is inspired by and loosely based on the following discussions.

* https://github.com/slightlyoff/ServiceWorker/issues/707
* https://github.com/WICG/async-cookies-api/issues/14

[cookie change events](https://github.com/patrickkettner/cookie-change-events)
is a concurrently developed API proposal that also addresses the synchronous
nature of `document.cookie`.

The Cookie Store API has also been discussed in the following places.

* [WICG discourse thread](https://discourse.wicg.io/t/rfc-proposal-for-an-asynchronous-cookies-api/1652)
* [Blink intent-to-implement](https://groups.google.com/a/chromium.org/d/msg/blink-dev/gU-tSdjR4rA/hAYgmxiHCAAJ)

The best resource for understanding the deep technical aspects of cookies is
the most recent draft of
[RFC 6265bis](https://tools.ietf.org/html/draft-ietf-httpbis-rfc6265bis-03).

This API aims to replace
[document.cookie](https://www.w3.org/TR/html/dom.html#dom-document-cookie)
and
[navigator.cookieEnabled](https://www.w3.org/TR/html/webappapis.html#cookies).

This API is also known as the *Async Cookies API*.
