explainer.md
# Async cookies API explained

## Summary

This proposal outlines an asynchronous API using Promises for the following cookie operations:

 * write (or "set") cookies
 * delete (or "expire") cookies
 * read (or "get") script-visible cookies
   * ... including for specified in-scope request paths in
   [ServiceWorker](https://github.com/slightlyoff/ServiceWorker) contexts
 * monitor script-visible cookies for changes
   * ... using `CookieObserver` in long-running script contexts (e.g. `document`)
   * ... using a `cookiechange` event
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

## Using the async cookies API

*Note:* This is largely inspired by the [API sketch](https://github.com/bsittler/async-cookies-api/issues/14)

### Reading

You can read the first in-scope script-visible value for a given cookie name. In a ServiceWorker this defaults to the path
of the ServiceWorker's registered scope. In a document it defaults to the path of the current document and does not respect
changes from `replaceState` or `document.domain`.

```js
async function getOneSimpleCookie() {
  let cookie = await cookieStore.get('__Host-COOKIENAME');
  console.log(cookie ? ('Current value: ' + cookie.value) : 'Not set');
}
```

In a ServiceWorker you can read a cookie from the point of view of a particular in-scope URL, which may be useful when
handling regular (same-origin, in-scope) fetch events or foreign fetch events.

```js
async function getOneCookieForRequestUrl() {
  let cookie = await cookieStore.get('__Secure-COOKIENAME', {url: '/cgi-bin/reboot.php'});
  console.log(cookie ? ('Current value in /cgi-bin is ' + cookie.value) : 'Not set in /cgi-bin');
}
```

Sometimes you need to see the whole script-visible in-scope subset of cookie jar, including potential reuse of the same
cookie name at multiple paths and/or domains (the paths and domains are not exposed to script by this API, though):

```js
async function countCookies() {
  let cookieList = await cookieStore.getAll();
  console.log('How many cookies? %d', cookieList.length);
  cookieList.forEach(cookie => console.log('Cookie %s has value %o', cookie.name, cookie.value));
}
```

Sometimes an expected cookie is known by a prefix rather than by an exact name:

```js
async function countMatchingCookies() {
  let cookieList = await cookieStore.getAll({name: '__Host-COOKIEN', matchType: 'prefix'});
  console.log('How many matching cookies? %d', cookieList.length);
  cookieList.forEach(cookie => console.log('Matching cookie %s has value %o', cookie.name, cookie.value));
}
```

### Writing

You can set a cookie too:

```js
async function setOneSimpleCookie() {
  await cookieStore.set('__Host-COOKIENAME', 'cookie-value');
  console.log('Set!');
}
```

That defaults to path `/` and *implicit* domain, and defaults to a Secure-if-https-origin, non-HttpOnly session cookie which
will be visible to scripts. You can override these defaults if needed:

```js
async function setOneDayCookieWithDate() {
  // one day ahead, ignoring a possible leap-second
  let inTwentyFourHours = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await cookieStore.set('__Secure-', 'cookie-value', {
      path: '/cgi-bin/',
      expires: inTwentyFourHours,
      secure: true,
      httpOnly: true,
      domain: 'example.org'
    });
  console.log('Set!');
}
```

Of course the numeric form (milliseconds since the beginning of 1970 UTC) works too:

```js
async function setOneDayCookieWithMillisecondsSinceEpoch() {
  // one day ahead, ignoring a possible leap-second
  let inTwentyFourHours = Date.now() + 24 * 60 * 60 * 1000;
  await cookieStore.set('COOKIENAME', 'cookie-value', {
      path: '/cgi-bin/',
      expires: inTwentyFourHours,
      secure: false,
      httpOnly: true,
      domain: 'example.org'
    });
  console.log('Set!');
}
```

Sometimes an expiration date comes from existing script it's not easy or convenient to replace, though:

```js
async function setCookieWithHttpLikeExpirationString() {
  await cookieStore.set('__Secure-COOKIENAME', 'cookie-value', {
      path: '/cgi-bin/',
      expires: 'Mon, 07 Jun 2021 07:07:07 GMT',
      secure: true,
      httpOnly: false,
      domain: 'example.org'
    });
  console.log('Set!');
}
```

In this case the syntax is that of the HTTP cookies spec; any other syntax will result in promise rejection.

#### Clearing

Clearing (deleting) a cookie is accomplished by expiration, that is by replacing it with an equivalent-scope cookie with
an expiration in the past:

```js
async function setExpiredCookieWithDomainPathAndFallbackValue() {
  let theVeryRecentPast = Date.now();
  let expiredCookieSentinelValue = 'EXPIRED';
  await cookieStore.set('__Secure-COOKIENAME', expiredCookieSentinelValue, {
      path: '/cgi-bin/',
      expires: theVeryRecentPast,
      secure: true,
      httpOnly: true,
      domain: 'example.org'
    });
  console.log('Expired! Deleted!! Cleared!!1!');
}
```

In this case the cookie's value is not important unless a clock is somehow re-set incorrectly or otherwise behaves nonmonotonically or incoherently.

A syntactic shorthand is also provided which is equivalent to the above except that the clock's accuracy and monotonicity becomes irrelevant:

```js
async function deleteSimpleCookie() {
  await cookieStore.delete('__Host-COOKIENAME');
  console.log('Expired! Deleted!! Cleared!!1!');
}
```

Again, the path and/or domain can be specified explicitly here.

```js
async function deleteCookieWithDomainAndPath() {
  await cookieStore.delete('__Secure-COOKIENAME', {
      path: '/cgi-bin/',
      domain: 'example.org'
    });
  console.log('Expired! Deleted!! Cleared!!1!');
}
```

This API has semantics aligned with the interpretation of `Max-Age=0` common to most modern browsers.

#### Rejection

A cookie write operation (`set` or `delete`) may fail to actually set the requested cookie. A cookie name, value or
parameter validation problem (for instance, a semicolon `;` cannot appear in any of these) will result in the promise being rejected. Likewise, exceeding implementation size limits, setting an out-of-supported-range expiration date, or setting a
cookie on a different eTLD+1 domain will also reject the promise and the cookie will not be set/modified. Other implementation-specific limits could lead to rejection, too.

### Monitoring

*Note:* multiple cookie changes in rapid succession may cause the user agent to only check for script-visible changes (relative to the last time the observer was called or the event was fired) after all the changes have been applied. In some cases (for instance, a very short-lived cookie being set and then expiring) this may cause the observer/event handler to miss the (now-expired) ephemeral cookie entirely.

#### Single execution context

You can monitor for script-visible cookie changes during the lifetime of your script's execution context:

```js
// This will get invoked (asynchronously) shortly after the observe(...) call to
// provide an initial snapshot; in that case the length of the cookieChangeList may
// be 0, indicating no matching script-visible cookies for any URL currently observed
let callback = cookieChanges => {
  console.log('Script-visible cookie changes: %d', cookieChanges.updates.length);
  cookieChanges.updates.forEach(cookieChange => {
    switch(cookieChange.type) {
    case 'visible':
      console.log('Cookie %s now visible to script with value %s', cookieChange.name, cookieChange.value);
      cookieChange.urls.forEach(url => console.log('... for observed URL %s', url));
      break;
    case 'hidden':
      console.log('Cookie %s expired or no longer visible to script', cookieChange.name);
      cookieChange.urls.forEach(url => console.log('... for observed URL %s', url));
      break;
    default:
      throw 'Unhandled change type ' + cookieChange.type;
    }
    console.log('Should be true:', cookieChange.cookieStore === cookieStore);
  })
};
let observer = new CookieObserver(callback);
// If null or omitted this defaults to location.pathname
let url = location.pathname;
// If null or omitted this defaults to interest in all cookies
let interests = [{name: '__Secure-COOKIENAME'}, {name: '__Host-COOKIEN', matchType: 'prefix'}];
observer.observe(cookieStore, url, interests);
```

Successive attempts to `observe` on the same CookieObserver with effectively identical or overlapping interests are ignored to allow straightforward idempotent setup code.

Eventually you may want to stop monitoring for script-visible cookie changes:

```js
// Again, url and interests are both optional
observer.unobserve(cookieStore, url, interests);
```

Attempts to `unobserve` not corresponding to a previous `observe` on the same CookieObserver are ignored to allow straightforward idempotent cleanup code.

#### ServiceWorker

A ServiceWorker does not have a persistent JavaScript execution context, so a different API is needed for interest registration. Register your interest while handling the `InstallEvent` to ensure your ServiceWorker will run when a cookie you care about changes.

```js
  ...
  // Cookie change interest is registered during the InstallEvent in a ServiceWorker;
  // parameters are identical to CookieObserver's observe(...) method. The url
  // must be inside the registration scope of the ServiceWorker, and defaults to
  // that if null or omitted.
  event.registerCookieChangeInterest(cookieStore); // all cookies, url === SW scope url
  // Call it more than once to register additional interests:
  let url = '/sw-scope/auth/';
  let interests = [{name: '__Host-AUTHTOKEN', matchType: 'prefix'}];
  event.registerCookieChangeInterest(cookieStore, url, interests);
  ...
```

*Note:* cookie changes which occur at paths not yet known during handling of the `InstallEvent` cannot be monitored in a ServiceWorker using this API.

You also need to be sure to handle the `CookieChangeEvent`:

```js
// This will get invoked once (asynchronously) after activation to provide an initial
// snapshot of the script-visible cookie jar; in that case the length of the cookieChangeList may
// be 0, indicating no matching script-visible cookies for any URL for which cookie interest was
// registered.
addEventListener('cookiechange', function(event) {
  // event.detail is CookieChanges, analogous to the one passed to CookieObserver's callback
  let cookieChanges = event.detail;
  console.log('ServiceWorker script-visible cookie changes: %d', cookieChanges.updates.length);
  cookieChanges.updates.forEach(cookieChange => {
    switch(cookieChange.type) {
    case 'visible':
      console.log('Cookie %s now visible to script with value %s', cookieChange.name, cookieChange.value);
      cookieChange.urls.forEach(url => console.log('... for observed URL %s', url));
      break;
    case 'hidden':
      console.log('Cookie %s expired or no longer visible to script', cookieChange.name);
      cookieChange.urls.forEach(url => console.log('... for observed URL %s', url));
      break;
    default:
      throw 'Unhandled change type ' + cookieChange.type;
    }
    console.log('Should be true:', cookieChange.cookieStore === cookieStore);
  })
});
```

*Note:* a ServiceWorker script needs to be prepared to handle "duplicate" notifications after updates to the ServiceWorker script with identical or overlapping cookie change interests compared to those interests previously registered.

## Security

Other than cookie access from ServiceWorker contexts, this API is not intended to expose any new capabilities to the web.

However, this API may have the unintended side-effect of making cookies easier to use and consequently encouraging their further use. If it causes their further use in unsecured `http` contexts this could result in a web less safe for users. 

For that reason it may be desirable to restrict its use, or at least the use of the `set` and `delete` operations, to secure origins running in secure contexts.

Some existing cookie behavior (especially domain-rather-than-origin orientation, unsecured contexts being able to set cookies readable in secure contexts, and script being able to set cookies unreadable from non-script contexts) may be quite surprising from a web security standpoint.

Where feasible the examples use the `__Host-` and `__Secure-` name prefixes from [Cookie Prefixes](https://tools.ietf.org/html/draft-ietf-httpbis-cookie-prefixes-00) which causes some current browsers to disallow overwriting from unsecured contexts, disallow overwriting with no `Secure` flag, and -- in the case of `__Host-` -- disallow overwriting with an explicit `Domain` or non-`/` `Path` attribute (effectively enforcing same-origin semantics.)
