# Cookie Store API Explainer

This proposal has the following main goals.

* Expose HTTP cookies to service workers.
* Offer an asynchronous alternative to `document.cookie`.

While accomplishing the goals above, the proposal gained the following
nice-to-have properties.

* Cookies expose the parsed components of the cookie-related HTTP headers.
  Script does not need to parse or serialize HTTP headers.

* The APIs have a well-defined mechanism for reporting cookie storage errors.
  Script does not need to issue a read request to verify the result of the
  previous write request.

* The APIs side-step some of the known cross-browser incompatibilities, and
  differences between specification and browser behavior.

The proposal does **not** aim to change the cookie security model, or how
cookies are handled at the network layer.

The proposal is also known as the *Async Cookies API*.

## Use Cases

Cookies are used most often for authentication. In this case, the relevant
cookies are generally called session cookies, and the state embedded in them
tends to be called session state. Documents generally update the current page UI
in response to changes in the session state. Service workers also need to react
to session state changes, to clean up private cached data.

Cookies have also found a niche in storing user decisions to opt out of tracking
by ad networks, and receive less personalized ads.

Separetly, from a conceptual angle, a service worker is intended to be an
HTTP proxy for the pages under its scope. By this principle, service workers
must be able to read and modify the cookies accessible to pages under their
scopes.

### Reacting to session state changes

While the previous samples are mostly aimed at updating a
page's UI to reflect


The following code illustrates synchronous polling via `document.cookie`. The
code periodically induces jank, as `document.cookie` is a synchronous call
that blocks the main thread on disk I/O, if the cookie value isn't cached in
memory, and/or on IPC, if the cookie cache does not reside in the same
process as the Document execution context.

```javascript
function decode_document_cookie(value) {
  // Simplified version of the code at https://github.com/js-cookie/js-cookie.
  const cookie_strings = value.split('; ');
  const cookies = {};
  for (const cookie_string of cookie_strings) {
    const index = cookie_string.indexOf('=');
    const name = cookie_string.substring(0, index);
    const encoded_value = cookie_string.substring(index + 1);
    cookies[name] = decodeURIComponent(encoded_value);
  }
  return cookies;
}

let old_value = null;
function poll(duration_ms, cookie_name, handle_cookie_change) {
  const cookies = decode_document_cookie(document.cookie);
  const newValue = (cookie_name in cookies) ? cookies[cookie_name] : null;
  if (old_value !== new_value) {
    handle_cookie_change(new_value);
    old_value = new_value;
  }
  setTimeout(() => {
    poll(duration_ms, cookie_name, handle_cookie_change);
  }, duration_ms);
}
```

The following code snippet uses the Cookie Store API instead of
`document.cookie`. The Cookie Store API doesn't block the main thread, so this
version does not introduce jank.

```javascript
let old_value = null;
async function poll(duration_ms, cookie_name, handle_cookie_change) {
  while (true) {
    const cookie = await cookieStore.get(cookie_name);
    const new_value = cookie ? cookie.value : null;
    if (new_value !== old_value) {
      handle_cookie_change(cookie_name, new_value);
      old_value = new_value;
    }
    await delayedPromise(duration_ms);
  }
}
```

The following code snippet uses change events in the Cookie Store API. This has
less overhead than asynchronous polling when the session cookies change rarely.

```javascript
function poll(cookie_name, handle_cookie_change) {
  cookieStore.addEventListener('change', (event) => {
    for (const cookie of event.changed) {
      if (cookie.name === cookie_name)
        handle_cookie_change(cookie.value);
    }
    for (const cookie of event.deleted) {
      if (cookie.name === cookie_name)
        handle_cookie_change(null);
    }
  });
}
```

Last, the following code snippet uses the service worker change events in the
Cookie Store API. The change handler will be executed even if the site isn't
currently opened in a browser tab / window.

```javascript
const kCookieName = 'session';

self.addEventListener('install', (event) => {
  event.waitFor(async () => {
    await cookieStore.subscribeToChanges([{ name: kCookieName }]);
  });
});

self.addEventListener('cookiechange', (event) => {
  for (const cookie of event.changed) {
    if (cookie.name === kCookieName)
      handle_session_change(cookie.name, cookie.value);
  }
  for (const cookie of event.deleted) {
    if (cookie.name === kCookieName)
      handle_session_change(cookie.name, null);
  }
});
```

### Opting out of tracking

The following code snippet illustrates a solution based on the synchronous
`document.cookie` settter. This induces jank, as the setter must block the
main thread until the cookie change is propagated to the network stack,
because Web developers expect that the cookie change would be reflected in a
`fetch` API call following the assignment to `document.cookie`.

