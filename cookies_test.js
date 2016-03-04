addEventListener('load', () => {
  navigator.cookies.set('TEST', 'value').then(() => {
    navigator.cookies.getAll().then(x=>console.log.apply(console, ['All cookies'].concat(x)));
    navigator.cookies.get().then(x=>console.log('First value for all cookies', x));
    navigator.cookies.getAll('TEST').then(x=>console.log.apply(console, ['All TEST cookies'].concat(x)));
    navigator.cookies.get('TEST').then(x=>console.log('First value for TEST cookie', x));
  });
}, true);
