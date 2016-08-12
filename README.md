# async-cookies-api
Sketching an asynchronous JavaScript cookies API for documents and workers

At present the best starting point for understanding this API is [the explainer](explainer.md). This API is inspired by and loosely based on the discussion at https://github.com/slightlyoff/ServiceWorker/issues/707 and [elsewhere](https://github.com/wicg/async-cookies-api/issues/14).

The [document-based polyfill](cookies.js) runs best in an `https` page [🔒](https://wicg.github.io/async-cookies-api/cookies_test.html) - the polyfill is also usable but some [tests](cookies_test.js) fail when run in an unsecured `http` page [🔓](http://wicg.github.io/async-cookies-api/cookies_test.html) due to its reliance on `Secure` cookie access.
