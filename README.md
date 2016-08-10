# async-cookies-api
Sketching an asynchronous JavaScript cookies API for documents and workers

At present the best starting point for understanding this API is [the explainer](explainer.md)

This is inspired by and loosely based on the discussion at https://github.com/slightlyoff/ServiceWorker/issues/707

The document-based polyfill test is hosted here in an `https` page:

🔒 https://bsittler.github.io/async-cookies-api/cookies_test.html

The polyfill is also usable but some tests fail when run in an unsecured `http` page:

🔓 <s style="color:maroon">http://bsittler.github.io/async-cookies-api/cookies_test.html </s>
