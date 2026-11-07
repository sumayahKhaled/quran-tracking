const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const startIdx = html.indexOf('id="view-settings"');
const nextMain = html.indexOf('</main>', startIdx);

const tagRegex = /<\/?(div|main)[\s>]/gi;
tagRegex.lastIndex = startIdx;
let depth = 0;
let m;
while ((m = tagRegex.exec(html)) !== null && m.index < nextMain + 10) {
  const full = m[0];
  const tag = m[1].toLowerCase();
  if (full.startsWith('</')) {
    if (tag === 'div') depth--;
  } else {
    if (tag === 'div') depth++;
  }
  if (depth === 0) {
    console.log('Depth hit 0 at index:', m.index);
    console.log(JSON.stringify(html.substring(m.index - 50, m.index + 50)));
  }
}

