const fs = require('fs');
const css = fs.readFileSync('scratch/qul_app.css', 'utf8');

const regex = /\.([a-zA-Z0-9_-]*(?:line|page|mushaf|ayah|char)[a-zA-Z0-9_-]*)\s*\{([^}]+)\}/g;
let match;
while ((match = regex.exec(css)) !== null) {
  console.log('.' + match[1] + ' { ' + match[2] + ' }');
}

