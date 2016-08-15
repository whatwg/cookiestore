// This is intentionally written in an archaic and portable style as it may be the
// only script able to parse and run in an older browser.

self.onerror = function(msg, url, ln, col, error) {
  console.error('Global onerror: %s at %s#ln=%s&col=%s %o', msg, url, ln, col, error);
  var errorNode = document.createElement('pre');
  errorNode.appendChild(document.createTextNode([
    'Global onerror: ' + msg,
    'URL: ' + url,
    'Line: ' + ln,
    'Column: ' + col,
    'Error: ' + error].join('\n')));
  (document.body || document.documentElement || document.head).appendChild(errorNode);
  return true;
};
