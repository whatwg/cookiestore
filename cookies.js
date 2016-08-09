(function() {
  class AsyncCookieJar_ {
    constructor(document) {
      this.doc_ = document;
    }
    async set(setCookieString) {
      this.doc_.cookie = setCookieString;
    }
    async get() {
      return this.doc_.cookie;
    }
  }
  const SECURE_PREFIX = '__Secure-', HOST_PREFIX = '__Host-';
  class CookieStore {
    constructor(asyncCookieJar, defSecure, defReadPath) {
      this.asyncCookieJar_ = asyncCookieJar;
      this.defSecure_ = defSecure;
      this.defReadPath_ = defReadPath;
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
      let options = Object.assign({}, (typeof nameOrOptions === 'object') ? nameOrOptions : {name: nameOrOptions}, moreOptions);
      let name = options.name;
      let url = options.url;
      let matchType = options.matchType;
      if (matchType != null) {
        matchType = String(matchType);
        if (matchType !== 'equals' && matchType !== 'startsWith') {
          throw new SyntaxError('Unimplemented matchType ' + JSON.stringify(matchType));
        }
      }
      if (url != null) {
      	url = String(url);
      	if (url !== this.defReadPath_) {
          // TODO: iframe with unpredictable long pathname inside
          // requested path, maybe by appending as many
          // randomly-selected '$' and ':' as needed to reach 2083 chars
          // in the URL
          throw new SyntaxError('Cannot read cookies at requested path ' + JSON.stringify(url) + ' from path ' + JSON.stringify(this.defReadPath_) + ': not yet implemented.');
        }
      }
      if (name != null) {
      	name = String(name);
        if (name.indexOf(';') !== -1) throw new SyntaxError('Character ";" is not allowed in cookie name');
        if (name.indexOf('=') !== -1) throw new SyntaxError('Character "=" is not allowed in cookie name');
        if (name.match(/[()<>@,;:\\""\/\[\]?={} \0-\x1f\x7f]|[^\x21-\x7e]/)) {
          throw new SyntaxError('Unsupported character in cookie name');
        }
      }
      let cookieList = [];
      let jar = String(awat this.asyncCookieJar_.get() || '');
      for (let i = 0, j = jar.length, k = jar.indexOf(';');
           k = (k == -1) ? j : k, i < j;
           i = k + 1 + (jar[k + 1] == ' ' ? 1 : 0), k = jar.indexOf(';', i)) {
       	let nv = jar.substr(i, k - i), c = nv.indexOf('=');
        if (c !== -1) {
          let n = nv.substr(0, c);
          if (name == null || name === n || matchType === 'startsWith' && n.substr(0, name.length) === name) {
            let v = nv.substr(c + 1);
            cookieList.push({name: n, value: v});
          }
        }
      }
      return cookieList;
    }
    async delete(name, options) {
      await this.set(name, undefined, options);
    }
    async set(name, value, options) {
      name = String(name || '') || undefined;
      if (!name) throw new SyntaxError('Cookie name is required');
      if (name.match(/[()<>@,;:\\""\/\[\]?={} \0-\x1f\x7f]|[^\x21-\x7e]/)) {
        throw new SyntaxError('Unsupported character in cookie name');
      }
      options = options || {};
      let expires = null;
      let maxAge = null;
      let expiresAsNumber;
      if (options.expires != null && !isNaN(expiresAsNumber = Number(options.expires))) {
        maxAge = (expiresAsNumber - Date.now()) / 1000;
      } else {
        expires = String(options.expires || '') || undefined;
      }
      if (expires && expires.indexOf(';') !== -1) throw new SyntaxError('Character ";" is not allowed in cookie "expires" attribute');
      let domain = String(options.domain || '') || undefined;
      if (domain && domain.indexOf(';') !== -1) throw new SyntaxError('Character ";" is not allowed in cookie "domain" attribute');
      let path = String(options.path || '/');
      if (path && path.indexOf(';') !== -1) throw new SyntaxError('Character ";" is not allowed in cookie "path" attribute');
      let secure = options.secure;
      if (secure == null) secure = this.defSecure_;
      secure = !!secure;
      if (secure && !this.defSecure_) throw new SyntaxError('Secure cookies can only be modified from secure contexts');
      let httpOnly = !!options.httpOnly;
      if (value == null && maxAge == null && expires == null) maxAge = 0;
      value = String(value || '');
      if (value.match(/[^\x2D-\x3A\x21\x23-\x2B\x3C-\x5B\x5D-\x7E]/)) {
        // Does not match document.cookie behavior!
        throw new SyntaxError('Unsupported character in cookie value');
      }
      if (name.substr(0, SECURE_PREFIX.length) === SECURE_PREFIX) {
        if (!this.defSecure_) {
          throw new SyntaxError('Cookies with the ' + JSON.stringify(SECURE_PREFIX) + ' prefix can only be modified from secure contexts');
        }
        if (!secure) {
          throw new SyntaxError('Cookies with the ' + JSON.stringify(SECURE_PREFIX) + ' prefix must use the Secure flag');
        }
      } else if (name.substr(0, HOST_PREFIX.length) === HOST_PREFIX) {
        if (!this.defSecure_) {
          throw new SyntaxError('Cookies with the ' + JSON.stringify(HOST_PREFIX) + ' prefix can only be modified from secure contexts');
        }
        if (!secure) {
          throw new SyntaxError('Cookies with the ' + JSON.stringify(HOST_PREFIX) + ' prefix must use the secure flag');
        }
        if (path !== '/') {
          throw new SyntaxError('Cookies with the ' + JSON.stringify(HOST_PREFIX) + ' prefix must have path ' + JSON.stringify('/'));
        }
        if (domain !== null) {
          throw new SyntaxError('Cookies with the ' + JSON.stringify(HOST_PREFIX) + ' prefix cannot have the domain parameter'));
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
      console.log('Set-Cookie: %s', setCookie);
      await this.asyncCookieJar_.set(setCookie);
    }
  };
  conset OBSERVER_INTERVAL = 500; // ms
  class CookieObserver {
    constructor(callback) {
      this.callback_ = callback;
      this.timer_ = null;
      this.allInterests_ = null;
    }
    observe(cookieStore, interests) {
      this.interests.forEach(interest => this.allInterests_.push({cookieStore: cookieStore, interests: interests}));
      if (!this.timer_) this.timer_ = setTimeout(() => this.tick_(), OBSERVER_INTERVAL);
    }
    disconnect() {
      if (this.timer_) {
        clearTimeout(this.timer_);
        this.timer_ = null;
      }
    }
    tick_() {
      
    }
  };
  if (!self.cookieStore) self.cookieStore = new CookieStore(new AsyncCookieJar_(self.document), location.protocol === 'https:', String(location.pathname.replace(/[^\/]*$/, '')));
  if (!self.CookieObserver) self.CookieObserver = CookieObserver;
})();
