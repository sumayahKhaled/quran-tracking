const fs = require('fs');
const c = fs.readFileSync('index.html', 'utf8');
const idx = c.indexOf('id="view-settings"');
console.log(c.substring(idx, idx + 400));