```javascript
document.getElementById('opt-out-button').addEventListener('click', () => {
  document.cookie = 'opt_out=1; Expires=Wed, 1 Jan 2025 00:00:00 GMT; Secure';
});
document.getElementById('opt-in-button').addEventListener('click', () => {
  // Cookies are deleted by setting their expiration dates in the past.
  document.cookie = 'opt_out=0; Expires=Thu, 1 Jan 1970 00:00:00 GMT; Secure';
});
```

The following code snippet uses the Cookie Store API instead, and does not jank
the main thread.

```javascript
document.getElementById('opt-out-button').addEventListener('click', () => {
  await cookieStore.set({ name: 'opt_out', value: '1',
                          expires: new Date('Wed, 1 Jan 2025 00:00:00 GMT') });
});
document.getElementById('opt-in-button').addEventListener('click', () => {
  await cookieStore.delete({ name: 'opt_out' });
});
```

## The Query API

Both documents and service workers access the same query API, via the
`cookieStore` property on the global object.

All methods in the query API return
[Promises](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise).

### Read a cookie


```javascript
try {
  const cookie = await cookieStore.get('session_id');
  if (cookie) {
    console.log(`Found ${cookie.name} cookie: ${cookie.value}`);
  } else {
    console.log('Cookie not found');
  }
} catch (e) {
  console.error(`Cookie store error: ${e}`);
}
```

### Read multiple cookies

```javascript
try {
  const cookies = await cookieStore.getAll({
    name: 'session_',
    matchType: 'starts-with',
  });
  for (const cookie of cookies)
    console.log(`Result: ${cookie.name} = ${cookie.value}`);
} catch (e) {
  console.error(`Cookie store error: ${e}`);
}
```

`get` is essentially a form of `getAll` that only returns the first result.
In Document contexts, `await cookieStore.getAll()` is an equivalent of
`document.cookie`.

In other words, `get` and `getAll` take the same arguments, which can be
* an optional dictionary of options
* a name and an optional dictionary of options; in this case, the bag must not
  contain the `name` properties


### Read the cookies for a specific URL

Cookies are URL-scoped, so pages

```javascript
await cookieStore.getAll({url: '/admin'});
```

Service workers can obtain the list of cookies that would be sent by a fetch to
any URL under their scope.

Documents can only obtain the cookies at their current URL. In other words,
the only valid `url` value in Document contexts is the document's URL.

## The Modifications API

Both documents and service workers access the same modification API, via the
`cookieStore` property on the global object.

### Write a cookie

```javascript
try {
  await cookieStore.set('opted_out', '1');
} catch (e) {
  console.error(`Failed to set cookie: ${e}`);
}
```

The `cookieStore.set()` call above is a shorthand for the following.

```javascript
await cookieStore.set({
  name: 'opted_out',
  value: '1',
  expires: null,  // session cookie

  // By default, cookies are scoped at the current domain.
  domain: self.location.host,
  path: '/',

  // Creates secure cookies by default on secure origins.
  secure: self.location.protocol === 'https:',
  httpOnly: false,
});
```

### Delete a cookie

```javascript
try {
  await cookieStore.delete('session_id');
} catch (e) {
  console.error(`Failed to delete cookie: ${e}`);
}
```

The `document.cookie` approach of deleting a cookie by moving the cookie's
expiration date to the past still works.

```javascript
try {
  await cookieStore.set('session_id', 'value will be ignored',
                        { expires: Date.now() - 86400 });
} catch (e) {
  console.error(`Failed to delete cookie: ${e}`);
}
```

### Access all the cookie data

The objects returned by `get` and `getAll` contain all the information in the
cookie store, not just the name and the value.

```javascript
await cookie = cookieStore.get('session_id');
console.log(`Cookie scope - Domain: ${cookie.domain} Path: ${cookie.path}`);
if (cookie.expires === null) {
  console.log('Cookie expires at the end of the session');
} else {
  console.log(`Cookie expires at: ${cookie.expires}`);
}
if (cookie.secure)
  console.log('The cookie is restricted to secure origins');
```


## The Change Events API

This proposal includes an API for observing cookie changes, which aims to
address all the use cases that currently require polling `document.cookie`. The
API has the following steps:

1. Express an interest in observing cookie changes
2. Handle cookie change events

### Get change events in documents

