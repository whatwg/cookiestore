// async cookies API polyfill for document contexts
if (self.document) (function() {
  'use strict';

  const DISALLOWED_IN_COOKIE_NAME_RE = /[()<>@,;:\\""\/\[\]?={} \0-\x1f\x7f]|[^\x21-\x7e\u00A0-\u{10FFFF}]/u;
  const DISALLOWED_IN_COOKIE_VALUE_RE = /[^\x2D-\x3A\x21\x23-\x2B\x3C-\x5B\x5D-\x7E\u00A0-\u{10FFFF}]/u;
  // based on https://tools.ietf.org/html/rfc3986#appendix-B
  const uriRegExp = /^(([^:\/?#]+):)?(\/\/([^\/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?$/;
  const uriSchemeGroup = 2;
  const uriAuthorityGroup = 4;
  const uriPathGroup = 5;
  const defUriGroups = String(location.href).match(uriRegExp) || [];
  const dirName = path => path.replace(/(^|\/)\.\.$/, '$1../').replace(/[^\/]+$/, '');
  const defReadPath = dirName(defUriGroups[uriPathGroup] || '/');
  const defOrigin = defUriGroups[uriSchemeGroup] + '://' + defUriGroups[uriAuthorityGroup];
  const defSecure = defUriGroups[uriSchemeGroup] === 'https';
  const resolvePath = path => {
    path = String(path || defReadPath);
    if (path[0] !== '/') path = defReadPath + path;
    let pathSegments = path.split('/');
    let resolvedPathSegments = [];
    pathSegments.forEach(segment => {
      if (segment === '..') resolvedPathSegments.pop();
      else resolvedPathSegments.push(segment);
    });
    return resolvedPathSegments.join('/');
  };
  const readPathForUrl = url => {
    if (url == null) url = defReadPath;
    url = String(url);
    const urlGroups = url.match(uriRegExp) || [];
    const urlPath = resolvePath(dirName(String(urlGroups[uriPathGroup] || defReadPath)));
    const origin = [
      urlGroups[uriSchemeGroup] || defUriGroups[uriSchemeGroup],
      urlGroups[uriAuthorityGroup] || defUriGroups[uriAuthorityGroup]].join('://').toLowerCase();
    if ((origin + urlPath) !== (defOrigin + defReadPath)) {
      // TODO: iframe with unpredictable long pathname inside
      // requested path, maybe by appending as many
      // randomly-selected '$' and ':' as needed to reach 2083 chars
      // in the URL could be used to read same-origin, different-path cookies.
      throw new SyntaxError([
        'Cannot read cookies at requested URL ',
        JSON.stringify(url),
        ' from ',
        JSON.stringify(defOrigin + defReadPath),
        ': not yet implemented.'].join(''));
    }
    return defReadPath;
  };
  class AsyncCookieJar_ {
    constructor(document) {
      this.doc_ = document;
    }
    async set(setCookieString) {
      console.info('Set-Cookie: %s', setCookieString);
      this.doc_.cookie = setCookieString;
    }
    async get() {
      return this.doc_.cookie;
    }
  }
  const SECURE_PREFIX = '__Secure-', HOST_PREFIX = '__Host-';
  class CookieStore {
    constructor(asyncCookieJar) {
      this.asyncCookieJar_ = asyncCookieJar;
    }
    async has(nameOrOptions, moreOptions) {
      let cookieList = await this.getAll(nameOrOptions, moreOptions);
      return cookieList.length >= 1;
    }
    async get(nameOrOptions, moreOptions) {
      let cookieList = await this.getAll(nameOrOptions, moreOptions);
      return cookieList[0];
    }
    async getAll(nameOrOptions, moreOptions) {
      let options = Object.assign(
        {},
        (typeof nameOrOptions === 'object') ? nameOrOptions : {name: nameOrOptions},
        moreOptions);
      let {name, url = defReadPath, matchType} = options || {};
      if (name != null) {
      	name = String(name);
        if (name.indexOf(';') !== -1) throw new SyntaxError('Character ";" is not allowed in cookie name');
        if (name.indexOf('=') !== -1) throw new SyntaxError('Character "=" is not allowed in cookie name');
      } else {
        name = '';
        if (matchType == null) matchType = 'startsWith';
      }
      if (matchType == null) matchType = 'equals';
      matchType = String(matchType);
      if (matchType !== 'equals' && matchType !== 'startsWith') {
        throw new SyntaxError('Unrecognized matchType ' + JSON.stringify(matchType));
      }
      url = readPathForUrl(url);
      let cookieList = [];
      let jar = String(await this.asyncCookieJar_.get() || '');
      for (let i = 0, j = jar.length, k = jar.indexOf(';');
           k = (k == -1) ? j : k, i < j;
           i = k + 1 + (jar[k + 1] == ' ' ? 1 : 0), k = jar.indexOf(';', i)) {
       	let nv = jar.substr(i, k - i), c = nv.indexOf('=');
       	// Ignore empty segments.
       	if (nv === '') continue;
       	let n = (c === -1) ? '' : nv.substr(0, c);
        // NOTE: some of the reported names and/or values will not be allowed in write operations.
        if (name === n || matchType === 'startsWith' && n.substr(0, name.length) === name) {
          let v = nv.substr(c + 1);
          cookieList.push({name: n, value: v});
        }
      }
      return cookieList;
    }
    async delete(name, options) {
      await this.set(name, undefined, options);
    }
    async set(name, value, options) {
      if (name == null) name = '';
      name = String(name);
      if (name.match(DISALLOWED_IN_COOKIE_NAME_RE) || name !== decodeURIComponent(encodeURIComponent(name))) {
        throw new SyntaxError('Unsupported character in cookie name');
      }
      options = options || {};
      let expires = null;
      let maxAge = null;
      let expiresAsNumber = (new Date(Number(options.expires))).getTime();
      // FIXME: this should instead use the HTTP Set-Cookie date/time parsing algorithm
      let parsedExpires = new Date(String(options.expires));
      if (options.expires != null && !isNaN(expiresAsNumber)) {
        expires = (new Date(expiresAsNumber)).toGMTString();
      } else if (options.expires != null) {
        if (isNaN(parsedExpires.getTime())) throw new SyntaxError('Unable to parse cookie "expires" attribute');
        expires = parsedExpires.toGMTString();
      }
      if (expires && expires.indexOf(';') !== -1) {
        throw new SyntaxError('Character ";" is not allowed in cookie "expires" attribute');
      }
      let domain = null;
      if (options.domain != null) domain = String(options.domain);
      if (domain != null && domain.indexOf(';') !== -1) {
        throw new SyntaxError('Character ";" is not allowed in cookie "domain" attribute');
      }
      if (domain != null) domain = new URL(location.protocol + '//' + domain).host;
      // FIXME: this should also check the public suffix list
      if (domain != null &&
          domain != location.host &&
          domain != location.hostname &&
          !location.hostname.endsWith('.' + domain)) {
        throw new SyntaxError('Cookie "domain" attribute does not match host');
      }
      let path = String(options.path || '/');
      if (path[0] !== '/') throw new SyntaxError('The "path" attribute must begin with "/"');
      if (path.match(/(^|\/)\.\.(\/|$)/)) {
        throw new SyntaxError('The cookie "path" attribute must not contain ".." path segments');
      }
      if (path.indexOf(';') !== -1) throw new SyntaxError('Character ";" is not allowed in cookie "path" attribute');
      if (path.indexOf('?') !== -1) throw new SyntaxError('Character "?" is not allowed in cookie "path" attribute');
      if (path.indexOf('#') !== -1) throw new SyntaxError('Character "#" is not allowed in cookie "path" attribute');
      // Add implicit trailing '/' if omitted. Does not match IE Set-Cookie behavior.
      path = path.replace(/([^\/]$)/, '$1/');
      let secure = options.secure;
      if (secure == null) secure = defSecure;
      secure = !!secure;
      if (secure && !defSecure) throw new SyntaxError('Secure cookies can only be modified from secure contexts');
      let httpOnly = !!options.httpOnly;
      if (value == null && maxAge == null && expires == null) maxAge = 0;
      value = value == null ? '' : String(value);
      if (name === '' && value.indexOf('=') !== -1) {
        throw new SyntaxError('Character "=" is not allowed in cookie value with empty name');
      }
      if (value.match(DISALLOWED_IN_COOKIE_VALUE_RE) || value !== decodeURIComponent(encodeURIComponent(value))) {
        // Does not match document.cookie behavior!
        throw new SyntaxError('Unsupported character in cookie value');
      }
      if (name.substr(0, SECURE_PREFIX.length) === SECURE_PREFIX) {
        if (!defSecure) {
          throw new SyntaxError([
            'Cookies with the ',
            JSON.stringify(SECURE_PREFIX),
            ' prefix can only be modified from secure contexts'].join(''));
        }
        if (!secure) {
          throw new SyntaxError('Cookies with the ' + JSON.stringify(SECURE_PREFIX) + ' prefix must use the Secure flag');
        }
      } else if (name.substr(0, HOST_PREFIX.length) === HOST_PREFIX) {
        if (!defSecure) {
          throw new SyntaxError([
            'Cookies with the ',
            JSON.stringify(HOST_PREFIX),
            ' prefix can only be modified from secure contexts'].join(''));
        }
        if (!secure) {
          throw new SyntaxError('Cookies with the ' + JSON.stringify(HOST_PREFIX) + ' prefix must use the secure flag');
        }
        if (path !== '/') {
          throw new SyntaxError([
            'Cookies with the ',
            JSON.stringify(HOST_PREFIX),
            ' prefix must have path ',
            JSON.stringify('/')].join(''));
        }
        if (domain != null) {
          throw new SyntaxError([
            'Cookies with the ',
            JSON.stringify(HOST_PREFIX),
            ' prefix cannot have the domain parameter'].join(''));
        }
      }
      let setCookieParts = [name, '=', value];
      if (domain != null) setCookieParts.push('; domain=', domain);
      if (path != null) setCookieParts.push('; path=', path);
      if (expires != null) setCookieParts.push('; expires=', expires);
      if (maxAge != null) setCookieParts.push('; max-age=', maxAge);
      if (secure) setCookieParts.push('; secure');
      if (httpOnly) setCookieParts.push('; httpOnly');
      let setCookie = setCookieParts.join('');
      await this.asyncCookieJar_.set(setCookie);
    }
  };
  const FAST_OBSERVER_INTERVAL = 200, SLOW_OBSERVER_INTERVAL = 5000; // ms
  const VERY_LOW_BATTERY_THRESHOLD = 0.05, LOW_BATTERY_THRESHOLD = 0.15; // 1.0 = charged
  class CookieObserver {
    constructor(callback) {
      this.callback_ = callback;
      this.timer_ = null;
      this.interests_ = [];
      this.newInterests_ = [];
      this.insideTick_ = false;
      this.newSchedule_ = false;
    }
    observe(cookieStore, interests) {
      if (cookieStore == null) throw new TypeError('Non-null first argument required');
      if (typeof cookieStore.getAll !== 'function') {
        throw new TypeError('Observed CookieStore must have a getAll method');
      }
      const copiedInterests = [];
      (interests || [{}]).forEach(({name, url = defReadPath, matchType} = {}) => {
        if (name != null) {
        	name = String(name);
          if (name.indexOf(';') !== -1) throw new SyntaxError('Character ";" is not allowed in cookie name');
          if (name.indexOf('=') !== -1) throw new SyntaxError('Character "=" is not allowed in cookie name');
        } else {
          name = '';
          if (matchType == null) matchType = 'startsWith';
        }
        url = String(url || defReadPath);
        let path = readPathForUrl(url);
        // readPathForUrl will throw or return defReadPath so we can ignore path past this point
        if (matchType == null) matchType = 'equals';
        matchType = String(matchType);
        if (matchType !== 'equals' && matchType !== 'startsWith') {
          throw new SyntaxError('Unrecognized matchType ' + JSON.stringify(matchType));
        }
        copiedInterests.push({name: name, url: url, matchType: matchType});
      });
      if (!copiedInterests.length) return;
      this.newInterests_.push({cookieStore: cookieStore, interests: copiedInterests, cookies_: null});
      this.schedule_(true);
    }
    disconnect() {
      this.interests_ = [];
      this.newInterests_ = [];
      if (this.timer_) {
        clearTimeout(this.timer_);
        this.timer_ = null;
      }
    }
    schedule_(skipWaiting) {
      if (this.insideTick_) {
        this.newSchedule_ = skipWaiting;
        return;
      }
      this.newSchedule_ = false;
      navigator.getBattery().then(batteryManager => {
        if (this.timer_ && !skipWaiting) return;
        if (this.timer_) {
          clearTimeout(this.timer_);
          this.timer_ = null;
        }
        let interval = SLOW_OBSERVER_INTERVAL;
        if (self.document.visibilityState === 'visible') {
          const level = batteryManager.level;
          if (level > VERY_LOW_BATTERY_THRESHOLD && level > LOW_BATTERY_THRESHOLD || batteryManager.charging) {
            interval = FAST_OBSERVER_INTERVAL;
          }
        }
        if (skipWaiting) interval = 0;
        let handler = () => this.tick_().then(() => this.schedule_(this.newSchedule_));
        this.timer_ = setTimeout(handler, interval);
      });
    }
    async tick_() {
      this.timer_ = null;
      this.newSchedule_ = false;
      this.insideTick_ = true;
      try {
        if (this.newInterests_.length) {
          this.interests_ = this.interests_.concat(this.interests_, this.newInterests_)
          this.newInterests_ = [];
        }
        let reported = {};
        let observed = [];
        let allCookies = null;
        let forceReport = false;
        let oldCookieStore = null;
        let storeIndex = -1;
        let interestEntries = this.interests_;
        for (let i = 0, j = interestEntries.length; i < j; ++i) {
          let {cookieStore, interests, cookies_} = interestEntries[i];
          if (oldCookieStore !== cookieStore) {
            oldCookieStore = cookieStore;
            ++storeIndex;
            allCookies = await cookieStore.getAll();
            // A call to disconnect() while awaiting a cookie store
            // snapshot causes an early return without reporting
            if (this.interests_ !== interestEntries) return;
          }
          let oldCookies = cookies_;
          let newCookies = interestEntries[i].cookies_ = allCookies;
          let oldCookiesFlat = {};
          (oldCookies || []).forEach(({name, value}) => {
            oldCookiesFlat[name + '='] = oldCookiesFlat[name + '='] || [];
            oldCookiesFlat[name + '='].push(name + '=' + value);
          });
          let newCookiesFlat = {};
          newCookies.forEach(({name, value}) => {
            newCookiesFlat[name + '='] = newCookiesFlat[name + '='] || [];
            newCookiesFlat[name + '='].push(name + '=' + value);
          });
          let changes = [];
          let newSame = {};
          (oldCookies || []).forEach(({name, value}, index) => {
            if (oldCookiesFlat[name + '='].join(';') === (newCookiesFlat[name + '='] || []).join(';')) {
              newSame[name + '='] = true;
            } else {
              changes.push({type: 'hidden', name: name, value: value, index: index, all: allCookies});
            }
          });
          newCookies.forEach(({name, value}, index) => {
            if (!newSame[name + '=']) changes.push({type: 'visible', name: name, value: value, index: index, all: allCookies});
          });
          if (oldCookies == null || changes.length > 0) {
            interests.forEach(({name, url, matchType}) => {
              let matching =
                changes.filter(change => name === change.name || matchType === 'startsWith' && change.name.startsWith(name));
              matching.forEach(({type, name, value, index}) => {
                let serialized = storeIndex + ';' + type + ';' + name + '=' + value + ';' + index + ';' + url;
                if (reported[serialized]) return;
                observed.push({type: type, name: name, value: value, url: url, cookieStore: cookieStore, index: index});
                reported[serialized] = true;
              });
            });
          }
          if (oldCookies == null) forceReport = true;
        }
        if (forceReport || observed.length) this.callback_.call(null, observed, this);
      } finally {
        this.insideTick_ = false;
      }
    }
  };
  if (!self.cookieStore) self.cookieStore = new CookieStore(new AsyncCookieJar_(self.document));
  if (!self.CookieObserver) self.CookieObserver = CookieObserver;
})();
