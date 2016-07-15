explainer.md
# Async cookies API explained

## Summary

This proposal outlines an asynchronous API using Promises for the following cookie operations:

 * write (or "set") cookies
 * delete (or "expire") cookies
 * read script-visible cookies
   * ... including for specified in-scope request paths in
   [ServiceWorker](https://github.com/slightlyoff/ServiceWorker) contexts
 * monitor script-visible cookies for changes
   * ... using `.observe` in long-running script contexts (e.g. `document`)
   * ... using an event
   in ephemeral script contexts ([ServiceWorker](https://github.com/slightlyoff/ServiceWorker))
   * ... again including for script-supplied in-scope request paths
   in [ServiceWorker](https://github.com/slightlyoff/ServiceWorker) contexts

### Motivations

Some service workers [need access to cookies](https://github.com/slightlyoff/ServiceWorker/issues/707) but
cannot use the synchronous, blocking `document.cookie` interface as they both have no `document` and
also cannot block the event loop as that would interfere with handling of unrelated events.

A new API may also provide a rare and valuable chance to address
some [outstanding cross-browser incompatibilities](https://github.com/inikulin/cookie-compat) and bring [divergent
specs and user-agent behavior](https://github.com/whatwg/html/issues/804) into closer correspondence.

A well-designed and opinionated API may actually make cookies easier to deal with correctly from
scripts, with the potential effect of reducing their accidental misuse. An efficient monitoring API, in particular,
can be used to replace power-hungry polling cookie scanners.

### Opinions

This API defaults cookie paths to '/' for write and delete operations. The implicit relative path-scoping of cookies
to `.` has caused a lot of additional complexity for relatively little gain given their security equivalence under the
same-origin policy and the difficulties arising from multiple same-named cookies at overlapping paths on the same domain.

This API defaults cookies to "Secure" when they are written from a secure web origin. This is intended to prevent unintentional
leakage to unsecured connections on the same domain.

This API defaults cookies to "Domain"-less, which in conjunction with "Secure" provides origin-scoped cookie
behavior in most modern browsers.

Serialization of expiration times for non-session cookies in a special cookie-specific format has proven cumbersome,
so this API allows JavaScript Date objects to be used instead. The inconsistently-implemented Max-Age parameter is not
implemented.

Name-only or value-only cookies (i.e. those with no `=` in their HTTP Cookie header serialization) are not settable
through this API and will not be included in results returned from it.

### Compatiblity

Some user-agents implement non-standard extensions to cookie behavior. The intent of this specification,
though, is to first capture a useful and interoperable (or mostly-interoperable) subset of cookie behavior implemented
across modern browsers. As new cookie features are specified and adopted it is expected that this API will be
extended to include them. A secondary goal is to converge with `document.cookie` behavior, `<meta http-equiv=set-cookie>`,
and the http cookie specification. See https://github.com/whatwg/html/issues/804 and https://inikulin.github.io/cookie-compat/
for the current state of this convergence.

Differences across browsers in how bytes outside the printable-ASCII subset are interpreted has led to
long-lasting user- and developer-visible incompatibilities across browsers making internationalized use of cookies
needlessly cumbersome. This API requires on UTF-8 interpretation for cookie data and `USVString` for the script interface,
with the additional note that subsequent uses of document.cookie to read the cookie or `document.cookie` or
`<meta http-equiv=set-cookie>` to update it will also use a UTF-8 interpretation of the cookie data. In practice this
will likely require changes in the behavior of `WinINet`-based user agents but should bring their behavior into concordance
with most modern user agents.

This API adopts the interpretation of Max-Age=0 common to most modern browsers.

## Using the async cookies API

*Note:* This is largely inspired by the [API sketch](https://github.com/bsittler/async-cookies-api/issues/14)

### Reading

You can read the first in-scope script-visible value for a given cookie name. In a ServiceWorker this defaults to the path
of the ServiceWorker's registered scope. In a document it defaults to the path of the current document and does not respect
changes from `replaceState` or `document.domain`.

```js
cookieStore.get('COOKIENAME').then(cookie =>
  console.log(cookie ? ('Current value: ' + cookie.value) : 'Not set'));
```

In a ServiceWorker you can read a cookie from the point of view of a particular in-scope URI, which may be useful when
handling regular (same-origin, in-scope) fetch events or foreign fetch events.

```js
cookieStore.get('COOKIENAME', {url: '/cgi-bin/reboot.php'}).then(cookie =>
  console.log(cookie ? ('Current value in /cgi-bin is ' + cookie.value) : 'Not set in /cgi-bin'));
```

Sometimes you need to see the whole script-visible in-scope subset of cookie jar, including potential reuse of the same
cookie name at multiple paths and/or domains (the paths and domains are not exposed to script by this API, though):

```js
cookieStore.getAll().then(cookieList =>
  console.log('How many cookies? %d', cookieList.length));
```

#### Matching

Sometimes an expected cookie is known by a prefix rather than by an exact name:

```js
cookieStore.matchAll('COOKIEN').then(cookieList =>
  console.log('How many matching cookies? %d', cookieList.length));
```

In other cases a pattern is needed:

```js
cookieStore.matchAll(/^C[oO][^Q]K..N.*E$/i).then(cookieList =>
  console.log('How many matching cookies? %d', cookieList.length));
```

Or perhaps you care about at most one such cookie at a time:

```js
cookieStore.match('COOKIEN').then(cookie =>
  console.log('Matching cookie name', cookie));
```

In other cases a pattern is needed but only the first match is needed:

```js
cookieStore.match(/^C[oO][^Q]K..N.*E$/i).then(cookie =>
  console.log('Matching cookie name', cookie.name));
```

### Writing

You can set a cookie too:

```js
cookieStore.put('COOKIENAME', 'cookie-value').then(() => console.log('Set!'));
```

That defaults to path `/` and *implicit* domain, and defaults to a Secure-if-https-origin, non-HttpOnly session cookie which
will be visible to scripts. You can override these defaults if needed:

```js
// one day ahead, ignoring a possible leap-second
let inTwentyFourHours = new Date(Date.now() + 24 * 60 * 60 * 1000);
cookieStore.put('COOKIENAME', 'cookie-value',
  {
    path: '/cgi-bin/',
    expiration: inTwentyFourHours,
    secure: false,
    httpOnly: true,
    domain: 'example.org'
  }).then(() => console.log('Set!'));
```

Sometimes an expiration date comes from existing script it's not easy or convenient to replace, though:

```js
cookieStore.put('COOKIENAME', 'cookie-value',
  {
    path: '/cgi-bin/',
    expiration: 'Mon, 07 Jun 2021 07:07:07 GMT',
    secure: false,
    httpOnly: true,
    domain: 'example.org'
  }).then(() => console.log('Set!'));
```

#### Clearing and deleting by expiration

Clearing or deleting a cookie is accomplished by expiration, that is by replacing it with an equivalent-scope cookie with
an expiration in the past:

```js
// beginning of 1970 in UTC
let longAgo = new Date(0);
cookieStore.put('COOKIENAME', 'EXPIRED', {expiration: longAgo}).then(() =>
  console.log('Expired!'));
```

In this case the cookie's value is not important unless a clock is somehow set incorrectly.

*Note:* a cookie write operation may fail to actually set the requested cookie. If this was due to a cookie name, value or
parameter validation problem (for instance, a semicolon `;` cannot appear in any of these) then the promise will be rejected.
Other write failures (e.g. due to exceeding size limits, setting an out-of-supported-range expiration date, or setting a
cookie on a different eTLD+1 domain) will fail silently: the promise will resolve but the cookie will not be set.

### Monitoring

#### Single execution context

You can monitor a specific cookie name for changes during the lifetime of your script's execution context:

```js
cookieStore.get('COOKIENAME').observe(cookie => console.log(
  cookie ?
    ('New value: ' + cookie.value) :
    'No longer set or no longer visible to script'))
```

*Note:* this will coalesce changes and only return the most recent value of the cookie. A cookie that exists only very briefly
before disappearing again might not trigger a callback, and likewise a cookie that changes value or disappears only to quickly
reappear with the former value might not trigger a callback. Furthermore, a cookie cleared at one in-scope path and
then re-set with the same value at a different in-scope path and domain might not trigger the callback.

More generally: any `get`, `getAll`, `match`, or `matchAll` operation can be used with `.observe` in place of `.then`.
The handler will get the same parameters with which the operation's promise would have been resolved.

#### Ephemeral execution context (ServiceWorker)

```js
document.cookieStore.addEventListener('change', function(event) {
    // event.detail is a CookieList
});

   ...
   // while handling the InstallEvent; params are the same as matchAll
   event.registerCookieInterest(
    /^(COOKIENAME|ANOTHERNAME)$/,
    /^\/(cgi-bin|.well-known)(\/.*)?$/);
   ...
```
