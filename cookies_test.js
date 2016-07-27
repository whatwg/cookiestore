addEventListener('load', () => {
  navigator.cookies.write('TEST', 'value'. {maxAge: 60}).then(() => {
    navigator.cookies.writeAsString('TEST2=value2; origin; max-age=60').then(() => {
      navigator.cookies.readAllAsString(jar=>console.log('All cookies as a string', jar));
      navigator.cookies.readAll().then(cookies=>console.log.apply(console, ['All cookies'].concat(cookies)));
      navigator.cookies.read().then(map=>console.log('First value for all cookies', map));
      navigator.cookies.readAll('TEST').then(values=>console.log.apply(console, ['All TEST cookie values'].concat(values)));
      navigator.cookies.read('TEST').then(value=>console.log('First value for TEST cookie', value));
    });
  });
}, true);
