(function() {
  "use strict";
  if (navigator.cookies) return;
  class CookieJar {
    constructor(document, defSecure, defReadPath) {
      this.doc_ = document;
      this.defSecure_ = defSecure;
      this.defReadPath_ = defReadPath;
    }
    has(name, path) {
      return this.getAll(name, path).then(x=>x.length);
    }
    get(name, path) {
      if (path != null && path !== this.defReadPath_) {
        // TODO: iframe with unpredictable long pathname inside
        // requested path, maybe by appending as many
        // randomly-selected '$' and ':' as needed to reach 2083 chars
        // in the URL
        throw new Error('Cannot read cookies from requested path ' + JSON.stringify(path) + ' from path ' + JSON.stringify(this.defReadPath_) + ': not yet implemented.');
      }
      return this.getAll(name, path).then(allCookies => {
        if (name != null) return allCookies[0];
        return allCookies.reduce((r,nc) => {
          if (!r.hasOwnProperty(nc.name)) r[nc.name] = nc.value;
          return r;
        }, {});
      });
    }
    getAll(name, path) {
      if (name != null) name = String(name);
      if (name != null && name.indexOf(';') !== -1) throw new Error('Character ";" is not allowed in cookie name');
      if (name != null && name.indexOf('=') !== -1) throw new Error('Character "=" is not allowed in cookie name');
      if (name && name.match(/[()<>@,;:\\""\/\[\]?={} \0-\x1f\x7f]|[^\x21-\x7e]/)) {
        // Does not match document.cookie behavior!
        throw new Error('Unsupported character in cookie name');
      }
      return new Promise((ok, fail) => {
        let allValues = [];
        try {
          let jar = String(document.cookie || '');
          for (let i = 0, j = jar.length, k = jar.indexOf(';');
               k = (k == -1) ? j : k, i < j;
               i = k + 1 + (jar[k + 1] == ' ' ? 1 : 0), k = jar.indexOf(';', i)) {
            let nv = jar.substr(i, k - i), c = nv.indexOf('=');
            if (c !== -1) {
              let n = nv.substr(0, c);
              if (name == null || name === n) {
                let v = nv.substr(c + 1);
                if (name == null) allValues.push({name: n, value: v});
                else allValues.push(v);
              }
            }
          }
          ok(allValues);
        } catch (x) {
          fail(x);
        }
      });
    }
    delete(name, options) {
      return this.set(name, undefined, options);
    }
    set(name, value, options) {
      name = String(name || '') || undefined;
      if (!name) throw new Error('Cookie name is required');
      if (name.match(/[()<>@,;:\\""\/\[\]?={} \0-\x1f\x7f]|[^\x21-\x7e]/)) {
        // Does not match document.cookie behavior!
        throw new Error('Unsupported character in cookie name');
      }
      options = options || {};
      let expires = String(options.expires || '') || undefined;
      if (expires && expires.indexOf(';') !== -1) throw new Error('Character ";" is not allowed in cookie "expires" attribute');
      let maxAge = options.maxAge;
      if (maxAge != null) maxAge = maxAge | 0;
      let domain = String(options.domain || '') || undefined;
      if (domain && domain.indexOf(';') !== -1) throw new Error('Character ";" is not allowed in cookie "domain" attribute');
      let path = String(options.path || '/');
      if (path && path.indexOf(';') !== -1) throw new Error('Character ";" is not allowed in cookie "path" attribute');
      let secure = options.secure;
      if (secure == null) secure = this.defSecure_;
      secure = !!secure;
      let httpOnly = !!options.httpOnly;
      if (value == null && maxAge == null && expires == null) maxAge = 0;
      value = String(value || '');
      if (value.match(/[^\x2D-\x3A\x21\x23-\x2B\x3C-\x5B\x5D-\x7E]/)) {
        // Does not match document.cookie behavior!
        throw new Error('Unsupported character in cookie value');
      }
      let setCookieParts = [name, '=', value];
      if (domain != null) setCookieParts.push('; domain=', domain);
      if (path != null) setCookieParts.push('; path=', path);
      if (expires != null) setCookieParts.push('; expires=', expires);
      if (maxAge != null) setCookieParts.push('; max-age=', maxAge);
      if (secure) setCookieParts.push('; secure');
      if (httpOnly) setCookieParts.push('; httpOnly');
      for (let k in options) {
        if (!Object.prototype.hasOwnProperty.call(options, k)) continue;
        let v = options[k];
        if (typeof(v) === 'function') continue;
        if (k.indexOf(';') != -1) throw new Error('Character ";" is not allowed in cookie extended attribute name: ' + JSON.stringify(k));
        if (k.indexOf('=') != -1) throw new Error('Character "=" is not allowed in cookie extended attribute name: ' + JSON.stringify(k));
        if (k !== k.replace(/^[ \t]*([^ \t](.*[^ \t])?)\s*$/, '$1')) throw new Error('Cookie extended attribute name cannot begin or end with whitespace');
        let ck = k.replace(/-([a-z])/g, x => x[1].toUpperCase());
        if (k != ck) throw new Error('Use camel-case in attribute names: ' + JSON.stringify(k));
        if (k.match(/^expires|maxAge|domain|path|secure|httpOnly$/)) continue;
        if (v != null) v = String(v);
        if (v && v.indexOf(';') != -1) throw new Error('Character ";" is not allowed in cookie extended attribute ' + JSON.stringify(k) + ' value: ' + JSON.stringify(v));
        if (v && v !== v.replace(/^[ \t]*([^ \t](.*[^ \t])?)\s*$/, '$1')) throw new Error('Cookie extended attribute value cannot begin or end with whitespace');
        setCookieParts.push('; ', k);
        if (v != null) setCookieParts.push('=', v);
      }
      let setCookie = setCookieParts.join('');
      return new Promise((ok, fail) => {
        try {
	  console.log('Set-Cookie: %s', setCookie);
          document.cookie = setCookie;
          ok();
        } catch(x) {
          fail(x);
        }
      });
    }
  };
  navigator.cookies = new CookieJar(self.document, location.protocol === 'https:', String(location.pathname.replace(/[^\/]*$/, '')));
})();