```javascript
cookieStore.addEventListener('change', (event) => {
  console.log(`${event.changed.length} changed cookies`);
  for (const cookie in event.changed)
    console.log(`Cookie ${cookie.name} changed to ${cookie.value}`);
  console.log(`${event.deleted.length} deleted cookies`);
  for (const cookie in event.deleted)
    console.log(`Cookie ${cookie.name} deleted`);
});
```

TODO: Add JSON output for the relevant properties of the event.

The API is designed to allow browsers to batch change events, for performance
reasons.

### Get change events in service workers

Service workers have to subscribe for change events during the install stage,
and start receiving events when activated.

```javascript
self.addEventListener('install', (event) => {
  event.waitFor(async () => {
    await cookieStore.subscribeToChanges([{
      name: 'session',  // Get change events for session-related cookies.
      matchType: 'starts-with',  // Matches session_id, session-id, etc.
    }]);
  });
});

self.addEventListener('cookiechange', (event) => {
  // The event has |changed| and |deleted| properties with
  // the same semantics as the Document events.
  console.log(`${event.changed.length} changed cookies`);
  console.log(`${event.deleted.length} deleted cookies`);
});
```

Calls to `subscribeToChanges()` are cumulative, so that independently maintained
modules or libraries can set up their own subscriptions. As expected, a service
worker's subscriptions are persisted for the worker's lifetime.

Subscriptions can use the same options as `cookieStore.get` /
`cookieStore.getAll`. The complexity of fine-grained subscriptions is justified
by the cost of dispatching an irrelevant cookie change event to a service
worker, which is is much higher than the cost of dispatching an equivalent event
to a Document. Specifically, dispatching an event to a service worker might
require waking up the worker, which has a significant impact on battery life.


## Security Model

This proposal aims to preserve the current security model for cookies. In most
situations, this principle means deferring to RFC 6265bis.

### The HttpOnly flag

The modification API can be used to set HttpOnly cookies. Neither the query
nor the monitoring API will include HttpOnly cookies in their results. This
matches the behavior of `document.cookie`.

### The Secure flag

The modification API defaults the `secure` (HTTPS-only) flag to true for
secure origins. This is an intentional difference from `document.cookie`,
which always defaults to insecure cookies.

