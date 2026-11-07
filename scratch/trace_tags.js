const fs = require('fs');
const c = fs.readFileSync('index.html', 'utf8');
const smpIdx = c.indexOf('id="settingsMainPanel"');

// Trace opening and closing elements inside settingsMainPanel
// Let us inspect the tags in the first section (الحساب)
console.log(c.substring(smpIdx, smpIdx + 1500));

