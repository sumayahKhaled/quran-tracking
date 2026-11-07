const fs = require('fs');
const c = fs.readFileSync('index.html', 'utf8');
const smpIdx = c.indexOf('id="settingsMainPanel"');

// print from smpIdx to 67500
console.log(c.substring(smpIdx, 67400));

