[Security and Privacy questionnaire](https://www.w3.org/TR/security-privacy-questionnaire/)
responses for the Cookie Store API

### 3.1 Does this specification deal with personally-identifiable information?

No.

### 3.2 Does this specification deal with high-value data?

Yes.

### 3.3 Does this specification introduce new state for an origin that persists across browsing sessions?

No.

This specification offers high-performance methods for accessing HTTP cookies,
which have already become an established part of the Web platform. No new state
mechanism is introduced.

### 3.4 Does this specification expose persistent, cross-origin state to the web?

Yes. However, it does not expose any **new** persistent cross-origin state.

This specification defers to
[RFC 6265bis](https://tools.ietf.org/html/draft-ietf-httpbis-rfc6265bis-02) for
the storage and security models of HTTP cookies. Cookies can be scoped to an
entire eTLD+1, transcending the same origin policy. For eaxmple, a cookie
whose
[domain](https://tools.ietf.org/html/draft-ietf-httpbis-rfc6265bis-02#section-4.1.2.3)
attribute is set to `example.com` is visible to `www.example.com` and
`foo.example.com`.

[document.cookie](https://www.w3.org/TR/html/dom.html#dom-document-cookie)
already exposes HTTP cookies. This specification does not open up access to
cookies past what `document.cookie` has to offer.

### 3.5 Does this specification expose any other data to an origin that it doesn’t currently have access to?

No.

### 3.6 Does this specification enable new script execution/loading mechanisms?

No.

### 3.7 Does this specification allow an origin access to a user’s location?

No.

### 3.8 Does this specification allow an origin access to sensors on a user’s device?

No.

### 3.9 Does this specification allow an origin access to aspects of a user’s local computing environment?

No.

### 3.10 Does this specification allow an origin access to other devices?

No.

### 3.11 Does this specification allow an origin some measure of control over a user agent’s native UI?

No.

### 3.12 Does this specification expose temporary identifiers to the web?

No.

### 3.13 Does this specification distinguish between behavior in first-party and third-party contexts?

No.

This specification defers to
[RFC 6265bis](https://tools.ietf.org/html/draft-ietf-httpbis-rfc6265bis-02) for
the storage and security models of HTTP cookies. Cookies have a
[SameSite](https://tools.ietf.org/html/draft-ietf-httpbis-rfc6265bis-02#section-4.1.2.7)
attribute that introduces differences in behavior between first-party and
third-party contexts.

This specification includes a method for accessing a cookie's SameSite
attribute.

### 3.14 How should this specification work in the context of a user agent’s "incognito" mode?

This specification builds on top of HTTP cookies as defined in
[RFC 6265bis](https://tools.ietf.org/html/draft-ietf-httpbis-rfc6265bis-02). The
specification should be compatible with any manner user agents choose to handle
 cookies in "incognito".

### 3.15 Does this specification persist data to a user’s local device?

Yes. However, it does not introduce any **new** persistence mechanism.

### 3.16 Does this specification have a "Security Considerations" and "Privacy Considerations" section?

No.

The specification will defer to
[RFC 6265bis](https://tools.ietf.org/html/draft-ietf-httpbis-rfc6265bis-02) for
its extensive treatment of
[Security](https://tools.ietf.org/html/draft-ietf-httpbis-rfc6265bis-02#section-8)
and
[Privacy](https://tools.ietf.org/html/draft-ietf-httpbis-rfc6265bis-02#section-7)
issues.

### 3.17 Does this specification allow downgrading default security characteristics?

No.
