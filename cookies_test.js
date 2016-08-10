addEventListener('load', () => runAllTests().then(() => console.log('All tests complete.')), true);
  
(() => {
  'use strict';

  function getOneSimpleOriginCookie() {
    return cookieStore.get('__Host-COOKIENAME').then(function(cookie) {
      console.log(cookie ? ('Current value: ' + cookie.value) : 'Not set');
    });
  }
  
  self.runAllTests = async () => {
    await cookieStore.set('TEST', 'value')
    console.log.apply(console, ['All cookies'].concat(await cookieStore.getAll()));
    console.log('First cookie', await cookieStore.get());
    console.log.apply(console, ['All TEST cookies'].concat(await cookieStore.getAll('TEST')));
    console.log('First value for TEST cookie', await cookieStore.get('TEST'));
    await getOneSimpleOriginCookie().then(function() {
      console.log('getOneSimpleOriginCookie succeeded!');
    }, function(reason) {
      console.error('getOneSimpleOriginCookie did not succeed: ', reason);
    });
    await getOneSimpleOriginCookieAsync().then(
      () => console.log('getOneSimpleOriginCookieAsync succeeded!'),
      reason => console.error('getOneSimpleOriginCookieAsync did not succeed: ', reason));
    await Promise.all([
      getOneCookieForRequestUrl(),
      countCookies(),
      countMatchingSimpleOriginCookies(),
      countMatchingCookiesForRequestUrl(),
      countAllCookiesForRequestUrl(),
      setOneSimpleOriginSessionCookie(),
      setOneDaySecureCookieWithDate(),
      setOneDayUnsecuredCookieWithMillisecondsSinceEpoch(),
      setSecureCookieWithHttpLikeExpirationString(),
      setThreeSimpleOriginSessionCookiesSequentially(),
      setThreeSimpleOriginSessionCookiesNonsequentially(),
      setExpiredSecureCookieWithDomainPathAndFallbackValue(),
      deleteSimpleOriginCookie(),
      deleteSecureCookieWithDomainAndPath(),
      testObservation()]);
  };
  
  let getOneSimpleOriginCookieAsync = async () => {
    let cookie = await cookieStore.get('__Host-COOKIENAME');
    console.log(cookie ? ('Current value: ' + cookie.value) : 'Not set');
  };
  
  let getOneCookieForRequestUrl = async () => {
    let cookie = await cookieStore.get('__Secure-COOKIENAME', {url: '/cgi-bin/reboot.php'});
    console.log(cookie ? ('Current value in /cgi-bin is ' + cookie.value) : 'Not set in /cgi-bin');
  };
  
  // FIXME: remove this once IFRAME puppets are implemented in the polyfill
  getOneCookieForRequestUrl =
    eval(String(getOneCookieForRequestUrl).split('/cgi-bin').join(location.pathname.replace(/\/[^/]+$/, '')));
  
  let countCookies = async () => {
    let cookieList = await cookieStore.getAll();
    console.log('How many cookies? %d', cookieList.length);
    cookieList.forEach(cookie => console.log('Cookie %s has value %o', cookie.name, cookie.value));
  };
  
  let countMatchingSimpleOriginCookies = async () => {
    let cookieList = await cookieStore.getAll({name: '__Host-COOKIEN', matchType: 'startsWith'});
    console.log('How many matching cookies? %d', cookieList.length);
    cookieList.forEach(cookie => console.log('Matching cookie %s has value %o', cookie.name, cookie.value));
  };
  
  let countMatchingCookiesForRequestUrl = async () => {
    // 'equals' is the default matchType and indicates exact matching
    let cookieList = await cookieStore.getAll({name: 'LEGACYSORTPREFERENCE', matchType: 'equals', url: '/pictures/'});
    console.log('How many legacy sort preference cookies? %d', cookieList.length);
    cookieList.forEach(cookie => console.log('Legacy sort preference cookie has value %o', cookie.value));
  };
  
  // FIXME: remove this once IFRAME puppets are implemented in the polyfill
  countMatchingCookiesForRequestUrl =
    eval(String(countMatchingCookiesForRequestUrl).split('/pictures/').join(location.pathname.replace(/[^/]+$/, '')));

  let countAllCookiesForRequestUrl = async () => {
    let cookieList = await cookieStore.getAll({url: '/sw-scope/session2/document5/'});
    console.log('How many script-visible cookies? %d', cookieList.length);
    cookieList.forEach(cookie => console.log('Cookie %s has value %o', cookie.name, cookie.value));
  };
  
  // FIXME: remove this once IFRAME puppets are implemented in the polyfill
  countAllCookiesForRequestUrl =
    eval(String(countAllCookiesForRequestUrl).split('/sw-scope/session2/document5/').join(location.pathname.replace(/[^/]+$/, '')));

  let setOneSimpleOriginSessionCookie = async () => {
    await cookieStore.set('__Host-COOKIENAME', 'cookie-value');
    console.log('Set!');
  };
  
  let setOneDaySecureCookieWithDate = async () => {
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
  };
  
  // FIXME: remove this once IFRAME puppets and ServiceWorker support are implemented in the polyfill
  setOneDaySecureCookieWithDate =
    eval(String(setOneDaySecureCookieWithDate).split('/cgi-bin/').join(location.pathname.replace(/[^/]+$/, '')));
  setOneDaySecureCookieWithDate =
    eval(String(setOneDaySecureCookieWithDate).split('example.org').join(location.hostname));

  let setOneDayUnsecuredCookieWithMillisecondsSinceEpoch = async () => {
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
  };
  
  // FIXME: remove this once IFRAME puppets and ServiceWorker support are implemented in the polyfill
  setOneDayUnsecuredCookieWithMillisecondsSinceEpoch =
    eval(String(setOneDayUnsecuredCookieWithMillisecondsSinceEpoch).split('/cgi-bin/').join(location.pathname.replace(/[^/]+$/, '')));
  setOneDayUnsecuredCookieWithMillisecondsSinceEpoch =
    eval(String(setOneDayUnsecuredCookieWithMillisecondsSinceEpoch).split('example.org').join(location.hostname));

  let setSecureCookieWithHttpLikeExpirationString = async () => {
    await cookieStore.set('__Secure-COOKIENAME', 'cookie-value', {
        path: '/cgi-bin/',
        expires: 'Mon, 07 Jun 2021 07:07:07 GMT',
        secure: true,
        httpOnly: false,
        domain: 'example.org'
      });
    console.log('Set!');
  };
  
  // FIXME: remove this once IFRAME puppets and ServiceWorker support are implemented in the polyfill
  setSecureCookieWithHttpLikeExpirationString =
    eval(String(setSecureCookieWithHttpLikeExpirationString).split('/cgi-bin/').join(location.pathname.replace(/[^/]+$/, '')));
  setSecureCookieWithHttpLikeExpirationString =
    eval(String(setSecureCookieWithHttpLikeExpirationString).split('example.org').join(location.hostname));

  let setThreeSimpleOriginSessionCookiesSequentially = async () => {
    await cookieStore.set('__Host-🍪', '🔵cookie-value1🔴');
    await cookieStore.set('__Host-🌟', '🌠cookie-value2🌠');
    await cookieStore.set('__Host-🌱', '🔶cookie-value3🔷');
    console.log('All set!');
    // NOTE: this assumes no concurrent writes from elsewhere; it also
    // uses three separate cookie jar read operations where a single getAll
    // would be more efficient, but this way the CookieStore does the filtering
    // for us.
    let matchingValues = await Promise.all(['🍪', '🌟', '🌱'].map(async ಠ_ಠ => (await cookieStore.get('__Host-' + ಠ_ಠ)).value));
    let actual = matchingValues.join(';');
    let expected = '🔵cookie-value1🔴;🌠cookie-value2🌠;🔶cookie-value3🔷';
    if (actual !== expected) throw new Error('Expected ' + JSON.stringify(expected) + ' but got ' + JSON.stringify(actual));
    console.log('All verified!');
  };
  
  let setThreeSimpleOriginSessionCookiesNonsequentially = async () => {
    await Promise.all([
      cookieStore.set('__Host-unordered🍪', '🔵unordered-cookie-value1🔴'),
      cookieStore.set('__Host-unordered🌟', '🌠unordered-cookie-value2🌠'),
      cookieStore.set('__Host-unordered🌱', '🔶unordered-cookie-value3🔷')]);
    console.log('All set!');
    // NOTE: this assumes no concurrent writes from elsewhere; it also
    // uses three separate cookie jar read operations where a single getAll
    // would be more efficient, but this way the CookieStore does the filtering
    // for us.
    let matchingCookies = await Promise.all(['🍪', '🌟', '🌱'].map(ಠ_ಠ => cookieStore.get('__Host-unordered' + ಠ_ಠ)));
    let actual = matchingCookies.map(({value}) => value).join(';');
    let expected = '🔵unordered-cookie-value1🔴;🌠unordered-cookie-value2🌠;🔶unordered-cookie-value3🔷';
    if (actual !== expected) throw new Error('Expected ' + JSON.stringify(expected) + ' but got ' + JSON.stringify(actual));
    console.log('All verified!');
  };
  
  let setExpiredSecureCookieWithDomainPathAndFallbackValue = async () => {
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
  };
  
  // FIXME: remove this once IFRAME puppets and ServiceWorker support are implemented in the polyfill
  setExpiredSecureCookieWithDomainPathAndFallbackValue =
    eval(String(setExpiredSecureCookieWithDomainPathAndFallbackValue).split('/cgi-bin/').join(location.pathname.replace(/[^/]+$/, '')));
  setExpiredSecureCookieWithDomainPathAndFallbackValue =
    eval(String(setExpiredSecureCookieWithDomainPathAndFallbackValue).split('example.org').join(location.hostname));

  let deleteSimpleOriginCookie = async () => {
    await cookieStore.delete('__Host-COOKIENAME');
    console.log('Expired! Deleted!! Cleared!!1!');
  };
  
  let deleteSecureCookieWithDomainAndPath = async () => {
    await cookieStore.delete('__Secure-COOKIENAME', {
        path: '/cgi-bin/',
        domain: 'example.org',
        secure: true
      });
    console.log('Expired! Deleted!! Cleared!!1!');
  };
  
  // FIXME: remove this once IFRAME puppets and ServiceWorker support are implemented in the polyfill
  deleteSecureCookieWithDomainAndPath =
    eval(String(deleteSecureCookieWithDomainAndPath).split('/cgi-bin/').join(location.pathname.replace(/[^/]+$/, '')));
  deleteSecureCookieWithDomainAndPath =
    eval(String(deleteSecureCookieWithDomainAndPath).split('example.org').join(location.hostname));

  let testObservation = resolve => {
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
      // Resolve promise after first callback
      if (resolve) resolve();
      resolve = null;
    };
    let observer = new CookieObserver(callback);
    // If null or omitted this defaults to location.pathname up to and
    // including the final '/' in a document context, or worker scope up
    // to and including the final '/' in a service worker context.
    let url = (location.pathname).replace(/[^\/]+$/, '');
    // If null or omitted this defaults to interest in all
    // script-visible cookies.
    let interests = [
      // Interested in all secure cookies named '__Secure-COOKIENAME';
      // the default matchType is 'equals' at the given URL.
      {name: '__Secure-COOKIENAME', url: url},
      // Interested in all simple origin cookies named like
      // /^__Host-COOKIEN.*$/ at the default URL.
      {name: '__Host-COOKIEN', matchType: 'startsWith'},
      // Interested in all simple origin cookies named '__Host-🍪'
      // at the default URL.
      {name: '__Host-🍪'},
      // Interested in all cookies named 'OLDCOOKIENAME' at the given URL.
      {name: 'OLDCOOKIENAME', matchType: 'equals', url: url},
      // Interested in all simple origin cookies named like
      // /^__Host-AUTHTOKEN.*$/ at the given URL.
      {name: '__Host-AUTHTOKEN', matchType: 'startsWith', url: url + 'auth/'}
    ];
    observer.observe(cookieStore, interests);
    // Default interest: all script-visible changes, default URL
    observer.observe(cookieStore);
  };

  // FIXME: remove this once IFRAME puppets and ServiceWorker support are implemented in the polyfill
  testObservation =
    eval(String(testObservation).split('auth/').join('auth'));

  testObservation = () => new Promise(testObservation);

})();
