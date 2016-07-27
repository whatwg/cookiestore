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
   * ... using `CookieChangeEvent` after registration during the `InstallEvent`
   in ephemeral [ServiceWorker](https://github.com/slightlyoff/ServiceWorker) contexts
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

The API must interoperate well enough with existing cookie APIs (HTTP-level, HTML-level and script-level) that it can be adopted incrementally by a large or complex website.

### Opinions

This API defaults cookie paths to '/' for write and delete operations. The implicit relative path-scoping of cookies
to '.' has caused a lot of additional complexity for relatively little gain given their security equivalence under the
same-origin policy and the difficulties arising from multiple same-named cookies at overlapping paths on the same domain.

This API defaults cookies to "Secure" when they are written from a secure web origin. This is intended to prevent unintentional leakage to unsecured connections on the same domain.

This API defaults cookies to "Domain"-less, which in conjunction with "Secure" provides origin-scoped cookie
behavior in most modern browsers.

Serialization of expiration times for non-session cookies in a special cookie-specific format has proven cumbersome,
so this API allows JavaScript Date objects and numeric timestamps (milliseconds since the beginning of the Unix epoch) to be used instead. The inconsistently-implemented Max-Age parameter is not exposed, although similar functionality is available for the specific case of expiring a cookie.

Name-only or value-only cookies (i.e. those with no `=` in their HTTP Cookie header serialization) are not settable
through this API and will not be included in results returned from it unless the user agent normalizes them to include a `=`.

Internationalized cookie usage from scripts has to date been slow and browser-specific due to lack of interoperability because although several major browsers use UTF-8 interpretation for cookie data, historically Safari and browsers based on WinINet have not. This API mandates UTF-8 interpretation for cookies read or written by this API.

Use of cookie-change-driven scripts has been hampered by the absence of a power-efficient (non-polling) API for this. This API provides observers for efficient monitoring in document contexts and interest registration for efficient monitoring in ServiceWorker contexts.

Scripts should not have to write and then read "test cookies" to determine whether script-initiated cookie write access is possible, nor should they have to correlate with cooperating server-side versions of the same write-then-read test to determine that script-initiated cookie read access is impossible despite cookies working at the HTTP level.

### Compatiblity

Some user-agents implement non-standard extensions to cookie behavior. The intent of this specification,
though, is to first capture a useful and interoperable (or mostly-interoperable) subset of cookie behavior implemented
across modern browsers. As new cookie features are specified and adopted it is expected that this API will be
extended to include them. A secondary goal is to converge with `document.cookie` behavior, `<meta http-equiv=set-cookie>`,
and the http cookie specification. See https://github.com/whatwg/html/issues/804 and https://inikulin.github.io/cookie-compat/
for the current state of this convergence.

Differences across browsers in how bytes outside the printable-ASCII subset are interpreted has led to
long-lasting user- and developer-visible incompatibilities across browsers making internationalized use of cookies
needlessly cumbersome. This API requires UTF-8 interpretation of cookie data and uses `USVString` for the script interface,
with the additional side-effects that subsequent uses of `document.cookie` to read a cookie read or written through this interface and subsequent uses of `document.cookie` or
`<meta http-equiv=set-cookie>` to update a cookie previously read or written through this interface will also use a UTF-8 interpretation of the cookie data. In practice this
will change the behavior of `WinINet`-based user agents and Safari but should bring their behavior into concordance
with other modern user agents.

## Using the async cookies API

*Note:* This is largely inspired by the [API sketch](https://github.com/bsittler/async-cookies-api/issues/14)

### Reading

You can read the first in-scope script-visible value for a given cookie name. In a ServiceWorker this defaults to the path
of the ServiceWorker's registered scope. In a document it defaults to the path of the current document and does not respect
changes from `replaceState` or `document.domain`.

```js
async function getOneSimpleOriginCookie() {
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
async function countMatchingSimpleOriginCookies() {
  let cookieList = await cookieStore.getAll({name: '__Host-COOKIEN', matchType: 'startsWith'});
  console.log('How many matching cookies? %d', cookieList.length);
  cookieList.forEach(cookie => console.log('Matching cookie %s has value %o', cookie.name, cookie.value));
}
```

In a ServiceWorker you may need to read more than one cookie from an in-scope path different from the default, for instance while handling a fetch event:

```js
async function countMatchingCookiesForRequestUrl() {
  // 'equals' is the default matchType and indicates exact matching
  let cookieList = await cookieStore.getAll({name: 'LEGACYSORTPREFERENCE', matchType: 'equals', url: '/pictures/'});
  console.log('How many legacy sort preference cookies? %d', cookieList.length);
  cookieList.forEach(cookie => console.log('Legacy sort preference cookie has value %o', cookie.value));
}
```

You might even need to read all of them:

```js
async function countAllCookiesForRequestUrl() {
  let cookieList = await cookieStore.getAll({url: '/sw-scope/session2/document5/'});
  console.log('How many script-visible cookies? %d', cookieList.length);
  cookieList.forEach(cookie => console.log('Cookie %s has value %o', cookie.name, cookie.value));
}
```

### Writing

You can set a cookie too:

```js
async function setOneSimpleOriginSessionCookie() {
  await cookieStore.set('__Host-COOKIENAME', 'cookie-value');
  console.log('Set!');
}
```

That defaults to path `/` and *implicit* domain, and defaults to a Secure-if-https-origin, non-HttpOnly session cookie which
will be visible to scripts. You can override these defaults if needed:

```js
async function setOneDaySecureCookieWithDate() {
  // one day ahead, ignoring a possible leap-second
  let inTwentyFourHours = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await cookieStore.set('__Secure-COOKIENAME', 'cookie-value', {
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
async function setOneDayUnsecuredCookieWithMillisecondsSinceEpoch() {
  // one day ahead, ignoring a possible leap-second
  let inTwentyFourHours = Date.now() + 24 * 60 * 60 * 1000;
  await cookieStore.set('LEGACYCOOKIENAME', 'cookie-value', {
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
async function setSecureCookieWithHttpLikeExpirationString() {
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
async function setExpiredSecureCookieWithDomainPathAndFallbackValue() {
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
async function deleteSimpleOriginCookie() {
  await cookieStore.delete('__Host-COOKIENAME');
  console.log('Expired! Deleted!! Cleared!!1!');
}
```

Again, the path and/or domain can be specified explicitly here.

```js
async function deleteSecureCookieWithDomainAndPath() {
  await cookieStore.delete('__Secure-COOKIENAME', {
      path: '/cgi-bin/',
      domain: 'example.org',
      secure: true
    });
  console.log('Expired! Deleted!! Cleared!!1!');
}
```

This API has semantics aligned with the interpretation of `Max-Age=0` common to most modern browsers.

#### Rejection

A cookie write operation (`set` or `delete`) may fail to actually set the requested cookie. A cookie name, value or
parameter validation problem (for instance, a semicolon `;` cannot appear in any of these) will result in the promise being rejected. Likewise, exceeding implementation size limits, setting an out-of-supported-range expiration date, or setting a
cookie on a different eTLD+1 domain will also reject the promise and the cookie will not be set/modified. Other implementation-specific limits could lead to rejection, too.

A cookie write operation for a cookie using one of the `__Host-` and `__Secure-` name prefixes from [Cookie Prefixes](https://tools.ietf.org/html/draft-ietf-httpbis-cookie-prefixes-00) will be rejected if the other cookie parameters do not conform to the special rules for the prefix. For both prefixes the Secure parameter must be set (either explicitly set to `true` or implicitly due to the script running on a secure origin), and the script must be running on a secure origin. Additionally for the `__Host-` prefix the Path parameter must have the value `/` (either explicitly or implicitly) and the Domain parameter must be absent.

### Monitoring

*Note:* multiple cookie changes in rapid succession may cause the user agent to only check for script-visible changes (relative to the last time the observer was called or the event was fired) after all the changes have been applied. In some cases (for instance, a very short-lived cookie being set and then expiring) this may cause the observer/event handler to miss the (now-expired) ephemeral cookie entirely.

#### Single execution context

You can monitor for script-visible cookie changes (creation, modification and deletion) during the lifetime of your script's execution context:

```js
// This will get invoked (asynchronously) shortly after the observe(...) call to
// provide an initial snapshot; in that case the length of cookieChanges may be 0,
// indicating no matching script-visible cookies for any URL+cookieStore currently
// observed. The CookieObserver instance is passed as the second parameter to allow
// additional calls to observe or disconnect.
let callback = (cookieChanges, observer) => {
  console.log(
    '%d script-visible cookie changes for CookieObserver %o',
    cookieChanges.length,
    observer);
  cookieChanges.forEach(cookieChange => {
    console.log(
      'CookieChange type %s for observed url %s in CookieStore %o',
      cookieChange.type,
      // Note that this will be the passed-in or defaulted value for the corresponding
      // call to observe(...).
      cookieChange.url,
      // This is the same CookieStore passed to observe(...)
      cookieChange.cookieStore);
    switch(cookieChange.type) {
    case 'visible':
      // Creation or modification (e.g. change in value, or removal of HttpOnly), or
      // appearance to script due to change in policy or permissions
      console.log('Cookie %s now visible to script with value %s', cookieChange.name, cookieChange.value);
      break;
    case 'hidden':
      // Deletion/expiration or disappearance (e.g. due to modification adding HttpOnly),
      // or disappearance from script due to change in policy or permissions
      console.log('Cookie %s expired or no longer visible to script', cookieChange.name);
      break;
    default:
      console.error('Unexpected CookieChange type, ')
      throw 'Unexpected CookieChange type ' + cookieChange.type;
    }
  });
};
let observer = new CookieObserver(callback);
// If null or omitted this defaults to location.pathname in a
// document context or worker scope in a ServiceWorker context.
let url = location.pathname;
// If null or omitted this defaults to interest in all
// script-visible cookies.
let interests = [
  // Interested in all secure cookies named '__Secure-COOKIENAME';
  // the default matchType is 'equals' at the given URL.
  {name: '__Secure-COOKIENAME', url: url},
  // Interested in all simple origin cookies named like
  // /^__Host-COOKIEN.*$/ at the default URL.
  {name: '__Host-COOKIEN', matchType: 'startsWith'},
  // Interested in all cookies named 'OLDCOOKIENAME' at the given URL.
  {name: 'OLDCOOKIENAME', matchType: 'equals', url: url},
  // Interested in all simple origin cookies named like
  // /^__Host-AUTHTOKEN.*$/ at the given URL.
  {name: '__Host-AUTHTOKEN', matchType: 'startsWith', url: url + '/auth'}
];
observer.observe(cookieStore, interests);
```

Successive attempts to `observe` on the same CookieObserver are additive but a single change to a single cookie will only be reported once for each URL where it is observed in a given CookieStore.

Eventually you may want to stop monitoring for script-visible cookie changes:

```js
// No more callbacks until another call to observer.observe(...)
observer.disconnect();
```

#### ServiceWorker

A ServiceWorker does not have a persistent JavaScript execution context, so a different API is needed for interest registration. Register your interest while handling the `InstallEvent` to ensure your ServiceWorker will run when a cookie you care about changes.

```js
  ...
  // Cookie change interest is registered during the InstallEvent in a ServiceWorker;
  // parameters are identical to CookieObserver's observe(...) method. The url
  // must be inside the registration scope of the ServiceWorker, and defaults to
  // the registration scope if null or omitted.
  event.registerCookieChangeInterest(cookieStore); // all cookies, url === SW scope url
  // Call it more than once to register additional interests:
  let url = '/sw-scope/';
  // If null or omitted this defaults to interest in all
  // script-visible cookies.
  let interests = [
    // Interested in all secure cookies named '__Secure-COOKIENAME';
    // the default matchType is 'equals' at the given URL.
    {name: '__Secure-COOKIENAME', url: url},
    // Interested in all simple origin cookies named like
    // /^__Host-COOKIEN.*$/ at the default URL.
    {name: '__Host-COOKIEN', matchType: 'startsWith'},
    // Interested in all cookies named 'OLDCOOKIENAME' at the given URL.
    {name: 'OLDCOOKIENAME', matchType: 'equals', url: url},
    // Interested in all simple origin cookies named like
    // /^__Host-AUTHTOKEN.*$/ at the given URL.
    {name: '__Host-AUTHTOKEN', matchType: 'startsWith', url: url + '/auth'}
  ];
  event.registerCookieChangeInterest(cookieStore, interests);
  ...
```

*Note:* cookie changes which occur at paths not yet known during handling of the `InstallEvent` cannot be monitored in a ServiceWorker using this API.

You also need to be sure to handle the `CookieChangeEvent`:

```js
// This will get invoked once (asynchronously) after activation to provide an initial
// snapshot of the script-visible cookie jar; in that case the length of the cookieChangeList may
// be 0, indicating no matching script-visible cookies for any URL for which cookie interest was
// registered.
addEventListener('cookiechange', event => {
  // event.detail is CookieChanges, analogous to the one passed to CookieObserver's callback
  let cookieChanges = event.detail;
  console.log(
    '%d script-visible cookie changes',
    cookieChanges.length);
  cookieChanges.forEach(cookieChange => {
    console.log(
      'CookieChange type %s for observed url %s in CookieStore %o',
      cookieChange.type,
      // Note that this will be the passed-in or defaulted value for the corresponding
      // call to observe(...).
      cookieChange.url,
      // This is the same CookieStore passed to observe(...)
      cookieChange.cookieStore);
    switch(cookieChange.type) {
    case 'visible':
      // Creation or modification (e.g. change in value, or removal of HttpOnly), or
      // appearance to script due to change in policy or permissions
      console.log('Cookie %s now visible to script with value %s', cookieChange.name, cookieChange.value);
      break;
    case 'hidden':
      // Deletion/expiration or disappearance (e.g. due to modification adding HttpOnly),
      // or disappearance from script due to change in policy or permissions
      console.log('Cookie %s expired or no longer visible to script', cookieChange.name);
      break;
    default:
      console.error('Unexpected CookieChange type, ')
      throw 'Unexpected CookieChange type ' + cookieChange.type;
    }
  });
});
```

*Note:* a ServiceWorker script needs to be prepared to handle "duplicate" notifications after updates to the ServiceWorker script with identical or overlapping cookie change interests compared to those interests previously registered.

## Security

Other than cookie access from ServiceWorker contexts, this API is not intended to expose any new capabilities to the web.

### Gotcha!

Although browser cookie implementations are now evolving in the direction of better security and fewer surprising and error-prone defaults, there are at present few guarantees about cookie data security.

 * unsecured origins can typically overwrite cookies used on secure origins
 * superdomains can typically overwrite cookies seen by subdomains
 * cross-site scripting attacts and other script and header injection attacks can be used to forge cookies too
 * cookie read operations (both from script and on web servers) don't give any indication of where the cookie came from
 * browsers sometimes truncate, transform or evict cookie data in surprising and counterintuitive ways
   * ... due to reaching storage limits
   * ... due to character encoding differences
   * ... due to differing syntactic and semantic rules for cookies

For these reasons it is best to use caution when interpreting any cookie's value, and never execute a cookie's value as script, HTML, CSS, XML, PDF, or any other executable format.

### Restrict?

This API may have the unintended side-effect of making cookies easier to use and consequently encouraging their further use. If it causes their further use in unsecured `http` contexts this could result in a web less safe for users. For that reason it may be desirable to restrict its use, or at least the use of the `set` and `delete` operations, to secure origins running in secure contexts.

### Surprises

Some existing cookie behavior (especially domain-rather-than-origin orientation, unsecured contexts being able to set cookies readable in secure contexts, and script being able to set cookies unreadable from script contexts) may be quite surprising from a web security standpoint.

Other surprises are documented in [Section 1 of HTTP State Management Mechanism (RFC 6265)](https://tools.ietf.org/html/rfc6265#section-1) - for instance, a cookie may be set for a superdomain (e.g. app.example.com may set a cookie for the whole example.com domain), and a cookie may be readable across all port numbers on a given domain name.

Further complicating this are historical differences in cookie-handling across major browsers, although some of those (e.g. port number handling) are now handled with more consistency than they once were.

### Prefixes

Where feasible the examples use the `__Host-` and `__Secure-` name prefixes from [Cookie Prefixes](https://tools.ietf.org/html/draft-ietf-httpbis-cookie-prefixes-00) which causes some current browsers to disallow overwriting from unsecured contexts, disallow overwriting with no `Secure` flag, and -- in the case of `__Host-` -- disallow overwriting with an explicit `Domain` or non-'/' `Path` attribute (effectively enforcing same-origin semantics.) These prefixes provide important security benefits in those browsers implementing Secure Cookies and degrade gracefully (i.e. the special semantics may not be enforced in other cookie APIs but the cookies work normally and the async cookies API enforces the secure semantics for write operations) in other browsers. A major goal of this API is interoperation with existing cookies, though, so a few examples have also been provided using cookie names lacking these prefixes.

Prefix rules are also enforced in write operations by this API, but may not be enforced in the same browser for other APIs. For this reason it is inadvisable to rely on their enforcement too heavily until and unless they are more broadly adopted.

### URL scoping

Although a ServiceWorker cannot directly access cookies today, it can already use controlled rendering of in-scope HTML and script resources to inject cookie-monitoring code under the remote control of the ServiceWorker, remotely controlled using postMessage, the caches API, or IndexedDB. This means that cookie access inside the scope of the ServiceWorker is technically possible already, it's just not very convenient.

When the ServiceWorker is scoped more narrowly than `/` it may still be able to read path-scoped cookies from outside its scope by successfully guessing/constructing a 404 page URL which allows IFRAME-ing and then running script inside it the same technique could expand to the whole origin, but a carefully constructed site (one where no out-of-scope pages are IFRAME-able) can actually deny this capability to a path-scoped ServiceWorker today and I was reluctant to remove that restriction without further discussion of the implications.

### Cookie aversion

To reduce complexity for developers and eliminate ephemeral test cookies, this async cookies API will explicitly reject attempts to write or delete cookies when the operation would be ignored. Likewise it will explicitly reject attempts to read cookies when that operation would ignore actual cookie data and simulate an empty cookie jar. Attempts to observe cookie changes in these contexts will still "work", but won't invoke the callback until and unless read access becomes allowed (due e.g. to changed site permissions.)

Today writing to `document.cookie` in contexts where script-initiated cookie-writing is disallowed typically is a no-op. However, many cookie-writing scripts and frameworks always write a test cookie and then check for its existence to determine whether script-initiated cookie-writing is possible.

Likewise, today reading `document.cookie` in contexts where script-initiated cookie-reading is disallowed typically returns an empty string. However, a cooperating web server can verify that server-initiated cookie-writing and cookie-reading work and report this to the script (which still sees empty string) and the script can use this information to infer that script-initiated cookie-reading is disallowed.
