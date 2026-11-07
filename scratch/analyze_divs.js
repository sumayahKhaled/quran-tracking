const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const startIdx = html.indexOf('id="view-settings"');
console.log('view-settings start:', startIdx);
const nextMain = html.indexOf('</main>', startIdx);
console.log('view-settings end main:', nextMain);

// Count opening and closing divs between startIdx and nextMain
const section = html.substring(startIdx, nextMain);
const openDivs = (section.match(/<div[\s>]/gi) || []).length;
const closeDivs = (section.match(/<\/div>/gi) || []).length;
console.log('Open divs:', openDivs, 'Close divs:', closeDivs);

// Let us find if view-settings is closed prematurely!
let depth = 0;
let pos = startIdx;
const tagRegex = /<\/?([a-z0-9]+)[\s>]/gi;
tagRegex.lastIndex = startIdx;
let m;
while ((m = tagRegex.exec(html)) !== null) {
  const full = m[0];
  const tag = m[1].toLowerCase();
  if (full.startsWith('</')) {
    if (tag === 'main') {
      console.log('Found </main> at pos', m.index, 'depth was', depth);
      break;
    }
    if (tag === 'div') depth--;
  } else {
    if (tag === 'div') depth++;
  }
}