The modification API disallows modifying (overwriting or deleting) a secure
cookie from a non-secure origin, following a
[recent proposal](https://tools.ietf.org/html/draft-ietf-httpbis-cookie-alone-01).

### Names and Values

The modification API refuses to write a cookie whose name is the empty string
if its value contains `=`. This avoids an ambiguous serialization problem in
some current browsers.

This proposal enforces the
[special cookie name prefixes](https://tools.ietf.org/html/draft-ietf-httpbis-cookie-prefixes-00)
`__Host-` and `__Secure-`. Specifically, the modification API rejects changes
where the name contains one of the special prefixes, but the `domain` or
`secure` options don't match the values implied by the special prefix.

The modification API serializes cookie names and values using UTF-8.

### The Scope (Path & Domain)

The guiding principle behind handling cookie scopes is providing equivalent
capabilities to the `document.cookie` API. We interpret this as follows.

* Document contexts may perform (roughly) the same operations that
  `document.cookie` would allow.
* A service worker may perform an operation if at least one document under its
  scope would be able to use `document.cookie` to perform that operation.
* The path in a scope is not considered reliable for security purposes. This
  matches the stance in the `document.cookie` specification, which points out
  that `<iframe>`s can be used to access the cookie list for different paths in
  the current origin.

#### Paths

This proposal intentionally diverges from `document.cookie` in the handling of
paths, for the purpose of ending up with a simpler model.

The modification API
* defaults paths to `/`
* rejects relative paths (not starting with `/`)
* adds `/` to the end of the paths that don't end in `/`

Note that while cookies created by the modification API are guaranteed to have
absolute paths that are directories, the query and change event API must still
handle cookies created by HTTP headers and by the `document.cookie` setter.

#### Domains

The modification API defaults to domain-less cookies, which are bound to the
current origin.

The modification API accepts any domain that matches the current origin's
eTLD+1. This deviation from the same origin policy is unintuitive, but
matches the current `document.cookie` capabilities. This proposal does not
aim to change this situation because the domain flexibility is an integral part
of authentication on the Web today.

TODO: Can we restrict `domain` to the current origin's subdomains and
super-domains (up to eTLD+1)?

#### URLs

The query and change event APIs
* remove the last path segment from URLs that don't end in `/`
* resolve relative URLs based on the current document / service worker's URL

The current document / service worker URL can only become
relevant for cookies created by `document.cookie` or by HTTP responses.

Document contexts may only use the current document's URL into the query API.
The change events API exposed to documents does not accept URLs.

Service workers may pass any URL under their scopes into the query or
change event API.

### Expiration Dates

This proposal side-steps date parsing issues by only accepting
[timestamps](https://heycam.github.io/webidl/#DOMTimeStamp)
(milliseconds since UNIX epoch), like
[the lastModified attribute](https://w3c.github.io/FileAPI/#file-attrs) in the
File API.

JavaScript Date objects will be automatically converted to timestamps thanks to
[implicit conversions](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/valueOf).


## Subtleties

Tutorials on this feature might want to cover the following topics.

### Data Races

Cookie store operations are guaranteed to have completed when their promises are
resolved. Failure to await the results can lead to the following races.

#### Write Race

BAD

```javascript
await cookieStore.set('cookie-name', 'old');
cookieStore.set('cookie-name', 'new');  // Missing "await".
// The cookieStore.set and the fetch operations are racing.
// The beacon may include cookie-name=old or cookie-name=new.
navigator.sendBeacon('/analytics');
```

GOOD

```javascript
await cookieStore.set('cookie-name', 'old');
await cookieStore.set('cookie-name', 'new');
// The beacon is guaranteed to include cookie-name=new.
navigator.sendBeacon('/analytics');
```

#### Read Race

BAD

```javascript
await cookieStore.delete('session-id');
fetch('/auth');  // The response inclues the HTTP header Cookie: session-id=new.
const cookie = await cookieStore.get('session-id');
// The fetch response processing and the cookieStore.get operations are racing.
// |cookie| may be null or a dictionary including {name: "session-id"}.
console.log(cookie);
```

GOOD

```javascript
await cookieStore.delete('session-id');
const response = await fetch('/auth');
const cookie = await cookieStore.get('session-id');
// |cookie| is guaranteed to be a dictionary including {name: "session-id"}.
console.log(cookie);
```

### Cookie Store Caching

A reasonable usage pattern for this API is obtaining a baseline snapshot of the
cookie store via the query API and using the change event API to keep the
snapshot in sync with the browser. This is more difficult than it might
appear.

TODO: Write up a recommended pattern for this use case or remove it.

### Error Handling

The APIs in this proposal signal errors by rejecting their promises. In most
situations, this outcome is better than the silent failures in the
`document.cookie` setter, and than the empty string results in the corresponding
getter.

However, the APIs will also reject their promises due to implementation-specific
limitations, such as overly long cookie names or values, expiration dates too
far in the future, permissions denied by the user, or internal errors. These
limitations are not consistent across browsers, so developers must have the
foresight to handle errors they might not experience while building their sites.


## Related Work

[RFC 6265bis](https://tools.ietf.org/html/draft-ietf-httpbis-rfc6265bis-02)
explains HTTP cookies. Cookies were implemented independently in separate HTTP
stacks without a comprehensive testing suite, leading to visible cross-browser
incompatibilities. The RFC explains many of these incompatibilities and lays out
a path for a new implementation to maximize its interoperability with the
existing software landscape.

[document.cookie](https://www.w3.org/TR/html/dom.html#dom-document-cookie)
implements synchronous access to the list of cookies associated with the
document's URL. `document.cookie`
[deviates from the cookies RFC](https://github.com/whatwg/html/issues/804).
The synchronous model is
[non-trivial to implement in modern browsers](https://lists.w3.org/Archives/Public/public-whatwg-archive/2009Sep/0083.html).

[navigator.cookieEnabled](https://www.w3.org/TR/html/webappapis.html#cookies)
aims to predict whether setting a cookie will succeed or not.

[cookie change events](https://github.com/patrickkettner/cookie-change-events)
is a concurrently developed API proposal that also addresses the synchronous
nature of `document.cookie`.

[inikulin/cookie-compat](https://github.com/inikulin/cookie-compat) is a test
suite that highlights differences between RFC 6265bis and the way current
browsers handle cookies.

The
[Google+ API](https://developers.google.com/+/web/api/javascript#gapiinteractivepost_interactive_posts)
is a prominent library that identifies cookies based on a name prefix, and
therefore needs the `matchType: 'starts-with'` option in the query API.

The [chrome.cookies](https://developers.chrome.com/extensions/cookies)
API (and the [WebExtensions adaptation of the
API](https://developer.mozilla.org/en-US/Add-ons/WebExtensions/API/cookies))
provides very similar functionality for trusted code added to
browsers, but is not restricted by the same-origin policy.
