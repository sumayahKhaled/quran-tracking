const fs = require('fs');
const c = fs.readFileSync('index.html', 'utf8');
const smpIdx = c.indexOf('id="settingsMainPanel"');

// print from 67200 to 67850
console.log(c.substring(67200, 67850));

