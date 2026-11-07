const fs = require('fs');
const c = fs.readFileSync('index.html', 'utf8');
console.log(c.substring(67000, 68000));

