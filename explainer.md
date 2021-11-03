# Cookie Store API Explainer

## Authors:
*   Ayu Ishii - [ayui@chromium.org](mailto:ayui@chromium.org)
*   Benjamin C. Wiley Sittler
*   Marijn Kruisselbrink - [mek@chromium.org](mailto:mek@chromium.org)
*   Staphany Park - [staphany@chromium.org](mailto:staphany@chromium.org)
*   Victor Costan - [pwnall@chromium.org](mailto:pwnall@chromium.org)

## Table of Contents
* [Introduction](#introduction)
* [Use Cases](#use-cases)
* [The Query API](#the-query-api)
  + [Read a cookie](#read-a-cookie)
  + [Read multiple cookies](#read-multiple-cookies)
  + [Read the cookies for a specific URL](#read-the-cookies-for-a-specific-url)
  + [Read a partitioned cookie](#read-a-partitioned-cookie)
* [The Modifications API](#the-modifications-api)
  + [Write a cookie](#write-a-cookie)
  + [Write a partitioned cookie](#write-a-partitioned-cookie)
  + [Delete a cookie](#delete-a-cookie)
  + [Delete a partitioned cookie](#delete-a-partitioned-cookie)
  + [Access all the cookie data](#access-all-the-cookie-data)
* [The Change Events API](#the-change-events-api)
  + [Get change events in documents](#get-change-events-in-documents)
  + [Get change events in service workers](#get-change-events-in-service-workers)
* [Security Model](#security-model)
  + [The HttpOnly flag](#the-httponly-flag)
  + [The Secure flag](#the-secure-flag)
  + [Names and Values](#names-and-values)
  + [The Scope (Path & Domain)](#the-scope-path--domain)
  + [Expiration Dates](#expiration-dates)
* [Subtleties](#subtleties)
  + [Data Races](#data-races)
  + [Modifying Insecure Cookies](#modifying-insecure-cookies)
  + [Error Handling](#error-handling)
* [Related Work](#related-work)

## Introduction
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

Separately, from a conceptual angle, a service worker is intended to be an
HTTP proxy for the pages under its scope. By this principle, service workers
must be able to read and modify the cookies accessible to pages under their
scopes.

### Reacting to session state changes

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

self.addEventListener('activate', (event) => {
  event.waitUntil(async () => {
    await self.registration.cookies.subscribe([{ name: kCookieName }]);
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
document.getElementById('opt-out-button').addEventListener('click', async () => {
  await cookieStore.set({ name: 'opt_out', value: '1',
                          expires: new Date('Wed, 1 Jan 2025 00:00:00 GMT') });
});
document.getElementById('opt-in-button').addEventListener('click', async () => {
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
  const cookies = await cookieStore.getAll('session_id');
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
* a name
* a dictionary of options (optional for `getAll`)


### Read the cookies for a specific URL

Cookies are URL-scoped, so fetches to different URLs may include different
cookies, even when the URLs have the same origin. The application can specify
the URL whose associated cookies will be read.

```javascript
await cookieStore.getAll({url: '/admin'});
```

Service workers can obtain the list of cookies that would be sent by a fetch to
any URL under their scope.

Documents can only obtain the cookies at their current URL. In other words,
the only valid `url` value in Document contexts is the document's URL.

### Read a partitioned cookie

If the user agent supports
[cookie partitioning](https://github.com/DCtheTall/CHIPS), then the cookie
objects will have a boolean value indicating if the cookie is partitioned.

```javascript
// Read a cookie set without the Partitioned attribute.
const cookie = await cookieStore.get('session_id');
console.log(cookie.partitioned);  // -> false

// Read a Partitioned cookie from a third-party context.
const cookie = await cookieStore.get({
  name: '__Host-third_party_session_id',
  partitioned: true
});
console.log(cookie.partitioned);  // -> true
```

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

  // By default, domain is set to null which means the scope is locked at the current domain.
  domain: null,
  path: '/'
});
```

### Write a partitioned cookie

If the user agent supports [cookie partitioning](https://github.com/WICG/CHIPS)
then you can set a partitioned cookie in a third-party context using the following.

```javascript
await cookieStore.set({
  name: '__Host-third_party_session_id',
  value: 'foobar',
  path: '/',
  sameSite: 'none',
  partitioned: true
  // `Secure` is implicitly set
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
  await cookieStore.set({
    name: 'session_id',
    value: 'value will be ignored',
    expires: Date.now() - 24 * 60 * 60 * 1000 });
} catch (e) {
  console.error(`Failed to delete cookie: ${e}`);
}
```

### Delete a partitioned cookie

If the user agent supports [cookie partitioning](https://github.com/WICG/CHIPS)
then it is possible for a site to set both a partitioned and unpartitioned
cookie with the same name.

In this edge case, if a site would like to distinguish between whether they
want to delete their partitioned and unpartitioned cookie, they can provide
a `partitioned` attribute. If the site wants to delete the partitioned cookie,
the site could use:

```javascript
await cookieStore.delete({
  name: '__Host-third_party_session_id',
  partitioned: true
});
```

If the site wants to delete the unpartitioned cookie, change the `partitioned`
field to `false`. If the field is not present, the value defaults to `false`.

### Access all the cookie data

The objects returned by `get` and `getAll` contain all the information in the
cookie store, not just the name and the value.

```javascript
const cookie = await cookieStore.get('session_id');
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
  for (const cookie of event.changed)
    console.log(`Cookie ${cookie.name} changed to ${cookie.value}`);
  console.log(`${event.deleted.length} deleted cookies`);
  for (const cookie of event.deleted)
    console.log(`Cookie ${cookie.name} deleted`);
});
```

TODO: Add JSON output for the relevant properties of the event.

The API is designed to allow browsers to batch change events, for performance
reasons.

### Get change events in service workers

```javascript
self.addEventListener('cookiechange', (event) => {
  // The event has |changed| and |deleted| properties with
  // the same semantics as the Document events.
  console.log(`${event.changed.length} changed cookies`);
  console.log(`${event.deleted.length} deleted cookies`);
});
```

Subscriptions can use the same options as `cookieStore.get` /
`cookieStore.getAll`. The complexity of fine-grained subscriptions is justified
by the cost of dispatching an irrelevant cookie change event to a service
worker, which is is much higher than the cost of dispatching an equivalent event
to a Document. Specifically, dispatching an event to a service worker might
require waking up the worker, which has a significant impact on battery life.

#### Subscribing/unsubscribing service workers to change events

All service workers under the same registration operate on a single set of
subscriptions that lives on the registration. This pattern is also seen
in the Push API and Periodic Background Sync API, where push subscriptions and
sync registrations, respectively, are aggregated under the service worker
registration. Due to the need for permission prompts, however, these two APIs
restrict registration changes to the window context, while the Cookie Store API
allows subscription modifications from both the window and service worker
contexts.

The main disadvantage of this pattern is that each service worker must account
for subscriptions registered by other versions. To avoid cross-contamination, it
is recommended to always wait until the 'activate' event before snapshotting or
modifying cookie change subscriptions. Modifying the subscription state during
installation could cause the currently active version to unexpectedly receive or
drop cookie change events.

Calls to `subscribe()` and `unsubscribe()` are idempotent.

```javascript
self.addEventListener('activate', (event) => {
  event.waitUntil(async () =>
    // Snapshot current state of subscriptions.
    const subscriptions = await self.registration.cookies.getSubscriptions();

    // Clear any existing subscriptions.
    await self.registration.cookies.unsubscribe(subscriptions);

    await self.registration.cookies.subscribe([
      {
        name: 'session_id',  // Get change events for cookies named session_id.
      }
    ]);
  });
});
```
#### Alternative subscription model for service workers

Alternatively, each service worker version could manage its own set of
subscriptions. During installation, the service worker would set up its
subscriptions; after activation, it would receive only change events that match
those subscriptions.

The main advantage of this approach is that each service worker starts with a
clean slate of subscriptions, rather than potentially carrying over
subscriptions from previous service worker versions. Thus, a service worker's
script contains all the information needed to know what subscriptions it has.

The main disadvantage of this approach is the loss of any change events
dispatched while there is no active service worker. For example, even if two
sequential service worker versions subscribe to the same change events, neither
of them would see the change events dispatched in the window between
deactivation of the first and activation of the second. If the second service
worker version takes a snapshot of the cookie jar at install time, that snapshot
could be outdated by the time the service worker becomes active.

## Security Model

This proposal aims to preserve the current security model for cookies. In most
situations, this principle means deferring to [RFC 6265bis](https://tools.ietf.org/html/draft-ietf-httpbis-rfc6265bis).

### The HttpOnly flag

The modification API can not be used to set HttpOnly cookies. Neither the query
nor the monitoring API will include HttpOnly cookies in their results. This
matches the behavior of `document.cookie`.

### The Secure flag

The modification API sets the `secure` (HTTPS-only) flag to true for
all origins. This is an intentional difference from `document.cookie`,
which always defaults to insecure cookies.

The modification API disallows modifying (overwriting or deleting) cookies
from a non-secure origin, following a
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

#### Service Worker Scope

The Cookie Store API does not change the access level for Service Workers.

Service Workers can currently access the cookies of any URL under their scope. For example, a Service Worker could respond to any top-level request with an HTML document embedding an `<iframe>` pointing to the desired URL. When responding to the request for that URL, the Service Worker can respond with an HTML document containing a `<script>` that proxies the Service Worker's access to the `document.cookie` API using `postMessage`.

### Expiration Dates

This proposal side-steps date parsing issues by only accepting
[timestamps](https://heycam.github.io/webidl/#DOMTimeStamp)
(milliseconds since UNIX epoch), like
[the lastModified attribute](https://w3c.github.io/FileAPI/#file-attrs) in the
File API.

JavaScript Date objects will be automatically converted to timestamps thanks to
[implicit conversions](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/valueOf).

## Design Decisions

### Default Paths
This API defaults cookie paths to `/` for cookie write operations, including deletion/expiration. The implicit relative path-scoping of cookies to `.` has caused a lot of additional complexity for relatively little gain given their security equivalence under the same-origin policy and the difficulties arising from multiple same-named cookies at overlapping paths on the same domain. Cookie paths without a trailing `/` are treated as if they had a trailing `/` appended for cookie write operations. Cookie paths must start with `/` for write operations, and must not contain any `..` path segments. Query parameters and URL fragments are not allowed in paths for cookie write operations.

### URL Behavior
URLs without a trailing `/` are treated as if the final path segment had been removed for cookie read operations, including change monitoring. Paths for cookie read operations are resolved relative to the default read cookie path.

### Secure Cookies
This API only allows writing [`Secure`](https://tools.ietf.org/html/draft-ietf-httpbis-rfc6265bis-06#section-5.3.5) cookies. This is intended to prevent unintentional leakage to unsecured connections on the same domain. Furthermore, it disallows (to the extent permitted by the browser implementation) creation or modification of `Secure` flagged cookies from unsecured web origins and enforces special rules for the [`Host`](https://tools.ietf.org/html/draft-ietf-httpbis-rfc6265bis-06#section-4.1.3.2) and [`Secure`](https://tools.ietf.org/html/draft-ietf-httpbis-rfc6265bis-06#section-4.1.3.1) cookie name prefixes.

This API will, however, allow reading non-`Secure` cookies in order to facilitate the migration to `Secure` cookies.

### Domain Defaults
This API defaults cookies to "Domain"-less, which in conjunction with "Secure" provides origin-scoped cookie
behavior in most modern browsers. When practical the `__Host-` cookie name prefix should be used with these cookies so that cooperating browsers origin-scope them.

### Serializing Expiration Dates
Serialization of expiration times for non-session cookies in a special cookie-specific format has proven cumbersome,
so this API allows JavaScript Date objects and numeric timestamps (milliseconds since the beginning of the Unix epoch) to be used instead. The inconsistently-implemented Max-Age parameter is not exposed, although similar functionality is available for the specific case of expiring a cookie.

### HTTP Cookie Header Serialization
Cookies without U+003D (=) code points in their HTTP Cookie header serialization are treated as having an empty name, consistent with the majority of current browsers. Cookies with an empty name cannot be set using values containing U+003D (=) code points as this would result in ambiguous serializations in the majority of current browsers.

### Interpreting Strings
Internationalized cookie usage from scripts has to date been slow and browser-specific due to lack of interoperability because although several major browsers use UTF-8 interpretation for cookie data, historically Safari and browsers based on WinINet have not. This API requires UTF-8 interpretation of cookie data and uses `USVString` for the script interface,
with the additional side-effects that subsequent uses of `document.cookie` to read a cookie read or written through this interface and subsequent uses of `document.cookie` to update a cookie previously read or written through this interface will also use a UTF-8 interpretation of the cookie data. This mandates changes to the behavior of `WinINet`-based user agents and Safari but should bring their behavior into concordance with other modern user agents.

### Compatibility
Some user-agents implement non-standard extensions to cookie behavior. The intent of this API is to first capture a useful and interoperable (or mostly-interoperable) subset of cookie behavior implemented across modern browsers. As new cookie features are specified and adopted it is expected that this API will be extended to include them. A secondary goal is to converge with `document.cookie` behavior
and the http cookie specification. See https://github.com/whatwg/html/issues/804 and https://inikulin.github.io/cookie-compat/
for the current state of this convergence.

## Subtleties

Tutorials on this feature might want to cover the following topics.

### Data loss with invalid expires timestamps

The expiration date is an absolute timestamp, not a relative time interval. If users of this API pass in a small non-zero number for `expires`, e.g. `expires: 30` or `expires: 1000`, the Cookie Store API will delete the cookie data, resulting in data loss.

For example, this code sample might superficially appear to set a cookie that lasts for a year, but instead it sets the cookie to expire at midnight of 1971 UTC, which will delete the cookie and its data immedately.

BAD

```
try {
  await cookieStore.set({
    name: 'session_id',
    value: 'this data will be LOST',
    expires: 365 * 24 * 60 * 60 * 1000 });
} catch (e) {
  console.error(`Failed to set cookie: ${e}`);
}
```

GOOD

```
try {
  await cookieStore.set({
    name: 'session_id',
    value: 'this cookie lasts for a year',
    expires: Date.now() + 365 * 24 * 60 * 60 * 1000 });
} catch (e) {
  console.error(`Failed to set cookie: ${e}`);
}
```

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
fetch('/auth');  // The response includes the HTTP header Cookie: session-id=new.
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

#### Read / Write Race

The ability of passing the return value of `cookieStore.set()` to `cookieStore.get()` may lead to code that reads like an atomic read-modify-write operation, when in reality it's not.

```javascript
async function incrementCookie(name) {
  const cookie = await cookieStore.get(name);
  cookie.value = parseInt(cookie.value) + 1;
  await cookieStore.set(cookie);
}

await cookieStore.set('cookie-name', 1);
await Promise.all([
  incrementCookie('cookie-name'),
  incrementCookie('cookie-name'),
]);
const cookie = await cookieStore.get('cookie-name');
console.log(cookie.value);  // Value will likely be '2' not '3'.
```

### Modifying Insecure Cookies
The API will be able to fetch insecure cookies, but will only be able to modify secure cookies. This will mean that when modifying an insecure cookie with the API, the insecure cookie will automatically be changed to secure.

```javascript
const cookie = await cookieStore.get('insecure-cookie');
cookie.value = 'new-value';
cookieStore.set(cookie);  // 'cookie' will be modified into a secure cookie.
```

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

[RFC 6265bis](https://tools.ietf.org/html/draft-ietf-httpbis-rfc6265bis)
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

The [chrome.cookies](https://developers.chrome.com/extensions/cookies)
API (and the [WebExtensions adaptation of the
API](https://developer.mozilla.org/en-US/Add-ons/WebExtensions/API/cookies))
provides very similar functionality for trusted code added to
browsers, but is not restricted by the same-origin policy.
